// A tiny shared wind system. One clock drives every wind-enabled material: each
// gets its sway injected into the standard vertex shader via onBeforeCompile, so
// trees, grass and flowers all bend under the same breeze without any per-frame
// CPU work (just one uniform tick). The sway grows from base → top and blows
// along a single world direction, with a little cross-flutter and slow gusting so
// it reads as real wind, not a metronome.

import * as THREE from "three";

// Shared, mutable uniforms. Every foliage material references these exact objects
// (not copies), so advancing uTime once animates the whole world.
export const windUniforms = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(1, 0.42).normalize() },
};

/** Advance the global wind clock once per frame. */
export function advanceWind(delta: number) {
  windUniforms.uTime.value += Math.min(delta, 0.05);
}

/** How hard a given prop bends in the wind (0 = rigid). */
export function windStrengthFor(key: string): number {
  if (key.startsWith("grass")) return 0.13; // thin blades ripple the most
  if (key.startsWith("tree")) return 0.07; // canopies sway
  if (key.startsWith("flower")) return 0.08;
  return 0; // rocks, stones, cliffs, mushrooms, bridge — planted
}

type WindOpts = {
  strength: number; // world sway units at the very top, before instance scale
  minY: number; // geometry local Y range, so 0 = base, 1 = crown
  maxY: number;
  speed?: number;
};

// Injects a height-weighted, world-directional sway into a MeshStandardMaterial.
// `transformed` is local geometry space; we project the desired world sway back
// onto each instance's local axes (yaw only, so columns 0/2 are an orthonormal
// basis once normalized) so every tree bends the same way in the world.
export function applyWind(mat: THREE.Material, opts: WindOpts) {
  const speed = opts.speed ?? 1.3;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindDir = windUniforms.uWindDir;
    shader.uniforms.uWindSpeed = { value: speed };
    shader.uniforms.uWindStrength = { value: opts.strength };
    shader.uniforms.uMinY = { value: opts.minY };
    shader.uniforms.uMaxY = { value: opts.maxY };

    shader.vertexShader =
      `uniform float uTime;
       uniform vec2 uWindDir;
       uniform float uWindSpeed;
       uniform float uWindStrength;
       uniform float uMinY;
       uniform float uMaxY;
      ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      /* glsl */ `#include <begin_vertex>
      {
        float span = max(0.001, uMaxY - uMinY);
        float hf = clamp((position.y - uMinY) / span, 0.0, 1.0);
        hf = hf * hf; // base stays planted, crown moves
      #ifdef USE_INSTANCING
        vec3 wBase = instanceMatrix[3].xyz;
        vec2 ax = vec2(instanceMatrix[0].x, instanceMatrix[0].z);
        vec2 az = vec2(instanceMatrix[2].x, instanceMatrix[2].z);
        ax /= max(1e-4, length(ax));
        az /= max(1e-4, length(az));
      #else
        vec3 wBase = vec3(0.0);
        vec2 ax = vec2(1.0, 0.0);
        vec2 az = vec2(0.0, 1.0);
      #endif
        float ph = wBase.x * 0.35 + wBase.z * 0.42;   // decorrelate neighbours
        float t = uTime * uWindSpeed;
        float gust = 0.6 + 0.4 * sin(uTime * 0.45 + ph * 0.2);
        float flow = sin(t + ph) + 0.35 * sin(t * 2.3 + ph * 1.7);
        vec2 worldSway = uWindDir * flow;
        worldSway += vec2(-uWindDir.y, uWindDir.x) * 0.3 * sin(t * 1.7 + ph * 2.1); // cross-drift
        worldSway *= uWindStrength * hf * gust;
        transformed.x += dot(worldSway, ax);
        transformed.z += dot(worldSway, az);
        // Fast, fine flutter on the tips so leaves and blades shimmer, not just lean.
        float flutter = sin(t * 3.9 + ph * 3.0 + position.y * 2.6)
                      + 0.5 * sin(t * 6.3 + position.x * 3.0);
        transformed.y += flutter * uWindStrength * hf * 0.16;
      }`,
    );
  };
  mat.needsUpdate = true;
}
