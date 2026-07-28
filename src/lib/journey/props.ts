// Prop registry + deterministic scatter for the crafted (Kenney Nature Kit)
// world. Pure numbers only — no THREE — so the same placement can be reasoned
// about anywhere. The R3F layer (Scatter.tsx) turns these transforms into
// instanced meshes.

import { fbm } from "./noise";
import { distanceToGraph, EDGE_IDS, edgeSamplesXZ, nodeById } from "./graph";
import { height, zoneAt, insidePond, POND_WATER_Y } from "./terrain";
import { insideSettlement } from "./settlement";
import { nearSideRoad } from "./sideroad";
import {
  TERRAIN_HALF_X,
  TERRAIN_Z_NEAR,
  TERRAIN_Z_FAR,
  TRAIL_HALF_WIDTH,
  POND,
} from "./config";

export type Zone = "meadow" | "forest" | "mountain";
export type PropKind = "tree" | "rock" | "plant";

export type PropDef = {
  key: string; // GLB basename in /public/models/nature
  kind: PropKind;
  scale: number; // base uniform scale (native models are ~1–1.5u)
  jitter: number; // ± fraction of scale randomness
  zones: Partial<Record<Zone, number>>; // spawn weight per zone (0 = never)
};

export const PROP_URL = (key: string) => `/models/nature/${key}.glb`;

// Scales chosen so tall conifers tower ~5–6u over the ~1.7u avatar, with a mix
// of smaller trees, boulders, and ground plants.
export const PROPS: PropDef[] = [
  // --- conifers -------------------------------------------------------------
  { key: "tree_pineTallA", kind: "tree", scale: 3.6, jitter: 0.18, zones: { forest: 1.0, mountain: 0.8, meadow: 0.05 } },
  { key: "tree_pineTallB", kind: "tree", scale: 3.4, jitter: 0.18, zones: { forest: 1.0, mountain: 0.8, meadow: 0.05 } },
  { key: "tree_pineTallC", kind: "tree", scale: 3.2, jitter: 0.18, zones: { forest: 0.9, mountain: 0.7 } },
  { key: "tree_pineDefaultA", kind: "tree", scale: 3.0, jitter: 0.2, zones: { forest: 0.8, mountain: 0.5 } },
  { key: "tree_pineRoundC", kind: "tree", scale: 2.7, jitter: 0.2, zones: { forest: 0.6, meadow: 0.2, mountain: 0.3 } },
  { key: "tree_pineRoundE", kind: "tree", scale: 2.8, jitter: 0.2, zones: { forest: 0.6, meadow: 0.2, mountain: 0.3 } },
  { key: "tree_pineSmallB", kind: "tree", scale: 2.3, jitter: 0.25, zones: { forest: 0.4, mountain: 0.5, meadow: 0.2 } },
  // --- broadleaf (lower elevations) ----------------------------------------
  { key: "tree_default", kind: "tree", scale: 3.2, jitter: 0.2, zones: { meadow: 0.8, forest: 0.4 } },
  { key: "tree_oak", kind: "tree", scale: 3.4, jitter: 0.2, zones: { meadow: 0.9, forest: 0.4 } },
  { key: "tree_fat", kind: "tree", scale: 3.0, jitter: 0.2, zones: { meadow: 0.7, forest: 0.3 } },
  // --- rocks / stones -------------------------------------------------------
  { key: "rock_largeA", kind: "rock", scale: 2.4, jitter: 0.3, zones: { mountain: 1.0, forest: 0.2, meadow: 0.1 } },
  { key: "rock_largeC", kind: "rock", scale: 2.2, jitter: 0.3, zones: { mountain: 1.0, forest: 0.2, meadow: 0.1 } },
  { key: "rock_tallC", kind: "rock", scale: 2.0, jitter: 0.3, zones: { mountain: 0.9, forest: 0.15 } },
  { key: "stone_largeB", kind: "rock", scale: 2.2, jitter: 0.3, zones: { mountain: 0.8, forest: 0.15 } },
  { key: "stone_tallB", kind: "rock", scale: 2.0, jitter: 0.3, zones: { mountain: 0.8 } },
  { key: "rock_smallA", kind: "rock", scale: 1.6, jitter: 0.35, zones: { mountain: 0.6, forest: 0.3, meadow: 0.2 } },
  // --- ground plants --------------------------------------------------------
  { key: "grass", kind: "plant", scale: 2.6, jitter: 0.3, zones: { meadow: 1.0, forest: 0.6, mountain: 0.15 } },
  { key: "grass_large", kind: "plant", scale: 3.0, jitter: 0.3, zones: { meadow: 1.0, forest: 0.6, mountain: 0.15 } },
  { key: "flower_redA", kind: "plant", scale: 2.4, jitter: 0.3, zones: { meadow: 0.8, forest: 0.2 } },
  { key: "flower_yellowB", kind: "plant", scale: 2.4, jitter: 0.3, zones: { meadow: 0.8, forest: 0.2 } },
  { key: "flower_purpleB", kind: "plant", scale: 2.4, jitter: 0.3, zones: { meadow: 0.7, forest: 0.2 } },
  { key: "mushroom_red", kind: "plant", scale: 2.2, jitter: 0.3, zones: { forest: 0.6, meadow: 0.1 } },
  { key: "mushroom_tan", kind: "plant", scale: 2.2, jitter: 0.3, zones: { forest: 0.6, meadow: 0.1 } },
  // --- landmark-only: never auto-scattered (zones empty), placed explicitly as
  //     set-pieces in scatterProps(). Registered here so they preload and get the
  //     "planted, no wind, no foliage tint" treatment in the render layer. -------
  { key: "cliff_rock", kind: "rock", scale: 5.5, jitter: 0.15, zones: {} },
];

/** Fast key → definition lookup (kind, scale, …) for the render layer. */
export const PROP_BY_KEY: Map<string, PropDef> = new Map(PROPS.map((p) => [p.key, p]));

export type Transform = { x: number; y: number; z: number; ry: number; s: number };

// Base per-cell category probabilities per zone. Tree probability is further
// modulated by a low-frequency "cluster" field so forests clump naturally.
const TAB: Record<Zone, { tree: number; rock: number; plant: number }> = {
  meadow: { tree: 0.13, rock: 0.02, plant: 0.36 },
  forest: { tree: 0.52, rock: 0.05, plant: 0.28 },
  mountain: { tree: 0.22, rock: 0.34, plant: 0.1 },
};

const TAU = Math.PI * 2;
const SINK = 0.08; // tuck bases slightly into the low-poly facets

// Deterministic RNG so the world is identical every load / SSR-safe.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slopeAt(x: number, z: number): number {
  const e = 1.4;
  const hx = height(x + e, z) - height(x - e, z);
  const hz = height(x, z + e) - height(x, z - e);
  return Math.min(1, Math.hypot(hx, hz) / (2 * e));
}

/**
 * Scatter every prop across the world once, deterministically. Returns a map of
 * GLB key → instance transforms, ready to feed instanced meshes.
 */
export function scatterProps(): Map<string, Transform[]> {
  const rand = mulberry32(20260723);
  const out = new Map<string, Transform[]>();
  const push = (key: string, t: Transform) => {
    const arr = out.get(key);
    if (arr) arr.push(t);
    else out.set(key, [t]);
  };

  // Convenience placer: sits a prop on the ground (or a given y), with jittered
  // scale + random yaw. Falls back to the prop's registered base scale/jitter.
  const place = (
    key: string,
    x: number,
    z: number,
    o?: { s?: number; jit?: number; yaw?: number; y?: number; sink?: number },
  ) => {
    const def = PROP_BY_KEY.get(key);
    const base = o?.s ?? def?.scale ?? 1;
    const jit = o?.jit ?? def?.jitter ?? 0;
    const s = base * (1 + (rand() * 2 - 1) * jit);
    const y = (o?.y ?? height(x, z)) - (o?.sink ?? SINK);
    push(key, { x, y, z, ry: o?.yaw ?? rand() * TAU, s });
  };

  // --- 1) Base grid: the broad distribution of trees / rocks / plants ---------
  const step = 5.5; // finer than before → a fuller world
  for (let z = TERRAIN_Z_NEAR - 5; z > TERRAIN_Z_FAR + 10; z -= step) {
    for (let x = -TERRAIN_HALF_X + 6; x < TERRAIN_HALF_X - 6; x += step) {
      const jx = x + (rand() - 0.5) * step;
      const jz = z + (rand() - 0.5) * step;

      // Keep the path and the pond clear (verges are planted separately, closer).
      if (distanceToGraph(jx, jz) < TRAIL_HALF_WIDTH + 3) continue;
      if (insidePond(jx, jz, 1.5)) continue;
      if (insideSettlement(jx, jz)) continue; // clearings for the hamlet
      if (nearSideRoad(jx, jz, 1.2)) continue; // keep the side-road lane clear

      const y = height(jx, jz);
      if (y < POND_WATER_Y + 0.2) continue; // no props in low/submerged ground

      const zone = zoneAt(jz);
      const slp = slopeAt(jx, jz);
      const cluster = fbm(jx * 0.03, jz * 0.03, 2) * 0.5 + 0.5;

      // Pick a category.
      const tp = TAB[zone].tree * (0.5 + cluster);
      const rp = TAB[zone].rock;
      const pp = TAB[zone].plant;
      const r = rand();
      let cat: PropKind | null = null;
      if (r < tp) cat = "tree";
      else if (r < tp + rp) cat = "rock";
      else if (r < tp + rp + pp) cat = "plant";
      if (!cat) continue;

      // Steep ground sheds trees in favor of rock.
      if (cat === "tree" && slp > 0.6) cat = "rock";

      // Weighted pick within the category for this zone.
      const pool = PROPS.filter((p) => p.kind === cat && (p.zones[zone] ?? 0) > 0);
      if (!pool.length) continue;
      let total = 0;
      for (const p of pool) total += p.zones[zone] ?? 0;
      let roll = rand() * total;
      let chosen = pool[0];
      for (const p of pool) {
        roll -= p.zones[zone] ?? 0;
        if (roll <= 0) {
          chosen = p;
          break;
        }
      }
      place(chosen.key, jx, jz);
    }
  }

  // --- 2) Lush road verges: greenery hugging BOTH sides of EVERY road ---------
  // This is the biggest "crafted" win — each lane of the network is bordered by
  // grass and flowers instead of bare ground, the way Bruno's tracks are
  // curbed. Walks every graph edge (the whole network, not just the tour); the
  // pond guard keeps the bridge span bare — its verge is open water.
  {
    for (const id of EDGE_IDS) {
      const line = edgeSamplesXZ(id); // ~1 m samples
      for (let i = 2; i < line.length - 2; i += 2) {
        const [px, pz] = line[i];
        const [ax, az] = line[i - 2];
        const [bx, bz] = line[i + 2];
        let tx = bx - ax;
        let tz = bz - az;
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const nx = -tz; // perpendicular in the XZ plane
        const nz = tx;
        for (const side of [-1, 1]) {
          if (rand() < 0.32) continue; // natural gaps
          const off = TRAIL_HALF_WIDTH + 0.3 + rand() * 2.4;
          const x = px + nx * side * off;
          const z = pz + nz * side * off;
          if (insidePond(x, z, 1)) continue;
          if (height(x, z) < POND_WATER_Y + 0.2) continue;
          // A verge plant of THIS lane must not stand in ANOTHER lane of the
          // network (verge offsets reach past a junction's neighbouring road).
          if (distanceToGraph(x, z) < TRAIL_HALF_WIDTH + 0.25) continue;
          // ...nor on a fountain plaza or inside a homestead's cleared yard
          // (the plaza sits 4.4 m off the street — inside verge reach).
          if (insideSettlement(x, z, 0.4)) continue;
          const zone = zoneAt(z);
          const r = rand();
          let key: string;
          if (zone === "mountain") key = r < 0.62 ? "grass" : "rock_smallA";
          else if (r < 0.5) key = "grass_large";
          else if (r < 0.72) key = "grass";
          else if (r < 0.83) key = "flower_yellowB";
          else if (r < 0.92) key = "flower_redA";
          else key = "flower_purpleB";
          place(key, x, z, { jit: 0.3 });
        }
      }
    }
  }

  // --- 3) Meadow flower fields: dense patches of colour to catch the light -----
  {
    const palette = ["flower_redA", "flower_yellowB", "flower_purpleB", "grass", "grass_large"];
    for (let f = 0; f < 7; f++) {
      let cx = 0;
      let cz = 0;
      let ok = false;
      for (let tries = 0; tries < 24 && !ok; tries++) {
        cx = (rand() * 2 - 1) * (TERRAIN_HALF_X - 24);
        cz = 4 - rand() * 72; // meadow band (z ∈ [-68, 4])
        if (
          distanceToGraph(cx, cz) > 8 &&
          !insidePond(cx, cz, 7) &&
          !insideSettlement(cx, cz, 7) && // the band now holds homesteads + the plaza
          height(cx, cz) > POND_WATER_Y + 0.3
        )
          ok = true;
      }
      if (!ok) continue;
      const n = 18 + Math.floor(rand() * 18);
      for (let k = 0; k < n; k++) {
        const a = rand() * TAU;
        const rad = Math.sqrt(rand()) * 6.5;
        const x = cx + Math.cos(a) * rad;
        const z = cz + Math.sin(a) * rad;
        if (distanceToGraph(x, z) < TRAIL_HALF_WIDTH + 2) continue;
        if (insidePond(x, z, 1)) continue;
        if (insideSettlement(x, z, 0.4)) continue;
        place(palette[Math.floor(rand() * palette.length)], x, z, { jit: 0.3 });
      }
    }
  }

  // --- 4) Forest floor: mushroom + fern clusters nestled between the pines -----
  {
    for (let c = 0; c < 12; c++) {
      const cx = (rand() * 2 - 1) * (TERRAIN_HALF_X - 20);
      const cz = -70 - rand() * 108; // forest band
      if (distanceToGraph(cx, cz) < TRAIL_HALF_WIDTH + 3) continue;
      if (insideSettlement(cx, cz, 2)) continue;
      if (height(cx, cz) < POND_WATER_Y + 0.3) continue;
      const n = 3 + Math.floor(rand() * 5);
      for (let k = 0; k < n; k++) {
        const a = rand() * TAU;
        const rad = rand() * 2.6;
        const x = cx + Math.cos(a) * rad;
        const z = cz + Math.sin(a) * rad;
        const r = rand();
        const key = r < 0.45 ? "mushroom_red" : r < 0.7 ? "mushroom_tan" : "grass";
        place(key, x, z, { jit: 0.3 });
      }
    }
  }

  // --- 5) Pond shoreline: reeds + rocks so the water reads as designed --------
  {
    const ringN = 40;
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * TAU + (rand() - 0.5) * 0.22;
      const rad = POND.radius + 0.6 + rand() * 2.4;
      const rx = POND.x + Math.cos(a) * rad;
      const rz = POND.z + Math.sin(a) * rad;
      const ry = height(rx, rz) - 0.05;
      if (rand() < 0.45) {
        push("rock_smallA", { x: rx, y: ry, z: rz, ry: rand() * TAU, s: 1.4 + rand() * 1.3 });
      } else {
        push("grass_large", { x: rx, y: ry, z: rz, ry: rand() * TAU, s: 2.8 + rand() * 1.2 });
      }
    }
  }

  // --- 6) Landmarks: hero set-pieces built from the (previously unused) assets --
  {
    // The Summit stop sits on its knoll (terrain.ts KNOLL); the cairn and the
    // cliff backdrop anchor to the node so they follow if the map moves.
    const summit = nodeById("contact");
    const sx = summit?.x ?? 10;
    const sz = summit?.z ?? -138;

    // Summit cairn — three balanced stones just off the stop: a clear
    // "you made it" marker at the top of the climb.
    const cxx = sx + 5;
    const czz = sz + 2.5;
    const gy = height(cxx, czz);
    push("stone_largeB", { x: cxx, y: gy - 0.1, z: czz, ry: 0.4, s: 2.6 });
    push("stone_tallB", { x: cxx + 0.15, y: gy + 1.5, z: czz + 0.1, ry: 1.2, s: 1.7 });
    push("rock_smallA", { x: cxx, y: gy + 2.9, z: czz, ry: 2.0, s: 1.5 });

    // Cliff backdrop — a ridge of big rocks on the knoll's south flank, closing
    // the vista behind the summit flag.
    for (let i = 0; i < 5; i++) {
      const x = sx + (i - 2) * 13 + (rand() - 0.5) * 6;
      const z = sz - 15 - rand() * 12;
      place("cliff_rock", x, z, { s: 5 + rand() * 2.5, jit: 0, yaw: rand() * TAU, sink: 0.6 });
    }
    // (The old decorative bridge_wood prop is gone — the REAL pond bridge is
    // now a structural piece of the road network: Bridge.tsx.)
  }

  return out;
}
