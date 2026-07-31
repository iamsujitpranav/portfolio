import { describe, it, expect, beforeEach } from "vitest";
import {
  warp,
  beginWarp,
  endWarp,
  roadAhead,
  WARP_FACE,
  WARP_TURN,
  WARP_TOTAL,
  WARP_LOOK_MIN,
} from "./warp";
import { placeCursor, spawnAt, nodeById, EDGES, edgePointXZ, type NavCursor } from "./graph";
import { STOPS } from "./sections";
import { PROJECT_SITES } from "./projects";
import { ATTRACTIONS } from "./attractions";

const cursor = (): NavCursor => ({
  route: [{ edgeId: EDGES[0].id, forward: true }],
  step: 3,
  edgeId: EDGES[0].id,
  tAB: 0.2,
  destTab: 0.9,
  destNodeId: "contact",
});

describe("warp state", () => {
  beforeEach(() => endWarp());

  it("arms the shot and points it at the thing that was clicked", () => {
    const before = warp.seq;
    beginWarp(12, -34);
    expect(warp.active).toBe(true);
    expect(warp.t).toBe(0);
    expect(warp.lookX).toBe(12);
    expect(warp.lookZ).toBe(-34);
    // The Avatar and the camera both key their snap off this, so it has to move
    // on every arrival — including two warps to the very same spot.
    expect(warp.seq).toBe(before + 1);
    beginWarp(12, -34);
    expect(warp.seq).toBe(before + 2);
  });

  it("still aims the avatar when the shot is suppressed (reduced motion)", () => {
    beginWarp(5, 6, false);
    expect(warp.active).toBe(false);
    expect(warp.lookX).toBe(5);
    expect(warp.lookZ).toBe(6);
  });

  it("carries the authored Architect pose only for that arrival", () => {
    beginWarp(5, 6, true, "architect");
    expect(warp.pose).toBe("architect");
    beginWarp(7, 8);
    expect(warp.pose).toBe("trail");
  });

  it("restarts the clock, so a second warp mid-shot re-opens face-on", () => {
    beginWarp(0, 0);
    warp.t = WARP_TOTAL - 0.1;
    beginWarp(1, 1);
    expect(warp.t).toBe(0);
  });

  it("hands the camera back on endWarp", () => {
    beginWarp(0, 0);
    endWarp();
    expect(warp.active).toBe(false);
  });

  it("holds the face before it turns, and turns slowly", () => {
    expect(WARP_FACE).toBeGreaterThan(0.8); // long enough to register a person
    expect(WARP_TURN).toBeGreaterThan(WARP_FACE); // the turn is the slow part
    expect(WARP_TOTAL).toBe(WARP_FACE + WARP_TURN);
  });
});

describe("placeCursor", () => {
  it("parks the cursor at an arbitrary point with no route left", () => {
    const nav = cursor();
    const target = EDGES[EDGES.length - 1].id;
    expect(placeCursor(nav, target, 0.42)).toBe(true);
    expect(nav.edgeId).toBe(target);
    expect(nav.tAB).toBeCloseTo(0.42);
    expect(nav.destTab).toBeCloseTo(0.42);
    // No leftover route: a teleport must not resume walking the old one.
    expect(nav.route).toEqual([]);
    expect(nav.step).toBe(0);
    expect(nav.destNodeId).toBeNull();
  });

  it("clamps off-edge fractions instead of walking off the end", () => {
    const nav = cursor();
    placeCursor(nav, EDGES[0].id, 1.8);
    expect(nav.tAB).toBe(1);
    placeCursor(nav, EDGES[0].id, -0.5);
    expect(nav.tAB).toBe(0);
  });

  it("leaves the avatar where it stands for an unknown edge", () => {
    const nav = cursor();
    expect(placeCursor(nav, "no~such~edge", 0.5)).toBe(false);
    expect(nav.edgeId).toBe(EDGES[0].id);
    expect(nav.tAB).toBe(0.2);
    expect(nav.route).toHaveLength(1);
  });

  it("lands somewhere the world actually is", () => {
    const nav = cursor();
    placeCursor(nav, EDGES[2].id, 0.5);
    const [x, z] = edgePointXZ(nav.edgeId, nav.tAB);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(z)).toBe(true);
  });
});

// The arrival shot is a HALF-TURN from face-on to over-the-shoulder around the
// axis avatar→look. Land with the look point on top of the avatar and that axis
// is undefined: the swing has nowhere to go and the shot ends on the back of a
// head. So every destination the map can send you to has to resolve to a point
// that's actually somewhere else.
describe("every map destination has something to turn toward", () => {
  const from = (edgeId: string, tAB: number, look: { x: number; z: number }) => {
    const [ax, az] = edgePointXZ(edgeId, tAB);
    return Math.hypot(look.x - ax, look.z - az);
  };

  // Every stop and junction id the Trail menu, the in-world signposts and the
  // map can hand to warpTo. All three now teleport, so a stop that resolved to
  // a zero-length look vector would break the arrival shot on three surfaces at
  // once, not one.
  it("aims a stop or a junction down its own road", () => {
    const nodes = [...STOPS.map((s) => s.id), "village", "villagegate", "waterfront", "cross"];
    for (const id of nodes) {
      const s = spawnAt(id);
      expect(from(s.edgeId, s.tAB, roadAhead(s.edgeId, s.tAB))).toBeGreaterThan(WARP_LOOK_MIN);
    }
  });

  it("has a node behind every id those three surfaces can send", () => {
    // warpTo bails on an unknown node, which would look like a dead click.
    // Signposts: the six stops plus the three junctions with boards.
    for (const id of [...STOPS.map((s) => s.id), "village", "villagegate", "cross"]) {
      expect(nodeById(id), id).toBeTruthy();
    }
  });

  // The Games list hands `attraction.at` — the board, the sheet of ice — as the
  // look point. It's only worth carrying if it's far enough off the anchor to
  // change the shot; below WARP_LOOK_MIN the overlay discards it and faces down
  // the road instead, and the field would be silently doing nothing.
  it("aims a game at the game, not at the road beside it", () => {
    const placed = ATTRACTIONS.filter((a) => a.at);
    expect(placed.length).toBeGreaterThan(0);
    for (const a of placed) {
      expect(from(a.anchor!.edgeId, a.anchor!.tAB, a.at!), a.id).toBeGreaterThan(WARP_LOOK_MIN);
    }
  });

  // Everything with an `at` must also have somewhere to stand: the Games list
  // reads `anchor` for the landing spot and `at` only for the aim.
  it("gives every aimed attraction an anchor to land on", () => {
    for (const a of ATTRACTIONS) if (a.at) expect(a.anchor, a.id).toBeTruthy();
  });

  it("aims a landmark at the building, not at the road it stands beside", () => {
    // Below WARP_LOOK_MIN the overlay discards the marker and falls back to the
    // road — which for a landmark would mean walking past the thing you clicked.
    for (const p of PROJECT_SITES) {
      expect(from(p.anchor.edgeId, p.anchor.tAB, p)).toBeGreaterThan(WARP_LOOK_MIN);
    }
  });

  it("still has a direction for the attractions that sit on the path itself", () => {
    // The listed attractions without an anchor are categories, not places
    // (every obstacle / snowman / gem has its own point) — nothing to warp to.
    const placed = ATTRACTIONS.filter((a) => a.anchor);
    expect(placed.length).toBeGreaterThan(0);
    for (const a of placed) {
      const { edgeId, tAB } = a.anchor!;
      expect(from(edgeId, tAB, roadAhead(edgeId, tAB))).toBeGreaterThan(WARP_LOOK_MIN);
    }
  });
});
