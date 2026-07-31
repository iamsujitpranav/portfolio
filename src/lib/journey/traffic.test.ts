import { afterEach, describe, expect, it } from "vitest";
import { setBlocker, dropBlocker, sidestepFor, MAX_SIDESTEP } from "./traffic";

// The avatar rides its route's centreline exactly, so the ONLY thing keeping it
// out of the delivery van is this solver. Its failure modes are both bad and
// both quiet: too little offset and the body clips through the bodywork (the
// bug this was written for), too much and the avatar wanders off the ribbon into
// the snow. And it has to be steady — a solver that flip-flops sides makes the
// avatar shimmy down the road.

// Heading due north (+Z). The right-hand perpendicular is then world +X, which
// is the frame every expectation below is written in.
const N = { hx: 0, hz: 1 };
const solve = (x: number, z: number, committed = 0) =>
  sidestepFor(x, z, N.hx, N.hz, committed);

afterEach(() => {
  ["v", "w"].forEach(dropBlocker);
});

describe("sidestepFor", () => {
  it("stays on the centreline when the road is empty", () => {
    expect(solve(0, 0)).toEqual({ offset: 0, side: 0 });
  });

  it("steps AWAY from a vehicle in the lane, not into it", () => {
    setBlocker("v", 0.6, 5, 1.05); // slightly to the right, 5 m ahead
    const r = solve(0, 0);
    expect(r.offset).toBeLessThan(0); // …so we pass on its left
    setBlocker("v", -0.6, 5, 1.05);
    expect(solve(0, 0).offset).toBeGreaterThan(0);
  });

  it("clears the bodywork with air to spare", () => {
    // Dead ahead on the centreline: the offset has to exceed the vehicle's
    // half-width plus a shoulder, or the pass is a graze.
    setBlocker("v", 0, 5, 1.05);
    const gap = Math.abs(solve(0, 0).offset);
    expect(gap).toBeGreaterThan(1.05 + 0.42);
    expect(gap).toBeLessThanOrEqual(MAX_SIDESTEP);
  });

  it("never wanders further off the road than the ribbon is wide", () => {
    // A comically wide blocker must be capped, not obeyed — walking into the
    // deep snow to avoid something is worse than brushing past it.
    setBlocker("v", 0, 4, 6);
    expect(Math.abs(solve(0, 0).offset)).toBeLessThanOrEqual(MAX_SIDESTEP);
  });

  it("ignores anything already clear of the lane", () => {
    // This is what makes the parked fleet free: most of it sits far enough off
    // its lane that a walker on the centreline never has to move at all.
    setBlocker("v", 3.6, 5, 1.05); // the SUV's real offset from its lane
    expect(solve(0, 0)).toEqual({ offset: 0, side: 0 });
  });

  it("ignores what is behind, but not what it is still alongside", () => {
    setBlocker("v", 0, -8, 1.05); // well past
    expect(solve(0, 0).offset).toBe(0);
    setBlocker("v", 0, -1.5, 1.05); // still level with the flank
    expect(solve(0, 0).offset).not.toBe(0);
  });

  it("holds the side it committed to instead of shimmying", () => {
    // Passing a vehicle sweeps its relative bearing across the centreline. If
    // the solver re-chose freely every frame it would swap sides mid-pass and
    // walk through the thing it was avoiding.
    setBlocker("v", 0.2, 4, 1.05);
    const first = solve(0, 0); // picks a side
    expect(first.side).not.toBe(0);
    setBlocker("v", -0.2, 2, 1.05); // bearing has crossed over
    const second = solve(0, 0, first.side);
    expect(second.side).toBe(first.side);
    expect(Math.sign(second.offset)).toBe(Math.sign(first.offset));
  });

  it("releases the commitment once nothing is engaged", () => {
    setBlocker("v", 0, 4, 1.05);
    const engaged = solve(0, 0);
    expect(engaged.side).not.toBe(0);
    dropBlocker("v");
    expect(solve(0, 0, engaged.side)).toEqual({ offset: 0, side: 0 });
  });

  it("obeys the most demanding blocker when two are in play", () => {
    setBlocker("v", 1.2, 6, 1.05); // barely in the way
    setBlocker("w", 0, 4, 1.05); // dead centre — this one decides it
    const r = solve(0, 0);
    expect(Math.abs(r.offset)).toBeGreaterThan(1.05 + 0.42);
  });

  it("forgets a vehicle that has been dropped", () => {
    setBlocker("v", 0, 4, 1.05);
    expect(solve(0, 0).offset).not.toBe(0);
    dropBlocker("v");
    expect(solve(0, 0).offset).toBe(0);
  });
});
