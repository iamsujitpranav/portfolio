"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { height } from "@/lib/journey/terrain";
import { smoothstep, lerp } from "@/lib/journey/noise";
import { pushToast, playThrow, game, avatarPos } from "@/lib/journey/game";
import { markGame } from "@/lib/journey/passport";

// Snowball toss. Snowmen stand just off the trail; click one and the avatar
// turns, winds up (the "throw" motion clip) and lobs a snowball in a ballistic
// arc — the ball leaves the hand on the clip's release frame, not the instant
// you click, so the toss reads. A hit poofs the snowman (it pops back a few
// seconds later so you can keep playing) and scores. Everything here is
// self-contained — targets, projectiles and puffs are fixed pools whose meshes
// are moved directly in useFrame (no per-frame React re-renders).

const GRAVITY = 16;
const FLIGHT = 0.62; // seconds to reach the target
const MAX_BALLS = 12;
const MAX_PUFFS = 16;
// The pools are fixed-size, so the JSX below iterates these constant index
// lists. Mapping over `balls.current` / `puffs.current` instead would mean
// reading a ref during render, which React (rightly) disallows — the ref holds
// per-frame simulation state that render must never depend on.
const BALL_SLOTS = Array.from({ length: MAX_BALLS }, (_, i) => i);
const PUFF_SLOTS = Array.from({ length: MAX_PUFFS }, (_, i) => i);
const HIT_R = 1.15;

// First target past the bridge (the old 0.08 spot is now the town's packed
// south-gate corner, and 0.13–0.18 is the deck itself). All five spots audited
// against every lane of the network, the pond, the far-shore oak and the Ask
// signboard.
export const TARGETS: { u: number; side: 1 | -1 }[] = [
  { u: 0.225, side: -1 },
  { u: 0.33, side: 1 },
  { u: 0.46, side: -1 },
  { u: 0.655, side: 1 },
  { u: 0.83, side: -1 },
];
export const TARGET_OFFSET = 5.5;

// A snowman's visual body (three stacked spheres, coal face, carrot, hat, arms).
function SnowmanBody() {
  return (
    <group>
      <mesh position={[0, 0.62, 0]} castShadow>
        <sphereGeometry args={[0.62, 16, 12]} />
        <meshStandardMaterial color="#f3f7fc" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 1.44, 0]} castShadow>
        <sphereGeometry args={[0.46, 16, 12]} />
        <meshStandardMaterial color="#f3f7fc" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 2.12, 0]} castShadow>
        <sphereGeometry args={[0.33, 16, 12]} />
        <meshStandardMaterial color="#f7fbff" roughness={0.85} flatShading />
      </mesh>
      {/* carrot nose */}
      <mesh position={[0, 2.12, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.07, 0.34, 8]} />
        <meshStandardMaterial color="#e8792a" roughness={0.7} flatShading />
      </mesh>
      {/* eyes */}
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} position={[x, 2.22, 0.28]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial color="#20242c" roughness={0.6} />
        </mesh>
      ))}
      {/* buttons */}
      {[0.5, 0.75, 1.0].map((y) => (
        <mesh key={y} position={[0, 0.62 + y * 0.55, 0.5]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#20242c" roughness={0.6} />
        </mesh>
      ))}
      {/* hat */}
      <mesh position={[0, 2.4, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 0.06, 14]} />
        <meshStandardMaterial color="#b23a3a" roughness={0.7} flatShading />
      </mesh>
      <mesh position={[0, 2.56, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.3, 14]} />
        <meshStandardMaterial color="#b23a3a" roughness={0.7} flatShading />
      </mesh>
      {/* twig arms */}
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[s * 0.5, 1.5, 0]} rotation={[0, 0, s * 0.9]}>
          <cylinderGeometry args={[0.03, 0.03, 0.9, 6]} />
          <meshStandardMaterial color="#5a3f26" roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  );
}

type BallState = {
  active: boolean;
  target: number; // snowman index this ball is aimed at
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
};
type PuffState = { active: boolean; t: number; pos: THREE.Vector3 };
type ManState = { hit: boolean; t: number };

// The thrower's position comes from the shared `avatarPos` in game state, so
// this component needs the trail curve only.
export default function Snowballs({ curve }: { curve: THREE.CatmullRomCurve3 }) {
  // Fixed snowman world placements.
  const spots = useMemo(() => {
    return TARGETS.map(({ u, side }) => {
      const p = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      const px = -tan.z;
      const pz = tan.x;
      const l = Math.hypot(px, pz) || 1;
      const x = p.x + (px / l) * TARGET_OFFSET * side;
      const z = p.z + (pz / l) * TARGET_OFFSET * side;
      return new THREE.Vector3(x, height(x, z), z);
    });
  }, [curve]);

  const manRefs = useRef<(THREE.Group | null)[]>([]);
  const men = useRef<ManState[]>(TARGETS.map(() => ({ hit: false, t: 0 })));

  // The snowman a wind-up is aimed at, and the release counter we last acted on.
  // The avatar's throw animation drives the release (game.throwReleaseSeq), so
  // the ball launches when the arm snaps through rather than the moment of click.
  const pending = useRef<number>(-1);
  const lastSeq = useRef<number>(0);

  const ballRefs = useRef<(THREE.Mesh | null)[]>([]);
  const balls = useRef<BallState[]>(
    Array.from({ length: MAX_BALLS }, () => ({
      active: false,
      target: -1,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      life: 0,
    })),
  );

  const puffRefs = useRef<(THREE.Mesh | null)[]>([]);
  const puffs = useRef<PuffState[]>(
    Array.from({ length: MAX_PUFFS }, () => ({ active: false, t: 0, pos: new THREE.Vector3() })),
  );

  const spawnPuff = (at: THREE.Vector3) => {
    const p = puffs.current.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.t = 0;
    p.pos.copy(at);
  };

  // Click → turn the avatar toward the snowman and start the throw. The ball is
  // launched later, on the release frame; refuse if a move (kick / dance / an
  // earlier throw) is still playing so we never queue a toss that can't fire.
  const windUp = (i: number) => {
    if (men.current[i].hit) return; // already down
    if (!playThrow(spots[i].x, spots[i].z)) return; // busy — ignore the click
    pending.current = i;
  };

  // The ball actually leaves the hand: recompute the origin from where the avatar
  // is standing now (it may have taken a step during the wind-up).
  const launchBall = (i: number) => {
    if (men.current[i].hit) return;
    const ball = balls.current.find((b) => !b.active);
    if (!ball) return;
    // avatarPos tracks the walker on every edge (loops included), unlike the
    // legacy spine scalar — so the ball always leaves from the actual hand.
    const origin = new THREE.Vector3(avatarPos.x, avatarPos.y + 1.5, avatarPos.z);
    const tgt = spots[i].clone();
    tgt.y += 1.7; // aim at the head
    const vel = tgt.clone().sub(origin).multiplyScalar(1 / FLIGHT);
    vel.y += 0.5 * GRAVITY * FLIGHT; // arc up so gravity drops it onto the target
    ball.active = true;
    ball.target = i;
    ball.pos.copy(origin);
    ball.vel.copy(vel);
    ball.life = 0;
  };

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);

    // Release frame reached (or the throw had no clip and fired instantly): send
    // the pending snowball. Guard on a strict increase so a game reset — which
    // zeroes the counter — re-syncs without launching a stray ball.
    if (game.throwReleaseSeq > lastSeq.current) {
      lastSeq.current = game.throwReleaseSeq;
      if (pending.current >= 0) {
        launchBall(pending.current);
        pending.current = -1;
      }
    } else if (game.throwReleaseSeq < lastSeq.current) {
      lastSeq.current = game.throwReleaseSeq;
      pending.current = -1;
    }

    // Snowmen: knockdown → gone → pop back.
    men.current.forEach((m, i) => {
      const g = manRefs.current[i];
      if (!g) return;
      if (m.hit) {
        m.t += dt;
        if (m.t < 0.35) {
          const k = smoothstep(0, 0.35, m.t);
          const sc = 1 - k;
          g.scale.setScalar(Math.max(0.001, sc));
          g.rotation.y += dt * 14;
          g.rotation.z = k * 1.2;
        } else if (m.t < 3.6) {
          g.scale.setScalar(0.001);
        } else {
          const k = smoothstep(3.6, 4.05, m.t);
          g.scale.setScalar(k);
          g.rotation.z = (1 - k) * 1.2;
          if (m.t >= 4.05) {
            m.hit = false;
            m.t = 0;
            g.rotation.set(0, 0, 0);
            g.scale.setScalar(1);
          }
        }
      }
    });

    // Snowballs: ballistic flight + hit test.
    balls.current.forEach((b, i) => {
      const mesh = ballRefs.current[i];
      if (!mesh) return;
      if (!b.active) {
        mesh.visible = false;
        return;
      }
      b.life += dt;
      b.vel.y -= GRAVITY * dt;
      b.pos.addScaledVector(b.vel, dt);
      mesh.visible = true;
      mesh.position.copy(b.pos);

      const man = men.current[b.target];
      const spot = spots[b.target];
      if (man && !man.hit && spot) {
        const head = spot.clone();
        head.y += 1.6;
        if (b.pos.distanceTo(head) < HIT_R) {
          man.hit = true;
          man.t = 0;
          b.active = false;
          spawnPuff(head);
          document.body.style.cursor = ""; // target vanished — don't strand the cursor
          if (game.active) {
            pushToast("Bullseye!", "score");
            markGame("snowmen", "won"); // one landed hit is the whole ask
          }
        }
      }
      // Ground / timeout.
      if (b.active && (b.pos.y <= height(b.pos.x, b.pos.z) + 0.1 || b.life > 2.2)) {
        spawnPuff(b.pos.clone());
        b.active = false;
      }
    });

    // Puffs: expand + fade.
    puffs.current.forEach((p, i) => {
      const mesh = puffRefs.current[i];
      if (!mesh) return;
      if (!p.active) {
        mesh.visible = false;
        return;
      }
      p.t += dt;
      const k = p.t / 0.5;
      mesh.visible = true;
      mesh.position.copy(p.pos);
      const sc = lerp(0.3, 2.3, k);
      mesh.scale.setScalar(sc);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - k) * 0.8;
      if (k >= 1) p.active = false;
    });
  });

  return (
    <group>
      {/* Snowmen (clickable targets) */}
      {spots.map((s, i) => (
        <group
          key={i}
          ref={(el) => {
            manRefs.current[i] = el;
          }}
          position={[s.x, s.y, s.z]}
          onClick={(e) => {
            e.stopPropagation();
            windUp(i);
          }}
          onPointerOver={() => {
            if (!men.current[i].hit) document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          <SnowmanBody />
        </group>
      ))}

      {/* Snowball projectiles */}
      {BALL_SLOTS.map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            ballRefs.current[i] = el;
          }}
          visible={false}
          castShadow
        >
          <sphereGeometry args={[0.16, 12, 10]} />
          <meshStandardMaterial color="#ffffff" roughness={0.7} flatShading />
        </mesh>
      ))}

      {/* Impact puffs */}
      {PUFF_SLOTS.map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            puffRefs.current[i] = el;
          }}
          visible={false}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[1, 16]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
