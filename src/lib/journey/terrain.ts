// The ground: one authoritative height(x,z) plus a per-vertex color sampler.
// A gentle, clean, low-poly landscape — soft rolling hills, no dramatic peaks —
// with a shallow pond basin carved in. Everything that touches the surface
// (ground mesh, trail ribbon, scattered props, the avatar's feet) reads
// height() so nothing floats or sinks.

import { fbm, clamp, lerp, smoothstep } from "./noise";
import { nearestGraph } from "./graph";
import { SETTLEMENT_PLOTS, FLAT_SPOTS } from "./settlement";
import {
  TRAIL_HALF_WIDTH,
  TRAIL_BLEND,
  ZONE_FOREST_START,
  ZONE_MOUNTAIN_START,
  POND,
  BRIDGE,
} from "./config";

// The summit knoll — a real hill under the Summit stop (the flag/cairn stand on
// its north shoulder, the cliff backdrop on its flanks), so the last leg of any
// route to Contact is a visible climb. Gaussian, so it blends into the rolling
// base with no seams.
const KNOLL = { x: 14, z: -152, amp: 6.0, sigma: 16 };

// Gentle rolling base — soft broad hills, a little medium detail, a mild rise
// into the distance, and the summit knoll.
function baseHeight(x: number, z: number): number {
  let h = fbm(x * 0.016, z * 0.016, 3) * 3.0;
  h += fbm(x * 0.06, z * 0.06, 2) * 0.7;
  const rise = smoothstep(-40, -280, z);
  h += rise * 3.5;
  const dx = x - KNOLL.x;
  const dz = z - KNOLL.z;
  h += KNOLL.amp * Math.exp(-(dx * dx + dz * dz) / (2 * KNOLL.sigma * KNOLL.sigma));
  return h;
}

// Reference ground level at the pond center, and the derived water surface.
const PONDref = baseHeight(POND.x, POND.z);
export const POND_WATER_Y = PONDref - 0.35;

/** True when (x, z) is over the pond (optionally expanded by `margin`). */
export function insidePond(x: number, z: number, margin = 0): boolean {
  return Math.hypot(x - POND.x, z - POND.z) < POND.radius + margin;
}

// Sink the terrain into a shallow bowl at the pond, blending back to ground.
function pondBasin(x: number, z: number, base: number): number {
  const d = Math.hypot(x - POND.x, z - POND.z);
  const outer = POND.radius + POND.blend;
  if (d >= outer) return base;
  const floor = PONDref - POND.depth;
  const t = 1 - smoothstep(POND.radius * 0.55, outer, d);
  return lerp(base, floor, t);
}

/** The "natural" landscape height (hills + pond), ignoring the trail. */
function rawHeight(x: number, z: number): number {
  return pondBasin(x, z, baseHeight(x, z));
}

/** Terrain height with every ROAD of the path graph carved in: level
 *  cross-section + slight groove wherever a walkable lane runs. The pond is
 *  exempt — the Experience road crosses it on the BRIDGE (walkHeight below),
 *  so the basin must stay a basin, and the shore around the abutments is never
 *  dragged below the waterline. */
function carveHeight(x: number, z: number): number {
  const g = nearestGraph(x, z);
  const raw = rawHeight(x, z);
  let onTrail = 1 - smoothstep(TRAIL_HALF_WIDTH, TRAIL_HALF_WIDTH + TRAIL_BLEND, g.d);
  // Fade the carve out across the waterline — the deck carries the crossing.
  const dp = Math.hypot(x - POND.x, z - POND.z);
  if (dp < POND.radius + 1.0) onTrail *= smoothstep(POND.radius - 2.5, POND.radius + 1.0, dp);
  if (onTrail <= 0) return raw;
  // The carve target is a distance-weighted average over every lane SAMPLE
  // within +2 m of the nearest lane (nearestGraph.near). Samples only — never
  // the projected nearest point: that projection flips identity across every
  // medial axis (fork mouths, the village hairpin, converging spokes) and any
  // term that flips while its weight is non-zero steps the ground. Sample
  // positions are fixed, so each weight varies continuously and membership
  // changes only at zero weight — C0 by construction, verified by walking
  // rays across every pad/fork at 1 cm (scratchpad verify_dress.ts).
  let cH: number;
  {
    let wSum = 0;
    let hSum = 0;
    for (const c of g.near) {
      const w = 1 - smoothstep(0, 2.0, c.d - g.d);
      if (w <= 0) continue;
      wSum += w;
      hSum += w * rawHeight(c.x, c.z);
    }
    cH = wSum > 0 ? hSum / wSum : rawHeight(g.nx, g.nz);
  }
  // Near the abutments the nearest lane point can sit over the water, whose
  // rawHeight is the basin floor — clamp so the shore road can't dig a trench
  // below the waterline.
  if (dp < POND.radius + POND.blend) cH = Math.max(cH, POND_WATER_Y + 0.18);
  const centerH = cH - 0.24; // small groove so the path reads
  return lerp(raw, centerH, onTrail);
}

// --- level pads: countryside plots + fountain plazas --------------------------
// The rolling base drops ~1–1.8 m across a homestead's footprint, which floats
// one building corner and buries another; each rural plot (flat: true) and each
// fountain plaza gets a level pad blended back into the hills. The pad's target
// height is the CARVED ground at its centre, resolved lazily on first query —
// module-init order between this file, graph and settlement stays untouched,
// and carveHeight (not height) keeps the lookup from recursing.
type Pad = { x: number; z: number; r: number; y?: number };
let PADS: Pad[] | null = null;
function pads(): Pad[] {
  if (!PADS) {
    PADS = [
      ...SETTLEMENT_PLOTS.filter((p) => p.flat).map((p) => ({ x: p.x, z: p.z, r: p.clearR })),
      ...FLAT_SPOTS.map((s) => ({ x: s.x, z: s.z, r: s.r })),
    ];
  }
  return PADS;
}

/** carveHeight with the level pads folded in — THE public ground height.
 *  Overlapping pads (homesteads on converging roads share blend aprons near
 *  the Crossroads) are combined Shepard-style: rational weights t/(1−t) make a
 *  pad's own core win absolutely (t→1 ⇒ weight→∞), while shared aprons blend
 *  smoothly — a plain sequential lerp let a neighbour's apron dent an already
 *  levelled core (measured 0.47 m across one cabin's footprint). */
export function height(x: number, z: number): number {
  const h = carveHeight(x, z);
  let wSum = 0;
  let ySum = 0;
  let cover = 1; // Π(1 − t_i) → overall pad strength is 1 − cover
  for (const p of pads()) {
    const dx = x - p.x;
    const dz = z - p.z;
    const R = p.r + 3.5; // pad + blend apron back into the hillside
    if (dx * dx + dz * dz >= R * R) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    const t = 1 - smoothstep(p.r * 0.55, R, d);
    if (t <= 0) continue;
    if (p.y === undefined) p.y = carveHeight(p.x, p.z);
    const w = t / (1.0001 - t);
    wSum += w;
    ySum += w * p.y;
    cover *= 1 - t;
  }
  if (wSum <= 0) return h;
  return lerp(h, ySum / wSum, 1 - cover);
}

/**
 * height() with the pond bridge's timber deck folded in — the WALKABLE ground.
 * Everything that carries or renders the walked surface reads this (edge
 * curves, the avatar's feet, the path ribbons, the camera's floor clamp); the
 * terrain mesh itself keeps reading height(), so the basin stays carved and the
 * Bridge component supplies the visible structure at exactly this profile.
 */
export function walkHeight(x: number, z: number): number {
  const h = height(x, z);
  const ex = BRIDGE.bx - BRIDGE.ax;
  const ez = BRIDGE.bz - BRIDGE.az;
  const L = Math.hypot(ex, ez) || 1;
  const s = ((x - BRIDGE.ax) * ex + (z - BRIDGE.az) * ez) / L; // metres along the chord
  if (s < -BRIDGE.apron || s > L + BRIDGE.apron) return h;
  const px = BRIDGE.ax + (ex / L) * s;
  const pz = BRIDGE.az + (ez / L) * s;
  const perp = Math.hypot(x - px, z - pz);
  if (perp > BRIDGE.halfW + 1.4) return h;
  const t = clamp(s / L, 0, 1);
  const deckY = POND_WATER_Y + BRIDGE.deckClear + Math.sin(Math.PI * t) * BRIDGE.arch;
  // Ramp up over the aprons, fade across the deck edge — continuous everywhere.
  const along = smoothstep(-BRIDGE.apron, 0, s) * (1 - smoothstep(L, L + BRIDGE.apron, s));
  const across = 1 - smoothstep(BRIDGE.halfW, BRIDGE.halfW + 1.4, perp);
  return Math.max(h, lerp(h, deckY, along * across));
}

// Approximate surface slope (0 = flat, 1 = steep) via finite differences.
function slope(x: number, z: number): number {
  const e = 1.2;
  const hx = rawHeight(x + e, z) - rawHeight(x - e, z);
  const hz = rawHeight(x, z + e) - rawHeight(x, z - e);
  return clamp(Math.sqrt(hx * hx + hz * hz) / (2 * e), 0, 1.5) / 1.5;
}

// Winter albedos (lit, flat-shaded). The ground is now mostly SNOW — a bright,
// slightly cool white — with only small patches of exposed sand/soil breaking it
// up for realism, and rock showing on the steep faces where snow can't settle.
type RGB = [number, number, number];
const SNOW: RGB = [0.9, 0.92, 0.97]; // fresh snow, faintly cool
const SNOW_SHADE: RGB = [0.72, 0.78, 0.92]; // drifts / shaded snow (bluer)
const SAND: RGB = [0.66, 0.56, 0.39]; // exposed sand patch peeking through
const SOIL: RGB = [0.4, 0.32, 0.23]; // bare earth in the low, wind-scoured spots
const ROCK: RGB = [0.57, 0.56, 0.56]; // snow sheds off steep rock faces
const PATH_SNOW: RGB = [0.82, 0.83, 0.87]; // packed snow over the trail

function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function scaleRGB(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** Per-vertex terrain color for (x, z) at height h. Returns linear-ish RGB. */
export function surfaceColor(x: number, z: number, h: number): RGB {
  const s = slope(x, z);

  // Base: broad snow field with soft drift shading, so it isn't one flat sheet.
  const macro = smoothstep(-1, 1, fbm(x * 0.03, z * 0.03, 2));
  let col = mix(SNOW, SNOW_SHADE, macro * 0.55);

  // Small patches of exposed sand where the wind has scoured the snow thin —
  // deliberately low coverage so "most of the sand is covered in white".
  const bare = smoothstep(0.62, 0.92, fbm(x * 0.08 + 50, z * 0.08, 2));
  col = mix(col, SAND, bare * 0.65);

  // A few darker bare-earth scuffs in the lowest spots.
  const soil = smoothstep(0.74, 0.96, fbm(x * 0.15, z * 0.15 + 20, 2));
  col = mix(col, SOIL, soil * 0.4);

  // Fine per-facet brightness noise so flat-shaded triangles sparkle, not flatten.
  const spk = fbm(x * 0.9, z * 0.9, 1) * 0.5 + 0.5;
  col = scaleRGB(col, 0.95 + spk * 0.1);

  // Steep faces shed their snow and show rock.
  col = mix(col, ROCK, smoothstep(0.5, 0.95, s) * 0.7);

  // A thin exposed-sand ring right at the pond's waterline (shore ice/mud).
  const d = Math.hypot(x - POND.x, z - POND.z);
  const nearWater = smoothstep(1.7, 0.2, Math.abs(h - POND_WATER_Y));
  const nearPond = smoothstep(POND.radius + 3, POND.radius - 1.5, d);
  col = mix(col, SAND, clamp(nearWater * nearPond, 0, 1) * 0.6);

  // Every walkable path reads as packed snow (the ribbons add the worn tread).
  const { d: pathD } = nearestGraph(x, z);
  const onTrail = 1 - smoothstep(TRAIL_HALF_WIDTH - 0.5, TRAIL_HALF_WIDTH + 2.2, pathD);
  col = mix(col, PATH_SNOW, onTrail * 0.85);

  // The fountain plazas read as the same packed, walked-on snow.
  for (const sp of FLAT_SPOTS) {
    const dsp = Math.hypot(x - sp.x, z - sp.z);
    col = mix(col, PATH_SNOW, (1 - smoothstep(sp.r - 1.5, sp.r + 1.2, dsp)) * 0.8);
  }

  return [clamp(col[0], 0, 1), clamp(col[1], 0, 1), clamp(col[2], 0, 1)];
}

/** Which zone a Z coordinate belongs to (for foliage rules / labels). */
export function zoneAt(z: number): "meadow" | "forest" | "mountain" {
  if (z > ZONE_FOREST_START) return "meadow";
  if (z > ZONE_MOUNTAIN_START) return "forest";
  return "mountain";
}
