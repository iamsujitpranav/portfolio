"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cssColor } from "@/lib/theme";
import { useReducedMotion } from "@/lib/useReducedMotion";

const COUNT = 5200;
const RADIUS = 1.55;

/**
 * Deterministic 0..1 hash — the classic GLSL fract(sin(x)*43758.5453) trick.
 *
 * Stands in for `Math.random()` so the point cloud can be built inside the
 * `useMemo` below: random during render is impure (React may re-run it), and
 * the scatter here only needs to look uneven, not be unpredictable. Bonus: the
 * field now looks identical on every mount instead of reshuffling.
 */
function rand01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const vertex = /* glsl */ `
  uniform float u_time;
  uniform vec2  u_pointer;
  uniform float u_size;
  uniform float u_pr;
  attribute float aRand;
  attribute float aScale;
  varying float vMix;

  void main() {
    vec3 p = position;
    vec3 dir = normalize(p + 1e-5);

    // organic breathing displacement
    float n = sin(p.x * 3.0 + u_time) * cos(p.y * 3.0 + u_time * 0.8)
            * sin(p.z * 3.2 + u_time * 0.6);
    p += dir * n * 0.07;

    // cursor ripple — points near the projected pointer get pushed outward
    float d = distance(p.xy, u_pointer * 1.35);
    float push = smoothstep(1.0, 0.0, d) * 0.22;
    p += dir * push;

    vMix = clamp(0.45 + n * 0.7 + push * 2.4 + (aRand - 0.5) * 0.9, 0.0, 1.0);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = u_size * aScale * u_pr * (1.0 / -mv.z);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform vec3 u_base;
  uniform vec3 u_accent;
  varying float vMix;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float dd = dot(c, c);
    if (dd > 0.25) discard;
    float alpha = smoothstep(0.25, 0.0, dd);
    vec3 col = mix(u_base, u_accent, smoothstep(0.5, 1.0, vMix));
    gl_FragColor = vec4(col, alpha * 0.92);
  }
`;

function Field({ reduce }: { reduce: boolean }) {
  const { gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 }); // target, normalized -1..1
  const smoothed = useRef({ x: 0, y: 0 });

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const rand = new Float32Array(COUNT);
    const scale = new Float32Array(COUNT);
    // Fibonacci sphere for even distribution, jittered inward for depth.
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < COUNT; i++) {
      const y = 1 - (i / (COUNT - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      // Three decorrelated streams out of the one hash, offset by COUNT.
      const shell = RADIUS * (0.72 + 0.28 * Math.pow(rand01(i), 0.5));
      positions[i * 3] = Math.cos(theta) * r * shell;
      positions[i * 3 + 1] = y * shell;
      positions[i * 3 + 2] = Math.sin(theta) * r * shell;
      rand[i] = rand01(i + COUNT);
      scale[i] = 6 + rand01(i + COUNT * 2) * 12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
    geo.setAttribute("aScale", new THREE.BufferAttribute(scale, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        u_time: { value: reduce ? 2.0 : 0 },
        u_pointer: { value: new THREE.Vector2(0, 0) },
        u_size: { value: 1.0 },
        u_pr: { value: 1.5 },
        u_base: { value: new THREE.Color(...cssColor("--text")) },
        u_accent: { value: new THREE.Color(...cssColor("--accent")) },
      },
    });
    return { geometry: geo, material: mat };
  }, [reduce]);

  // Track pointer + keep colors in sync with the theme.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    const applyTheme = () => {
      material.uniforms.u_base.value.setRGB(...cssColor("--text"));
      material.uniforms.u_accent.value.setRGB(...cssColor("--accent"));
    };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("themechange", applyTheme);
    mq.addEventListener("change", applyTheme);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("themechange", applyTheme);
      mq.removeEventListener("change", applyTheme);
    };
  }, [material]);

  useFrame((state) => {
    material.uniforms.u_pr.value = gl.getPixelRatio();
    if (reduce) {
      if (group.current) group.current.rotation.set(0.1, 0.5, 0);
      return;
    }
    const t = state.clock.elapsedTime;
    material.uniforms.u_time.value = t;

    // ease pointer, feed the ripple + parallax
    smoothed.current.x += (pointer.current.x - smoothed.current.x) * 0.05;
    smoothed.current.y += (pointer.current.y - smoothed.current.y) * 0.05;
    material.uniforms.u_pointer.value.set(smoothed.current.x, smoothed.current.y);

    if (group.current) {
      group.current.rotation.y = t * 0.05 + smoothed.current.x * 0.45;
      group.current.rotation.x = smoothed.current.y * -0.32 + Math.sin(t * 0.15) * 0.05;
    }
  });

  return (
    <group ref={group}>
      <points geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}

export default function HeroCanvas() {
  const reduce = useReducedMotion();
  return (
    <Canvas
      className="heroCanvas"
      dpr={[1, 1.8]}
      frameloop={reduce ? "demand" : "always"}
      gl={{ antialias: false, powerPreference: "high-performance", alpha: true }}
      camera={{ position: [0, 0, 4.1], fov: 52 }}
    >
      <Field reduce={reduce} />
    </Canvas>
  );
}
