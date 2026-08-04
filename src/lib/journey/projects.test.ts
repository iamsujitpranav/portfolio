import { describe, it, expect } from "vitest";
import { PROJECT_SITES } from "./projects";
import { distanceToGraph } from "./graph";

// Front-most solid geometry of each structure, in local +Z metres, read off
// Landmarks.tsx by hand (nested groups included — the Foundry's workshops sit
// in a group at +5.6 with a 3.6-deep pad, so its true front is 7.4).
const FRONT: Record<string, number> = {
  foundry: 7.4,
  mill: 4.5,
  watchtower: 2.2,
  depot: 5.25,
  signal: 5.25,
  exchange: 2.4,
};

describe("plaque placement", () => {
  it("plants every board outside its structure and off the road", () => {
    for (const s of PROJECT_SITES) {
      if (!s.structure) continue;
      const z = s.plaqueZ ?? s.clearR * 0.62;
      const front = FRONT[s.structure];
      const roadGap = distanceToGraph(s.x + s.fx * z, s.z + s.fz * z);
      process.stdout.write(
        `${s.id.padEnd(11)} plaqueZ=${z.toFixed(2).padStart(5)}  ` +
          `front=${front.toFixed(2).padStart(5)}  ` +
          `clear-of-wall=${(z - front).toFixed(2).padStart(6)}  ` +
          `→road=${roadGap.toFixed(2).padStart(6)}\n`,
      );
      expect(z, `${s.id}: board is inside the structure`).toBeGreaterThan(front);
      expect(roadGap, `${s.id}: board is in the roadway`).toBeGreaterThan(2);
    }
  });
});
