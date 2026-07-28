"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { skyExtra } from "@/lib/journey/daynight";

// The two primitives every hand-built structure in this world is made of.
// Extracted from Settlement.tsx when the PROJECT LANDMARKS (Landmarks.tsx)
// needed the same box-and-glowing-window vocabulary — one definition, so a
// tweak to how windows light at night reaches the whole town at once.

export const WARM = "#ffd98a"; // lit-window / lamp warmth

/** A flat-shaded box. The unit of construction here. */
export function B({
  args,
  position,
  rotation,
  color,
  roughness = 0.85,
}: {
  args: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  roughness?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow frustumCulled={false}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={0} flatShading />
    </mesh>
  );
}

/**
 * A pane that glows only after dark. Self-driven off the shared `skyExtra.night`
 * signal (the same one the street lamps ignite on), so nothing has to thread
 * time-of-day down to it.
 *
 * `max` is the peak opacity. Keep the resulting luminance under the composer's
 * bloom threshold (0.82) unless a visible flare is the point — that's what
 * turned the sun into a hard glowing disc once already.
 */
export function GlowPane({
  position,
  rotation = [0, 0, 0],
  size,
  color = WARM,
  max = 0.95,
  additive = false,
  /** Glow around the clock instead of only at night (instrument panels). */
  always = false,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  size: [number, number];
  color?: string;
  max?: number;
  additive?: boolean;
  always?: boolean;
}) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    if (!mat.current) return;
    // Daytime floor keeps instrument faces readable when the sun is up; at
    // night they come to full strength like every other window in the world.
    mat.current.opacity = always
      ? max * (0.45 + 0.55 * skyExtra.night)
      : max * skyExtra.night;
  });
  return (
    <mesh position={position} rotation={rotation} frustumCulled={false}>
      <planeGeometry args={size} />
      <meshBasicMaterial
        ref={mat}
        color={color}
        transparent
        opacity={0}
        toneMapped={false}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </mesh>
  );
}
