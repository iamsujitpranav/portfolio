// The day↔night cycle. One phase value t ∈ [0,1) loops through keyframed moods
// (night → dawn → day → golden → dusk → night); every frame we interpolate the
// surrounding keys and write the result into shared objects that the sky dome,
// sun light, fog, ambient/hemisphere fill and stars all read. Keeping the state
// in module-level singletons (like the wind system) means one update animates the
// whole world with no prop-drilling.

import * as THREE from "three";
import { lerp } from "./noise";

// Sky dome shader uniforms (shared object — SkyDome binds these exact refs).
export const skyUniforms = {
  uTop: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uSun: { value: new THREE.Color() },
  // Sun stays at a fixed raking direction; only its colour/strength change over
  // the day, which keeps shadows sane while the mood swings.
  uSunDir: { value: new THREE.Vector3(-52, 19, 30).normalize() },
};

// Direct-light + fill state the Scene lights read each frame.
export const sunState = { color: new THREE.Color(), intensity: 2.9 };
export const skyExtra = {
  fog: new THREE.Color(),
  ambient: new THREE.Color(),
  ambientI: 0.14,
  hemiSky: new THREE.Color(),
  hemiGround: new THREE.Color(),
  hemiI: 0.42,
  star: 0, // star field opacity (1 at deep night)
  // "lights-on" factor for artificial light (street lamps, windows, headlights):
  // 0 in bright day/golden, ramps up through dusk, 1 by nightfall. Derived from
  // the sun's strength so it always tracks the mood without extra tuning.
  night: 0,
};

type Key = {
  t: number;
  top: string;
  horizon: string;
  sun: string; // sky sun-glow tint
  sunColor: string; // directional light colour
  sunI: number;
  fog: string;
  amb: string;
  ambI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  star: number;
};

// Hand-tuned moods around the clock. t wraps, so the last key mirrors the first.
//
// WINTER PALETTE — deliberately COOL at every phase. The snow must read WHITE in
// day AND night, so the *direct sun light* (sunColor) and the *fog* are kept
// near-white / cool-blue the whole cycle — they never go warm/orange, because a
// warm sun + warm fog is exactly what stained the snow sand-coloured at golden
// hour. The SKY dome still shifts (bright blue day → dusky blue dusk → moonlit
// night) for a day/night feel, but that colour lives in the sky, not on the snow.
const KEYS: Key[] = [
  // deep night — moonlit cool blue. Snow reads a soft blue-white (correct for
  // night), never warm. Strong cool fill so the world stays readable under the
  // lamps; fog is a dark cool blue, not brown.
  { t: 0.0, top: "#0a0f28", horizon: "#223752", sun: "#5a6a92", sunColor: "#c2d2ec", sunI: 0.5, fog: "#27374f", amb: "#a8b8d6", ambI: 0.42, hemiSky: "#52658f", hemiGround: "#2a3346", hemiI: 0.95, star: 1.0 },
  // dawn — pale cool morning (soft blue, only the faintest cool blush). Light and
  // fog stay near-white so the snow lifts to white as it brightens.
  { t: 0.16, top: "#46578a", horizon: "#c2cee2", sun: "#dfe8f5", sunColor: "#eef3fb", sunI: 1.9, fog: "#ccd9ea", amb: "#c4cfe0", ambI: 0.26, hemiSky: "#cdd9ee", hemiGround: "#4c525e", hemiI: 0.62, star: 0.1 },
  // full day — bright cool white. Sun light is essentially white, fog cool white:
  // clean white snow.
  { t: 0.36, top: "#5b79c8", horizon: "#dbe8f3", sun: "#ffffff", sunColor: "#fdf8f2", sunI: 3.1, fog: "#e0e9f3", amb: "#cfd8e6", ambI: 0.3, hemiSky: "#bcd6f2", hemiGround: "#7c8490", hemiI: 0.6, star: 0.0 },
  // afternoon — still bright, still cool. (This slot used to be "golden hour"; the
  // gold is gone so the snow never warms.)
  { t: 0.56, top: "#6178ae", horizon: "#d4e2f0", sun: "#f2f7ff", sunColor: "#fbf6ef", sunI: 2.9, fog: "#dae5f1", amb: "#cdd8e8", ambI: 0.27, hemiSky: "#bcd0ee", hemiGround: "#787f8c", hemiI: 0.56, star: 0.0 },
  // dusk — a cool blue-violet evening. The mood dims and the SKY takes a dusky
  // mauve, but the sun light and fog stay cool so the snow stays cool-white.
  { t: 0.72, top: "#38385f", horizon: "#a6b6d2", sun: "#c6d2e8", sunColor: "#d2dcef", sunI: 1.5, fog: "#b4c1d6", amb: "#a8b4cc", ambI: 0.28, hemiSky: "#a6b4ce", hemiGround: "#3c4154", hemiI: 0.6, star: 0.15 },
  // nightfall — deepening cool blue, fill already lifted toward the moonlit night.
  { t: 0.87, top: "#161a3c", horizon: "#29395c", sun: "#6a7aa0", sunColor: "#9db0d6", sunI: 0.7, fog: "#32445e", amb: "#94a7c9", ambI: 0.36, hemiSky: "#48597d", hemiGround: "#232b3c", hemiI: 0.82, star: 0.7 },
];

// Pre-parse to Colors, and append a wrap copy of the first key at t = 1.
const PK = KEYS.map((k) => ({
  t: k.t,
  top: new THREE.Color(k.top),
  horizon: new THREE.Color(k.horizon),
  sun: new THREE.Color(k.sun),
  sunColor: new THREE.Color(k.sunColor),
  sunI: k.sunI,
  fog: new THREE.Color(k.fog),
  amb: new THREE.Color(k.amb),
  ambI: k.ambI,
  hemiSky: new THREE.Color(k.hemiSky),
  hemiGround: new THREE.Color(k.hemiGround),
  hemiI: k.hemiI,
  star: k.star,
}));
PK.push({ ...PK[0], t: 1 });

/** Advance the world's look to phase `t` (0..1). Writes the shared singletons. */
export function updateDayNight(t: number) {
  t = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < PK.length - 1 && !(t >= PK[i].t && t <= PK[i + 1].t)) i++;
  const a = PK[i];
  const b = PK[i + 1];
  const f = (t - a.t) / (b.t - a.t || 1);

  skyUniforms.uTop.value.lerpColors(a.top, b.top, f);
  skyUniforms.uHorizon.value.lerpColors(a.horizon, b.horizon, f);
  skyUniforms.uSun.value.lerpColors(a.sun, b.sun, f);

  sunState.color.lerpColors(a.sunColor, b.sunColor, f);
  sunState.intensity = lerp(a.sunI, b.sunI, f);

  skyExtra.fog.lerpColors(a.fog, b.fog, f);
  skyExtra.ambient.lerpColors(a.amb, b.amb, f);
  skyExtra.ambientI = lerp(a.ambI, b.ambI, f);
  skyExtra.hemiSky.lerpColors(a.hemiSky, b.hemiSky, f);
  skyExtra.hemiGround.lerpColors(a.hemiGround, b.hemiGround, f);
  skyExtra.hemiI = lerp(a.hemiI, b.hemiI, f);
  skyExtra.star = lerp(a.star, b.star, f);

  // Lamps come on as the sun weakens: off above ~1.9, full below ~0.5. This lags
  // the sky nicely — lanterns flicker to life through dusk, blaze at night.
  const n = (1.9 - sunState.intensity) / 1.4;
  skyExtra.night = n < 0 ? 0 : n > 1 ? 1 : n;
}

// Seconds for one full loop, and the phase we start on. Start at bright DAY so
// the first impression is clean WHITE snow (golden hour warms snow to cream — a
// beautiful passing phase, but not the "white snow" the scene should open on).
export const CYCLE_SECONDS = 150;
export const START_PHASE = 0.36;

// Initialise the singletons so the very first frame is already golden, not black.
updateDayNight(START_PHASE);
