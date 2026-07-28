import { describe, expect, it } from "vitest";
import { clamp, fbm, lerp, ridged, simplex2, smoothstep } from "./noise";

// The terrain, trail and snow all derive from this module, so its contract —
// deterministic, bounded, continuous — is what keeps the world stable between
// renders and reloads.

describe("simplex2", () => {
  it("is deterministic for the same coordinates", () => {
    expect(simplex2(1.5, -2.25)).toBe(simplex2(1.5, -2.25));
  });

  it("stays inside roughly [-1, 1] across a wide sample", () => {
    for (let i = 0; i < 400; i++) {
      const v = simplex2(i * 0.37, i * -0.61);
      expect(v).toBeGreaterThanOrEqual(-1.001);
      expect(v).toBeLessThanOrEqual(1.001);
    }
  });

  it("varies with position (it isn't a constant field)", () => {
    const samples = new Set(Array.from({ length: 50 }, (_, i) => simplex2(i * 0.9, i * 1.3)));
    expect(samples.size).toBeGreaterThan(20);
  });

  it("is continuous — a tiny step never jumps far", () => {
    for (let i = 0; i < 100; i++) {
      const a = simplex2(i * 0.1, 3.2);
      const b = simplex2(i * 0.1 + 0.001, 3.2);
      expect(Math.abs(a - b)).toBeLessThan(0.05);
    }
  });
});

describe("fbm", () => {
  it("stays inside roughly [-1, 1]", () => {
    for (let i = 0; i < 200; i++) {
      const v = fbm(i * 0.21, i * 0.13);
      expect(v).toBeGreaterThanOrEqual(-1.001);
      expect(v).toBeLessThanOrEqual(1.001);
    }
  });

  it("is deterministic", () => {
    expect(fbm(2.5, 4.5)).toBe(fbm(2.5, 4.5));
  });

  it("adds detail with more octaves", () => {
    expect(fbm(1.7, 2.3, 1)).not.toBe(fbm(1.7, 2.3, 5));
  });
});

describe("ridged", () => {
  it("stays inside [0, 1] — crests are never negative", () => {
    for (let i = 0; i < 200; i++) {
      const v = ridged(i * 0.17, i * 0.29);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1.001);
    }
  });
});

describe("helpers", () => {
  it("clamps below, above and inside the range", () => {
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });

  it("lerps the endpoints and the midpoint", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it("smoothsteps flat outside the edges and 0.5 in the middle", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });

  it("smoothstep is monotonic between the edges", () => {
    let prev = -Infinity;
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const v = smoothstep(0, 1, x);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("smoothstep has zero slope at both edges (that's the point of it)", () => {
    const eps = 1e-4;
    expect(smoothstep(0, 1, eps)).toBeLessThan(eps);
    expect(1 - smoothstep(0, 1, 1 - eps)).toBeLessThan(eps);
  });
});
