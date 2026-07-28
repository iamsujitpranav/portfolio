"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { smoothstep, lerp } from "@/lib/journey/noise";
import {
  game,
  clearObstacle,
  stumble,
  nextObstacleMove,
  startObstacleMove,
  jumpRise,
  type Move,
} from "@/lib/journey/game";
import {
  WALK_SPEED,
  KICK_STOP_LEAD,
  SPRINT_MULT,
  VAULT_MOVES,
} from "@/lib/journey/config";
import { nearestSideRoadPoint } from "@/lib/journey/sideroad";
import type { Nav } from "./Avatar";

// The obstacle course. Snow-logs and ice-rocks sit across the trail at fixed
// points. Two ways past one: tap Space to be airborne as you cross (a takeoff
// pad glows on the approach so the timing is learnable), or just run into it —
// the avatar pulls up short and
// throws a hurricane kick that launches it off the trail. Either way the runner
// never overlaps the obstacle: the kick trigger fires KICK_STOP_LEAD metres
// before contact, which is what stopped the avatar walking through logs — but
// that only clears an obstacle you CROSS while moving; a stationary spawn sitting
// inside one never triggers the kick, so it just stands through it.
// Obstacle `u` values are therefore kept off every stop waypoint (0.022 / 0.11 /
// 0.135 / 0.307 / 0.692 / 0.862 / 1.0), off the pond-bridge deck (u≈0.14–0.17,
// POND radius 10 m), AND off the TOWN SQUARE — the crossroads spawn sits at
// u≈0.535, so the whole span u≈0.49–0.575 is within 18 m of where the avatar
// materialises; no obstacle may fall in it, or the avatar spawns through it.
// (audited: scratchpad/js/verify_obstacles.ts — every entry clears square+stop+pond.)

type Kind = "log" | "rock";
export const OBSTACLES: { u: number; kind: Kind }[] = [
  { u: 0.075, kind: "log" }, // mid-street out of Old Town, clear of the bridge apron
  { u: 0.28, kind: "log" },
  { u: 0.34, kind: "rock" },
  { u: 0.44, kind: "log" }, // on the Experience→Square return leg, 38 m clear of the square
  { u: 0.63, kind: "rock" }, // on the Square→Skills leg, 38 m clear of the square
  { u: 0.71, kind: "log" },
  { u: 0.9, kind: "log" },
];

function Obstacle({
  id,
  u,
  kind,
  curve,
  nav,
}: {
  id: number;
  u: number;
  kind: Kind;
  curve: THREE.CatmullRomCurve3;
  nav: Nav;
}) {
  // World placement + facing, sampled once. kickV: how hard a stumble punts the
  // obstacle — it must outrun the avatar (world walk speed = WALK_SPEED × curve
  // length) or the kicked log just rides along inside the model. leadU: the
  // crossing trigger leads the mesh centre by ~a body's reach in *metres*, so
  // the kick fires when the avatar's front would touch the obstacle — not after
  // the model has already sunk into it. side: which way this obstacle gets
  // punted off the trail (deterministic per placement).
  const place = useMemo(() => {
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    const yaw = Math.atan2(tan.x, tan.z); // local +Z runs down-trail
    const len = curve.getLength();
    const kickV = Math.max(9, WALK_SPEED * len * 1.7);
    const leadU = 0.9 / len;
    const stopU = KICK_STOP_LEAD / len; // where the runner pulls up to kick
    // Where the avatar *decides* what to do. This has to be the widest lead any
    // move could need, so the choice is made before the earliest possible launch:
    // a vault leaves the ground rise = v0/GRAVITY seconds before the obstacle to
    // be at its apex over it, and distance is speed × time — in curve fractions
    // that's WALK_SPEED × rise, independent of trail length. Sprinting covers
    // more ground in the same rise time, so it scales by SPRINT_MULT.
    // NOTE the decision point is NOT the launch point: each move then fires at
    // its own distance (see `leadFor` below), or a kick would halt the runner out
    // here, 4.8 m from the obstacle, and swing at thin air.
    const vaultRise = Math.max(...Object.values(VAULT_MOVES).map((v) => jumpRise(v.v0)));
    const decideU = Math.max(WALK_SPEED * SPRINT_MULT * vaultRise, stopU) * 1.15;
    let side = Math.sin(u * 173.3) >= 0 ? 1 : -1;
    // Never punt debris toward the village side-road — the delivery van drives
    // that lane, and a log rolled into it would sit there for the van to hit.
    const road = nearestSideRoadPoint(p.x, p.z);
    if (road.d < 12) {
      // World direction of a local +X kick, given the group's yaw.
      const axX = Math.cos(yaw);
      const axZ = -Math.sin(yaw);
      const away = (p.x - road.x) * axX + (p.z - road.z) * axZ;
      side = away >= 0 ? 1 : -1;
    }
    return {
      pos: [p.x, p.y, p.z] as [number, number, number],
      yaw,
      kickV,
      leadU,
      stopU,
      decideU,
      side,
    };
  }, [curve, u]);

  // Rest height of the mesh centre (meshes sit at the tilt-group origin so
  // rotation.x rolls the log about its own axis) + per-kind kick tuning.
  const P =
    kind === "log"
      ? { base: 0.42, vy: 3.0, vzK: 0.9, vxK: 0.9, spin: 11, fric: 9 }
      : { base: 0.5, vy: 2.4, vzK: 0.7, vxK: 1.0, spin: 6, fric: 14 };

  const tilt = useRef<THREE.Group>(null);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null);
  const sparkGroup = useRef<THREE.Group>(null);
  const sparkMat = useRef<THREE.MeshBasicMaterial>(null);
  const puffGroup = useRef<THREE.Group>(null);
  const puffMat = useRef<THREE.MeshBasicMaterial>(null);
  const st = useRef({
    prev: 0,
    dir: 1, // last travel direction, so a kick launches it the way we're heading
    down: false,
    // The move chosen for this obstacle, and whether it has been started. Picked
    // early (decideU) and started later at the move's own trigger distance.
    plan: null as Move | null,
    started: false,
    spark: 0,
    glow: 0,
    puff: 0,
    // kicked-obstacle flight state (local frame: +Z down-trail, +X sideways)
    ky: 0,
    kz: 0,
    kx: 0,
    kvy: 0,
    kvz: 0,
    kvx: 0,
    roll: 0,
    spin: 0,
  });

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const s = st.current;
    const progress = nav.progress;
    const prev = s.prev;
    s.prev = progress;

    // Approach glow on the takeoff pad: brightens as we near from behind.
    const ahead = u - progress;
    const targetGlow = ahead > 0 ? smoothstep(0.055, 0.006, ahead) : 0;
    s.glow += (targetGlow - s.glow) * Math.min(1, dt * 8);
    if (glowMat.current) {
      const pulse = 0.55 + 0.45 * Math.sin(progress * 240);
      glowMat.current.opacity = s.glow * (s.down ? 0.12 : 0.6) * pulse;
    }

    // Launch this obstacle: forward along travel AND sideways off the trail. It
    // has to come to rest *beside* the path, because anything left on the path
    // gets run through again by the on-rails avatar moments later. `power`
    // scales a stumble-punt (1) up to a hurricane kick.
    const launch = (dir: number, power: number) => {
      s.down = true; // never re-trigger
      s.kvz = place.kickV * P.vzK * dir * power;
      s.kvx = place.kickV * P.vxK * place.side * power;
      s.kvy = P.vy * (power > 1 ? power * 1.15 : 1);
      s.spin = P.spin * dir * power;
      s.puff = 0.0001;
    };

    // A JUMP in the derived spine scalar (rejoining the spine off a scenic loop
    // snaps it across the loop's whole span) is a reposition — it must never
    // read as sprinting past this obstacle. Real frames move ≤ ~0.001.
    const teleported = Math.abs(progress - prev) > 0.03;
    const moved = !teleported && Math.abs(progress - prev) > 1e-7;
    if (moved) s.dir = Math.sign(progress - prev) || 1;

    // Well clear of this obstacle again: forget any plan, so running back up the
    // trail past a still-standing log picks a fresh move rather than re-using a
    // stale one.
    if (s.plan && Math.abs(progress - u) > place.decideU * 3) {
      s.plan = null;
      s.started = false;
    }

    if (moved && !s.down) {
      const dir = s.dir;
      const lo = Math.min(prev, progress);
      const hi = Math.max(prev, progress);

      // 1. Decide, early — this has to happen before the earliest possible
      //    launch. Skipped mid-air, so a visitor who taps Space clears the
      //    obstacle themselves instead of triggering a move.
      const uDecide = u - dir * place.decideU;
      if (!s.plan && !game.airborne && lo < uDecide && uDecide <= hi) {
        s.plan = nextObstacleMove(kind);
      }

      // 2. Execute at the distance THIS move needs: a vault launches one rise-
      //    time out so its apex lands over the obstacle, a kick waits until the
      //    runner has pulled up short of the mesh. Tested as "past the mark"
      //    rather than as a crossing window, so a move that can't start yet
      //    (another still playing — obstacles bunch up at sprint speed) retries
      //    next frame instead of being silently skipped.
      if (s.plan && !s.started) {
        const lead =
          s.plan.kind === "vault"
            ? WALK_SPEED * (game.sprint ? SPRINT_MULT : 1) * jumpRise(s.plan.v0 ?? 5.6)
            : place.stopU;
        const uGo = u - dir * lead;
        const past = dir > 0 ? progress >= uGo : progress <= uGo;
        if (past && startObstacleMove(id, s.plan)) s.started = true;
      }

      // 3. Contact point. Cleared cleanly if the avatar is off the ground (its
      //    own vault, or a well-timed Space hop); otherwise it's a stumble —
      //    though never while a vault is in progress, since blaming the runner
      //    for its own committed jump would be a false penalty.
      //
      //    A committed vault is timed to apex over the CENTRE, so its clear is
      //    scored there. The airborne window narrows with pace — the arc clears
      //    fewer metres each side of the apex the slower you cross — so a fixed
      //    metre lead before the mesh (fine at a run) can fall *outside* the
      //    window at a walk, and the vault would clear the log visually yet
      //    score nothing. A stray walk-in still stumbles at first contact, leadU
      //    out, where the body would actually meet the mesh.
      const uClear = s.plan?.kind === "vault" ? u : u - dir * place.leadU;
      if (lo < uClear && uClear <= hi) {
        if (game.airborne) {
          clearObstacle();
          s.spark = 0.0001; // pop a clear-sparkle
        } else if (s.plan?.kind !== "vault") {
          stumble();
          launch(dir, 1);
        }
      }
    }

    // A kick connects: send it flying — higher, faster and spinning harder than a
    // clumsy stumble-punt, with a sparkle as well as a snow puff.
    if (!s.down && game.moveImpactId === id) {
      launch(s.dir, 1.7);
      s.spark = 0.0001;
    }

    // Kicked-obstacle flight: ballistic hop with a damped bounce, then ground
    // friction rolls it to a stop a few metres down-trail.
    if (s.down) {
      s.kvy -= 26 * dt;
      s.ky += s.kvy * dt;
      s.kz += s.kvz * dt;
      s.kx += s.kvx * dt;
      s.roll += s.spin * dt;
      if (s.ky <= 0) {
        s.ky = 0;
        if (s.kvy < -1.2) {
          s.kvy = -s.kvy * 0.4; // bounce
          s.kvz *= 0.65;
          s.kvx *= 0.65;
          s.spin *= 0.7;
        } else {
          s.kvy = 0; // grounded — friction
          const f = Math.max(0, 1 - P.fric * dt * 0.45);
          s.kvz *= f;
          s.kvx *= f;
          s.spin *= f;
        }
      }
    }
    if (tilt.current) {
      tilt.current.position.set(s.kx, P.base + s.ky, s.kz);
      tilt.current.rotation.x = s.roll;
    }

    // Snow puff on impact: an expanding, fading ground ring.
    if (s.puff > 0) {
      s.puff += dt;
      const k = s.puff / 0.45;
      if (puffGroup.current) {
        const sc = lerp(0.6, 3.2, k);
        puffGroup.current.scale.set(sc, sc, sc);
      }
      if (puffMat.current) puffMat.current.opacity = Math.max(0, 1 - k) * 0.75;
      if (k >= 1) s.puff = 0;
    } else if (puffMat.current) {
      puffMat.current.opacity = 0;
    }

    // Clear-sparkle: an expanding, fading ring.
    if (s.spark > 0) {
      s.spark += dt;
      const k = s.spark / 0.55;
      if (sparkGroup.current) {
        const sc = lerp(0.5, 3.4, k);
        sparkGroup.current.scale.set(sc, sc, sc);
      }
      if (sparkMat.current) sparkMat.current.opacity = Math.max(0, 1 - k) * 0.85;
      if (k >= 1) s.spark = 0;
    } else if (sparkMat.current) {
      sparkMat.current.opacity = 0;
    }
  });

  return (
    <group position={place.pos} rotation={[0, place.yaw, 0]}>
      {/* takeoff pad — glows on approach */}
      <mesh position={[0, 0.06, -2.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.5, 28]} />
        <meshBasicMaterial
          ref={glowMat}
          color="#8fe6ff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* the obstacle itself — meshes sit at the tilt-group origin (the group is
          lifted to rest height in useFrame) so a kick can roll it about its own
          axis while it flies down-trail */}
      <group ref={tilt} position={[0, kind === "log" ? 0.42 : 0.5, 0]}>
        {kind === "log" ? (
          <group>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
              <cylinderGeometry args={[0.42, 0.42, 3.4, 12]} />
              <meshStandardMaterial color="#6b4a2f" roughness={0.95} flatShading />
            </mesh>
            {/* snow dusting along the top */}
            <mesh position={[0, 0.34, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.44, 0.44, 3.42, 12, 1, false, 0, Math.PI]} />
              <meshStandardMaterial color="#eef4fb" roughness={0.85} flatShading />
            </mesh>
          </group>
        ) : (
          <group>
            <mesh castShadow receiveShadow>
              <icosahedronGeometry args={[0.85, 0]} />
              <meshStandardMaterial color="#8b93a0" roughness={1} flatShading />
            </mesh>
            <mesh position={[0, 0.42, 0]}>
              <icosahedronGeometry args={[0.7, 0]} />
              <meshStandardMaterial color="#eef4fb" roughness={0.9} flatShading />
            </mesh>
          </group>
        )}
      </group>

      {/* snow puff on impact */}
      <group ref={puffGroup} position={[0, 0.12, 0]} scale={0.6}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.9, 24]} />
          <meshBasicMaterial
            ref={puffMat}
            color="#dcebf8"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* clear-sparkle ring */}
      <group ref={sparkGroup} position={[0, 0.6, 0]} scale={0.5}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.72, 24]} />
          <meshBasicMaterial
            ref={sparkMat}
            color="#b6ffcf"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

export default function Obstacles({
  curve,
  nav,
}: {
  curve: THREE.CatmullRomCurve3;
  nav: Nav;
}) {
  return (
    <group>
      {OBSTACLES.map((o, i) => (
        <Obstacle key={i} id={i} u={o.u} kind={o.kind} curve={curve} nav={nav} />
      ))}
    </group>
  );
}
