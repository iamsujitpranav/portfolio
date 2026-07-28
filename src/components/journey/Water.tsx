"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { POND } from "@/lib/journey/config";
import { POND_WATER_Y } from "@/lib/journey/terrain";

// A stylized animated pond: a flat disc that gently undulates (vertex waves),
// with scrolling highlight streaks, a grazing-angle sheen, and a foam ring at
// the shore. Cheap — one draw call, a couple of sines — but it reads as alive.
const vertexShader = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec3 p = position;
  float w = sin(position.x * 2.2 + uTime * 1.4) * 0.035
          + cos(position.y * 1.8 - uTime * 1.1) * 0.035;
  p.z += w; // local +z becomes world up once the disc is laid flat
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float d = length(vUv - 0.5) * 2.0;              // 0 center → 1 rim
  vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.9, d));

  // Drifting highlight streaks.
  float r = sin(vUv.x * 26.0 + uTime * 1.3) + cos(vUv.y * 22.0 - uTime * 1.0);
  col = mix(col, uFoam, smoothstep(1.3, 1.9, r) * 0.22);

  // Grazing-angle sheen (cheap fresnel; disc normal is world-up).
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
  col = mix(col, uFoam, fres * 0.35);

  // Shore foam ring.
  col = mix(col, uFoam, smoothstep(0.86, 1.0, d) * 0.7);

  gl_FragColor = vec4(col, mix(0.92, 0.78, d));
}
`;

export default function Water() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uDeep: { value: new THREE.Color("#22566f") },
          uShallow: { value: new THREE.Color("#5fa9b6") },
          uFoam: { value: new THREE.Color("#ffe6c0") },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
      }),
    [],
  );

  useFrame((_, delta) => {
    material.uniforms.uTime.value += Math.min(delta, 0.05);
  });

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[POND.x, POND_WATER_Y, POND.z]}
      renderOrder={1}
    >
      <circleGeometry args={[POND.radius + 0.3, 72]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
