"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { PROP_URL } from "@/lib/journey/props";
import { height } from "@/lib/journey/terrain";
import { STOPS } from "@/lib/journey/sections";
import { spineUToPoint, edgePointXZ } from "@/lib/journey/graph";

// Each stop gets a small crafted vignette so it reads as a PLACE, not a sign in
// bare grass. Built from the same Kenney GLBs as the world plus a few
// procedural pieces (arch, crates, a glowing "ask" shrine, a summit flag).
// Every diorama is anchored to the PATH GRAPH — the stop's grand-tour point and
// the tangent of its own road — so it lines up with its signpost exactly even
// where several roads meet at the stop.

const WOOD = "#7a5636";
const WOOD_DARK = "#5f4227";
const STONE = "#8b8478";

// --- a single GLB prop, cloned + Kenney-material-fixed, planted on the ground ---
function Prop({
  name,
  x,
  z,
  s = 1,
  ry = 0,
  sink = 0.08,
}: {
  name: string;
  x: number;
  z: number;
  s?: number;
  ry?: number;
  sink?: number;
}) {
  const { scene } = useGLTF(PROP_URL(name));
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false; // hand-placed set-pieces must never pop out

      const src = m.material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      mat.metalness = 0; // Kenney GLBs ship metalness=1 → render black
      mat.roughness = 0.9;
      mat.flatShading = true;
      m.material = mat;
    });
    return c;
  }, [scene]);
  return (
    <primitive object={obj} position={[x, height(x, z) - sink, z]} rotation={[0, ry, 0]} scale={s} />
  );
}

// --- procedural building blocks ------------------------------------------------
function Box({
  args,
  position,
  rotation,
  color,
}: {
  args: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow frustumCulled={false}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.85} metalness={0} flatShading />
    </mesh>
  );
}

// A stack of little wooden crates (Experience: "the work").
function Crates() {
  return (
    <group>
      <Box args={[1.1, 1.1, 1.1]} position={[0, 0.55, 0]} color={WOOD} />
      <Box args={[1.0, 1.0, 1.0]} position={[1.15, 0.5, 0.15]} color={WOOD_DARK} />
      <Box args={[0.95, 0.95, 0.95]} position={[0.5, 1.55, -0.1]} rotation={[0, 0.4, 0]} color={WOOD} />
      <Box args={[0.9, 0.9, 0.9]} position={[-1.05, 0.45, 0.35]} rotation={[0, 0.7, 0]} color={WOOD_DARK} />
    </group>
  );
}

// A simple bench (kept small so it reads as a bench, not a wall).
function Bench({ x, z, ry }: { x: number; z: number; ry: number }) {
  const y = height(x, z);
  return (
    <group position={[x, y, z]} rotation={[0, ry, 0]}>
      <Box args={[1.3, 0.09, 0.38]} position={[0, 0.38, 0]} color={WOOD} />
      <Box args={[1.3, 0.28, 0.07]} position={[0, 0.58, -0.15]} color={WOOD} />
      <Box args={[0.09, 0.38, 0.38]} position={[-0.55, 0.19, 0]} color={WOOD_DARK} />
      <Box args={[0.09, 0.38, 0.38]} position={[0.55, 0.19, 0]} color={WOOD_DARK} />
    </group>
  );
}

// A welcome arch spanning the trailhead. Built in local space (x = across the
// path) then rotated to the trail yaw by the parent group.
function Arch() {
  const h = 3.2;
  const span = 3.6;
  return (
    <group>
      <Box args={[0.28, h, 0.28]} position={[-span, h / 2, 0]} color={WOOD} />
      <Box args={[0.28, h, 0.28]} position={[span, h / 2, 0]} color={WOOD} />
      <Box args={[span * 2 + 0.5, 0.32, 0.32]} position={[0, h, 0]} color={WOOD_DARK} />
      <Box args={[span * 2 + 0.9, 0.18, 0.5]} position={[0, h + 0.28, 0]} color={WOOD} />
    </group>
  );
}

// The "Ask my résumé" shrine: a stone plinth with a slowly bobbing, glowing orb —
// a bit of magic that signals the interactive/AI moment.
function Shrine() {
  const orb = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    const y = 2.15 + Math.sin(t * 1.2) * 0.14;
    if (orb.current) {
      orb.current.position.y = y;
      orb.current.rotation.y = t * 0.5;
    }
    if (light.current) light.current.intensity = 2.4 + Math.sin(t * 3.0) * 0.5;
  });
  return (
    <group>
      <Box args={[1.5, 0.4, 1.5]} position={[0, 0.2, 0]} color={STONE} />
      <Box args={[1.1, 0.5, 1.1]} position={[0, 0.62, 0]} color="#9a9285" />
      <Box args={[0.75, 0.7, 0.75]} position={[0, 1.2, 0]} color={STONE} />
      <mesh ref={orb} position={[0, 2.15, 0]} castShadow frustumCulled={false}>
        <icosahedronGeometry args={[0.42, 1]} />
        <meshStandardMaterial
          color="#ffe6a8"
          emissive="#ffcf72"
          emissiveIntensity={1.8}
          roughness={0.4}
          metalness={0}
          flatShading
        />
      </mesh>
      <pointLight ref={light} position={[0, 2.3, 0]} color="#ffd98a" intensity={2.4} distance={12} decay={2} />
    </group>
  );
}

// A pennant flag on a pole at the summit (Contact) — the "you made it" banner.
function Flag() {
  const cloth = useRef<THREE.Mesh>(null);
  useFrame((st) => {
    if (cloth.current) {
      const t = st.clock.elapsedTime;
      cloth.current.rotation.y = Math.sin(t * 2.2) * 0.18 - 0.2;
      cloth.current.scale.x = 1 + Math.sin(t * 3.1) * 0.04;
    }
  });
  return (
    <group>
      <Box args={[0.14, 4.2, 0.14]} position={[0, 2.1, 0]} color={WOOD_DARK} />
      <mesh ref={cloth} position={[0.95, 3.55, 0]} castShadow frustumCulled={false}>
        <planeGeometry args={[1.8, 0.9]} />
        <meshStandardMaterial color="#d33b5f" roughness={0.8} metalness={0} side={THREE.DoubleSide} flatShading />
      </mesh>
    </group>
  );
}

export default function Dioramas() {
  // Anchor + road-facing frame for each stop, straight from the path graph:
  // the stop's point on the grand tour and a finite-difference tangent along
  // its own edge (stable even at the stops where the tour turns a corner).
  const anchors = useMemo(() => {
    const out: Record<
      string,
      { pos: THREE.Vector3; yaw: number; perp: THREE.Vector3; tan: THREE.Vector3 }
    > = {};
    for (const s of STOPS) {
      const at = spineUToPoint(s.u);
      const p = edgePointXZ(at.edgeId, at.tAB);
      const ahead = edgePointXZ(at.edgeId, Math.min(1, at.tAB + 0.02));
      const behind = edgePointXZ(at.edgeId, Math.max(0, at.tAB - 0.02));
      const tan = new THREE.Vector3(ahead[0] - behind[0], 0, ahead[1] - behind[1]);
      if (tan.lengthSq() < 1e-9) tan.set(0, 0, -1);
      tan.normalize();
      const pos = new THREE.Vector3(p[0], height(p[0], p[1]), p[1]);
      const perp = new THREE.Vector3(-tan.z, 0, tan.x); // "left" across the path
      out[s.id] = { pos, yaw: Math.atan2(tan.x, tan.z), perp, tan };
    }
    return out;
  }, []);

  // World XZ at a stop, offset `lat` across the path (+ = left) and `along` up it.
  const at = (id: string, lat: number, along = 0): [number, number] => {
    const a = anchors[id];
    return [a.pos.x + a.perp.x * lat + a.tan.x * along, a.pos.z + a.perp.z * lat + a.tan.z * along];
  };

  const skillsC = at("skills", -8);
  const expC = at("experience", -6);

  return (
    <group>
      {/* Old Town — two benches flanking the walk between the street's head
          and the arch (the plaza behind them belongs to the library now). */}
      <Bench {...benchAt(at("start", -3.6, 3.5), anchors.start.yaw + Math.PI / 2)} />
      <Bench {...benchAt(at("start", 3.6, 3.5), anchors.start.yaw - Math.PI / 2)} />

      {/* THE ARC — the arch itself, mid-Old-Town, spanning the street between
          the library plaza and the Arc stop: the grand tour begins by walking
          under it. Planted 5 m BEFORE the stop point: audited — any closer to
          the stop and its east post stands in the waterfront arc's mouth, any
          further and the west post lands on the village road. */}
      {(() => {
        const p = at("thesis", 0, -5.0);
        return (
          <group position={[p[0], height(p[0], p[1]), p[1]]} rotation={[0, anchors.thesis.yaw, 0]}>
            <Arch />
          </group>
        );
      })()}

      {/* The lone oak marks the pond's FAR shore, just south of where the
          bridge road lands — the tree you walk toward crossing the deck.
          (Audited: 8+ m clear of the Experience road, 14 m from the curling
          house.) */}
      <Prop name="tree_oak" x={47} z={-37} s={4.6} ry={1.2} />
      <FlowerRing cx={47} cz={-37} radius={3.2} n={10} />

      {/* Experience — a cluster of crates + a couple of boulders (the workbench). */}
      <group position={[expC[0], height(expC[0], expC[1]) - 0.05, expC[1]]} rotation={[0, anchors.experience.yaw, 0]}>
        <Crates />
      </group>
      <Prop name="rock_largeA" x={at("experience", -9)[0]} z={at("experience", -9)[1]} s={2.0} ry={0.6} />
      <Prop name="mushroom_red" x={at("experience", -4.2, 1)[0]} z={at("experience", -4.2, 1)[1]} s={2.2} />

      {/* Skills — a tended grove: a ring of mixed trees around a small clearing. */}
      <Grove cx={skillsC[0]} cz={skillsC[1]} />

      {/* Ask my résumé — a glowing shrine just off the trail. */}
      <group position={[at("ask", -5)[0], height(at("ask", -5)[0], at("ask", -5)[1]) - 0.05, at("ask", -5)[1]]}>
        <Shrine />
      </group>

      {/* Contact / Summit — a banner flag beside the cairn. */}
      <group position={[at("contact", -4)[0], height(at("contact", -4)[0], at("contact", -4)[1]) - 0.05, at("contact", -4)[1]]}>
        <Flag />
      </group>
    </group>
  );
}

// Helper to spread Bench props from an [x,z] tuple.
function benchAt([x, z]: [number, number], ry: number) {
  return { x, z, ry };
}

// A ring of flowers/grass around a point (for The Arc's lone tree).
function FlowerRing({ cx, cz, radius, n }: { cx: number; cz: number; radius: number; n: number }) {
  const items = useMemo(() => {
    const keys = ["flower_redA", "flower_yellowB", "flower_purpleB", "grass_large"];
    const out: { name: string; x: number; z: number; s: number; ry: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i * 0.7;
      const r = radius * (0.7 + ((i * 37) % 10) / 33);
      out.push({
        name: keys[i % keys.length],
        x: cx + Math.cos(a) * r,
        z: cz + Math.sin(a) * r,
        s: 2.2 + ((i * 13) % 7) / 10,
        ry: a,
      });
    }
    return out;
  }, [cx, cz, radius, n]);
  return (
    <>
      {items.map((it, i) => (
        <Prop key={i} name={it.name} x={it.x} z={it.z} s={it.s} ry={it.ry} />
      ))}
    </>
  );
}

// A cultivated grove: trees in a rough ring with flowers/grass in the clearing.
function Grove({ cx, cz }: { cx: number; cz: number }) {
  const trees = useMemo(() => {
    const keys = ["tree_pineTallA", "tree_pineRoundE", "tree_default", "tree_pineTallC", "tree_fat"];
    const out: { name: string; x: number; z: number; s: number; ry: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const r = 4.4 + ((i * 29) % 8) / 8;
      out.push({
        name: keys[i % keys.length],
        x: cx + Math.cos(a) * r,
        z: cz + Math.sin(a) * r,
        s: 2.7 + ((i * 17) % 9) / 10,
        ry: a * 1.3,
      });
    }
    return out;
  }, [cx, cz]);
  return (
    <>
      {trees.map((t, i) => (
        <Prop key={i} name={t.name} x={t.x} z={t.z} s={t.s} ry={t.ry} />
      ))}
      <FlowerRing cx={cx} cz={cz} radius={2.4} n={7} />
    </>
  );
}
