"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { centerlineXZ } from "@/lib/journey/trail";
import { height } from "@/lib/journey/terrain";

// Cheap ambient particle clouds that follow the trail corridor: golden dust
// motes drifting in the low sun, and warmer, slower fireflies down in the
// forest. One draw call each (THREE.Points + a tiny additive shader) with the
// whole motion done on the GPU — so hundreds of specks cost almost nothing but
// make the world read as ALIVE, which is most of the gap to Bruno's scenes.

// Deterministic RNG so the cloud is identical every load (SSR-safe, stable).
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uDrift;
  attribute float aSeed;
  attribute float aScale;
  varying float vTw;
  void main() {
    vec3 p = position;
    float s = aSeed * 6.2831853;
    // Slow, decorrelated drift + a gentle vertical float.
    p.x += sin(uTime * 0.18 + s) * uDrift;
    p.z += cos(uTime * 0.15 + s * 1.3) * uDrift;
    p.y += sin(uTime * 0.5 + s * 2.1) * uDrift * 0.4;
    // Twinkle.
    vTw = 0.5 + 0.5 * sin(uTime * 1.7 + s * 5.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(uSize * aScale * (50.0 / -mv.z), 1.0, 16.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);   // soft round sprite
    a *= a * vTw;                         // fade edges + twinkle
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

function DriftingPoints({
  count,
  color,
  size,
  drift,
  spread,
  yMin,
  yMax,
  zMin,
  zMax,
  seed,
}: {
  count: number;
  color: string;
  size: number;
  drift: number;
  spread: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  seed: number;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const rand = rng(seed);
    const line = centerlineXZ(2);
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const scales = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Anchor each speck near a random point on the trail within the z-band,
      // then scatter it laterally — so the cloud hugs the walked corridor.
      let px = 0;
      let pz = 0;
      for (let t = 0; t < 8; t++) {
        const p = line[Math.floor(rand() * line.length)];
        px = p[0];
        pz = p[1];
        if (pz <= zMax && pz >= zMin) break;
      }
      const x = px + (rand() * 2 - 1) * spread;
      const z = pz + (rand() * 2 - 1) * spread;
      const y = height(x, z) + yMin + rand() * (yMax - yMin);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      seeds[i] = rand();
      scales[i] = 0.5 + rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    g.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    return g;
  }, [count, spread, yMin, yMax, zMin, zMax, seed]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uDrift: { value: drift },
    }),
    [color, size, drift],
  );

  useFrame((_, delta) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += Math.min(delta, 0.05);
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Fine golden dust suspended in the low sun, all along the trail.
export function Motes() {
  return (
    <DriftingPoints
      count={1400}
      color="#ffdca0"
      size={5}
      drift={1.3}
      spread={26}
      yMin={0.6}
      yMax={8}
      zMin={-260}
      zMax={40}
      seed={7}
    />
  );
}

// Warmer, larger, slower glows low in the forest + around the pond — the bit of
// magic that makes people lean in.
export function Fireflies() {
  return (
    <DriftingPoints
      count={160}
      color="#ffe98a"
      size={10}
      drift={0.8}
      spread={16}
      yMin={0.4}
      yMax={3.4}
      zMin={-200}
      zMax={-24}
      seed={19}
    />
  );
}
