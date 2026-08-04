// Shared "snow settles on up-facing surfaces" shader. One helper patches any
// MeshStandardMaterial so that wherever a surface points skyward it gathers a cap
// of lit snow — roofs, rock tops, pine canopies, car hoods — with the same cool
// white and the same diamond-dust sparkle as the terrain. This is what turns a
// world of green Kenney props into a coherent WINTER world: everything wears snow.
//
// How it reads a surface as "up": we carry a world-space normal varying (folding
// in the per-instance rotation for instanced props), and blend toward snow where
// its Y is high. A world-position value-noise wobbles the snow line so it isn't a
// dead-flat latitude. The snow is injected into `diffuseColor` BEFORE lighting, so
// the sun and ambient light it like real snow (not glowing paint); roughness drops
// on the cap for a soft sheen; and a view-dependent sparkle is added at the end,
// scaled by the sun so it blazes by day and calms at night.
//
// Composition: foliage materials already own `onBeforeCompile` (the wind sway), so
// applyTopSnow WRAPS whatever is there — wind runs first, then snow injects at
// different anchors. See the customProgramCacheKey note in applyTopSnow for the
// three.js program-cache subtlety that makes the wrap safe.
//
// LIVING snow (the avatar): world props can wear a static cap — nobody watches a
// roof long enough to notice it never changes — but the avatar is on screen the
// whole visit, so his snow is a WEATHER SIMULATION readout instead. The CPU
// (Avatar.tsx) integrates a cover level: it climbs while he stands in the
// snowfall (waxing and waning with the flurries), drains as he walks, dumps when
// he runs, vaults or kicks. The shader turns that one number into patchy,
// inconsistent snow: a body-anchored noise field whose every cell slowly
// oscillates on its own clock is thresholded at the cover level — cover rising
// grows patches in one by one, cover falling sloughs them off chunk by chunk,
// and even at steady cover the drift means a clump quietly drops off a shoulder
// while another gathers on the hood. Skin holds far less than cloth (uAvHold),
// so the face sheds while the shoulders keep their drift. The HAIR is not
// patched at all (Avatar.tsx skips its materials) — a cap on the crown read as a
// white streak in the portrait framing the camera holds longest.

import * as THREE from "three";
import { sunState } from "./daynight";

const SNOW_ALBEDO = "#eef3fb"; // cool white, matches the falling snow / snow caps
const SPARKLE_COLOR = "#eaf2ff"; // same glint tint as the terrain sparkle

// Sun-driven sparkle/brightness factor, shared by the terrain and every snowed
// prop so the whole world's snow twinkles in lock-step. Held in one mutable
// uniform object (like windUniforms) — advanceSnow() ticks it once per frame.
export const snowUniforms = { uSun: { value: 0.6 } };

/** Refresh the shared snow-sun factor from the day/night sun. Call once per frame. */
export function advanceSnow() {
  // Sun intensity swings ~0.5 (night) → ~3.1 (day); keep a faint glint at night.
  snowUniforms.uSun.value = THREE.MathUtils.clamp(sunState.intensity / 3.0, 0.08, 1.0);
}

// Shared LIVING-snow uniforms for the avatar's materials (all four bind these same
// objects, so one write per frame moves the whole body). Avatar.tsx owns the
// simulation: uCover is how much snow he currently carries (0 bare → 1 buried),
// uTime the slow clock the patch field drifts on. Starts part-covered — he's been
// standing out in the snowfall since before the reveal.
export const avatarSnowUniforms = {
  uCover: { value: 0.55 },
  uTime: { value: 0 },
};

// --- vertex injections --------------------------------------------------------
// World normal: objectNormal, rotated by the instance (if any) then the model.
// Uniform per-instance scale means mat3()+normalize is exact. Injected right after
// <beginnormal_vertex>, where objectNormal is the raw geometry normal.
const V_WORLD_NORMAL = /* glsl */ `
  vec3 _wn = objectNormal;
  #ifdef USE_INSTANCING
    _wn = mat3(instanceMatrix) * _wn;
  #endif
  vWNorm = normalize(mat3(modelMatrix) * _wn);`;

// Skinned variant (the avatar): injected AFTER <skinnormal_vertex>, where three has
// already bone-deformed objectNormal into model space — so snow follows his shoulders
// as they actually move, not the bind pose. No instancing on the avatar. modelMatrix
// is unscaled (avatar scale 1), so mat3()+normalize is exact.
const V_WORLD_NORMAL_SKINNED = /* glsl */ `
  vWNorm = normalize(mat3(modelMatrix) * objectNormal);`;

// World position AFTER any wind sway (transformed is final here); same instance→
// model chain the standard <project_vertex> uses.
const V_WORLD_POS = /* glsl */ `
  vec4 _wp4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    _wp4 = instanceMatrix * _wp4;
  #endif
  vWPos = (modelMatrix * _wp4).xyz;`;

// --- fragment injections ------------------------------------------------------
const F_PARS = /* glsl */ `
  varying vec3 vWPos;
  varying vec3 vWNorm;
  uniform float uSnowSun;
  uniform vec3 uSnowColor;
  uniform vec3 uSparkleColor;
`;

// Snow albedo, injected right after <color_fragment> (so instance tint is already
// applied and the snow then LIT by the standard pass). Declares `snowMask` at
// main() scope so the roughness and sparkle injections downstream can reuse it.
// Split in two so the LIVING variant can modulate the mask between them.
const F_MASK = /* glsl */ `
  float _up = clamp(vWNorm.y, 0.0, 1.0);
  // Smooth world-space value noise (4-corner bilinear hash) wobbles the snow line.
  vec2 _p = vWPos.xz * 0.5;
  vec2 _i = floor(_p); vec2 _f = fract(_p);
  _f = _f * _f * (3.0 - 2.0 * _f);
  float _a = fract(sin(dot(_i + vec2(0.0, 0.0), vec2(41.3, 289.1))) * 43758.5453);
  float _b = fract(sin(dot(_i + vec2(1.0, 0.0), vec2(41.3, 289.1))) * 43758.5453);
  float _c = fract(sin(dot(_i + vec2(0.0, 1.0), vec2(41.3, 289.1))) * 43758.5453);
  float _d = fract(sin(dot(_i + vec2(1.0, 1.0), vec2(41.3, 289.1))) * 43758.5453);
  float _n = mix(mix(_a, _b, _f.x), mix(_c, _d, _f.x), _f.y);
  float _edge = 0.42 + (_n - 0.5) * 0.28;                 // wobbly snow line
  // _snowBodyGate is 1.0 everywhere for world props; on the avatar it's the
  // upper-body gate (declared just above this block) so legs/hands stay bare.
  float snowMask = smoothstep(_edge, _edge + 0.22, _up) * _snowBodyGate;`;

const F_MIX = /* glsl */ `
  diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, snowMask);`;

// LIVING modulation (avatar only) — see the header. A trilinear value noise over
// the BIND-pose position (so a clump stays on the same shoulder through every
// stride) whose 8 cell-corner values each breathe on their own slow clock; the
// CPU-simulated cover level sweeps a threshold through it. Cover 1 → snowed to
// the edge of the body gate; 0.5 → drifting blotches; 0.1 → stray flecks on the
// crown; 0 → bare. uAvHold caps what this surface can keep (warm skin ≪ hair).
const F_LIVING = /* glsl */ `
  vec3 _bp = vBindPos * 13.0;
  vec3 _bi = floor(_bp);
  vec3 _bf = _bp - _bi;
  _bf = _bf * _bf * (3.0 - 2.0 * _bf);
  float _pn = 0.0;
  for (int _ci = 0; _ci < 8; _ci++) {
    float _fi = float(_ci);
    vec3 _o = vec3(mod(_fi, 2.0), mod(floor(_fi * 0.5), 2.0), floor(_fi * 0.25));
    float _h = fract(sin(dot(_bi + _o, vec3(13.73, 61.31, 27.19))) * 43758.5453);
    float _cv = 0.5 + 0.5 * sin(uAvTime * (0.14 + _h * 0.3) + _h * 6.2831853);
    vec3 _w = mix(1.0 - _bf, _bf, _o);
    _pn += _cv * _w.x * _w.y * _w.z;
  }
  float _cov = clamp(uAvCover * uAvHold, 0.0, 1.0);
  float _th = 1.0 - _cov * 1.15;
  snowMask *= smoothstep(_th, _th + 0.14, _pn) * smoothstep(0.0, 0.05, _cov);`;

// Soft sheen on the cap (matte world stays put).
const F_ROUGH = /* glsl */ `
  roughnessFactor = mix(roughnessFactor, 0.72, snowMask);`;

// Diamond-dust sparkle + grazing rim, gated by the snow cap and the sun. Mirrors
// the terrain sparkle so caps and ground twinkle as one. Added just before the
// standard <opaque_fragment> writes outgoingLight out.
const F_SPARKLE = /* glsl */ `
  {
    vec3 Vw = normalize(cameraPosition - vWPos);
    vec2 cell = floor(vWPos.xz * 6.0);
    float h  = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
    float a1 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453) * 6.2831853;
    float a2 = fract(sin(dot(cell, vec2(419.2, 371.9))) * 43758.5453) * 1.4 + 0.3;
    vec3 gdir = normalize(vec3(cos(a1) * sin(a2), cos(a2), sin(a1) * sin(a2)));
    float glint = pow(max(dot(Vw, gdir), 0.0), 180.0) * step(0.984, h);
    vec3 Vv = normalize(vViewPosition);
    float fres = pow(1.0 - max(dot(Vv, normal), 0.0), 4.0);
    outgoingLight += uSparkleColor * snowMask * (glint * 2.4 * uSnowSun + fres * 0.10);
  }
  #include <opaque_fragment>`;

/**
 * Patch a MeshStandardMaterial (or MeshPhysicalMaterial) so up-facing surfaces
 * gather lit, sparkling snow. Safe to call on a material that already has an
 * onBeforeCompile (e.g. wind): the previous hook runs first, then snow injects at
 * non-overlapping anchors. Idempotent — safe to call twice on a shared material
 * (avatar meshes can share one). Pass `{ skinned: true }` for a SkinnedMesh so the
 * snow follows the animated (not bind-pose) normal. Pass `bodyBounds` (a bind-pose
 * feet→head Y extent) to gate snow to the UPPER body only — shoulders and head,
 * never the legs or hands. Pass `dynamic: { hold }` (avatar) to swap the static
 * cap for the LIVING simulation readout — hold is this surface's snow-keeping
 * ceiling (cloth ~0.9, warm skin ~0.35). Don't call this on hair at all.
 */
export function applyTopSnow(
  mat: THREE.Material,
  opts?: {
    skinned?: boolean;
    bodyBounds?: { min: number; max: number };
    dynamic?: { hold: number };
  },
) {
  const tagged = mat as THREE.Material & { __topSnow?: boolean };
  if (tagged.__topSnow) return; // already snowed — never double-inject (dup varyings)
  tagged.__topSnow = true;

  const skinned = opts?.skinned ?? false;
  const bounds = opts?.bodyBounds;
  const dynamic = opts?.dynamic;
  const normalAnchor = skinned ? "#include <skinnormal_vertex>" : "#include <beginnormal_vertex>";
  const normalInject =
    (skinned ? V_WORLD_NORMAL_SKINNED : V_WORLD_NORMAL) +
    // Bind-pose position: `position` is the raw attribute, untouched by skinning —
    // the stable body-space the living patch field anchors to.
    (dynamic ? "\n  vBindPos = position;" : "");

  // Anatomical height gate (avatar only). Snow should cling to the STABLE upper
  // body — shoulders, neck, head, hair — and never to the legs or hands, which
  // swing through every stride and in life shake any settling snow straight off.
  // We read each vertex's ANIMATED local height (`transformed.y`, post-skinning)
  // and normalise it over the avatar's bind feet→head extent, so the gate tracks
  // the LIVE pose: while walking the hands ride down at the hips (low t → no snow)
  // and only the shoulders/head sit up in the band. Reading the animated height
  // (not the bind pose) is what makes it correct whether the rig binds A- or T-pose
  // — a T-pose would put the hands at shoulder HEIGHT in the bind, but the walk
  // clip lowers them, and `transformed.y` follows the clip. Numbers are baked in
  // (known at patch time), so no per-frame uniform and no extra plumbing.
  const span = bounds ? Math.max(1e-3, bounds.max - bounds.min) : 1;
  const bodyVary = bounds ? "varying float vBodyT;\n" : "";
  const bodyVertex = bounds
    ? `\n  vBodyT = (transformed.y - ${bounds.min.toFixed(4)}) / ${span.toFixed(4)};`
    : "";
  const bodyGate = bounds
    ? "float _snowBodyGate = smoothstep(0.72, 0.80, vBodyT);\n  " // shoulders in, arms fade, legs/hands out
    : "float _snowBodyGate = 1.0;\n  "; // world props: whole up-facing top snows

  const prev = mat.onBeforeCompile;
  // A real prior hook (wind) shadows the Material.prototype no-op as an OWN
  // function; a plain material still inherits that shared no-op. Distinguishing
  // the two is what makes the program-cache key below correct (see note).
  const hadPrevHook = prev !== THREE.Material.prototype.onBeforeCompile;
  const livingVary = dynamic ? "varying vec3 vBindPos;\n" : "";
  const livingPars = dynamic
    ? "uniform float uAvCover;\nuniform float uAvTime;\nuniform float uAvHold;\n"
    : "";

  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer); // no-op by default; wind sway first if this is foliage

    shader.uniforms.uSnowSun = snowUniforms.uSun;
    shader.uniforms.uSnowColor = { value: new THREE.Color(SNOW_ALBEDO) };
    shader.uniforms.uSparkleColor = { value: new THREE.Color(SPARKLE_COLOR) };
    if (dynamic) {
      // Bind the SHARED uniform objects — Avatar.tsx writes them once per frame
      // and every avatar material sees the same weather.
      shader.uniforms.uAvCover = avatarSnowUniforms.uCover;
      shader.uniforms.uAvTime = avatarSnowUniforms.uTime;
      shader.uniforms.uAvHold = { value: dynamic.hold };
    }

    shader.vertexShader =
      "varying vec3 vWPos;\nvarying vec3 vWNorm;\n" +
      bodyVary +
      livingVary +
      shader.vertexShader
        .replace(normalAnchor, normalAnchor + normalInject)
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>" + V_WORLD_POS + bodyVertex,
        );

    shader.fragmentShader =
      F_PARS +
      bodyVary +
      livingVary +
      livingPars +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\n  " + bodyGate + F_MASK + (dynamic ? F_LIVING : "") + F_MIX,
        )
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>" + F_ROUGH)
        .replace("#include <opaque_fragment>", F_SPARKLE);
  };

  // three's DEFAULT program-cache key is onBeforeCompile.toString(), which is
  // IDENTICAL for this wrapper regardless of what it closes over — so a snow-only
  // rock and a wind+snow tree (both instanced, otherwise identical params) would
  // collide onto ONE compiled program and swap shaders. Encode the variant axes
  // (wind present, skinned, and the baked body-gate bounds) so each gets its own.
  mat.customProgramCacheKey = () =>
    "topsnow" +
    (hadPrevHook ? "|w" : "") +
    (skinned ? "|s" : "") +
    (dynamic ? "|d" : "") + // hold itself is a uniform — no key axis needed
    (bounds ? `|b${bounds.min.toFixed(2)}_${bounds.max.toFixed(2)}` : "");
  mat.needsUpdate = true;
}
