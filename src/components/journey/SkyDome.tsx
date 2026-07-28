"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { skyUniforms } from "@/lib/journey/daynight";

// A stylized golden-hour sky. Unlike three's physical <Sky> (which only warms the
// pixels near the sun and stays blue everywhere else), this floods the WHOLE dome
// with a warm gradient — gold at the horizon rising to a dusky periwinkle zenith,
// with a soft sun glow toward the key light. That all-over warmth is what makes a
// scene read as "golden hour" from any camera angle, the way Bruno's / Firewatch's
// skies do. Rendered as a big back-side sphere behind everything, unaffected by fog.

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position; // sphere-local position doubles as a direction from center
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    // Vertical gradient: warm horizon → dusky top (eased so most of the dome
    // keeps some warmth, only the very top going cool).
    float t = pow(smoothstep(-0.05, 0.62, d.y), 0.72);
    vec3 col = mix(uHorizon, uTop, t);
    // Extra warm band hugging the horizon line.
    col = mix(col, uHorizon * 1.07, smoothstep(0.16, -0.06, d.y));
    // Sun glow: a soft, FEATHERED brightening toward the light — NO hard rim and
    // kept deliberately dim so post-bloom can't clip it into a discrete glowing
    // disc. The old tight pow(s,300)*0.5 term peaked bright enough to cross the
    // bloom threshold, so when the camera orbited to face the sun it read as a
    // hard circle in the sky. A wide, low glow gives a hazy winter sun instead.
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSun * pow(s, 5.0) * 0.09;
    col += uSun * pow(s, 48.0) * 0.13;
    // Ordered dither (±1/255) to break up the visible banding the smooth, dark
    // night gradient shows on 8-bit displays — the "not clean" sky. Imperceptible
    // by day, it dissolves the concentric colour steps at dusk/night.
    float dith = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
    col += dith;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function SkyDome() {
  // Bind the shared, day/night-driven uniforms directly, so the cycle animates
  // the sky by mutating those same Color objects each frame.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: skyUniforms,
        vertexShader,
        fragmentShader,
      }),
    [],
  );

  // Radius 480 < camera.far (600) and > any trail distance from origin, so the
  // camera always sits inside the dome. renderOrder -1 draws it first as backdrop.
  return (
    <mesh scale={480} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 16]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
