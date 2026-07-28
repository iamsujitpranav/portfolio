// The walking trail's centerline, defined purely in the XZ plane (height is
// applied later by the terrain sampler so the path always hugs the ground).
//
// Kept THREE-free so it can be imported by both the terrain math (Node/build
// side) and the R3F components without pulling three into the sampler.

import { TRAIL_LENGTH } from "./config";

// Hand-placed control points [x, z]. The path starts near the camera at
// z ≈ +8, weaves left/right, and heads off to the summit at z ≈ -TRAIL_LENGTH.
const CONTROL: [number, number][] = [
  [0, 8],
  [16, -22],
  [-14, -56],
  [20, -92],
  [-8, -128],
  [16, -168],
  [-12, -206],
  [4, -TRAIL_LENGTH],
];

// Catmull-Rom interpolation of the control polygon in the XZ plane.
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

/** Raw (non-arc-length) point on the centerline for parameter s ∈ [0, 1]. */
function rawPoint(s: number): [number, number] {
  const n = CONTROL.length - 1;
  const scaled = Math.min(Math.max(s, 0), 1) * n;
  const i = Math.min(Math.floor(scaled), n - 1);
  const t = scaled - i;
  const p0 = CONTROL[Math.max(0, i - 1)];
  const p1 = CONTROL[i];
  const p2 = CONTROL[i + 1];
  const p3 = CONTROL[Math.min(n, i + 2)];
  return [
    catmull(p0[0], p1[0], p2[0], p3[0], t),
    catmull(p0[1], p1[1], p2[1], p3[1], t),
  ];
}

// Dense samples used both for nearest-point queries (terrain carving / tree
// avoidance) and to expose evenly spaced control points for the R3F curve.
const SAMPLES = 400;
const CENTERLINE: [number, number][] = [];
for (let i = 0; i <= SAMPLES; i++) CENTERLINE.push(rawPoint(i / SAMPLES));

/**
 * Nearest centerline point to (x, z): its distance and coordinates.
 *
 * The returned point must vary CONTINUOUSLY with (x, z), which is why this does
 * not simply return the closest sample. terrain.height() carves the trail by
 * reading the ground at this point, and the avatar's feet are planted on that
 * height every frame — so snapping to one of 401 discrete samples made the
 * ground under a runner a staircase: dead flat, then a jump, ~5 times a second
 * (measured: 4.7 pops/s at run pace, the largest a 453 mm teleport against a
 * 60 mm bob). That vertical stutter was the "shaky" run.
 *
 * So: find the nearest sample, then project onto the two segments meeting there
 * and take the better one. The answer now slides smoothly along the line.
 */
export function nearestTrail(x: number, z: number): {
  dist: number;
  nx: number;
  nz: number;
} {
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < CENTERLINE.length; i++) {
    const dx = x - CENTERLINE[i][0];
    const dz = z - CENTERLINE[i][1];
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      bi = i;
    }
  }

  let bx = CENTERLINE[bi][0];
  let bz = CENTERLINE[bi][1];
  // The nearest point on a polyline always lies on a segment touching the
  // nearest vertex, so these two are the only candidates worth projecting onto.
  for (const j of [bi - 1, bi]) {
    if (j < 0 || j + 1 >= CENTERLINE.length) continue;
    const [ax, az] = CENTERLINE[j];
    const [cx, cz] = CENTERLINE[j + 1];
    const ex = cx - ax;
    const ez = cz - az;
    const len2 = ex * ex + ez * ez;
    if (len2 <= 1e-12) continue;
    let t = ((x - ax) * ex + (z - az) * ez) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + ex * t;
    const pz = az + ez * t;
    const dx = x - px;
    const dz = z - pz;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      bx = px;
      bz = pz;
    }
  }
  return { dist: Math.sqrt(best), nx: bx, nz: bz };
}

/** Distance from (x, z) to the trail centerline. */
export function distanceToTrail(x: number, z: number): number {
  return nearestTrail(x, z).dist;
}

/** Control points for building the smooth 3D walk curve in a component. */
export function centerlineXZ(step = 8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < CENTERLINE.length; i += step) out.push(CENTERLINE[i]);
  out.push(CENTERLINE[CENTERLINE.length - 1]);
  return out;
}
