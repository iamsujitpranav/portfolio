"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { height } from "@/lib/journey/terrain";
import { FOUNTAINS } from "@/lib/journey/settlement";
import { skyExtra } from "@/lib/journey/daynight";
import { applyTopSnow } from "@/lib/journey/snowcover";

// Stone fountains, FROZEN for the winter: an octagonal basin, a tiered column,
// and the water caught mid-fall as ice — a solid cascade column between the
// bowls and icicle fringes on every lip. The grand one is the TOWN SQUARE's
// centrepiece at the five-way Crossroads (three tiers, ringed by the social
// boards, right where the journey spawns); the small two-tier one holds the
// old plaza as the town library's forecourt piece. Terrain levels a pad under each
// (settlement.FLAT_SPOTS) and the tree scatter keeps off the plaza. The stone
// gathers real snow via the shared top-snow shader; at night the ice takes a
// faint cold glow (driven by the same skyExtra.night as every other lamp), so
// the plaza reads at dusk without another point light.

const STONE = "#98938a";
const STONE_DARK = "#7e7970";
const ICE = "#bcd9ee";
const ICE_GLOW = "#7fb8e8";

function ice() {
  return new THREE.MeshStandardMaterial({
    color: ICE,
    roughness: 0.16,
    metalness: 0,
    flatShading: true,
    emissive: ICE_GLOW,
    emissiveIntensity: 0,
  });
}

function stone(color: string) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true });
  applyTopSnow(m); // snow settles on rims, bowls and the finial
  return m;
}

function Fountain({
  x,
  z,
  grand,
  iceMat,
  stoneMat,
  stoneDarkMat,
}: {
  x: number;
  z: number;
  grand: boolean;
  iceMat: THREE.MeshStandardMaterial;
  stoneMat: THREE.MeshStandardMaterial;
  stoneDarkMat: THREE.MeshStandardMaterial;
}) {
  const s = grand ? 1 : 0.78;
  const y = height(x, z) - 0.04;

  // Icicle fringes hanging off the bowl lips (deterministic ring).
  const icicles = useMemo(() => {
    const out: { x: number; y: number; z: number; s: number }[] = [];
    const ring = (r: number, yy: number, n: number, seed: number) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + seed;
        const len = 0.55 + (((i * 7 + seed * 13) % 5) / 5) * 0.75;
        out.push({ x: Math.cos(a) * r, y: yy, z: Math.sin(a) * r, s: len });
      }
    };
    ring(0.95, 1.18, 9, 1);
    if (grand) ring(0.52, 1.98, 6, 4);
    return out;
  }, [grand]);

  return (
    <group position={[x, y, z]} scale={s}>
      {/* paved apron the plaza gathers around */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[2.75, 2.9, 0.1, 8]} />
        <primitive object={stoneDarkMat} attach="material" />
      </mesh>
      {/* octagonal basin wall + lip */}
      <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.92, 2.05, 0.55, 8]} />
        <primitive object={stoneMat} attach="material" />
      </mesh>
      <mesh position={[0, 0.62, 0]} castShadow>
        <cylinderGeometry args={[2.08, 1.98, 0.12, 8]} />
        <primitive object={stoneMat} attach="material" />
      </mesh>
      {/* the basin water, frozen over */}
      <mesh position={[0, 0.52, 0]}>
        <cylinderGeometry args={[1.82, 1.82, 0.08, 8]} />
        <primitive object={iceMat} attach="material" />
      </mesh>

      {/* centre column + mid bowl */}
      <mesh position={[0, 0.85, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.34, 0.62, 8]} />
        <primitive object={stoneDarkMat} attach="material" />
      </mesh>
      <mesh position={[0, 1.22, 0]} castShadow>
        <cylinderGeometry args={[1.02, 0.62, 0.26, 8]} />
        <primitive object={stoneMat} attach="material" />
      </mesh>
      <mesh position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 0.07, 8]} />
        <primitive object={iceMat} attach="material" />
      </mesh>
      {/* frozen cascade: the fall from the mid bowl caught as a solid ice skirt */}
      <mesh position={[0, 0.88, 0]}>
        <cylinderGeometry args={[0.98, 1.35, 0.62, 8, 1, true]} />
        <primitive object={iceMat} attach="material" />
      </mesh>

      {grand && (
        <>
          {/* upper column + top bowl, its own frozen spill */}
          <mesh position={[0, 1.62, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.22, 0.55, 8]} />
            <primitive object={stoneDarkMat} attach="material" />
          </mesh>
          <mesh position={[0, 1.98, 0]} castShadow>
            <cylinderGeometry args={[0.56, 0.34, 0.2, 8]} />
            <primitive object={stoneMat} attach="material" />
          </mesh>
          <mesh position={[0, 2.04, 0]}>
            <cylinderGeometry args={[0.47, 0.47, 0.06, 8]} />
            <primitive object={iceMat} attach="material" />
          </mesh>
          <mesh position={[0, 1.68, 0]}>
            <cylinderGeometry args={[0.5, 0.78, 0.5, 8, 1, true]} />
            <primitive object={iceMat} attach="material" />
          </mesh>
          {/* finial */}
          <mesh position={[0, 2.28, 0]} castShadow>
            <coneGeometry args={[0.2, 0.42, 8]} />
            <primitive object={stoneMat} attach="material" />
          </mesh>
        </>
      )}

      {/* icicles under the lips */}
      {icicles.map((ic, i) => (
        <mesh key={i} position={[ic.x, ic.y - ic.s * 0.32, ic.z]}>
          <coneGeometry args={[0.055, ic.s * 0.64, 5]} />
          <primitive object={iceMat} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

export default function Fountains() {
  const iceMat = useMemo(() => ice(), []);
  const stoneMat = useMemo(() => stone(STONE), []);
  const stoneDarkMat = useMemo(() => stone(STONE_DARK), []);
  const shimmer = useRef(0);

  // Cold night glow on the ice, with a slow shimmer so it feels lit, not lit-up.
  useFrame((st) => {
    shimmer.current = 0.9 + 0.1 * Math.sin(st.clock.elapsedTime * 1.7);
    iceMat.emissiveIntensity = skyExtra.night * 0.55 * shimmer.current;
  });

  return (
    <group>
      {FOUNTAINS.map((f, i) => (
        <Fountain
          key={i}
          x={f.x}
          z={f.z}
          grand={f.grand}
          iceMat={iceMat}
          stoneMat={stoneMat}
          stoneDarkMat={stoneDarkMat}
        />
      ))}
    </group>
  );
}
