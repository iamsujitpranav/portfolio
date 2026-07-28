"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { walkHeight } from "@/lib/journey/terrain";
import { avatarPos } from "@/lib/journey/game";
import type { Nav } from "./Avatar";

// Little puffs of warm dust kicked up under the avatar as it walks. A small CPU
// particle pool (cheap — ~90 points, one draw call): while nav.moving, it emits a
// burst at the ground under the walker on a step cadence, each particle drifting
// up and out and fading over ~0.8s. Soft alpha (not additive) so it reads as dust,
// not glow. Adds a lot of "someone is really walking here" life for near-zero cost.

const MAX = 90;
const LIFETIME = 0.8; // seconds
const STEP_INTERVAL = 0.4; // seconds between puffs while moving

const vertexShader = /* glsl */ `
  uniform float uPR;
  attribute float aLife;   // 1 = fresh → 0 = dead
  attribute float aSize;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float grow = mix(0.45, 1.0, 1.0 - aLife); // the puff expands as it ages
    gl_PointSize = clamp(aSize * grow * uPR * (55.0 / -mv.z), 1.0, 42.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  varying float vLife;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.04, d) * vLife * 0.42;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export default function Dust({ nav }: { nav: Nav }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const buffers = useMemo(
    () => ({
      positions: new Float32Array(MAX * 3),
      life: new Float32Array(MAX),
      size: new Float32Array(MAX),
      vel: new Float32Array(MAX * 3),
    }),
    [],
  );

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(buffers.positions, 3));
    g.setAttribute("aLife", new THREE.BufferAttribute(buffers.life, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(buffers.size, 1));
    return g;
  }, [buffers]);

  const uniforms = useMemo(
    () => ({
      // Muted, dusty tan. Kept deliberately below the bloom threshold (0.82) so
      // the post bloom pass doesn't grab the puffs and glow them white.
      uColor: { value: new THREE.Color("#b6975f") },
      uPR: { value: 1.5 },
    }),
    [],
  );

  const state = useRef({ timer: 0, cursor: 0, seed: 0x1a2b3c });
  const p = useMemo(() => new THREE.Vector3(), []);

  const rnd = () => {
    const s = state.current;
    s.seed = (s.seed * 1664525 + 1013904223) >>> 0;
    return s.seed / 4294967296;
  };

  useFrame((st, delta) => {
    const d = Math.min(delta, 0.05);
    const s = state.current;
    const { positions, life, size, vel } = buffers;

    // Emit a burst on the step cadence while walking.
    if (nav.moving) {
      s.timer -= d;
      if (s.timer <= 0) {
        s.timer = STEP_INTERVAL;
        // Under the avatar's actual feet (avatarPos tracks it on every edge,
        // scenic loops included — the legacy spine scalar doesn't).
        p.set(avatarPos.x, avatarPos.y, avatarPos.z);
        const side = s.cursor % 2 === 0 ? 1 : -1; // alternate feet
        for (let k = 0; k < 5; k++) {
          const i = s.cursor % MAX;
          s.cursor++;
          const gx = p.x + side * 0.25 + (rnd() - 0.5) * 0.4;
          const gz = p.z + (rnd() - 0.5) * 0.4;
          positions[i * 3] = gx;
          positions[i * 3 + 1] = walkHeight(gx, gz) + 0.08;
          positions[i * 3 + 2] = gz;
          vel[i * 3] = (rnd() - 0.5) * 0.5;
          vel[i * 3 + 1] = 0.2 + rnd() * 0.3;
          vel[i * 3 + 2] = (rnd() - 0.5) * 0.5;
          size[i] = 6 + rnd() * 5;
          life[i] = 1;
        }
        (geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      }
    }

    // Integrate the live particles.
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] = Math.max(0, life[i] - d / LIFETIME);
      positions[i * 3] += vel[i * 3] * d;
      positions[i * 3 + 1] += vel[i * 3 + 1] * d;
      positions[i * 3 + 2] += vel[i * 3 + 2] * d;
      vel[i * 3 + 1] += 0.55 * d; // gentle rise
      vel[i * 3] *= 1 - 1.6 * d; // horizontal drag
      vel[i * 3 + 2] *= 1 - 1.6 * d;
    }
    geometry.attributes.position.needsUpdate = true;
    (geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    if (matRef.current) matRef.current.uniforms.uPR.value = st.gl.getPixelRatio();
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
      />
    </points>
  );
}
