"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { height } from "@/lib/journey/terrain";
import { fbm, lerp, smoothstep, clamp } from "@/lib/journey/noise";
import { buildSideRoadCurve } from "@/lib/journey/curve";
import { ROAD_HALF_WIDTH } from "@/lib/journey/sideroad";
import { skyExtra } from "@/lib/journey/daynight";
import { avatarPos } from "@/lib/journey/game";

// The village side-road: a packed-snow ribbon forking off the trail through the
// hamlet, with a delivery van shuttling along it. The van eases to a stop at each
// end, turns (steering damped so the 180° is a smooth K-turn, not a snap), and
// heads back — and switches its headlights + a pool of light on at night.
// It also BRAKES for the avatar: if the player is in its lane ahead it eases to
// a stop and waits, then pulls away gently once they step clear.

const CAR = (n: string) => `/models/car/${n}.glb`;
const VAN_SCALE = 1.25;
// Kenney car front is +Z (same as the parked fleet, which faces atan2(dir) with
// no offset), so no yaw offset is needed to drive front-first.
const VAN_FRONT = 0;

// Shuttle span. The road's END points sit ON the walking trail (they're the fork
// mouths), and below s=0.12 / above s=0.88 the lane has converged to within
// ~3.8m of the trail centerline — the avatar's territory. The van turns around
// at these marks so it can never drive onto the trail (or through the avatar
// and the logs/rocks that live there). Audited: at S_MIN/S_MAX the lane centre
// is ≥3.8m from the trail; every parked vehicle and lamp is ≥3.6m off this lane.
const S_MIN = 0.12;
const S_MAX = 0.88;

// Brake-for-avatar tuning (metres): start easing off ~7m out, be fully stopped
// by 3.2m, and never creep while they're within 2.4m in any direction.
const BRAKE_LAT = 3.2; // how far off the heading line still counts as "in the way"
const BRAKE_FAR = 7.2;
const BRAKE_NEAR = 3.2;
const HARD_STOP = 2.4;

// Packed-snow tread colours (matched to the main trail ribbon).
const CENTER: [number, number, number] = [0.68, 0.66, 0.62];
const EDGE: [number, number, number] = [0.86, 0.88, 0.93];
const COLS = [-1, -0.4, 0, 0.4, 1];

function useRoadRibbon(curve: THREE.CatmullRomCurve3) {
  return useMemo(() => {
    const N = 200;
    const COLW = COLS.length;
    const halfW = ROAD_HALF_WIDTH;
    const pos: number[] = [];
    const colr: number[] = [];
    const idx: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const perp = new THREE.Vector3();
    const t = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const p = curve.getPointAt(u);
      t.copy(curve.getTangentAt(u)).normalize();
      perp.crossVectors(t, up).normalize();
      for (const f of COLS) {
        const x = p.x + perp.x * halfW * f;
        const z = p.z + perp.z * halfW * f;
        pos.push(x, height(x, z) + 0.05, z);
        const across = smoothstep(0.15, 1, Math.abs(f));
        const wear = fbm(u * 22, f * 3, 1) * 0.5 + 0.5;
        const k = 0.86 + wear * 0.3;
        colr.push(
          lerp(CENTER[0], EDGE[0], across) * k,
          lerp(CENTER[1], EDGE[1], across) * k,
          lerp(CENTER[2], EDGE[2], across) * k,
        );
      }
    }
    for (let i = 0; i < N; i++) {
      for (let c = 0; c < COLW - 1; c++) {
        const a = i * COLW + c;
        const b = i * COLW + c + 1;
        const cc = (i + 1) * COLW + c;
        const d = (i + 1) * COLW + c + 1;
        idx.push(a, b, cc, b, d, cc);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [curve]);
}

// Smoothly ease an angle toward a target along the shortest arc.
function dampAngle(cur: number, target: number, lambda: number, dt: number) {
  let diff = target - cur;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return cur + diff * (1 - Math.exp(-lambda * dt));
}

function MovingVan({ curve }: { curve: THREE.CatmullRomCurve3 }) {
  const group = useRef<THREE.Group>(null);
  const s = useRef(S_MIN + 0.001);
  const dir = useRef(1);
  const yaw = useRef(0);
  const brake = useRef(1); // 0 = stopped for the avatar, 1 = free to drive
  const started = useRef(false);

  const { scene } = useGLTF(CAR("van"));
  const van = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      const src = m.material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      mat.metalness = 0;
      mat.roughness = 0.85;
      mat.flatShading = true;
      m.material = mat;
    });
    return c;
  }, [scene]);

  // Night lights: two headlight panes (shared material) + a forward ground pool.
  const headMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#fff3d0",
        transparent: true,
        opacity: 0,
        toneMapped: false,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );
  const poolMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffe6b0",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const u = clamp(s.current, S_MIN, S_MAX);
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u).normalize();

    // Brake for the avatar: slow to a stop when they're in the lane ahead
    // (positive along our travel direction, within a lane's width of our line),
    // and never creep while they're right next to the bodywork. Braking is
    // sharp (a driver stamping the pedal); pulling away again is gentle.
    const ax = avatarPos.x - p.x;
    const az = avatarPos.z - p.z;
    const d = Math.hypot(ax, az);
    const ahead = (ax * tan.x + az * tan.z) * dir.current;
    const lat = Math.abs(ax * tan.z - az * tan.x);
    let free = 1;
    if (ahead > 0 && lat < BRAKE_LAT)
      free = clamp((d - BRAKE_NEAR) / (BRAKE_FAR - BRAKE_NEAR), 0, 1);
    if (d < HARD_STOP) free = 0;
    brake.current += (free - brake.current) * Math.min(1, dt * (free < brake.current ? 9 : 1.4));

    // Ease speed to near-zero at the turnarounds so the 180° happens while
    // nearly stopped.
    const k = (u - S_MIN) / (S_MAX - S_MIN);
    const ease = smoothstep(0, 0.08, k) * smoothstep(1, 0.92, k);
    const SPEED = 0.05; // fraction of the road per second (calm)
    s.current += dir.current * SPEED * (0.2 + 0.8 * ease) * brake.current * dt;
    if (s.current >= S_MAX) {
      s.current = S_MAX;
      dir.current = -1;
    } else if (s.current <= S_MIN) {
      s.current = S_MIN;
      dir.current = 1;
    }
    const target = Math.atan2(tan.x * dir.current, tan.z * dir.current) + VAN_FRONT;

    if (!started.current) {
      yaw.current = target; // don't spin up from 0 on the first frame
      started.current = true;
    }
    yaw.current = dampAngle(yaw.current, target, 3.5, dt);

    if (group.current) {
      group.current.position.set(p.x, p.y, p.z);
      group.current.rotation.y = yaw.current;
    }
    const n = skyExtra.night;
    headMat.opacity = n;
    poolMat.opacity = n * 0.55;
  });

  return (
    <group ref={group}>
      <primitive object={van} scale={VAN_SCALE} />
      {/* headlights (front is +Z) */}
      {[-0.42, 0.42].map((hx, i) => (
        <mesh
          key={i}
          position={[hx * VAN_SCALE, 0.55 * VAN_SCALE, 1.42 * VAN_SCALE]}
          rotation={[0, 0, 0]}
          frustumCulled={false}
        >
          <planeGeometry args={[0.28, 0.18]} />
          <primitive object={headMat} attach="material" />
        </mesh>
      ))}
      {/* pool of light thrown on the road ahead */}
      <mesh position={[0, 0.04, 3.0 * VAN_SCALE]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <circleGeometry args={[2.4, 24]} />
        <primitive object={poolMat} attach="material" />
      </mesh>
    </group>
  );
}

export default function SideRoad() {
  const curve = useMemo(() => buildSideRoadCurve(), []);
  const ribbon = useRoadRibbon(curve);
  return (
    <group>
      <mesh geometry={ribbon} receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={1}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <MovingVan curve={curve} />
    </group>
  );
}

useGLTF.preload(CAR("van"));
