"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { height, walkHeight } from "@/lib/journey/terrain";
import { SETTLEMENT_PLOTS } from "@/lib/journey/settlement";
import { applyTopSnow } from "@/lib/journey/snowcover";
import { edgeLength, edgePointXZ } from "@/lib/journey/graph";
import { skyExtra } from "@/lib/journey/daynight";
import { avatarPos } from "@/lib/journey/game";

// Vehicles ACROSS the road network. In town: a snow-dusted car at each of a few
// buildings, a delivery van at the shop, an SUV + a snow-plough tractor at the
// petrol bunk, and a wooden sled leaning by a cabin — all anchored to a
// settlement plot (which already carries a trail-facing frame + a tree-cleared
// apron). In the countryside: a parked car at the roadside of most homesteads
// (audited literals — dress_audit.ts), plus a pickup truck that DRIVES the
// south country road (Town Gate → Crossroads → the Summit approach and back),
// braking for the avatar exactly like the village van.

const CAR = (n: string) => `/models/car/${n}.glb`;
const HOLIDAY = (n: string) => `/models/holiday/${n}.glb`;

// --- a cloned, Kenney-material-fixed GLB ---------------------------------------
function Gltf({
  url,
  position,
  rotation,
  scale = 1,
}: {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale?: number;
}) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      const src = m.material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      mat.metalness = 0; // Kenney GLBs ship metalness=1 → render black
      mat.roughness = 0.85;
      mat.flatShading = true;
      applyTopSnow(mat); // real snow on the hood/roof, following the body's normals
      m.material = mat;
    });
    return c;
  }, [scene]);
  return <primitive object={obj} position={position} rotation={rotation} scale={scale} />;
}

// Snow on the vehicles is no longer a manual white slab — the shared top-snow
// shader (applyTopSnow, wired into Gltf above) gathers real snow on each body's
// up-facing panels, following the actual roof/hood normals.

type VSpec = {
  plot: number; // index into SETTLEMENT_PLOTS
  url: string;
  right: number; // metres to the plot's right (facing the trail)
  fwd: number; // metres toward the trail
  scale: number;
  spin: number; // extra yaw (rad) on top of "face along the trail"
  sink?: number;
};

// The parked fleet. right/fwd are in each plot's own frame (fwd = toward the
// trail). "spin" trims the facing; a vehicle's front is -Z in the Kenney kit, so
// the base yaw already points it up the road — spin just nudges/reverses it.
//
// PLACEMENT RULE: the side-road van drives the lane that runs 4.5–5m in front
// of these plots, so every vehicle must park ≥3.5m from the road CENTERLINE
// (lane ribbon half-width 2.3 + a car's half-width) — beside its building, not
// on its frontage. Audited numerically (min is the SUV at 3.64m); re-check
// against SIDE_ROAD_XZ if you move one.
// Plot indices follow the TOWN-SQUARE settlement SPEC: 0 petrol, 1 shop,
// 2-4 west cabins, 5-6 east cabins.
const FLEET: VSpec[] = [
  // petrol bunk (plot 0): an SUV pulled up beside the bunk + the snow-plough
  { plot: 0, url: CAR("suv"), right: 2.8, fwd: 1.0, scale: 1.25, spin: 0 }, // tucked beside the bunk, clear of the NW road
  { plot: 0, url: CAR("tractor-shovel"), right: -3.6, fwd: 1.6, scale: 1.3, spin: 0.5 },
  // shop (plot 1): the delivery van parked at the side of the trading post
  { plot: 1, url: CAR("delivery"), right: 4.6, fwd: 1.2, scale: 1.3, spin: Math.PI },
  // cabins: a sedan + a truck pulled off beside their cabins
  { plot: 4, url: CAR("sedan"), right: -3.8, fwd: 1.4, scale: 1.2, spin: 0 },
  { plot: 6, url: CAR("truck"), right: -4.4, fwd: 1.6, scale: 1.2, spin: Math.PI },
  // a wooden sled leaning by a cabin (plot 3)
  { plot: 3, url: HOLIDAY("sled-long"), right: 2.8, fwd: 1.0, scale: 1.8, spin: 0.6, sink: -0.02 }, // by the cabin corner, off the lane edge
];

// Cars pulled off at the countryside homesteads — between each house and its
// road, nose to the lane. Audited literals (dress_audit.ts: ≥ 3.3 m clear of
// every lane centreline, ≥ 4.5 m from every game item; re-run if roads move).
const RURAL_FLEET: { x: number; z: number; yaw: number; url: string; scale: number }[] = [
  { x: -39.16, z: -20.82, yaw: 2.02, url: CAR("suv"), scale: 1.25 }, // NW road homestead
  { x: 10.84, z: -50.46, yaw: 1.93, url: CAR("sedan"), scale: 1.2 }, // south road cabin
  { x: 28.7, z: -63.31, yaw: 2.87, url: CAR("truck"), scale: 1.2 }, // Crossroads→Experience cabin
  { x: 4.6, z: -96.21, yaw: -1.71, url: CAR("van"), scale: 1.22 }, // Crossroads→Summit house
  { x: -13.43, z: -132.06, yaw: 0.43, url: CAR("suv"), scale: 1.25 }, // Ask→Summit cabin
  { x: 53.21, z: -113.92, yaw: -0.85, url: CAR("sedan"), scale: 1.2 }, // outer-ring cabin
];

// --- the country pickup: drives Town Gate → Crossroads → Summit approach ------
// Same driver brain as the village van (SideRoad.tsx): shuttles its route,
// eases into the turnarounds, brakes for the avatar, lights up at night. The
// route is the two SOUTH roads — deliberately network legs the grand tour never
// walks, so it can't plough through the u-keyed obstacles/gems that live on the
// tour legs.
const TRUCK_LEGS = ["villagegate~cross", "cross~contact"] as const;
const TRUCK_SPEED = 3.4; // m/s — a country pace
const TRUCK_MARGIN = { start: 7, end: 13 }; // stay clear of the gate + the Summit stop

const T_BRAKE_LAT = 3.2;
const T_BRAKE_FAR = 7.2;
const T_BRAKE_NEAR = 3.2;
const T_HARD_STOP = 2.4;

function dampAngle(cur: number, target: number, lambda: number, dt: number) {
  let diff = target - cur;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return cur + diff * (1 - Math.exp(-lambda * dt));
}

function RoamingTruck() {
  const group = useRef<THREE.Group>(null);
  const lens = useMemo(() => TRUCK_LEGS.map((id) => edgeLength(id)), []);
  const total = useMemo(() => lens.reduce((a, b) => a + b, 0), [lens]);
  const s = useRef(TRUCK_MARGIN.start + 0.01); // metres along the chain
  const dir = useRef(1);
  const yaw = useRef(0);
  const brake = useRef(1);
  const started = useRef(false);

  const { scene } = useGLTF(CAR("truck"));
  const truck = useMemo(() => {
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
      applyTopSnow(mat);
      m.material = mat;
    });
    return c;
  }, [scene]);

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

  // Chain-metres → world point (XZ from the leg's edge, Y from walkHeight).
  const at = (m: number): { x: number; z: number } => {
    let rest = Math.min(Math.max(m, 0), total);
    for (let i = 0; i < TRUCK_LEGS.length; i++) {
      if (rest <= lens[i] || i === TRUCK_LEGS.length - 1) {
        const [x, z] = edgePointXZ(TRUCK_LEGS[i], Math.min(1, rest / (lens[i] || 1)));
        return { x, z };
      }
      rest -= lens[i];
    }
    return { x: 0, z: 0 };
  };

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const p = at(s.current);
    const ahead2 = at(s.current + 0.8 * dir.current);
    let tx = ahead2.x - p.x;
    let tz = ahead2.z - p.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;

    // Brake for the avatar in the lane ahead (same tuning as the village van).
    const ax = avatarPos.x - p.x;
    const az = avatarPos.z - p.z;
    const d = Math.hypot(ax, az);
    const fwdD = ax * tx + az * tz;
    const lat = Math.abs(ax * tz - az * tx);
    let free = 1;
    if (fwdD > 0 && lat < T_BRAKE_LAT)
      free = Math.min(1, Math.max(0, (d - T_BRAKE_NEAR) / (T_BRAKE_FAR - T_BRAKE_NEAR)));
    if (d < T_HARD_STOP) free = 0;
    brake.current += (free - brake.current) * Math.min(1, dt * (free < brake.current ? 9 : 1.4));

    // Ease into the turnarounds so the 180° happens near-stopped.
    const S0 = TRUCK_MARGIN.start;
    const S1 = total - TRUCK_MARGIN.end;
    const k = (s.current - S0) / (S1 - S0);
    const ease = Math.min(1, k / 0.07) * Math.min(1, (1 - k) / 0.07);
    s.current += dir.current * TRUCK_SPEED * (0.25 + 0.75 * Math.max(0, ease)) * brake.current * dt;
    if (s.current >= S1) {
      s.current = S1;
      dir.current = -1;
    } else if (s.current <= S0) {
      s.current = S0;
      dir.current = 1;
    }

    const target = Math.atan2(tx * dir.current, tz * dir.current);
    if (!started.current) {
      yaw.current = target;
      started.current = true;
    }
    yaw.current = dampAngle(yaw.current, target, 3.5, dt);

    if (group.current) {
      group.current.position.set(p.x, walkHeight(p.x, p.z) + 0.03, p.z);
      group.current.rotation.y = yaw.current;
    }
    const n = skyExtra.night;
    headMat.opacity = n;
    poolMat.opacity = n * 0.55;
  });

  const TS = 1.25;
  return (
    <group ref={group}>
      <primitive object={truck} scale={TS} />
      {[-0.42, 0.42].map((hx, i) => (
        <mesh key={i} position={[hx * TS, 0.55 * TS, 1.42 * TS]} frustumCulled={false}>
          <planeGeometry args={[0.28, 0.18]} />
          <primitive object={headMat} attach="material" />
        </mesh>
      ))}
      <mesh position={[0, 0.04, 3.0 * TS]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <circleGeometry args={[2.4, 24]} />
        <primitive object={poolMat} attach="material" />
      </mesh>
    </group>
  );
}

export default function Vehicles() {
  const placed = useMemo(() => {
    return FLEET.map((v) => {
      const p = SETTLEMENT_PLOTS[v.plot];
      if (!p) return null;
      // Right-hand perpendicular of the plot's facing direction (runs along road).
      const rx = p.faceZ;
      const rz = -p.faceX;
      const x = p.x + rx * v.right + p.faceX * v.fwd;
      const z = p.z + rz * v.right + p.faceZ * v.fwd;
      const y = height(x, z) - (v.sink ?? 0.04);
      // Face along the road: point down the right-hand (trail) axis, plus trim.
      const yaw = Math.atan2(rx, rz) + v.spin;
      return { ...v, x, y, z, yaw };
    }).filter(Boolean) as (VSpec & { x: number; y: number; z: number; yaw: number })[];
  }, []);

  return (
    <group>
      {placed.map((v, i) => (
        <group key={i} position={[v.x, v.y, v.z]} rotation={[0, v.yaw, 0]}>
          <Gltf url={v.url} position={[0, 0, 0]} rotation={[0, 0, 0]} scale={v.scale} />
        </group>
      ))}
      {RURAL_FLEET.map((v, i) => (
        <group key={`r${i}`} position={[v.x, height(v.x, v.z) - 0.04, v.z]} rotation={[0, v.yaw, 0]}>
          <Gltf url={v.url} position={[0, 0, 0]} rotation={[0, 0, 0]} scale={v.scale} />
        </group>
      ))}
      <RoamingTruck />
    </group>
  );
}

["sedan", "suv", "van", "truck", "delivery", "tractor-shovel"].forEach((n) => useGLTF.preload(CAR(n)));
["sled", "sled-long"].forEach((n) => useGLTF.preload(HOLIDAY(n)));
