"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { height } from "@/lib/journey/terrain";
import { TERRAIN_HALF_X, TERRAIN_Z_NEAR, TERRAIN_Z_FAR } from "@/lib/journey/config";

// Falling snow that always surrounds the camera. A single GPU-animated Points
// cloud in a box that we keep centred on the viewer; each flake falls (y wraps
// from top to bottom) with a lazy horizontal sway, so it reads as real snow
// drifting down from the sky rather than specks hanging in the air.

const BOX = 80; // horizontal extent of the snow column (x & z)
const FALL_H = 46; // vertical span the flakes wrap through

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uFall;
  uniform float uSize;
  uniform float uPR;
  attribute vec3 aOffset;   // base position within the box
  attribute float aSeed;
  varying float vA;
  varying float vWorldY;    // world height, for melting the flake out at the ground
  varying vec2 vWXZ;        // world XZ, to look up the ground height under this flake
  varying float vTw;        // gentle per-flake shimmer
  void main() {
    vec3 p = aOffset;
    float s = aSeed * 6.2831853;
    // Fall + wrap through the vertical span.
    float y = mod(p.y - uTime * uFall * (0.6 + aSeed * 0.8), ${FALL_H.toFixed(1)});
    p.y = y - ${(FALL_H / 2).toFixed(1)};
    // Lazy horizontal drift so flakes don't fall in straight lines.
    p.x += sin(uTime * 0.5 + s) * 1.3;
    p.z += cos(uTime * 0.42 + s * 1.3) * 1.3;
    // Fade flakes in/out at the top/bottom seam of the wrapping column.
    vA = smoothstep(0.0, 6.0, y) * smoothstep(${FALL_H.toFixed(1)}, ${(FALL_H - 8).toFixed(1)}, y);
    vTw = 0.7 + 0.3 * sin(uTime * 2.6 + s * 2.3);
    vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
    vWorldY = wp.y;
    vWXZ = wp.xz;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Bigger, softer flakes near the camera; a 2.5px floor keeps distant ones from
    // collapsing into hard 1px specks (the "dots"). Perspective size via 1/-z.
    gl_PointSize = clamp(uSize * (0.55 + aSeed * 0.9) * uPR * (55.0 / -mv.z), 2.5, 15.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform sampler2D uHeightMap; // terrain height packed to [0,1] over the world
  uniform vec2 uWorldMin;       // world XZ of the heightmap's (0,0) corner
  uniform vec2 uWorldSize;      // world-XZ span the heightmap covers
  uniform float uH0;            // ground height that maps to texel 0
  uniform float uH1;            // ground height that maps to texel 1
  varying float vA;
  varying float vWorldY;
  varying vec2 vWXZ;
  varying float vTw;
  void main() {
    // Soft round flake: a feathered disc with a brighter core, so even the big
    // near flakes read as fuzzy snow rather than hard dots.
    float d = length(gl_PointCoord - 0.5);
    float disc = smoothstep(0.5, 0.06, d);
    disc *= 0.6 + 0.4 * smoothstep(0.28, 0.0, d);
    // Melt into the snow at THIS flake's OWN ground height — sampled from the
    // terrain heightmap by the flake's world XZ, not a single plane under the
    // camera. That plane was often metres above the ground the flake was actually
    // falling toward (chase cam sits high/behind on slopes), so flakes vanished in
    // mid-air. Now they fall all the way down; a soft ~0.7 m fade at the surface
    // reads as settling snow.
    vec2 huv = (vWXZ - uWorldMin) / uWorldSize;
    float gY = mix(uH0, uH1, texture2D(uHeightMap, huv).r);
    float ground = smoothstep(gY - 0.3, gY + 0.7, vWorldY);
    float a = disc * vA * ground * vTw * 0.9;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export default function Snow({ count = 1800 }: { count?: number }) {
  const points = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);

  const geometry = useMemo(() => {
    // Deterministic scatter so the field is stable across reloads.
    let seed = 0x9e3779b9;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const offset = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      offset[i * 3] = (rnd() - 0.5) * BOX;
      offset[i * 3 + 1] = rnd() * FALL_H;
      offset[i * 3 + 2] = (rnd() - 0.5) * BOX;
      seeds[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("aOffset", new THREE.BufferAttribute(offset, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    // position attribute is unused by the shader but three wants one present.
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, [count]);

  // Static terrain heightmap, built once. Each flake samples the ground height
  // under its own XZ from this so it can melt at the real surface everywhere,
  // instead of a single camera-relative plane (which floated above sloped ground
  // and made flakes disappear before landing). Height is normalised to a byte and
  // read back with LinearFilter — 8 bits over the world's ~35 m span is ~0.14 m,
  // finer than the melt band. RGBA8 + linear needs no float-texture extension.
  const heightField = useMemo(() => {
    const W = 128;
    const H = 128;
    const xMin = -TERRAIN_HALF_X;
    const xMax = TERRAIN_HALF_X;
    const zMin = Math.min(TERRAIN_Z_NEAR, TERRAIN_Z_FAR);
    const zMax = Math.max(TERRAIN_Z_NEAR, TERRAIN_Z_FAR);
    const raw = new Float32Array(W * H);
    let h0 = Infinity;
    let h1 = -Infinity;
    for (let i = 0; i < H; i++) {
      const z = zMin + (zMax - zMin) * (i / (H - 1));
      for (let j = 0; j < W; j++) {
        const x = xMin + (xMax - xMin) * (j / (W - 1));
        const h = height(x, z);
        raw[i * W + j] = h;
        if (h < h0) h0 = h;
        if (h > h1) h1 = h;
      }
    }
    const span = Math.max(1e-3, h1 - h0);
    const data = new Uint8Array(W * H * 4);
    for (let k = 0; k < W * H; k++) {
      const v = Math.round(((raw[k] - h0) / span) * 255);
      data[k * 4] = v;
      data[k * 4 + 1] = v;
      data[k * 4 + 2] = v;
      data[k * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace; // raw heights, not colour — no sRGB decode
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return {
      tex,
      h0,
      h1,
      min: new THREE.Vector2(xMin, zMin),
      size: new THREE.Vector2(xMax - xMin, zMax - zMin),
    };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFall: { value: 7.0 }, // fall speed (units/sec)
      uSize: { value: 7.0 },
      uColor: { value: new THREE.Color("#eef3f8") },
      uPR: { value: 1.5 },
      uHeightMap: { value: heightField.tex },
      uWorldMin: { value: heightField.min },
      uWorldSize: { value: heightField.size },
      uH0: { value: heightField.h0 },
      uH1: { value: heightField.h1 },
    }),
    [heightField],
  );

  useFrame((st, delta) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value += Math.min(delta, 0.05);
      matRef.current.uniforms.uPR.value = st.gl.getPixelRatio();
    }
    // Keep the snow column centred on the camera (snapped a little) so it always
    // surrounds the viewer without the flakes being "left behind" as you move.
    if (points.current) {
      target.set(camera.position.x, camera.position.y, camera.position.z);
      points.current.position.lerp(target, 0.2);
    }
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
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
