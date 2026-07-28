// A branching side-road. It forks off the main walking trail at the village
// entrance, curves out to run along the hamlet's frontage, and rejoins the trail
// past the last cabin — a visible fork the eye can follow, and a lane for a
// delivery van to drive (SideRoad.tsx). Kept THREE-free so the tree-scatter
// (props.ts) can clear a lane for it that matches the rendered road.

import { SETTLEMENT_PLOTS, DEBUG_Z_SHIFT } from "./settlement";
import { centerlineXZ } from "./trail";

export const ROAD_HALF_WIDTH = 2.3;

// Nearest main-trail point to a target z (the fork endpoints sit on the trail).
function trailNearZ(z: number): [number, number] {
  const line = centerlineXZ(1);
  let bi = 0;
  let bd = Infinity;
  for (let k = 0; k < line.length; k++) {
    const d = Math.abs(line[k][1] - z);
    if (d < bd) {
      bd = d;
      bi = k;
    }
  }
  return [line[bi][0], line[bi][1]];
}

// A point `off` metres in front of a plot (toward the trail) — the frontage line.
function frontOf(i: number, off: number): [number, number] {
  const p = SETTLEMENT_PLOTS[i];
  return [p.x + p.faceX * off, p.z + p.faceZ * off];
}

// Fork off the trail → run the town's west frontage (in front of the petrol
// bunk, the shop, and a cabin down the main street) → fork back onto the trail
// at the town's south exit. Plot indices follow settlement.ts SPEC order:
// 0 petrol, 1 shop, 2-4 west cabins.
export const SIDE_ROAD_CONTROL: [number, number][] = [
  trailNearZ(8 + DEBUG_Z_SHIFT),
  frontOf(0, 4.5),
  frontOf(1, 5.0),
  frontOf(3, 4.5),
  trailNearZ(-30 + DEBUG_Z_SHIFT),
];

// Uniform Catmull-Rom (same math as trail.ts) → dense XZ for the clearing lane.
function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function buildXZ(): [number, number][] {
  const C = SIDE_ROAD_CONTROL;
  const n = C.length - 1;
  const out: [number, number][] = [];
  const SAMP = 240;
  for (let k = 0; k <= SAMP; k++) {
    const s = (k / SAMP) * n;
    const i = Math.min(Math.floor(s), n - 1);
    const t = s - i;
    const p0 = C[Math.max(0, i - 1)];
    const p1 = C[i];
    const p2 = C[i + 1];
    const p3 = C[Math.min(n, i + 2)];
    out.push([
      catmull(p0[0], p1[0], p2[0], p3[0], t),
      catmull(p0[1], p1[1], p2[1], p3[1], t),
    ]);
  }
  return out;
}

export const SIDE_ROAD_XZ: [number, number][] = buildXZ();

/** Nearest point on the road centerline to (x, z), with its distance. */
export function nearestSideRoadPoint(x: number, z: number): { x: number; z: number; d: number } {
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < SIDE_ROAD_XZ.length; i++) {
    const dx = x - SIDE_ROAD_XZ[i][0];
    const dz = z - SIDE_ROAD_XZ[i][1];
    const d2 = dx * dx + dz * dz;
    if (d2 < bd) {
      bd = d2;
      bi = i;
    }
  }
  return { x: SIDE_ROAD_XZ[bi][0], z: SIDE_ROAD_XZ[bi][1], d: Math.sqrt(bd) };
}

/** True when (x, z) lies within the road lane (+ margin) — for tree exclusion. */
export function nearSideRoad(x: number, z: number, margin = 0): boolean {
  const r = ROAD_HALF_WIDTH + margin;
  const r2 = r * r;
  for (let i = 0; i < SIDE_ROAD_XZ.length; i++) {
    const dx = x - SIDE_ROAD_XZ[i][0];
    const dz = z - SIDE_ROAD_XZ[i][1];
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}
