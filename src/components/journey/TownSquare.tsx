"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { besideEdge } from "@/lib/journey/graph";
import { FOUNTAINS } from "@/lib/journey/settlement";
import { height } from "@/lib/journey/terrain";

const FOUNTAIN = FOUNTAINS.find((f) => f.grand) ?? { x: 6.98, z: -79.96 };

const ROUTES = [
  { edgeId: "cross~experience", color: "#4ea8ff", side: -1 as const },
  { edgeId: "cross~skills", color: "#48d6ae", side: -1 as const },
  { edgeId: "cross~ask", color: "#b47cff", side: 1 as const },
  { edgeId: "cross~contact", color: "#ffb84d", side: -1 as const },
];

function RouteLantern({ x, z, yaw, color, phase }: { x: number; z: number; yaw: number; color: string; phase: number }) {
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    const pulse = 0.82 + Math.sin(state.clock.elapsedTime * 2.1 + phase) * 0.18;
    if (glow.current) glow.current.emissiveIntensity = 2.2 + pulse * 1.4;
    if (halo.current) halo.current.opacity = 0.13 + pulse * 0.1;
  });
  return (
    <group position={[x, height(x, z), z]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.48, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.1, 0.96, 8]} />
        <meshStandardMaterial color="#30343a" roughness={0.6} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.94, 0]}>
        <octahedronGeometry args={[0.18, 0]} />
        <meshStandardMaterial ref={glow} color={color} emissive={color} emissiveIntensity={3} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.94, 0]}>
        <sphereGeometry args={[0.34, 10, 8]} />
        <meshBasicMaterial ref={halo} color={color} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function RouteLanterns() {
  const markers = useMemo(() => ROUTES.flatMap((route) =>
    [0.1, 0.2, 0.3].map((t, index) => {
      const at = besideEdge(route.edgeId, t, route.side, 2.75);
      return { ...at, color: route.color, key: `${route.edgeId}:${index}`, phase: index * 0.8 };
    })), []);
  return (
    <group>
      {markers.map(({ key, ...marker }) => <RouteLantern key={key} {...marker} />)}
    </group>
  );
}

function FountainReflections() {
  const orbit = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!orbit.current) return;
    orbit.current.rotation.y = state.clock.elapsedTime * 0.22;
    orbit.current.position.y = Math.sin(state.clock.elapsedTime * 1.1) * 0.035;
  });
  const y = height(FOUNTAIN.x, FOUNTAIN.z);
  return (
    <group ref={orbit} position={[FOUNTAIN.x, y + 0.64, FOUNTAIN.z]}>
      {[0, 1, 2].map((index) => {
        const angle = (index / 3) * Math.PI * 2;
        const radius = 1.1 + index * 0.24;
        return (
          <mesh key={index} position={[Math.cos(angle) * radius, 0.08 + index * 0.12, Math.sin(angle) * radius]}>
            <sphereGeometry args={[0.075 + index * 0.015, 8, 8]} />
            <meshBasicMaterial color={index === 1 ? "#ffe5a6" : "#b9e6ff"} transparent opacity={0.72} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function DistantBirds() {
  const flock = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!flock.current) return;
    const t = state.clock.elapsedTime * 0.075;
    flock.current.position.set(FOUNTAIN.x + Math.cos(t) * 22, height(FOUNTAIN.x, FOUNTAIN.z) + 15 + Math.sin(t * 2) * 0.8, FOUNTAIN.z + Math.sin(t) * 16);
    flock.current.rotation.y = -t + Math.PI / 2;
  });
  const birds = [[0, 0, 0], [-1.8, 0.35, 1.2], [1.7, -0.2, 1.5], [-3.1, 0.1, 2.8], [3, 0.45, 3.1]];
  return (
    <group ref={flock}>
      {birds.map(([x, y, z], index) => (
        <group key={index} position={[x, y, z]} scale={0.72 + index * 0.04}>
          <mesh position={[-0.25, 0, 0]} rotation={[-Math.PI / 2, 0, -0.32]}><planeGeometry args={[0.52, 0.075]} /><meshBasicMaterial color="#3b4653" side={THREE.DoubleSide} /></mesh>
          <mesh position={[0.25, 0, 0]} rotation={[-Math.PI / 2, 0, 0.32]}><planeGeometry args={[0.52, 0.075]} /><meshBasicMaterial color="#3b4653" side={THREE.DoubleSide} /></mesh>
        </group>
      ))}
    </group>
  );
}

export default function TownSquare() {
  return (
    <group>
      <RouteLanterns />
      <FountainReflections />
      <DistantBirds />
    </group>
  );
}
