// A directory of everything there is to play on the trail.
//
// Every game was already in the world, but nothing told you so: the kiosks are
// boards you walk past in a second, and the curling house is 14 m off the trail.
// This list is what the HUD reads to show them, walk you to them, and tell you
// what to actually do when you arrive.
//
// THREE-free on purpose. Each fixed attraction is ANCHORED to a point on the
// path graph ({edgeId, tAB}), so the HUD's distance is the honest WALKING
// distance over the graph (routeDistance) — a straight |Δu| guess stopped being
// true the moment the map branched — and "Go" routes to that exact point.

import type { ModalGame } from "./game";
import { CURL_SHEET } from "./config";
import {
  besideEdge,
  nearestGraph,
  routeDistance,
  spineUToPoint,
} from "./graph";

export type Anchor = { edgeId: string; tAB: number };

export type Attraction = {
  id: string;
  label: string;
  /** What the visitor actually does — shown when they're standing at it. */
  how: string;
  /**
   * The path point you have to be standing at. `null` for the activities that
   * are spread along the whole route rather than parked in one spot.
   */
  anchor: Anchor | null;
  /** Kiosks open a DOM modal once you're close enough to reach the board. */
  modal?: ModalGame;
};

// --- kiosk board placements (world furniture, shared with GameKiosk.tsx) ------
// Tic-tac-toe stands on the OLD TOWN's plaza — the open ground at the street's
// head, now the town library's forecourt — nudged clear of the north-west road
// to Skills (audited: 3.8 m from that lane). Stack match sits out on the
// Town Square→Skills leg — "somewhere in between", a reason to pause mid-leg.
const MATCH_AT = spineUToPoint(0.58);
export const KIOSK_PLACES: Record<ModalGame, { x: number; z: number; yaw: number }> = {
  tictactoe: { x: -7.5, z: 11, yaw: Math.atan2(0 - -7.5, 8 - 11) },
  match: besideEdge(MATCH_AT.edgeId, MATCH_AT.tAB, 1, 3.6),
};

// The anchor for a kiosk is the nearest PATH point to its board — where "Go"
// should actually deliver you.
function anchorNear(x: number, z: number): Anchor {
  const g = nearestGraph(x, z);
  return { edgeId: g.edgeId, tAB: g.t };
}

export const ATTRACTIONS: Attraction[] = [
  {
    id: "curling",
    label: "Curling on the pond",
    // The sheet lives on the pond's south lobe, beside the bridge — "Go"
    // delivers you to the nearest road point to the hack (the west abutment).
    how: "Drag to look at the pond, then click the ice — three stones to an end, closest to the button scores.",
    anchor: anchorNear(CURL_SHEET.hackX, CURL_SHEET.hackZ),
  },
  {
    id: "tictactoe",
    label: "Tic-tac-toe kiosk",
    how: "Beat the board — win and the avatar breaks into a dance.",
    anchor: anchorNear(KIOSK_PLACES.tictactoe.x, KIOSK_PLACES.tictactoe.z),
    modal: "tictactoe",
  },
  {
    id: "match",
    label: "Stack match kiosk",
    how: "Six pairs face down. Clear it in twelve turns for the big routine.",
    anchor: anchorNear(KIOSK_PLACES.match.x, KIOSK_PLACES.match.z),
    modal: "match",
  },
  {
    id: "obstacles",
    label: "Obstacle run",
    how: "Run into a log or a rock — the avatar kicks it clear or vaults it. Space hops on demand.",
    anchor: null,
  },
  {
    id: "snowmen",
    label: "Snowball targets",
    how: "Five snowmen along the route. Click one to pelt it.",
    anchor: null,
  },
  {
    id: "secrets",
    label: "Hidden secrets",
    how: "Six ✦ gems just off the path. Run through one to collect it.",
    anchor: null,
  },
];

/** Close enough to reach the board / the ice (metres). */
export const AT_RANGE_M = 12;

/** Walking metres from a graph position to an attraction (Infinity if roaming). */
export function metresTo(a: Attraction, edgeId: string, tAB: number): number {
  if (!a.anchor) return Infinity;
  return routeDistance(edgeId, tAB, a.anchor.edgeId, a.anchor.tAB);
}
