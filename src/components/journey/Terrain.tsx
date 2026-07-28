"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { height, surfaceColor } from "@/lib/journey/terrain";
import { snowUniforms } from "@/lib/journey/snowcover";
import {
  TERRAIN_HALF_X,
  TERRAIN_Z_NEAR,
  TERRAIN_Z_FAR,
  TERRAIN_SEGMENTS,
} from "@/lib/journey/config";

// A single displaced grid. Vertices come straight from the shared height()
// sampler and are tinted per-vertex by surfaceColor(), so the visible ground and
// everything standing on it agree. Rendered lit + flat-shaded: the per-face
// normals give crisp low-poly facets that catch the key light and receive the
// props' and avatar's cast shadows — one coherent lighting model for the world.
//
// On top of the standard PBR pass we inject a SNOW look via onBeforeCompile (same
// hook the wind system uses), so the day/night sun/ambient/IBL still light it:
//  • view-dependent SPARKLE — sparse, tight glints keyed off a per-cell random
//    direction, so they twinkle as the camera moves and (being > the bloom
//    threshold) bloom into little stars. Snow-only, and scaled by the sun so they
//    fade at night. This is the signature "it's real snow" cue.
//  • a soft SHEEN — snow drops to roughness ~0.72 (rock/soil stay matte), giving
//    a gentle specular roll instead of dead-flat paint.
//  • a grazing-angle RIM — snow scatters light at glancing angles; a mild fresnel
//    add gives the drifts some form.
// Tuning knobs live in the GLSL below (SPARKLE_DENSITY / _THRESHOLD / _GAIN, the
// sheen roughness, the rim gain).

// Injected just before `outgoingLight` is written out. Uses the world position
// varying (vWPos) we add in the vertex stage, the view-space `normal`/`vViewPosition`
// the standard shader already has, and the per-vertex `vColor` to tell snow apart.
const SNOW_FRAGMENT = /* glsl */ `
  {
    float lum = dot(vColor.rgb, vec3(0.299, 0.587, 0.114));
    float snz = smoothstep(0.72, 0.87, lum);           // 1 on bright snow, 0 on rock/soil
    // Diamond-dust sparkle: hash the world into small cells, give each a random
    // facet direction, and glint hard when the view aligns with it.
    vec3 Vw = normalize(cameraPosition - vWPos);
    vec2 cell = floor(vWPos.xz * 6.0);                 // SPARKLE_DENSITY (cells/m)
    float h  = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
    float a1 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453) * 6.2831853;
    float a2 = fract(sin(dot(cell, vec2(419.2, 371.9))) * 43758.5453) * 1.4 + 0.3;
    vec3 gdir = normalize(vec3(cos(a1) * sin(a2), cos(a2), sin(a1) * sin(a2)));
    float glint = pow(max(dot(Vw, gdir), 0.0), 180.0)  // tight = crisp twinkle
                * step(0.984, h);                       // SPARKLE_THRESHOLD (sparse)
    // Grazing-angle rim (view space; vViewPosition already points toward the camera).
    vec3 Vv = normalize(vViewPosition);
    float fres = pow(1.0 - max(dot(Vv, normal), 0.0), 4.0);
    outgoingLight += uSparkleColor * snz * (glint * 2.8 * uSparkleI + fres * 0.12);
  }
  #include <opaque_fragment>
`;

export default function Terrain() {
  const geometry = useMemo(() => {
    const segX = TERRAIN_SEGMENTS;
    const segZ = TERRAIN_SEGMENTS;
    const cols = segX + 1;
    const rows = segZ + 1;
    const positions = new Float32Array(cols * rows * 3);
    const colors = new Float32Array(cols * rows * 3);

    let p = 0;
    for (let i = 0; i < rows; i++) {
      const z = THREE.MathUtils.lerp(TERRAIN_Z_NEAR, TERRAIN_Z_FAR, i / segZ);
      for (let j = 0; j < cols; j++) {
        const x = THREE.MathUtils.lerp(-TERRAIN_HALF_X, TERRAIN_HALF_X, j / segX);
        const y = height(x, z);
        positions[p] = x;
        positions[p + 1] = y;
        positions[p + 2] = z;
        const c = surfaceColor(x, z, y);
        colors[p] = c[0];
        colors[p + 1] = c[1];
        colors[p + 2] = c[2];
        p += 3;
      }
    }

    const indices: number[] = [];
    for (let i = 0; i < segZ; i++) {
      for (let j = 0; j < segX; j++) {
        const a = i * cols + j;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, []);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 1,
      metalness: 0,
    });
    m.onBeforeCompile = (shader) => {
      // Shared sun-driven sparkle factor (ticked once in DayNight) — the terrain
      // and every snowed prop twinkle in lock-step.
      shader.uniforms.uSparkleI = snowUniforms.uSun;
      shader.uniforms.uSparkleColor = { value: new THREE.Color("#eaf2ff") };
      // Vertex: carry world position through for the sparkle hash.
      shader.vertexShader =
        "varying vec3 vWPos;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
      // Fragment: soft sheen on snow, then the sparkle/rim add before output.
      shader.fragmentShader =
        "varying vec3 vWPos;\nuniform float uSparkleI;\nuniform vec3 uSparkleColor;\n" +
        shader.fragmentShader
          .replace(
            "#include <roughnessmap_fragment>",
            "#include <roughnessmap_fragment>\n  { float _l = dot(vColor.rgb, vec3(0.299,0.587,0.114)); float _s = smoothstep(0.72,0.87,_l); roughnessFactor = mix(0.96, 0.72, _s); }",
          )
          .replace("#include <opaque_fragment>", SNOW_FRAGMENT);
    };
    return m;
  }, []);

  return <mesh geometry={geometry} material={material} receiveShadow />;
}
