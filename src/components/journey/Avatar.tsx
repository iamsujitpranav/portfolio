"use client";

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  AVATAR_URL,
  ANIMATIONS_URL,
  MOTION,
  CORE_MOTIONS,
  LAZY_MOTIONS,
  KICK_SECONDS,
  THROW_SECONDS,
  SPRINT_MULT,
  LOCO_TIME_SCALE,
  WALK_BOB_PHASE,
  RUN_BOB_PHASE,
  REMOTE_AVATAR_FALLBACK,
  AVATAR_FACING_OFFSET,
  IDLE_CLIP_HINT,
  WALK_CLIP_HINT,
  WALK,
  WALK_SPEED,
  ARRIVE_EPS,
  TRAIL_METRES,
  type MotionName,
} from "@/lib/journey/config";
import { walkHeight } from "@/lib/journey/terrain";
import { spineProgress, resetCursor, type RouteStep } from "@/lib/journey/graph";
import {
  game,
  stepJump,
  avatarPos,
  faceTarget,
  landKick,
  releaseThrow,
  endMove,
  JUMP_V0,
  GRAVITY,
} from "@/lib/journey/game";
import { applyTopSnow, avatarSnowUniforms } from "@/lib/journey/snowcover";

// Shared, mutable navigation state. The Avatar owns advancing the ROUTE CURSOR
// (which graph edge it is on and how far along); the camera reads the cursor;
// the HUD assigns routes (graph.assignRoute) and reads `moving`/`revealed`.
// Passing one object keeps a single source of truth. `progress` is the legacy
// spine scalar, derived each frame so the games/HUD/sun (which still speak a
// single [0,1] along the résumé spine) keep working unchanged.
export type Nav = {
  // --- route cursor: where the avatar IS on the path graph ------------------
  route: RouteStep[]; // remaining directed legs; empty = idle/arrived
  step: number; // index of the leg currently being walked
  edgeId: string; // graph edge the avatar is physically on
  tAB: number; // fraction along edgeId, measured a→b regardless of travel dir
  destTab: number; // where on the final leg to stop (a→b fraction)
  destNodeId: string | null; // node the route was aimed at, if any
  dir: 1 | -1; // current travel direction along edgeId (a→b = 1)
  // --- derived / status -----------------------------------------------------
  progress: number; // derived legacy spine fraction [0,1]
  moving: boolean; // set by Avatar each frame
  revealed: boolean; // set true once the load reveal finishes
};

// ~0.8 m "close enough" — the old ARRIVE_EPS (a curve fraction) in metres, so
// arriving keeps the same feel: no shuffling the last steps to a signpost.
const ARRIVE_M = ARRIVE_EPS * TRAIL_METRES;

// --- route-cursor integrator (shared by the real avatar and the capsule) -----
// Consume `metres` of ground along the route, carrying leftover distance across
// edge joins so a join never costs a frame of speed. Mutates the cursor; ends
// the route (route = []) on arrival or once within ARRIVE_M of the destination.
function advanceRoute(nav: Nav, metres: number, edgeLens: Map<string, number>) {
  let budget = metres;
  while (budget > 1e-9 && nav.step < nav.route.length) {
    const leg = nav.route[nav.step];
    const isLast = nav.step === nav.route.length - 1;
    const endTab = isLast ? nav.destTab : leg.forward ? 1 : 0;
    const eLen = edgeLens.get(leg.edgeId) ?? 1;
    const remDist = Math.max(0, leg.forward ? endTab - nav.tAB : nav.tAB - endTab) * eLen;
    if (budget < remDist) {
      nav.tAB += (leg.forward ? 1 : -1) * (budget / eLen);
      budget = 0;
    } else {
      budget -= remDist;
      nav.tAB = endTab;
      if (isLast) {
        nav.route = [];
        nav.step = 0;
        break;
      }
      nav.step++;
      const nx = nav.route[nav.step];
      nav.edgeId = nx.edgeId;
      nav.tAB = nx.forward ? 0 : 1;
    }
  }
  if (nav.route.length > 0 && routeRemaining(nav, edgeLens) <= ARRIVE_M) {
    nav.route = [];
    nav.step = 0;
  }
}

/** Metres left between the cursor and the route's destination. */
function routeRemaining(nav: Nav, edgeLens: Map<string, number>) {
  let rem = 0;
  for (let i = nav.step; i < nav.route.length; i++) {
    const leg = nav.route[i];
    const isLast = i === nav.route.length - 1;
    const endTab = isLast ? nav.destTab : leg.forward ? 1 : 0;
    const from = i === nav.step ? nav.tAB : leg.forward ? 0 : 1;
    rem += Math.max(0, leg.forward ? endTab - from : from - endTab) * (edgeLens.get(leg.edgeId) ?? 1);
  }
  return rem;
}

// --- living-snow shed flakes -------------------------------------------------
// When the cover simulation drains (a stride's shake-off, a clump letting go, the
// scheduled full-body shake), the lost snow leaves as VISIBLE flakes: a pooled
// world-space THREE.Points the avatar emits into and walks out from under —
// exactly how snow drops off a moving person.
const SHAKE_DUR = 0.8; // seconds of shiver
const FLAKE_N = 160; // particle pool size (worst case: mid-shake flurry)
const FLAKE_GRAV = 2.6; // m/s² — snow clods are drag-limited, not ballistic
const FLAKE_VMAX = 1.9; // terminal fall speed

function makeFlakeTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
  g.addColorStop(0, "rgba(238,243,251,1)");
  g.addColorStop(0.55, "rgba(238,243,251,0.85)");
  g.addColorStop(1, "rgba(238,243,251,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const REVEAL_DURATION = 1.9; // seconds, feet → head
const WALK_CADENCE = 2 * Math.PI * WALK.cadence; // radians/sec
const XAXIS = new THREE.Vector3(1, 0, 0);
const YAXIS = new THREE.Vector3(0, 1, 0);
const ZAXIS = new THREE.Vector3(0, 0, 1);

// FALLBACK-ONLY now: the primary walk/run loops and every one-shot bind via
// retargetNative below (pelvis kept). This Hips-drop path is used only by the
// last-resort walk fallbacks (a clip bundled in the avatar, or animations.glb).
//
// Make an external motion clip bind cleanly to the Avaturn skeleton. The FBX→GLB
// export bakes translation, rotation *and* scale onto every bone; for a
// same-hierarchy Mixamo→Avaturn retarget we want ROTATION ONLY — applying the
// baked bone translations/scales would force Mixamo's proportions onto this rig
// and tear the mesh. So keep just the `.quaternion` tracks (position comes from
// the curve), and strip any Mixamo bone-name prefix so tracks bind by name.
//
// CRUCIALLY we also drop the Hips (root) rotation track. Mixamo authors the
// pelvis orientation in its own coordinate frame; applied to the Avaturn Hips it
// rotates the entire body ~90° and the character walks lying flat ("sleeping").
// Dropping it lets the pelvis keep the Avaturn rig's upright rest orientation
// (the idle clip drives its subtle sway) while the clip still animates the limbs.
function retargetWalkClip(clip: THREE.AnimationClip) {
  clip.tracks = clip.tracks
    .filter(
      (t) =>
        t.name.endsWith(".quaternion") &&
        !t.name.startsWith("Armature") &&
        !/hips/i.test(t.name), // keep the body upright — see note above
    )
    .map((t) => {
      t.name = t.name.replace(/mixamorig[:_]?/i, "");
      return t;
    });
  return clip;
}

// NATIVE clip binding — the faithful way to play a Mixamo clip on this avatar.
//
// The clip and the Avaturn avatar are the SAME 52-bone skeleton; the ONLY thing
// that differs is a coordinate convention. The clip export carries a +90° X on
// its root `Armature` node (Blender's Z-up → glTF Y-up conversion), and every
// bone — including the Hips — is authored relative to that rotated root. The
// avatar's own Armature is identity. So `retargetWalkClip` (which drops the Hips
// to dodge the resulting ~90° pelvis "flip") throws away real motion: the pelvis
// tilt that a throw leans into, and the counter-rotation that keeps the legs
// planted. That's the true cause of "both legs coming up".
//
// The fix is to REBASE, not drop: fold the root's +90° into the Hips track
// (world_Hips = Armature ∘ Hips) and drop the Armature track itself. Every other
// bone is relative to the Hips and binds unchanged, so the WHOLE body — pelvis,
// spine, legs — plays exactly as authored, upright. Validated headlessly on the
// real rig: throw feet lift ~0.25 m (a step) vs ~0.9 m splay under the old Hips
// drop; walk/jog/kick/leap all upright with correct gait. Positions are dropped
// (the clips are in-place; world position comes from the trail). `armQuat` is
// read from the clip file's own Armature node.
function retargetNative(clip: THREE.AnimationClip, armQuat: THREE.Quaternion) {
  clip.tracks = clip.tracks
    .filter((t) => t.name.endsWith(".quaternion") && !t.name.startsWith("Armature"))
    .map((t) => {
      t.name = t.name.replace(/mixamorig[:_]?/i, "");
      return t;
    });
  const q = new THREE.Quaternion();
  for (const t of clip.tracks) {
    if (t.name !== "Hips.quaternion") continue; // rebase only the root
    const v = t.values;
    for (let i = 0; i < v.length; i += 4) {
      q.set(v[i], v[i + 1], v[i + 2], v[i + 3]).premultiply(armQuat); // armQuat ∘ Hips
      v[i] = q.x; v[i + 1] = q.y; v[i + 2] = q.z; v[i + 3] = q.w;
    }
  }
  return clip;
}

// Read the +90° convention rotation from a freshly-loaded clip's own Armature
// root, so `retargetNative` bakes exactly what that file carries.
function armatureQuat(scene: THREE.Object3D) {
  return scene.getObjectByName("Armature")?.quaternion.clone() ?? new THREE.Quaternion();
}

type Props = {
  edgeCurves: Map<string, THREE.CatmullRomCurve3>; // one 3D walk curve per graph edge
  nav: Nav;
  onLoaded?: () => void;
  onReady?: () => void; // reveal complete
  onArrive?: () => void; // reached target after moving
};

export default function Avatar(props: Props) {
  const [url, setUrl] = useState(AVATAR_URL);
  const [dead, setDead] = useState(false);

  return (
    <AvatarBoundary
      resetKey={`${url}:${dead}`}
      onError={() => {
        // Try a reachable remote fallback once, if one is configured; otherwise
        // (or after it also fails) degrade to the built-in capsule walker rather
        // than re-fetching an unreachable URL and throwing again.
        if (REMOTE_AVATAR_FALLBACK && url !== REMOTE_AVATAR_FALLBACK)
          setUrl(REMOTE_AVATAR_FALLBACK);
        else setDead(true);
      }}
    >
      {dead ? <CapsuleWalker {...props} /> : <AvatarModel url={url} {...props} />}
    </AvatarBoundary>
  );
}

// ---------------------------------------------------------------------------

function AvatarModel({ url, edgeCurves, nav, onLoaded, onReady, onArrive }: Props & { url: string }) {
  const gltf = useGLTF(url);
  const { gl, camera } = useThree();
  const group = useRef<THREE.Group>(null);

  // Per-edge 3D curve lengths, so the metres-per-frame budget maps to exact
  // curve fractions (skate-free ground speed on every edge, like the old
  // arc-length-parameterized single curve).
  const edgeLens = useMemo(() => {
    const m = new Map<string, number>();
    edgeCurves.forEach((c, id) => m.set(id, c.getLength()));
    return m;
  }, [edgeCurves]);

  // Skeleton bones we drive procedurally while walking.
  const bones = useMemo(() => {
    const b: Record<string, THREE.Bone | null> = {};
    const want = [
      "Hips", "Spine", "Spine1", "Neck", "Head",
      "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot",
      "LeftShoulder", "LeftArm", "LeftForeArm",
      "RightShoulder", "RightArm", "RightForeArm",
    ];
    gltf.scene.traverse((o) => {
      if ((o as THREE.Bone).isBone && want.includes(o.name)) b[o.name] = o as THREE.Bone;
    });
    want.forEach((n) => (b[n] = b[n] ?? null));
    return b;
  }, [gltf]);

  // Rest (bind) pose of every driven bone, captured once from the freshly loaded
  // rig. The procedural gait is applied as a blended offset from this — never
  // integrated onto the live quaternion — so constant-sign terms (lean, knee,
  // elbow) can't pile up frame over frame and tip the body into a slant.
  const rest = useMemo(() => {
    const r: Record<string, THREE.Quaternion> = {};
    for (const name of Object.keys(bones)) {
      const bone = bones[name];
      if (bone) r[name] = bone.quaternion.clone();
    }
    return r;
  }, [bones]);

  // Animation. `idle` always plays underneath; the two run loops crossfade over
  // it while travelling (sprint picks which one), and any one-shot from the
  // motion library — a kick, a vault, a dance — layers on top of that. Managed
  // directly rather than via drei's useAnimations so the procedural fallback can
  // still run *after* the mixer when no run clip loaded at all.
  const mixer = useMemo(() => new THREE.AnimationMixer(gltf.scene), [gltf]);
  const idleAction = useRef<THREE.AnimationAction | null>(null);
  // Two locomotion loops: `walk` is the default gait, `run` is the Shift-held jog.
  const loco = useRef<{ walk: THREE.AnimationAction | null; run: THREE.AnimationAction | null }>(
    { walk: null, run: null },
  );
  // Every one-shot from MOTION, keyed by name, plus whichever is loading.
  const oneShots = useRef(new Map<MotionName, THREE.AnimationAction>());
  const requested = useRef(new Set<MotionName>());

  const pickClip = (clips: THREE.AnimationClip[], hint: string) =>
    clips.find((c) => c.name.toLowerCase().includes(hint)) ?? clips[0];

  // A looping travel clip.
  const setLoop = (
    slot: "walk" | "run",
    clip: THREE.AnimationClip,
    timeScale: number,
  ) => {
    const a = mixer.clipAction(clip);
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.timeScale = timeScale;
    a.setEffectiveWeight(0).play();
    loco.current[slot] = a;
  };

  // A one-shot that holds its last frame until faded out, so the avatar never
  // snaps back to the run pose mid-recovery.
  const setOneShot = (name: MotionName, clip: THREE.AnimationClip, additive = false) => {
    const a = additive
      ? mixer.clipAction(clip, undefined, THREE.AdditiveAnimationBlendMode)
      : mixer.clipAction(clip);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.setEffectiveWeight(0);
    oneShots.current.set(name, a);
  };

  // Fetch one motion file and register its clip. Safe to call repeatedly — the
  // `requested` set makes it idempotent, which is what lets the dances load
  // lazily on the first win without ever double-fetching.
  const loadMotion = useCallback(
    (name: MotionName) => {
      if (requested.current.has(name)) return;
      requested.current.add(name);
      const spec = MOTION[name];
      new GLTFLoader()
        .loadAsync(spec.url)
        .then((g) => {
          const clip = pickClip(g.animations ?? [], spec.hint);
          if (!clip) return;
          if (name === "walk" || name === "run") {
            // The locomotion loops play NATIVELY too now — pelvis rebased upright
            // but KEPT, so the walk carries its real hip sway/lead (tilt 1–5°, yaw
            // ~11°) instead of the stiff Hips-dropped pelvis. Ground speed was
            // re-measured under native binding (config LOCO_NATIVE_MS) so the feet
            // still grip: walk unchanged (1.74 m/s), jog re-derived 2.58 → 2.42.
            setLoop(name, retargetNative(clip, armatureQuat(g.scene)), LOCO_TIME_SCALE[name]);
          } else {
            // Every one-shot — throw, kick, vault/jump, dance — plays NATIVELY so
            // the full body reads: the pelvis leans/crouches and carries each
            // clip's own rotation (a kick's pivot, a vault's forward pitch). Only
            // the two locomotion LOOPS stay on the Hips-drop path, because their
            // ground speed and foot-strike bob are measured against that pose
            // (see config). See retargetNative.
            setOneShot(name, retargetNative(clip, armatureQuat(g.scene)));
          }
        })
        .catch(() => {
          // A missing motion file must never break the journey: the walk falls
          // back to the older bundled walk GLB and one-shots simply no-op.
          requested.current.delete(name);
          if (name === "walk" && ANIMATIONS_URL) {
            new GLTFLoader()
              .loadAsync(ANIMATIONS_URL)
              .then((g) => {
                const clip = pickClip(g.animations ?? [], WALK_CLIP_HINT);
                if (clip) setLoop("walk", retargetWalkClip(clip), WALK.clipTimeScale);
              })
              .catch(() => {
                /* procedural gait */
              });
          }
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mixer],
  );

  useEffect(() => {
    const clips = gltf.animations ?? [];
    const lower = (c: THREE.AnimationClip) => c.name.toLowerCase();
    const idle = clips.find((c) => lower(c).includes(IDLE_CLIP_HINT)) ?? clips[0];
    if (idle) {
      const a = mixer.clipAction(idle);
      a.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      idleAction.current = a;
    }
    // A walk clip bundled inside the avatar itself, if present — the last-resort
    // travel loop if even walk.glb is missing.
    const bundledWalk = clips.find((c) => lower(c).includes(WALK_CLIP_HINT));
    if (bundledWalk) setLoop("walk", retargetWalkClip(bundledWalk.clone()), WALK.clipTimeScale);
    return () => {
      mixer.stopAllAction();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf, mixer]);

  // Core motions up front; the dances wait until something is actually won.
  useEffect(() => {
    CORE_MOTIONS.forEach(loadMotion);
  }, [loadMotion]);

  // Shadows on every mesh + LIVING snow on his up-facing surfaces. He walks
  // through the snowfall, so his shoulders / head / hair gather some — but NOT
  // his legs or hands, which swing through every stride and would shed it. We pass
  // the avatar's bind feet→head extent so applyTopSnow can gate the snow to the
  // upper body by each vertex's animated height (skinned variant → tracks the live
  // pose). `dynamic.hold` keys off the Avaturn mesh names: hair nests snow, cloth
  // holds most of it, warm skin (avaturn_body = face/nose/neck) keeps only passing
  // flecks. The cover level itself is simulated per frame in useFrame below.
  // The per-material guard makes shared avatar materials safe.
  useEffect(() => {
    // Union bind-pose Y extent across every mesh = the feet→head range the snow
    // gate normalises against (all Avaturn meshes share one bind space, so their
    // geometry-space Y is directly comparable).
    let minY = Infinity;
    let maxY = -Infinity;
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const geo = m.geometry as THREE.BufferGeometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      if (geo.boundingBox) {
        minY = Math.min(minY, geo.boundingBox.min.y);
        maxY = Math.max(maxY, geo.boundingBox.max.y);
      }
    });
    const bodyBounds =
      Number.isFinite(minY) && maxY > minY ? { min: minY, max: maxY } : undefined;

    const holdFor = (name: string) => {
      const n = name.toLowerCase();
      if (n.includes("hair")) return 1.0; // snow nests in hair
      if (n.includes("body")) return 0.35; // warm skin — face/nose shed almost all of it
      return 0.9; // clothing shoulders
    };
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) =>
        applyTopSnow(mat as THREE.Material, {
          skinned: true,
          bodyBounds,
          dynamic: { hold: holdFor(m.name) },
        }),
      );
    });
  }, [gltf]);

  // --- bottom→top reveal via a rising world-space clipping plane ------------
  const reveal = useRef({ t: 0, active: false, baseY: 0, done: false });
  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), []);

  const setClipping = (on: boolean) => {
    const planes = on ? [clipPlane] : [];
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => {
        (mat as THREE.Material).clippingPlanes = planes;
        (mat as THREE.Material).clipShadows = on;
        (mat as THREE.Material).needsUpdate = true;
      });
    });
  };

  useEffect(() => {
    gl.localClippingEnabled = true;
    // Stand at the spawn node and begin the reveal.
    resetCursor(nav);
    nav.progress = spineProgress(nav.edgeId, nav.tAB);
    const p0y =
      edgeCurves.get(nav.edgeId)?.getPointAt(THREE.MathUtils.clamp(nav.tAB, 0, 1)).y ?? 0;
    reveal.current = { t: 0, active: true, baseY: p0y, done: false };
    clipPlane.constant = p0y - 0.15; // start fully hidden (show nothing)
    setClipping(true);
    onLoaded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- per-frame: idle → walk overrides → move → orient → reveal -----------
  const walk = useRef({ amount: 0, phase: 0, yaw: 0, fast: 0 });
  // Kick sequence: elapsed clip time, whether the impact frame has fired yet,
  // and the blend weight that swaps the run/idle pose out for the kick.
  const kick = useRef({ t: 0, fired: false, weight: 0, spin: 0, playing: false, wait: 0 });
  // LIVING-snow simulation (see snowcover.ts): how much snow he currently
  // carries, edge-detect memory for the impulse sheds, and the schedules for
  // the periodic full-body SHAKE and the smaller random clump-sloughs.
  // Simulated here because this frame loop owns the locomotion truth.
  const snowSim = useRef({
    cover: avatarSnowUniforms.uCover.value,
    t: 0,
    air: false,
    shot: false,
    shakeT: SHAKE_DUR + 9, // time since the last shake began (starts expired)
    // Negative = not seeded yet. The first delays are still random, but the
    // dice are rolled on the first frame instead of here: a useRef initializer
    // runs during render, and random-during-render is impure.
    nextShake: -1,
    nextSlough: -1,
  });
  const shakeQ = useMemo(() => new THREE.Quaternion(), []);
  // Shed-flake pool: world-space positions (the points object sits at the scene
  // origin, a sibling of the moving rig, so emitted snow does NOT follow him).
  const flakeGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(FLAKE_N * 3).fill(-999);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return geo;
  }, []);
  const flakeMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        map: makeFlakeTexture(),
        color: "#eef3fb",
        size: 0.055,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    [],
  );
  const flakePool = useRef({ vel: new Float32Array(FLAKE_N * 3), life: new Float32Array(FLAKE_N), cursor: 0 });
  const flakeDebt = useRef(0);
  // Drop `n` flakes around the head/shoulders at (x, y, z). `clump` clusters them
  // into one clod letting go from a single spot; `fling` is the lateral scatter
  // a shake adds. Recycles the oldest slots when the pool wraps.
  const emitFlakes = (n: number, x: number, y: number, z: number, r: number, clump: boolean, fling: number) => {
    const fp = flakeGeo.attributes.position.array as Float32Array;
    const pool = flakePool.current;
    const ang = Math.random() * Math.PI * 2;
    const cx = clump ? x + Math.cos(ang) * r : x;
    const cz = clump ? z + Math.sin(ang) * r : z;
    for (let i = 0; i < n; i++) {
      const slot = pool.cursor++ % FLAKE_N;
      const j = slot * 3;
      const a2 = Math.random() * Math.PI * 2;
      const rr = clump ? Math.random() * 0.09 : Math.random() * r;
      fp[j] = cx + Math.cos(a2) * rr;
      fp[j + 1] = y + (Math.random() - 0.5) * (clump ? 0.08 : 0.35);
      fp[j + 2] = cz + Math.sin(a2) * rr;
      pool.vel[j] = (Math.random() - 0.5) * (0.22 + fling);
      pool.vel[j + 1] = -0.15 - Math.random() * 0.3;
      pool.vel[j + 2] = (Math.random() - 0.5) * (0.22 + fling);
      pool.life[slot] = 0.9 + Math.random() * 0.5;
    }
    flakeGeo.attributes.position.needsUpdate = true;
  };
  const q = useMemo(() => new THREE.Quaternion(), []);
  const target = useMemo(() => new THREE.Quaternion(), []);
  // Drive a bone toward (rest ∘ offsets), blended in by `amount`. Rebuilding the
  // target from the captured rest pose every frame — instead of multiplying onto
  // the bone's live quaternion — is what keeps the gait from integrating into a
  // slant. At amount 0 the bone stays on its idle value; at 1 it's the full pose.
  const drive = (
    name: keyof typeof bones,
    amount: number,
    offsets: [THREE.Vector3, number][],
  ) => {
    const bone = bones[name];
    const base = rest[name];
    if (!bone || !base) return;
    target.copy(base);
    for (const [axis, angle] of offsets) {
      if (angle === 0) continue;
      q.setFromAxisAngle(axis, angle);
      target.multiply(q);
    }
    bone.quaternion.slerp(target, amount);
  };

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    mixer.update(delta);

    // Jump hop — a shared vertical offset added to the feet-on-ground position
    // below. Driven by the mini-game jump key (Space); 0 when not jumping.
    const jy = stepJump(delta);

    // --- one-shot moves: kick / vault / dance -------------------------------
    // `game.move` is set by an obstacle (kick or vault), by the Space hop, or by
    // a game win (dance). Start it, drive its impact frame and body spin, then
    // fade it out when the clip is spent.
    const k = kick.current;
    const move = game.move;
    const action = move ? (oneShots.current.get(move.clip) ?? null) : null;

    // The dances are fetched lazily (they're the big files), so warm them as soon
    // as the visitor is somewhere they could win: a kiosk game is open, or
    // they've started an end of curling. loadMotion is idempotent.
    if (game.modal || game.curlStones > 0) LAZY_MOTIONS.forEach(loadMotion);

    if (move && !k.playing) {
      if (!action && move.kind === "dance") {
        // First win of the session may land before the clip has arrived: ask for
        // it and hold the move briefly rather than silently skipping the dance.
        loadMotion(move.clip);
        k.wait += delta;
        if (k.wait > 3) {
          k.wait = 0;
          endMove();
        }
      } else if (action) {
        k.wait = 0;
        k.playing = true;
        k.t = 0;
        k.fired = false;
        // Kicks are all retimed to the same beat so a slow clip (roundhouse runs
        // 2.53 s) doesn't strand the runner while a quick one looks rushed. A
        // vault instead matches the hop it's riding, so the legs are tucked
        // exactly while the avatar is off the ground.
        const dur = action.getClip().duration;
        if (move.kind === "kick") {
          action.timeScale = THREE.MathUtils.clamp(dur / KICK_SECONDS, 0.8, 1.8);
        } else if (move.kind === "vault") {
          const airtime = Math.max(0.35, (2 * (move.v0 ?? JUMP_V0)) / GRAVITY);
          action.timeScale = THREE.MathUtils.clamp(dur / airtime, 1, 2.8);
        } else if (move.kind === "throw") {
          // The throw mocap is a leisurely 4.9 s; retime it so the toss lands in
          // THROW_SECONDS and the ball leaves the hand at a responsive moment.
          action.timeScale = THREE.MathUtils.clamp(dur / THROW_SECONDS, 1, 4);
        } else {
          action.timeScale = 1;
        }
        action.reset().setEffectiveWeight(1).play();
      } else if (move.kind === "kick") {
        // No clip loaded — clear the obstacle instantly, so a missing animation
        // file can never leave the runner frozen in the path.
        landKick();
        endMove();
      } else if (move.kind === "throw") {
        releaseThrow(); // no clip: still launch the snowball this frame
        endMove();
      } else {
        endMove(); // a vault still hops (the integrator owns that), just unposed
      }
    }

    if (k.playing && move && action) {
      k.t += delta;
      const dur = action.getClip().duration / (action.timeScale || 1);
      if (!k.fired && k.t >= dur * move.impact) {
        if (move.kind === "kick") landKick(); // foot connects: obstacle launches
        else if (move.kind === "throw") releaseThrow(); // ball leaves the hand
        if (move.kind === "kick" || move.kind === "throw") k.fired = true;
      }
      // Whole-body spin, eased across the clip (see KICK_MOVES).
      const e = Math.min(1, k.t / dur);
      k.spin = move.spin * (0.5 - 0.5 * Math.cos(Math.PI * e));
      // A dance is abandoned the moment the visitor sets off again.
      const bail = move.kind === "dance" && (nav.route.length > 0 || game.modal);
      if (k.t >= dur || bail) {
        action.fadeOut(0.25);
        k.playing = false;
        endMove();
      }
    } else if (!move) {
      k.playing = false;
      k.spin = 0; // a full turn ends on the original facing, so this can't pop
    }
    // Blend the one-shot over the locomotion pose (and back out on recovery).
    k.weight += ((k.playing ? 1 : 0) - k.weight) * Math.min(1, delta * 12);
    const kw = k.weight;

    // Ease along the ROUTE. A fresh stumble (lurch 1 → 0) briefly cuts the walk
    // to ~35% so clipping a log costs real ground, then eases back. Only a KICK
    // holds station: a vault carries the runner over mid-stride, and a dance
    // only ever plays when they're already standing still.
    const lu = game.lurch;
    const blocked = game.move?.kind === "kick";
    const moving = nav.route.length > 0 && reveal.current.done && !blocked;
    if (moving) {
      const leg0 = nav.route[nav.step];
      if (leg0) nav.dir = leg0.forward ? 1 : -1;
      const speedM = WALK_SPEED * TRAIL_METRES * (game.sprint ? SPRINT_MULT : 1);
      advanceRoute(nav, speedM * (1 - 0.65 * lu) * delta, edgeLens);
    }
    // Derive the legacy spine fraction — the games / HUD still read one scalar
    // along the résumé spine. On a scenic-loop edge spineProgress is -1: HOLD the
    // last on-spine value so u-crossing games can't see a false 0-jump.
    const sp = spineProgress(nav.edgeId, nav.tAB);
    if (sp >= 0) nav.progress = sp;
    const arrived = nav.route.length === 0;
    const wasMoving = nav.moving;
    nav.moving = moving;
    // Only a real arrival advances the journey — stopping to kick must not fire
    // the waypoint callback.
    if (wasMoving && !moving && arrived) onArrive?.();

    // Gait blend + phase.
    const w = walk.current;
    w.amount += ((moving ? 1 : 0) - w.amount) * Math.min(1, delta * 7);
    const a = w.amount;
    // Sprint crossfade: walk loop → jog loop.
    w.fast += ((game.sprint ? 1 : 0) - w.fast) * Math.min(1, delta * 4);
    const f = loco.current.run ? w.fast : 0;

    // --- living snow: gather standing in the snowfall, shed on the move -------
    // One scalar integrated to equilibrium: standing still it climbs toward
    // "dusted" over ~30 s (the gust term waxes/wanes the flurries so even pure
    // accumulation breathes); walking shakes most of it off within ~7 s;
    // sprinting strips it in ~2; a vault landing or a kick/throw/dance knocks a
    // chunk loose at once. On top of that, two idle behaviours keep it honest:
    // a scheduled full-body SHAKE (he shivers the snow off like anyone standing
    // in a snowfall does) and random clump-sloughs. EVERY loss leaves the body
    // as visible falling flakes via the pool above, so snow never just fades —
    // it drops off his shoulders.
    {
      const s = snowSim.current;
      if (s.nextShake < 0) {
        s.nextShake = 11 + Math.random() * 9;
        s.nextSlough = 5 + Math.random() * 5;
      }
      // Dev-only time scale for headless verification: the capture rig renders
      // ~1 fps software GL, dilating the frame-delta clock ~20×, so a capture
      // sets window.__jrnSnowBoost to run the weather at design cadence anyway.
      // Stripped from production builds; real GPUs never need it.
      const boost =
        process.env.NODE_ENV !== "production"
          ? ((window as unknown as { __jrnSnowBoost?: number }).__jrnSnowBoost ?? 1)
          : 1;
      const sdt = delta * boost;
      s.t += sdt;
      s.shakeT += sdt;
      const gust = 0.7 + 0.3 * Math.sin(s.t * 0.11) * Math.sin(s.t * 0.043 + 1.7);
      const fall = 0.024 * gust; // flakes landing on him, per second
      let shed = 0.02 + (moving ? 0.11 + 0.3 * f : 0); // stride shake-off
      const idle = !moving && !k.playing && reveal.current.done;
      // Time for the scheduled shake? Needs snow worth shedding and a settled body.
      if (idle && s.t >= s.nextShake && s.cover > 0.26 && s.shakeT > SHAKE_DUR + 2) {
        s.shakeT = 0;
        s.nextShake = s.t + 13 + Math.random() * 13;
      }
      const shaking = s.shakeT < SHAKE_DUR;
      if (shaking) shed += 2.1; // the shiver dumps ~4/5 of the cover over its 0.8 s

      const before = s.cover;
      s.cover += (fall * (1 - s.cover) - shed * s.cover) * sdt;
      const air = jy > 0.12;
      if (s.air && !air) s.cover *= 0.55; // vault/hop landing thumps it loose
      if (k.playing && !s.shot) s.cover *= 0.75; // a kick/throw/dance starts with a jolt
      s.air = air;
      s.shot = k.playing;

      const gp = group.current?.position;
      // Random clump-slough: every so often a clod just lets go on its own.
      if (idle && !shaking && s.t >= s.nextSlough) {
        s.nextSlough = s.t + 5 + Math.random() * 6;
        if (s.cover > 0.16 && gp) {
          s.cover *= 0.93;
          emitFlakes(7, gp.x, gp.y + 1.3 + Math.random() * 0.35, gp.z, 0.17, true, 0);
        }
      }
      s.cover = THREE.MathUtils.clamp(s.cover, 0, 1);

      // Whatever the body lost this frame leaves as flakes (debt-accumulated so
      // slow trickles still emit whole flakes now and then).
      const lost = Math.max(0, before - s.cover);
      if (gp && lost > 0) {
        flakeDebt.current += lost * (shaking ? 380 : 260);
        const n = Math.floor(flakeDebt.current);
        if (n > 0) {
          flakeDebt.current -= n;
          emitFlakes(
            Math.min(n, 12),
            gp.x,
            gp.y + 1.2 + Math.random() * 0.5,
            gp.z,
            shaking ? 0.26 : 0.19,
            false,
            shaking ? 0.55 : 0,
          );
        }
      }

      // The shiver itself: a decaying ~7 Hz wobble through head/chest/shoulders,
      // layered ADDITIVELY over whatever pose the mixer just wrote — so it plays
      // fine over the idle clip without fighting it.
      if (shaking) {
        const env = Math.exp(-2.6 * s.shakeT) * Math.sin(s.shakeT * Math.PI * 2 * 7);
        shakeQ.setFromAxisAngle(YAXIS, env * 0.17);
        bones.Head?.quaternion.multiply(shakeQ);
        shakeQ.setFromAxisAngle(YAXIS, env * 0.07);
        bones.Spine1?.quaternion.multiply(shakeQ);
        shakeQ.setFromAxisAngle(ZAXIS, env * 0.05);
        bones.LeftShoulder?.quaternion.multiply(shakeQ);
        shakeQ.setFromAxisAngle(ZAXIS, -env * 0.05);
        bones.RightShoulder?.quaternion.multiply(shakeQ);
      }

      // Advance airborne flakes: drag-limited fall, recycled when spent.
      const fp = flakeGeo.attributes.position.array as Float32Array;
      const pool = flakePool.current;
      let alive = false;
      for (let i = 0; i < FLAKE_N; i++) {
        if (pool.life[i] <= 0) continue;
        pool.life[i] -= delta;
        const j = i * 3;
        if (pool.life[i] <= 0) {
          fp[j + 1] = -999;
        } else {
          pool.vel[j + 1] = Math.max(pool.vel[j + 1] - FLAKE_GRAV * delta, -FLAKE_VMAX);
          fp[j] += pool.vel[j] * delta;
          fp[j + 1] += pool.vel[j + 1] * delta;
          fp[j + 2] += pool.vel[j + 2] * delta;
        }
        alive = true;
      }
      if (alive) flakeGeo.attributes.position.needsUpdate = true;

      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __jrnSnowCover?: number }).__jrnSnowCover = s.cover;
      }
      avatarSnowUniforms.uCover.value = s.cover;
      avatarSnowUniforms.uTime.value = s.t;
    }

    const walkAction = loco.current.walk;

    // Body bob — the vertical dip that has to land ON each footfall. When a real
    // clip drives the legs, take it FROM that clip rather than free-running a
    // sine (which beats against the footfalls and reads as a limp).
    //
    // ONE 2π turn per clip cycle: there are two strikes in a cycle and |sin| dips
    // twice per turn, so that's one dip per footfall. Each gait has its own strike
    // phase (walk 0.215/0.690, jog 0.26/0.78), so each carries its own offset.
    const bobOf = (act: THREE.AnimationAction | null, phase: number) => {
      if (!act) return 0;
      const cycle = act.getClip().duration || 1;
      return Math.abs(Math.sin((act.time / cycle) * Math.PI * 2 + phase));
    };
    let bobN: number;
    if (walkAction || loco.current.run) {
      // Crossfade the two loops' bobs by the same weight the poses use. Picking
      // whichever is louder instead would jump the body at the switch: the loops
      // are 1.07 s and 0.77 s, so their phases are unrelated.
      bobN =
        bobOf(walkAction, WALK_BOB_PHASE) * (1 - f) +
        bobOf(loco.current.run, RUN_BOB_PHASE) * f;
    } else {
      if (w.amount > 0.001) w.phase += delta * WALK_CADENCE;
      bobN = Math.abs(Math.sin(w.phase));
    }

    // A one-shot (kick / vault / dance / throw) ducks the locomotion out from
    // under it as it blends in, so its full-body pose reads cleanly.
    const duck = kw;
    if (walkAction || loco.current.run) {
      // Real motion clips: crossfade idle ↔ walk ↔ jog by weight, all of them
      // ducking under whatever replace one-shot is playing.
      walkAction?.setEffectiveWeight(a * (1 - f) * (1 - duck));
      loco.current.run?.setEffectiveWeight(a * f * (1 - duck));
      idleAction.current?.setEffectiveWeight((1 - a) * (1 - duck));
    } else if (a > 0.001) {
      // Procedural gait, applied as a blended offset from the rest pose (the `a`
      // ramp is the slerp weight now, not a multiplier baked into each angle).
      const ph = w.phase;
      const sL = Math.sin(ph);
      const sR = Math.sin(ph + Math.PI);
      // Legs: hip flexion, knee bend during swing, ankle roll.
      drive("LeftUpLeg", a, [[XAXIS, sL * WALK.legSwing]]);
      drive("RightUpLeg", a, [[XAXIS, sR * WALK.legSwing]]);
      drive("LeftLeg", a, [[XAXIS, Math.max(0, Math.sin(ph + 0.5)) * WALK.kneeBend]]);
      drive("RightLeg", a, [[XAXIS, Math.max(0, Math.sin(ph + Math.PI + 0.5)) * WALK.kneeBend]]);
      drive("LeftFoot", a, [[XAXIS, -sL * WALK.footRoll]]);
      drive("RightFoot", a, [[XAXIS, -sR * WALK.footRoll]]);
      // Arms swing opposite the legs, with a little elbow bend.
      drive("LeftArm", a, [[XAXIS, -sL * WALK.armSwing]]);
      drive("RightArm", a, [[XAXIS, -sR * WALK.armSwing]]);
      drive("LeftForeArm", a, [[XAXIS, (0.5 + 0.5 * sL) * WALK.elbowBend]]);
      drive("RightForeArm", a, [[XAXIS, (0.5 + 0.5 * sR) * WALK.elbowBend]]);
      // Pelvis sway + lead, torso counter-rotation, subtle forward lean.
      drive("Hips", a, [[ZAXIS, sL * WALK.hipSway], [YAXIS, sL * WALK.hipTwist]]);
      drive("Spine1", a, [[YAXIS, -sL * WALK.torsoTwist]]);
      drive("Spine", a, [[XAXIS, WALK.lean]]);
    }

    // Position + facing along the current graph edge's curve.
    const g = group.current;
    const ec = edgeCurves.get(nav.edgeId);
    if (g && ec) {
      const tt = THREE.MathUtils.clamp(nav.tAB, 0, 1);
      const p = ec.getPointAt(tt);
      // Plant on the RESAMPLED ground at the avatar's XZ, not the walk curve's
      // baked Y: the Catmull-Rom curve undershoots the terrain on hills, so the
      // feet sank below the (re-sampled) path ribbon even at rest. FOOT_CLEAR
      // seats the soles just on the ribbon (drawn at height + 0.06); WALK_LIFT
      // then adds a touch more while walking to cover the stance-leg dip left by
      // the removed pelvis bob. Tune these two if it ever floats or sinks.
      const FOOT_CLEAR = 0.1;
      const WALK_LIFT = 0.16;
      // walkHeight, not height: over the pond the walkable ground is the
      // bridge DECK, not the basin floor beneath it.
      const groundY = walkHeight(p.x, p.z);
      const bob = bobN * WALK.bob * w.amount;
      g.position.set(
        p.x,
        groundY + FOOT_CLEAR + bob + WALK_LIFT * w.amount + jy - lu * 0.12,
        p.z,
      );
      avatarPos.x = p.x;
      avatarPos.y = g.position.y;
      avatarPos.z = p.z;

      // Face travel direction while walking — and while squaring up to kick,
      // since the obstacle is straight down-trail. Standing still, turn to face
      // whatever a snowball throw is aimed at, else the camera (the chase-cam
      // sits behind the avatar, so otherwise the visitor sees the back of a head).
      let targetYaw: number;
      const aiming = !moving && faceTarget.active;
      if (moving || blocked) {
        const tan = ec.getTangentAt(tt);
        const dir = nav.dir;
        targetYaw = Math.atan2(tan.x * dir, tan.z * dir) + AVATAR_FACING_OFFSET;
      } else if (aiming) {
        targetYaw =
          Math.atan2(faceTarget.x - p.x, faceTarget.z - p.z) + AVATAR_FACING_OFFSET;
      } else {
        targetYaw =
          Math.atan2(camera.position.x - p.x, camera.position.z - p.z) +
          AVATAR_FACING_OFFSET;
      }
      // Shortest-arc smoothing — snappy mid-walk or snapping to a throw, an
      // unhurried turn when just idling toward the camera.
      let dyaw = targetYaw - w.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      w.yaw += dyaw * Math.min(1, delta * (moving || blocked || aiming ? 6 : 3.5));
      // YXZ = yaw first, then a facing-relative forward pitch — the stumble
      // trip-lean (squared so it snaps in hard and eases out).
      g.rotation.order = "YXZ";
      g.rotation.y = w.yaw + k.spin;
      g.rotation.x = lu * lu * 0.42;
    }

    // Reveal animation.
    const r = reveal.current;
    if (r.active) {
      r.t += delta / REVEAL_DURATION;
      const e = 1 - Math.pow(1 - Math.min(r.t, 1), 3); // easeOutCubic
      clipPlane.constant = THREE.MathUtils.lerp(r.baseY - 0.15, r.baseY + 2.1, e);
      if (r.t >= 1) {
        r.active = false;
        r.done = true;
        setClipping(false);
        nav.revealed = true;
        onReady?.();
      }
    }
  });

  return (
    <group>
      <primitive ref={group} object={gltf.scene} />
      {/* Shed snow — world-space, so it drops where it left him as he walks on. */}
      <points geometry={flakeGeo} material={flakeMat} frustumCulled={false} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Last-ditch placeholder if no avatar GLB can be loaded at all — the scene
// still has a walker so the journey never breaks.
function CapsuleWalker({ edgeCurves, nav, onLoaded, onReady, onArrive }: Props) {
  const group = useRef<THREE.Group>(null);
  const walk = useRef({ yaw: 0 });
  const edgeLens = useMemo(() => {
    const m = new Map<string, number>();
    edgeCurves.forEach((c, id) => m.set(id, c.getLength()));
    return m;
  }, [edgeCurves]);
  useEffect(() => {
    resetCursor(nav);
    nav.progress = spineProgress(nav.edgeId, nav.tAB);
    onLoaded?.();
    nav.revealed = true;
    const t = setTimeout(() => onReady?.(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const jy = stepJump(delta);
    const lu = game.lurch;
    const moving = nav.route.length > 0;
    if (moving) {
      const leg0 = nav.route[nav.step];
      if (leg0) nav.dir = leg0.forward ? 1 : -1;
      advanceRoute(nav, WALK_SPEED * TRAIL_METRES * (1 - 0.65 * lu) * delta, edgeLens);
    }
    const sp = spineProgress(nav.edgeId, nav.tAB);
    if (sp >= 0) nav.progress = sp;
    const wasMoving = nav.moving;
    nav.moving = moving;
    if (wasMoving && !moving) onArrive?.();
    const g = group.current;
    const ec = edgeCurves.get(nav.edgeId);
    if (g && ec) {
      const tt = THREE.MathUtils.clamp(nav.tAB, 0, 1);
      const p = ec.getPointAt(tt);
      g.position.set(p.x, p.y + 0.9 + jy - lu * 0.12, p.z);
      avatarPos.x = p.x;
      avatarPos.y = g.position.y;
      avatarPos.z = p.z;
      const tan = ec.getTangentAt(tt);
      walk.current.yaw = Math.atan2(tan.x * nav.dir, tan.z * nav.dir);
      g.rotation.order = "YXZ";
      g.rotation.y = walk.current.yaw;
      g.rotation.x = lu * lu * 0.42;
    }
  });
  return (
    <group ref={group}>
      <mesh castShadow>
        <capsuleGeometry args={[0.32, 1.1, 6, 12]} />
        <meshStandardMaterial color="#c22b45" roughness={0.8} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
class AvatarBoundary extends Component<
  { children: ReactNode; onError: () => void; resetKey: string },
  { errored: boolean }
> {
  state = { errored: false };
  static getDerivedStateFromError() {
    return { errored: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.errored)
      this.setState({ errored: false });
  }
  render() {
    if (this.state.errored) return null;
    return this.props.children;
  }
}

// Warm the cache in the browser only — never during SSR/prerender.
if (typeof window !== "undefined") useGLTF.preload(AVATAR_URL);
