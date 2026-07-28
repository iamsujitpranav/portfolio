// The journey's PATH GRAPH — nodes (town / résumé stop / junction / social) linked
// by curved edges. This generalizes the single linear walk curve: instead of one
// `progress ∈ [0,1]` scalar the avatar carries a ROUTE (a shortest path over the
// graph), so the world can branch, rejoin, and loop through a walkable town while
// staying on-rails (click a destination → auto-walk the chosen route).
//
// Kept THREE-free (like `trail.ts` / `game.ts`) so the terrain sampler, the prop
// scatter (Node/build side), the router, and the R3F components can all share it
// without pulling three into the math. The 3D curves per edge are built from this
// in `curve.ts`; here everything is XZ + arc-length.
//
// THE MAP — a ROAD NETWORK, not a line. The circular town is the hub and every
// résumé stop hangs off it at a short hop, with crossroads so any stop is
// reachable without walking a long spine end-to-end:
//
//        Skills ←——— NW road ———— TOWN CIRCLE ——— waterfront arc ——╮
//          │  ╲                (street = diameter,                 │
//          │   ╲                side road = west arc)         Waterfront
//          │    ╲                    │                       ═ POND BRIDGE ═══ Experience
//          │     ╲               Town Gate ──────────────────╯      │    │
//          │      ╲                  │ south road                   │    │
//       (outer     ╲————————— CROSSROADS (5-way) ———————————————————╯    │
//        ring)      ╲        ╱       │        ╲                        (outer
//          │         ╲      ╱        │         ╲                        ring)
//         Ask ————————╲————╯      Summit ←——————╲———————————————————————╯
//          ╰————— outer ring ———————↑
//
// • TOWN CIRCLE: main street (start → The Arc → Town Gate) is the diameter;
//   the village side road closes the west arc; a waterfront arc rounds the
//   east cabins down to the pond and closes the east side at the bridge apron.
// • THE POND BRIDGE: the road to Experience crosses the pond on a timber
//   bridge (curling sheet on the ice just south of the deck).
// • CROSSROADS — the TOWN SQUARE: a 5-way junction south of the old town and
//   the journey's spawn — Experience east, Skills west, Ask southwest, the
//   Summit south, the Town Gate north; grand fountain + social boards in the
//   south-east wedge.
// • OUTER RING: Experience–Summit–Ask–Skills link directly, so stop-to-stop
//   never has to pass back through town.
// Every résumé stop is itself a junction (degree ≥ 3). Routing is Dijkstra —
// click any stop/junction and the avatar takes the shortest road there.
//
// The STREET is still cut from the original trail centerline (so the town's
// shape, plots and side road stay put); everything south of the Town Gate is
// authored fresh — the old 260 m linear trail south of town is retired.

import { centerlineXZ } from "./trail";
import { SIDE_ROAD_XZ } from "./sideroad";
import { BRIDGE } from "./config";
import { height } from "./terrain";

export type NodeKind = "town" | "stop" | "junction" | "social";

export type GraphNode = {
  id: string;
  x: number;
  z: number;
  kind: NodeKind;
  sectionId?: string; // résumé section to open on arrival (stop nodes)
  label?: string; // short nav / sign label
  href?: string; // social nodes: external link opened on arrival
};

export type GraphEdge = {
  id: string;
  a: string; // node id (undirected — traversable either way)
  b: string;
  via: [number, number][]; // interior XZ points shaping the edge between a and b
};

/** One leg of a route: which edge, and which way along it (a→b when forward). */
export type RouteStep = { edgeId: string; forward: boolean };

// --- author the spine from the original trail centerline ---------------------
// Dense XZ of the current trail, start (index 0) → summit (last). The spine edges
// are contiguous slices of this, so their union reproduces the original path.
const LINE = centerlineXZ(1);

/** LINE index whose z is nearest `zTarget` — the SAME rule sideroad.ts uses for
 * its fork points (trailNearZ), so the village loop's mouths land EXACTLY on
 * their spine nodes. (The trail's z decreases monotonically, so it's unique.) */
function indexNearZ(zTarget: number): number {
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < LINE.length; i++) {
    const d = Math.abs(LINE[i][1] - zTarget);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return bi;
}

// The STREET cuts — the only nodes still cut from the original centerline (the
// main street through town is its first 45 m). The Arc keeps the town centre
// (~z+1, mid-square); the Town Gate is the street's south mouth (z≈-30), where
// the side road rejoins and the roads south + east fan out.
type SpineCut = {
  id: string;
  idx: number; // LINE index of the cut
  kind: NodeKind;
  sectionId?: string;
  label: string;
};
const STREET_CUTS: SpineCut[] = [
  // "start" is the OLD TOWN's plaza — the street's head, now fronted by the
  // town library (the town square itself moved to the Crossroads).
  { id: "start", idx: 0, kind: "stop", sectionId: "start", label: "Old Town" },
  { id: "thesis", idx: indexNearZ(1), kind: "stop", sectionId: "thesis", label: "The Arc" },
  { id: "villagegate", idx: indexNearZ(-30), kind: "junction", label: "Town Gate" },
];

// The rest of the map is authored free of the old line: the résumé stops fan
// out AROUND the town (east / west / southwest / south), plus the two country
// junctions. All coordinates are the numerically audited ones (design_map.ts —
// plots, pond, lanes, junction angles all cleared).
const VILLAGE_MID = 120; // SIDE_ROAD_XZ index of the shop frontage (of 0..240)
const FREE_NODES: GraphNode[] = [
  {
    id: "village",
    x: SIDE_ROAD_XZ[VILLAGE_MID][0],
    z: SIDE_ROAD_XZ[VILLAGE_MID][1],
    kind: "junction",
    label: "Village Lane",
  },
  // The bridge's west abutment — where the waterfront arc, the gate link and
  // the deck itself meet. Tied to the BRIDGE spec so the road and the timber
  // structure can never drift apart.
  { id: "waterfront", x: BRIDGE.ax, z: BRIDGE.az, kind: "junction", label: "Pond Bridge" },
  // The five-way is the TOWN SQUARE now — the square moved here from the old
  // town, bringing the grand fountain and the social boards with it.
  { id: "cross", x: -2, z: -72, kind: "junction", label: "Town Square" },
  { id: "experience", x: 85, z: -44, kind: "stop", sectionId: "experience", label: "Experience" },
  { id: "skills", x: -62, z: -54, kind: "stop", sectionId: "skills", label: "Skills" },
  { id: "ask", x: -36, z: -116, kind: "stop", sectionId: "ask", label: "Ask my résumé" },
  { id: "contact", x: 10, z: -138, kind: "stop", sectionId: "contact", label: "Summit" },
];

export const NODES: GraphNode[] = [
  ...STREET_CUTS.map((s): GraphNode => {
    const [x, z] = LINE[s.idx];
    return { id: s.id, x, z, kind: s.kind, sectionId: s.sectionId, label: s.label };
  }),
  ...FREE_NODES,
];

// Densify a sparse hand-authored control polyline with the same uniform
// Catmull-Rom the trail uses, so a branch edge's carve/clearing (which walk the
// polyline) match the smooth curve the ribbon and avatar ride.
function densify(control: [number, number][], step = 1.0): [number, number][] {
  const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
    );
  };
  let rough = 0;
  for (let i = 1; i < control.length; i++)
    rough += Math.hypot(control[i][0] - control[i - 1][0], control[i][1] - control[i - 1][1]);
  const n = control.length - 1;
  const samples = Math.max(8, Math.ceil(rough / step));
  const out: [number, number][] = [];
  for (let k = 1; k < samples; k++) {
    const s = (k / samples) * n;
    const i = Math.min(Math.floor(s), n - 1);
    const t = s - i;
    const p0 = control[Math.max(0, i - 1)];
    const p1 = control[i];
    const p2 = control[i + 1];
    const p3 = control[Math.min(n, i + 2)];
    out.push([
      catmull(p0[0], p1[0], p2[0], p3[0], t),
      catmull(p0[1], p1[1], p2[1], p3[1], t),
    ]);
  }
  return out; // interior points only — endpoints come from the edge's nodes
}

const nodeXZ = (id: string): [number, number] => {
  const n = NODES.find((nn) => nn.id === id)!;
  return [n.x, n.z];
};

// The main street: contiguous slices of the original dense centerline. FIRST in
// EDGES so spawnAt("start") keeps its classic frame (street, tAB 0).
const STREET_EDGES: GraphEdge[] = (() => {
  const out: GraphEdge[] = [];
  for (let i = 0; i < STREET_CUTS.length - 1; i++) {
    const via: [number, number][] = [];
    for (let k = STREET_CUTS[i].idx + 1; k < STREET_CUTS[i + 1].idx; k++) via.push(LINE[k]);
    out.push({
      id: `${STREET_CUTS[i].id}~${STREET_CUTS[i + 1].id}`,
      a: STREET_CUTS[i].id,
      b: STREET_CUTS[i + 1].id,
      via,
    });
  }
  return out;
})();

// Interior samples of the side road between two of its dense indices (~1 m step
// — the road polyline is ~19 cm/sample). Endpoints come from the edge's nodes.
function roadSlice(from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = from + 5; i <= to - 5; i += 5) out.push([SIDE_ROAD_XZ[i][0], SIDE_ROAD_XZ[i][1]]);
  return out;
}

// The deck's interior control points: two on-chord points keep the Catmull-Rom
// dead straight over the water so the road rides the timber bridge exactly.
const DECK_VIA: [number, number][] = [
  [(BRIDGE.ax * 2 + BRIDGE.bx) / 3, (BRIDGE.az * 2 + BRIDGE.bz) / 3],
  [(BRIDGE.ax + BRIDGE.bx * 2) / 3, (BRIDGE.az + BRIDGE.bz * 2) / 3],
];

// The road network (see the header map). Every via list is the audited one.
const NETWORK_EDGES: GraphEdge[] = [
  // TOWN CIRCLE, west arc — the village lane: the delivery van's frontage road
  // (petrol → shop → cabins), walkable. Its geometry IS the road's own
  // polyline; TrailPath skips the ribbon here (VILLAGE_EDGE_IDS) because
  // SideRoad.tsx already draws that roadbed.
  { id: "start~village", a: "start", b: "village", via: roadSlice(0, VILLAGE_MID) },
  {
    id: "village~villagegate",
    a: "village",
    b: "villagegate",
    via: roadSlice(VILLAGE_MID, SIDE_ROAD_XZ.length - 1),
  },
  // TOWN CIRCLE, east arc — the waterfront lane: The Arc → around the east
  // cabins → down the pond's north-west rim to the bridge abutment.
  {
    id: "thesis~waterfront",
    a: "thesis",
    b: "waterfront",
    via: densify([nodeXZ("thesis"), [13, 3], [20, -2], [24, -9], [23.5, -17], nodeXZ("waterfront")]),
  },
  // TOWN CIRCLE, south-east closure — Town Gate ↔ bridge abutment.
  {
    id: "villagegate~waterfront",
    a: "villagegate",
    b: "waterfront",
    via: densify([nodeXZ("villagegate"), [14.2, -27.6], nodeXZ("waterfront")]),
  },
  // THE POND BRIDGE + the east country road to Experience.
  {
    id: "waterfront~experience",
    a: "waterfront",
    b: "experience",
    via: densify([
      nodeXZ("waterfront"),
      ...DECK_VIA,
      [BRIDGE.bx, BRIDGE.bz],
      [45, -27.5],
      [57, -32],
      [71, -38],
      nodeXZ("experience"),
    ]),
  },
  // South road out of town, to the country crossroads.
  {
    id: "villagegate~cross",
    a: "villagegate",
    b: "cross",
    via: densify([nodeXZ("villagegate"), [8, -45], [3, -58], nodeXZ("cross")]),
  },
  // North-west road: town square → Skills, skirting north of the petrol stop
  // and the west suburbs.
  {
    id: "start~skills",
    a: "start",
    b: "skills",
    via: densify([nodeXZ("start"), [-10, 7], [-22, 1], [-30, -12], [-38, -28], [-48, -42], nodeXZ("skills")]),
  },
  // Crossroads spokes.
  {
    id: "cross~experience",
    a: "cross",
    b: "experience",
    via: densify([nodeXZ("cross"), [14, -71], [35, -66], [60, -56], nodeXZ("experience")]),
  },
  {
    id: "cross~skills",
    a: "cross",
    b: "skills",
    via: densify([nodeXZ("cross"), [-25, -68], [-45, -62], nodeXZ("skills")]),
  },
  {
    id: "cross~ask",
    a: "cross",
    b: "ask",
    via: densify([nodeXZ("cross"), [-16, -88], [-26, -102], nodeXZ("ask")]),
  },
  {
    id: "cross~contact",
    a: "cross",
    b: "contact",
    via: densify([nodeXZ("cross"), [0, -95], [4, -118], nodeXZ("contact")]),
  },
  // OUTER RING — stop-to-stop without passing back through town.
  {
    id: "experience~contact",
    a: "experience",
    b: "contact",
    via: densify([nodeXZ("experience"), [75, -75], [55, -105], [32, -128], nodeXZ("contact")]),
  },
  {
    id: "skills~ask",
    a: "skills",
    b: "ask",
    via: densify([nodeXZ("skills"), [-58, -78], [-48, -98], nodeXZ("ask")]),
  },
  {
    id: "ask~contact",
    a: "ask",
    b: "contact",
    via: densify([nodeXZ("ask"), [-22, -132], [-6, -139], nodeXZ("contact")]),
  },
];

export const EDGES: GraphEdge[] = [...STREET_EDGES, ...NETWORK_EDGES];

// --- lookups + per-edge geometry (samples, cumulative arc-length, length) -----
const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));
const EDGE_BY_ID = new Map(EDGES.map((e) => [e.id, e]));

export const nodeById = (id: string): GraphNode | undefined => NODE_BY_ID.get(id);
export const edgeById = (id: string): GraphEdge | undefined => EDGE_BY_ID.get(id);

type EdgeGeo = { samples: [number, number][]; cum: number[]; length: number };

const EDGE_GEO = new Map<string, EdgeGeo>(
  EDGES.map((e) => {
    const A = NODE_BY_ID.get(e.a)!;
    const B = NODE_BY_ID.get(e.b)!;
    const samples: [number, number][] = [[A.x, A.z], ...e.via, [B.x, B.z]];
    const cum = [0];
    for (let i = 1; i < samples.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]));
    }
    return [e.id, { samples, cum, length: cum[cum.length - 1] }];
  }),
);

/** Arc-length (world metres, XZ) of an edge. */
export function edgeLength(id: string): number {
  return EDGE_GEO.get(id)?.length ?? 0;
}

/** Dense XZ samples of an edge (endpoints included) — for ribbon / clearing. */
export function edgeSamplesXZ(id: string): [number, number][] {
  return EDGE_GEO.get(id)?.samples ?? [];
}

/** XZ point at arc-length fraction `t ∈ [0,1]` along edge `id` (a→b). */
export function edgePointXZ(id: string, t: number): [number, number] {
  const g = EDGE_GEO.get(id);
  if (!g) return [0, 0];
  const target = Math.min(Math.max(t, 0), 1) * g.length;
  // Walk the cumulative table to the containing segment, then lerp within it.
  let i = 1;
  while (i < g.cum.length && g.cum[i] < target) i++;
  const j = Math.min(i, g.samples.length - 1);
  const segLen = g.cum[j] - g.cum[j - 1] || 1;
  const f = (target - g.cum[j - 1]) / segLen;
  const a = g.samples[j - 1];
  const b = g.samples[j];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

// --- nearest point on the whole graph ----------------------------------------
/**
 * Nearest point on ANY edge to (x, z): distance, that point, its edge, and the
 * arc-length fraction `t` along the edge — plus the SECOND-nearest from a
 * DIFFERENT edge or a DISTANT stretch of the same edge (d2/nx2/nz2, d2 =
 * Infinity when none competes). Generalizes `nearestTrail` (trail.ts) and,
 * like it, MUST vary CONTINUOUSLY with (x, z): the terrain sampler carves the
 * ground here and the avatar's feet read that height every frame, so a
 * nearest-*sample* answer would staircase. Hence: nearest sample, then project
 * onto the two segments meeting it, per edge.
 * The runner-up lets height() blend the carve target across the MEDIAL AXIS
 * between two converging lanes — the nearest point legitimately flips there,
 * and carving from just one would step the ground. That flip happens at forks
 * (two edges) AND wherever ONE edge doubles back past the same ground (the
 * village lane's out-and-return passes ~6 m apart south-west of the plaza —
 * carving from only the nearest pass stepped the square ~1 m), so each edge
 * also offers its best projection from an arc-DISTANT sample cluster as a
 * runner-up candidate.
 */
export function nearestGraph(x: number, z: number): {
  d: number;
  nx: number;
  nz: number;
  edgeId: string;
  t: number;
  /** Every raw edge SAMPLE within +2 m of the best distance (unordered, ≤ 64
   * — comfortably above the ~35 that qualify where three lanes meet at the
   * spawn node; a lower cap TRUNCATES by edge order and the cut line moving
   * through non-zero-weight samples re-stepped the ground 0.15 m).
   * The terrain carve blends its target over these. Samples — not projected
   * candidate points — because sample positions are FIXED: every distance,
   * weight and membership then varies continuously with (x, z), where any
   * argmin-picked candidate (nearest projection, second-nearest pass, top-K
   * list) someplace flips identity while its blend weight is still large and
   * steps the ground — measured 1.0 m where the street, both arms of the
   * village hairpin and the NW road converge, 0.26 m from a curved lane's own
   * continuation flipping sides of an arc window. A doubled-back lane simply
   * contributes both arms' samples here. */
  near: { d: number; x: number; z: number }[];
} {
  let best = Infinity;
  let bnx = 0;
  let bnz = 0;
  let bEdge = "";
  let bArc = 0;

  // Pass 1 — the exact nearest point (projection around each edge's nearest
  // sample): routing anchors, ribbon frames and gameplay read this.
  for (const [id, g] of EDGE_GEO) {
    const s = g.samples;
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < s.length; i++) {
      const dx = x - s[i][0];
      const dz = z - s[i][1];
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) {
        bd = d2;
        bi = i;
      }
    }
    for (const j of [bi - 1, bi]) {
      if (j < 0 || j + 1 >= s.length) continue;
      const ax = s[j][0];
      const az = s[j][1];
      const ex = s[j + 1][0] - ax;
      const ez = s[j + 1][1] - az;
      const len2 = ex * ex + ez * ez;
      if (len2 <= 1e-12) continue;
      let tt = ((x - ax) * ex + (z - az) * ez) / len2;
      tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      const px = ax + ex * tt;
      const pz = az + ez * tt;
      const dx = x - px;
      const dz = z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) {
        best = d2;
        bnx = px;
        bnz = pz;
        bEdge = id;
        bArc = g.length > 0 ? (g.cum[j] + Math.sqrt(len2) * tt) / g.length : 0;
      }
    }
  }

  const d1 = Math.sqrt(best);

  // Pass 2 — gather every sample inside the blend band around the best.
  const lim = (d1 + 2) * (d1 + 2);
  const near: { d: number; x: number; z: number }[] = [];
  for (const [, g] of EDGE_GEO) {
    const s = g.samples;
    for (let i = 0; i < s.length; i++) {
      const dx = x - s[i][0];
      const dz = z - s[i][1];
      const d2 = dx * dx + dz * dz;
      if (d2 <= lim && near.length < 64) {
        near.push({ d: Math.sqrt(d2), x: s[i][0], z: s[i][1] });
      }
    }
  }

  return { d: d1, nx: bnx, nz: bnz, edgeId: bEdge, t: bArc, near };
}

/** Distance from (x, z) to the nearest edge of the graph (tree clearing etc.). */
export function distanceToGraph(x: number, z: number): number {
  return nearestGraph(x, z).d;
}

/**
 * A spot BESIDE an edge: `off` metres to the given side (+1 = left of a→b
 * travel) of the point at fraction `tAB`, plus the yaw that faces back toward
 * the path. This is how square furniture (social posts, kiosks) is placed —
 * anchoring to the edge's own local frame is bend-proof, where hand-authored
 * {z, lat} guesses kept landing on the wrong side of the first curve.
 */
export function besideEdge(
  edgeId: string,
  tAB: number,
  side: 1 | -1,
  off: number,
): { x: number; z: number; yaw: number } {
  const p = edgePointXZ(edgeId, tAB);
  const ahead = edgePointXZ(edgeId, Math.min(1, tAB + 0.01));
  const behind = edgePointXZ(edgeId, Math.max(0, tAB - 0.01));
  let tx = ahead[0] - behind[0];
  let tz = ahead[1] - behind[1];
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl;
  tz /= tl;
  const px = -tz * side; // left perpendicular of travel, flipped by side
  const pz = tx * side;
  const x = p[0] + px * off;
  const z = p[1] + pz * off;
  return { x, z, yaw: Math.atan2(-px, -pz) };
}

// --- adjacency + shortest-path routing ---------------------------------------
type Adj = { edgeId: string; to: string; forward: boolean; w: number };
const ADJ = new Map<string, Adj[]>();
for (const n of NODES) ADJ.set(n.id, []);
for (const e of EDGES) {
  const w = edgeLength(e.id);
  ADJ.get(e.a)!.push({ edgeId: e.id, to: e.b, forward: true, w });
  ADJ.get(e.b)!.push({ edgeId: e.id, to: e.a, forward: false, w });
}

/** Neighbours of a node: the edges leaving it and where they lead. */
export function neighbors(nodeId: string): Adj[] {
  return ADJ.get(nodeId) ?? [];
}

/**
 * Shortest route from one node to another (Dijkstra by edge arc-length), as an
 * ordered list of directed edge steps. Empty array if already there; null if the
 * target is unreachable / unknown. Small graph (< ~100 nodes) so a plain array
 * priority scan is more than fast enough.
 */
export function routeTo(fromNodeId: string, toNodeId: string): RouteStep[] | null {
  if (!NODE_BY_ID.has(fromNodeId) || !NODE_BY_ID.has(toNodeId)) return null;
  if (fromNodeId === toNodeId) return [];

  const dist = new Map<string, number>();
  const prev = new Map<string, { node: string; step: RouteStep }>();
  const visited = new Set<string>();
  dist.set(fromNodeId, 0);

  while (true) {
    // Pop the unvisited node with the smallest tentative distance.
    let u: string | null = null;
    let ud = Infinity;
    for (const [node, d] of dist) {
      if (!visited.has(node) && d < ud) {
        ud = d;
        u = node;
      }
    }
    if (u === null) break;
    if (u === toNodeId) break;
    visited.add(u);

    for (const a of neighbors(u)) {
      if (visited.has(a.to)) continue;
      const nd = ud + a.w;
      if (nd < (dist.get(a.to) ?? Infinity)) {
        dist.set(a.to, nd);
        prev.set(a.to, { node: u, step: { edgeId: a.edgeId, forward: a.forward } });
      }
    }
  }

  if (!prev.has(toNodeId) && toNodeId !== fromNodeId) return null;
  // Walk the predecessor chain back to the source, reversing into forward order.
  const steps: RouteStep[] = [];
  let cur = toNodeId;
  while (cur !== fromNodeId) {
    const p = prev.get(cur);
    if (!p) return null;
    steps.unshift(p.step);
    cur = p.node;
  }
  return steps;
}

/** Total arc-length (metres) of a route. */
export function routeLength(route: RouteStep[]): number {
  return route.reduce((sum, s) => sum + edgeLength(s.edgeId), 0);
}

/** All edge ids (render / iterate). */
export const EDGE_IDS: string[] = EDGES.map((e) => e.id);

/**
 * The GRAND TOUR — the walk that visits every résumé stop in order (what the
 * "next stop" buttons walk, and the ruler the legacy scalar consumers measure
 * along). It is a CHAIN of edges start → … → summit; `rev` marks the legs the
 * tour walks b→a (the tour turns at Experience and heads back west through the
 * Crossroads). Everything off this chain is a network road: walkable, routed,
 * but off the legacy scalar (spineProgress returns -1 there).
 */
const SPINE_CHAIN: { edgeId: string; rev: boolean }[] = [
  { edgeId: "start~thesis", rev: false },
  { edgeId: "thesis~villagegate", rev: false },
  { edgeId: "villagegate~waterfront", rev: false },
  { edgeId: "waterfront~experience", rev: false },
  { edgeId: "cross~experience", rev: true },
  { edgeId: "cross~skills", rev: false },
  { edgeId: "skills~ask", rev: false },
  { edgeId: "ask~contact", rev: false },
];

/** The grand tour's edge ids — ribbons/map style these as the main route. */
export const SPINE_EDGE_IDS: Set<string> = new Set(SPINE_CHAIN.map((c) => c.edgeId));

/**
 * Dense XZ of the whole grand tour, start → summit (duplicate joint samples
 * dropped, decimated to every `step`-th point). This is what the legacy single
 * walk curve is built from, so every u-keyed placement (lamps, gems, obstacles,
 * snowmen) rides the real roads of the network.
 */
export function spineSamplesXZ(step = 3): [number, number][] {
  const pts: [number, number][] = [];
  for (const leg of SPINE_CHAIN) {
    const g = EDGE_GEO.get(leg.edgeId);
    if (!g) continue;
    const s = leg.rev ? [...g.samples].reverse() : g.samples;
    for (const p of s) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) pts.push(p);
    }
  }
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
  const last = pts[pts.length - 1];
  const outLast = out[out.length - 1];
  if (outLast[0] !== last[0] || outLast[1] !== last[1]) out.push(last);
  return out;
}

/** The village lane's edge ids — walkable graph edges that share their geometry
 * with the rendered side ROAD, so TrailPath must not draw a second ribbon. */
export const VILLAGE_EDGE_IDS: Set<string> = new Set(["start~village", "village~villagegate"]);

// --- spine parameterization (compat with the old single `progress ∈ [0,1]`) ---
// The legacy consumers (games, HUD, the sun) still speak a single scalar along
// the RÉSUMÉ SPINE; the route-driven avatar derives it each frame. 3D arc-length
// (terrain height folded in) keeps the derived fraction aligned with the old
// arc-length-parameterized walk curve. Computed LAZILY on first use: terrain.ts
// imports nearestGraph from here while we import height from it, and deferring
// the height() calls past module init is what makes that cycle safe.
type SpineParam = {
  order: { edgeId: string; rev: boolean }[]; // tour legs, start → summit
  lens: Map<string, number>; // 3D length per tour edge
  cum: number[]; // cumulative length at each leg's start
  total: number;
  nodeIds: string[]; // tour node ids in walk order
  nodeU: number[]; // each tour node's global fraction
};
let SPINE_PARAM: SpineParam | null = null;
function spineParam(): SpineParam {
  if (SPINE_PARAM) return SPINE_PARAM;
  const order = SPINE_CHAIN;
  const lens = new Map<string, number>();
  for (const { edgeId } of order) {
    const s = EDGE_GEO.get(edgeId)!.samples;
    let L = 0;
    for (let i = 1; i < s.length; i++) {
      const y0 = height(s[i - 1][0], s[i - 1][1]);
      const y1 = height(s[i][0], s[i][1]);
      L += Math.hypot(s[i][0] - s[i - 1][0], y1 - y0, s[i][1] - s[i - 1][1]);
    }
    lens.set(edgeId, L);
  }
  const cum = [0];
  for (const { edgeId } of order) cum.push(cum[cum.length - 1] + (lens.get(edgeId) ?? 0));
  const total = cum[cum.length - 1] || 1;
  // Walk-order node ids, honouring each leg's direction (a rev leg is entered
  // at its b node and left at its a node).
  const first = EDGE_BY_ID.get(order[0].edgeId)!;
  const nodeIds = [order[0].rev ? first.b : first.a];
  for (const leg of order) {
    const e = EDGE_BY_ID.get(leg.edgeId)!;
    nodeIds.push(leg.rev ? e.a : e.b);
  }
  const nodeU = nodeIds.map((_, i) => cum[i] / total);
  SPINE_PARAM = { order, lens, cum, total, nodeIds, nodeU };
  return SPINE_PARAM;
}

/**
 * Global tour fraction [0,1] for a point (edge, a→b fraction) — or -1 when the
 * point is on a network road off the grand tour, which has no place on the
 * legacy scalar. Callers keep their last on-tour value while off it. On a leg
 * the tour walks b→a, the a→b fraction is flipped so the scalar still grows
 * monotonically along the walk.
 */
export function spineProgress(edgeId: string, tAB: number): number {
  const sp = spineParam();
  const i = sp.order.findIndex((leg) => leg.edgeId === edgeId);
  if (i < 0) return -1;
  const t = Math.min(Math.max(tAB, 0), 1);
  const frac = sp.order[i].rev ? 1 - t : t;
  return (sp.cum[i] + frac * (sp.lens.get(edgeId) ?? 0)) / sp.total;
}

/** Inverse: a global tour fraction → the point (edge, a→b fraction) on it. */
export function spineUToPoint(u: number): { edgeId: string; tAB: number } {
  const sp = spineParam();
  const target = Math.min(Math.max(u, 0), 1) * sp.total;
  let i = 0;
  while (i < sp.order.length - 1 && sp.cum[i + 1] < target) i++;
  const leg = sp.order[i];
  const len = sp.lens.get(leg.edgeId) ?? 1;
  const frac = Math.min(Math.max((target - sp.cum[i]) / (len || 1), 0), 1);
  return { edgeId: leg.edgeId, tAB: leg.rev ? 1 - frac : frac };
}

// --- spawning + point-to-point routing ---------------------------------------
/** Where a node sits as an (edge, a→b fraction): its first incident edge's end. */
export function spawnAt(nodeId: string): { edgeId: string; tAB: number } {
  const e = EDGES.find((ed) => ed.a === nodeId || ed.b === nodeId);
  if (!e) return { edgeId: EDGES[0].id, tAB: 0 };
  return { edgeId: e.id, tAB: e.a === nodeId ? 0 : 1 };
}

const AT_END = 1e-4;

/** The node the journey spawns at: the TOWN SQUARE — the five-way Crossroads
 * at the centre of the road network (the square moved here from the old
 * town). The avatar materialises at the junction with the grand fountain and
 * its ring of social boards in the south-east wedge and every road of the map
 * fanning out around it. */
export const START_NODE = "cross";

/**
 * The mutable route-cursor fields shared by the nav singleton (Avatar.tsx adds
 * its own derived/status fields on top). Kept here so the assign/reset helpers
 * below — used by the DOM overlay AND validated headlessly — stay THREE-free.
 */
export type NavCursor = {
  route: RouteStep[];
  step: number;
  edgeId: string;
  tAB: number;
  destTab: number;
  destNodeId: string | null;
};

/**
 * Point a cursor down a freshly computed route. If the route starts on a
 * different edge (the avatar was resting exactly on a node), snap the cursor to
 * that edge's matching end — same world position, new edge frame.
 */
export function assignRoute(
  nav: NavCursor,
  r: { steps: RouteStep[]; destTab: number },
  destNodeId: string | null,
) {
  if (r.steps.length > 0 && r.steps[0].edgeId !== nav.edgeId) {
    nav.edgeId = r.steps[0].edgeId;
    nav.tAB = r.steps[0].forward ? 0 : 1;
  }
  nav.route = r.steps;
  nav.step = 0;
  nav.destTab = r.destTab;
  nav.destNodeId = destNodeId;
}

/** Park a cursor at a node with no route (spawn / journey restart). */
export function resetCursor(nav: NavCursor, nodeId: string = START_NODE) {
  const s = spawnAt(nodeId);
  nav.route = [];
  nav.step = 0;
  nav.edgeId = s.edgeId;
  nav.tAB = s.tAB;
  nav.destTab = s.tAB;
  nav.destNodeId = null;
}

/**
 * Route from the avatar's current point — (fromEdge, fromT), a→b fraction — to
 * an arbitrary point (toEdge, toT): a kiosk, the pond hack, any mid-edge spot.
 * Same edge → one partial leg; otherwise leave the current edge at whichever end
 * minimises the TOTAL cost (exit remainder + node hops + entry distance into the
 * target edge), comparing both entry ends of the target edge. Comparing both
 * ends also means the winner never doubles back over the target edge itself.
 */
export function routeToPoint(
  fromEdge: string,
  fromT: number,
  toEdge: string,
  toT: number,
): { steps: RouteStep[]; destTab: number } | null {
  const r = bestRouteToPoint(fromEdge, fromT, toEdge, toT);
  return r ? { steps: r.steps, destTab: r.destTab } : null;
}

/** Walking metres from a point on the graph to another point — Infinity when
 *  unreachable/unknown. The honest distance for the Games HUD (a straight
 *  |Δu|-style guess is wrong the moment routes branch). */
export function routeDistance(
  fromEdge: string,
  fromT: number,
  toEdge: string,
  toT: number,
): number {
  const r = bestRouteToPoint(fromEdge, fromT, toEdge, toT);
  return r ? r.cost : Infinity;
}

function bestRouteToPoint(
  fromEdge: string,
  fromT: number,
  toEdge: string,
  toT: number,
): { steps: RouteStep[]; destTab: number; cost: number } | null {
  const fe = EDGE_BY_ID.get(fromEdge);
  const te = EDGE_BY_ID.get(toEdge);
  if (!fe || !te) return null;

  // Same edge: walk straight to the target fraction, no node hops.
  if (fromEdge === toEdge) {
    if (Math.abs(toT - fromT) < AT_END) return { steps: [], destTab: fromT, cost: 0 };
    return {
      steps: [{ edgeId: fromEdge, forward: toT >= fromT }],
      destTab: toT,
      cost: Math.abs(toT - fromT) * edgeLength(fromEdge),
    };
  }

  const feLen = edgeLength(fromEdge);
  const teLen = edgeLength(toEdge);
  let best: { cost: number; steps: RouteStep[] } | null = null;

  for (const exitNode of [fe.a, fe.b]) {
    const exitForward = exitNode === fe.b;
    const exitDist = (exitForward ? 1 - fromT : fromT) * feLen;
    for (const entryNode of [te.a, te.b]) {
      const entryForward = entryNode === te.a; // entered at a → walk a→b
      const entryDist = (entryForward ? toT : 1 - toT) * teLen;
      const mid = routeTo(exitNode, entryNode);
      if (mid === null) continue;
      const cost = exitDist + routeLength(mid) + entryDist;
      if (best && cost >= best.cost) continue;
      const steps: RouteStep[] = [];
      if (exitDist > AT_END) steps.push({ edgeId: fromEdge, forward: exitForward });
      steps.push(...mid);
      steps.push({ edgeId: toEdge, forward: entryForward });
      best = { cost, steps };
    }
  }

  if (!best) return null;
  return { steps: best.steps, destTab: toT, cost: best.cost };
}

/**
 * Route the avatar from its CURRENT point on the graph — (fromEdge, fromT) as an
 * a→b fraction — to a résumé/town NODE. Returns the ordered directed steps plus
 * the `destTab` the final edge stops at (the node's end), or null if unreachable.
 * The avatar leaves its current edge at whichever end gives the shortest TOTAL
 * path (folding in the partial distance already covered on the current edge), then
 * node-hops via Dijkstra. Correct whether it starts idle at a node or mid-edge, and
 * for graphs with cycles it naturally avoids doubling back over the current edge.
 *
 * (Stopping at an arbitrary MID-edge point — a kiosk — needs an edge-split and
 * lands in Phase 5; Phase 2's Games "Go" rounds to the nearest node.)
 */
export function routeToNode(
  fromEdge: string,
  fromT: number,
  nodeId: string,
): { steps: RouteStep[]; destTab: number } | null {
  const fe = EDGE_BY_ID.get(fromEdge);
  if (!fe || !NODE_BY_ID.has(nodeId)) return null;

  // Already resting at the target node.
  if ((fromT <= AT_END && fe.a === nodeId) || (fromT >= 1 - AT_END && fe.b === nodeId))
    return { steps: [], destTab: fromT };

  const feLen = edgeLength(fromEdge);
  let best: { cost: number; steps: RouteStep[] } | null = null;

  for (const exitNode of [fe.a, fe.b]) {
    const exitForward = exitNode === fe.b; // leaving toward b = a→b
    const exitDist = (exitForward ? 1 - fromT : fromT) * feLen;
    const mid = routeTo(exitNode, nodeId);
    if (mid === null) continue;
    const cost = exitDist + routeLength(mid);
    if (best && cost >= best.cost) continue;
    const steps: RouteStep[] = [];
    if (exitDist > AT_END) steps.push({ edgeId: fromEdge, forward: exitForward });
    steps.push(...mid);
    best = { cost, steps };
  }

  if (!best) return null;
  const last = best.steps[best.steps.length - 1];
  const destTab = last ? (last.forward ? 1 : 0) : fromT;
  return { steps: best.steps, destTab };
}

/** Nearest spine node id to a global fraction u ∈ [0,1]. */
export function nearestNodeToU(u: number): string {
  const sp = spineParam();
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < sp.nodeU.length; i++) {
    const d = Math.abs(sp.nodeU[i] - u);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return sp.nodeIds[bi];
}
