// The winter settlement layout — a small hamlet the trail passes through in the
// forest zone. Defined here (THREE-free) so BOTH the deterministic tree-scatter
// (props.ts, which must clear the forest where buildings stand) and the render
// layer (Settlement.tsx) agree on exactly where every plot sits and which way it
// faces. Positions are derived from the shared trail centerline so the buildings
// always line the real path even if the curve is retuned.

import { centerlineXZ } from "./trail";
import { BUILT_SITES } from "./projects";
import { ASK_TERMINAL } from "./ask";

// "project" plots are the PROJECT LANDMARKS (projects.ts). They live in this
// list purely so they inherit the two things every building here gets for free:
// a levelled terrain pad and a hole in the forest scatter. Settlement.tsx does
// NOT render them — Landmarks.tsx does.
export type PlotKind = "cabin" | "shop" | "petrol" | "suburb" | "library" | "project";

export type Plot = {
  x: number;
  z: number;
  /** Unit vector from the plot toward the trail (a building's front faces this). */
  faceX: number;
  faceZ: number;
  yaw: number; // atan2(faceX, faceZ) — ready to drop on a group's rotation.y
  kind: PlotKind;
  variant: number; // stable per-plot seed for picking pieces / dressing
  clearR: number; // radius of forest to clear around this plot
  scale: number; // world scale for the building
  /** Terrain levels a pad under this plot (rural plots on rolling ground). */
  flat?: boolean;
};

// Hand-authored plots: { z aimed for, lateral offset (+ = left of travel,
// − = right), kind }. THE OLD TOWN anchors the north of the road network —
// the main street is the town circle's diameter and the buildings ring it:
// the west row fronts the village side road, the east cabins front the
// waterfront arc from outside. (The journey now SPAWNS at the Town Square —
// the five-way Crossroads — since the square moved there; the old plaza here
// belongs to the town library, its forecourt fountain and the tic-tac-toe
// kiosk.) NOTE the centerline starts at z=8, so plot z's must stay ≤ 8
// (targets beyond the street's head all clamp to it).
type Spec = { z: number; lat: number; kind: PlotKind; scale?: number };
const SPEC: Spec[] = [
  // --- main street, west side (the side-road runs this frontage). NOTE: the
  // trail's first bend apex (z≈-22) compresses equal-z spacing — the row skips
  // that pocket and resumes past the corner at z≈-33 (the south exit). ---------
  { z: 7, lat: -11, kind: "petrol", scale: 1 }, // fuel stop at the town entrance
  { z: -1, lat: -10, kind: "shop", scale: 3.3 }, // trading post on the square
  { z: -8, lat: -11, kind: "cabin", scale: 3.4 },
  { z: -16, lat: -10.5, kind: "cabin", scale: 3.1 },
  { z: -33, lat: -10.5, kind: "cabin", scale: 3.2 }, // town's south exit
  // --- east row: pushed OUT beyond the waterfront arc (the town circle's east
  // road, graph.ts thesis~waterfront) so they front onto it from outside,
  // facing west back toward the arc and the street. Audited spots ≈ (25,3) and
  // (30,-10) — clear of the arc lane, the pond rim and the bridge road. -------
  { z: -6.5, lat: 17, kind: "cabin", scale: 3.0 },
  { z: -15, lat: 15.5, kind: "cabin", scale: 3.2 },
  // --- suburban houses, set back on the rising ground -------------------------
  { z: 5, lat: -27, kind: "suburb", scale: 4.4 },
  { z: -11, lat: -30, kind: "suburb", scale: 4.2 },
  { z: -23, lat: -26, kind: "suburb", scale: 4.0 },
  { z: 6, lat: 22, kind: "suburb", scale: 4.6 }, // NE knoll, above the pond walk
  { z: -44, lat: -22, kind: "suburb", scale: 4.2 }, // past the bend, south of town
];

const CLEAR_R: Record<PlotKind, number> = {
  cabin: 6.0,
  shop: 7.0,
  petrol: 8.5,
  suburb: 7.0,
  library: 8.5, // covers the hall + portico + steps (half-diagonal ≈ 7.6)
  project: 9.0, // nominal — each landmark carries its own audited clearR
};

// --- countryside homesteads along EVERY road of the network -------------------
// One or two houses per country road, so no lane walks through empty ground:
// the NW road, the south road, both Crossroads spokes, the east road past the
// bridge, and the whole outer ring. Positions are MEASURED with besideEdge()
// (8.5–10 m off their road's own frame — bend-proof) and audited for clearance
// against every lane, the pond, the bridge, all stops/junctions, the dioramas,
// kiosks, the curling sheet, both fountains and every game item (obstacles,
// gems, snowmen ≥ 7 m; scratchpad dress_audit.ts — re-run if the roads move).
// fx/fz is the unit vector from the house toward its road (the frontage).
type RuralSpec = { x: number; z: number; fx: number; fz: number; kind: PlotKind; scale: number };
const RURAL: RuralSpec[] = [
  { x: -41.85, z: -14.55, fx: 0.91, fz: -0.42, kind: "suburb", scale: 4.2 }, // NW road, north side
  { x: -48.32, z: -28.5, fx: 0.84, fz: -0.55, kind: "cabin", scale: 3.2 }, // NW road, nearer Skills
  { x: 14.04, z: -54.84, fx: -0.92, fz: 0.39, kind: "cabin", scale: 3.1 }, // south road (the truck's route)
  { x: 63.94, z: -25.68, fx: -0.39, fz: -0.92, kind: "cabin", scale: 3.3 }, // east road, past the bridge
  { x: 23.3, z: -59.96, fx: 0.24, fz: -0.97, kind: "cabin", scale: 3.2 }, // Crossroads→Experience, north side
  { x: 57.81, z: -46.57, fx: 0.41, fz: -0.91, kind: "suburb", scale: 4.3 }, // Crossroads→Experience, east end
  { x: -21.27, z: -59.61, fx: -0.21, fz: -0.98, kind: "cabin", scale: 3.0 }, // Crossroads→Skills
  { x: -13.21, z: -99.32, fx: -0.82, fz: 0.57, kind: "cabin", scale: 3.2 }, // Crossroads→Ask
  { x: 9.12, z: -98.9, fx: -0.99, fz: -0.15, kind: "suburb", scale: 4.1 }, // Crossroads→Summit
  { x: -61.75, z: -90.93, fx: 0.89, fz: 0.46, kind: "cabin", scale: 3.1 }, // outer ring, Skills→Ask
  { x: -13.34, z: -126.94, fx: -0.49, fz: -0.87, kind: "cabin", scale: 3.2 }, // outer ring, Ask→Summit
  { x: 64.78, z: -75.11, fx: 0.87, fz: -0.49, kind: "suburb", scale: 4.4 }, // outer ring, Experience side
  { x: 52.19, z: -121.84, fx: -0.72, fz: 0.69, kind: "cabin", scale: 3.3 }, // outer ring, above the Summit
];

// --- fountains ----------------------------------------------------------------
// SWAPPED when the town square moved to the Crossroads (square_audit.ts): the
// GRAND fountain is now the centrepiece of the five-way TOWN SQUARE — parked
// in the junction's south-east wedge, ringed by the social boards, right where
// the journey spawns — and the small one holds the old plaza as the town
// library's forecourt piece. Audited: grand 8.2 m clear of the nearest lane;
// the small one sits 4.4 m off the street's DEAD-END head (not a through
// lane) — ice apron 2.26 + a 2.1 m walking gap, the exact spot the grand one
// stood (and was verified walkable) before the swap.
export const FOUNTAINS: { x: number; z: number; grand: boolean }[] = [
  { x: 0, z: 12.4, grand: false },
  { x: 6.98, z: -79.96, grand: true },
];

// Reserved low-profile positions around the GRAND fountain. These began as the
// social-board arc; TownSquare.tsx now reuses three for glowing career
// milestones. The audited spacing remains valuable: every point is ≥ 6.6 m
// clear of a lane and ≥ 2.8 m from the square lamp pair. StreetLamps.tsx keeps
// road posts off the full set.
export const SOCIAL_BOARDS: { x: number; z: number }[] = [
  { x: 5.57, z: -84.03 },
  { x: 8.86, z: -83.83 },
  { x: 11.04, z: -81.37 },
  { x: 10.85, z: -78.08 },
];

// THE TOWN LIBRARY — the civic hall that took the old square when the town
// square moved south: centred behind the forecourt fountain, front steps
// facing the street's head. Footprint (world metres): hall 8.8 × 5.6 plus a
// columned portico (+1.4) and steps (+2.0) — square_audit.ts cleared every
// corner against the NW road, the street, the kiosk, the arch, the benches
// and the old plaza lamp pair. StreetLamps.tsx keeps road posts out of this
// rectangle; Settlement.tsx builds it procedurally at scale 1.
export const LIBRARY = { x: 0, z: 22.1, hw: 4.4, front: 6.2, rear: 2.8 };

/** Open paved/level spots (fountain plazas): terrain levels a pad and the
 *  tree-scatter keeps out, exactly like a building plot's clearing. */
export const FLAT_SPOTS: { x: number; z: number; r: number }[] = FOUNTAINS.map((f) => ({
  x: f.x,
  z: f.z,
  r: f.grand ? 5.5 : 4.5,
}));

// TEMP debug: shift the hamlet toward the trailhead so it lands in the opening
// camera for a headless assembly screenshot. MUST be 0 in the shipped scene.
// (Exported so the side-road's trail fork-points shift with the plots.)
export const DEBUG_Z_SHIFT = 0;

function buildPlots(): Plot[] {
  const line = centerlineXZ(1); // dense, ordered [x,z] from start → summit
  const out: Plot[] = [];

  SPEC.forEach((spec, i) => {
    const targetZ = spec.z + DEBUG_Z_SHIFT;
    // Nearest centerline sample to the target z.
    let bi = 0;
    let bd = Infinity;
    for (let k = 0; k < line.length; k++) {
      const d = Math.abs(line[k][1] - targetZ);
      if (d < bd) {
        bd = d;
        bi = k;
      }
    }
    const [px, pz] = line[bi];
    // Tangent from neighbours, then the "left" perpendicular in the XZ plane.
    const a = line[Math.max(0, bi - 2)];
    const b = line[Math.min(line.length - 1, bi + 2)];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const perpX = -tz; // "left" across the path
    const perpZ = tx;

    const x = px + perpX * spec.lat;
    const z = pz + perpZ * spec.lat;
    // Face back toward the trail (opposite the lateral offset).
    const sign = spec.lat >= 0 ? 1 : -1;
    const faceX = -perpX * sign;
    const faceZ = -perpZ * sign;

    out.push({
      x,
      z,
      faceX,
      faceZ,
      yaw: Math.atan2(faceX, faceZ),
      kind: spec.kind,
      variant: i,
      clearR: CLEAR_R[spec.kind],
      scale: spec.scale ?? 3.2,
    });
  });

  // Countryside homesteads appended AFTER the town rows, so the parked-fleet
  // plot indices in Vehicles.tsx (0–11, town) never shift.
  RURAL.forEach((r, i) => {
    out.push({
      x: r.x,
      z: r.z,
      faceX: r.fx,
      faceZ: r.fz,
      yaw: Math.atan2(r.fx, r.fz),
      kind: r.kind,
      variant: SPEC.length + i,
      clearR: CLEAR_R[r.kind],
      scale: r.scale,
      flat: true,
    });
  });

  // The town library, last of the buildings Settlement.tsx renders (town 0–11
  // and rural 12–24 indices stay stable — Vehicles.tsx keys its parked fleet
  // off them). Faces due south over its forecourt fountain toward the Old Town.
  out.push({
    x: LIBRARY.x,
    z: LIBRARY.z,
    faceX: 0,
    faceZ: -1,
    yaw: Math.PI,
    kind: "library",
    variant: SPEC.length + RURAL.length,
    clearR: CLEAR_R.library,
    scale: 1, // Settlement.tsx builds it in world metres
    flat: true,
  });

  // THE PROJECT LANDMARKS — appended after everything else so no existing index
  // shifts. They're here for the level pad and the forest clearing only; the
  // structures themselves are built by Landmarks.tsx, which is why
  // Settlement.tsx skips kind "project".
  BUILT_SITES.forEach((p, i) => {
    out.push({
      x: p.x,
      z: p.z,
      faceX: p.fx,
      faceZ: p.fz,
      yaw: p.yaw,
      kind: "project",
      variant: SPEC.length + RURAL.length + 1 + i,
      clearR: p.clearR, // the audited footprint, not the nominal CLEAR_R
      scale: 1, // built in world metres
      flat: true,
    });
  });

  // The ASK TERMINAL beside the Ask stop — same deal: a level pad and a hole in
  // the trees, with AskTerminal.tsx building the structure. Appended last, after
  // the landmarks, so every index above stays where it was.
  out.push({
    x: ASK_TERMINAL.x,
    z: ASK_TERMINAL.z,
    faceX: ASK_TERMINAL.fx,
    faceZ: ASK_TERMINAL.fz,
    yaw: ASK_TERMINAL.yaw,
    kind: "project",
    variant: SPEC.length + RURAL.length + 1 + BUILT_SITES.length,
    clearR: ASK_TERMINAL.clearR,
    scale: 1,
    flat: true,
  });

  return out;
}

/** Every building plot in the settlement (stable across loads). */
export const SETTLEMENT_PLOTS: Plot[] = buildPlots();

/** True when (x, z) falls inside any plot's or fountain plaza's clear radius
 *  (for tree exclusion) — the rural homesteads and both fountains included. */
export function insideSettlement(x: number, z: number, margin = 0): boolean {
  for (const p of SETTLEMENT_PLOTS) {
    if (Math.hypot(x - p.x, z - p.z) < p.clearR + margin) return true;
  }
  for (const s of FLAT_SPOTS) {
    if (Math.hypot(x - s.x, z - s.z) < s.r + margin) return true;
  }
  return false;
}
