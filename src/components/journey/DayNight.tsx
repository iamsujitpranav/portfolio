"use client";

import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  updateDayNight,
  skyExtra,
  CYCLE_SECONDS,
  START_PHASE,
} from "@/lib/journey/daynight";
import { advanceSnow } from "@/lib/journey/snowcover";

// Drives the day↔night loop: advances the phase clock, pushes the interpolated
// fog / ambient / hemisphere values onto the scene each frame, and fades a star
// field in at night. The sun light + sky dome read the same shared state (see
// daynight.ts) — this component owns the fog, fill and stars.
export default function DayNight({
  ambientRef,
  hemiRef,
}: {
  ambientRef: RefObject<THREE.AmbientLight | null>;
  hemiRef: RefObject<THREE.HemisphereLight | null>;
}) {
  const { scene, camera } = useThree();
  const t = useRef(START_PHASE);
  const stars = useRef<THREE.Points>(null);
  const starMat = useRef<THREE.PointsMaterial>(null);

  // A dome of stars on the upper hemisphere (fixed pixel size, no attenuation).
  const starGeo = useMemo(() => {
    let seed = 0x2545f491;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const N = 700;
    const pos = new Float32Array(N * 3);
    const R = 420;
    for (let i = 0; i < N; i++) {
      const u = rnd();
      const v = rnd() * 0.5; // upper hemisphere only
      const theta = u * Math.PI * 2;
      const phi = Math.acos(1 - 2 * (0.5 + v * 0.5)); // bias toward the sky
      pos[i * 3] = R * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(R * Math.cos(phi)) + 20;
      pos[i * 3 + 2] = R * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((_, delta) => {
    t.current = (t.current + Math.min(delta, 0.05) / CYCLE_SECONDS) % 1;
    updateDayNight(t.current);
    advanceSnow(); // derive the shared snow-sparkle sun factor from the fresh sunState

    if (scene.fog) (scene.fog as THREE.FogExp2).color.copy(skyExtra.fog);
    if (ambientRef.current) {
      ambientRef.current.color.copy(skyExtra.ambient);
      ambientRef.current.intensity = skyExtra.ambientI;
    }
    if (hemiRef.current) {
      hemiRef.current.color.copy(skyExtra.hemiSky);
      hemiRef.current.groundColor.copy(skyExtra.hemiGround);
      hemiRef.current.intensity = skyExtra.hemiI;
    }
    if (starMat.current) starMat.current.opacity = skyExtra.star;
    if (stars.current) stars.current.position.copy(camera.position); // keep overhead
  });

  return (
    <points ref={stars} geometry={starGeo} frustumCulled={false} renderOrder={-1}>
      <pointsMaterial
        ref={starMat}
        color="#ffffff"
        size={1.6}
        sizeAttenuation={false}
        transparent
        opacity={0}
        depthWrite={false}
      />
    </points>
  );
}
