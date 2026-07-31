// The stops along the journey. Stop ids double as PATH-GRAPH node ids (routing
// is by node); `u` is each stop's fraction along the GRAND TOUR (the legacy
// scalar some placements still ride). The measured fractions below come from
// the graph itself (scratchpad len.ts) — re-measure if the road network moves.

// World-space offsets from each stop node to its physical signboard. Shared by
// TrailPath (placement) and the teleport camera (framing), so every map arrival
// looks from the road toward the same board the visitor sees. Ask deliberately
// has no offset: its terminal screen is the destination instead.
export const STOP_SIGN_OFFSETS: Record<string, [number, number]> = {
  // The Root lives at the existing Town Square introduction, not at the old
  // northern trailhead. Keep the internal `start` id for compatibility while
  // resolving its world position to the Crossroads.
  // Centre the Root board on the opening camera → grand-fountain sightline.
  start: [6.2, -5.4],
  thesis: [-2.8, 0],
  experience: [2.4, 0],
  skills: [-2.6, 0],
  contact: [0, -2.6],
};

export const JUNCTION_SIGN_OFFSETS: Record<string, [number, number]> = {
  village: [-3.4, -0.4],
  villagegate: [2.3, -2.3],
  cross: [-1.9, -5.7],
};

// Off-road opening pose directly in front of the Architect board.
export const PLAZA_AVATAR_POSITION = { x: 4.25, z: -75.85 } as const;

export type JourneyStop = {
  id: string;
  label: string; // short nav label — the PLACE in the world
  sub: string; // what you'll actually find there (résumé content, in plain words)
  marker: string; // sign text planted at the waypoint
  zone: "meadow" | "forest" | "mountain";
  u: number; // position along the grand tour [0, 1]
};

// Every stop is a place in the world AND a section of the résumé. The place
// names alone ("The Root", "The Arc") told a first-time visitor nothing, so each
// carries a `sub` that says what's there — shown under the label in the Trail
// menu, on the in-world signpost, and in the map tooltip.
export const STOPS: JourneyStop[] = [
  // The Root is the existing spawn/introduction at the Town Square. Its
  // internal id remains `start` because older route and content data use it.
  {
    id: "start",
    label: "The Root",
    sub: "Introduction — start here",
    marker: "The Root",
    zone: "meadow",
    u: 0.0,
  },
  // The Arc stands at the CENTRE of the town square — the journey begins by
  // walking under it. Keep in sync with the `thesis` cut in graph.ts.
  {
    id: "thesis",
    label: "Career Snapshot",
    sub: "My career in one paragraph",
    marker: "Career Snapshot",
    zone: "meadow",
    u: 0.022,
  },
  // East, over the Pond Bridge.
  {
    id: "experience",
    label: "Experience",
    sub: "Where I've worked, and on what",
    marker: "Experience",
    zone: "forest",
    u: 0.3095,
  },
  // West, at the end of the town's north-west road.
  {
    id: "skills",
    label: "Skills",
    sub: "The stack I build with",
    marker: "Skills",
    zone: "forest",
    u: 0.6936,
  },
  // South-west of the Crossroads.
  {
    id: "ask",
    label: "Ask my résumé",
    sub: "Put questions to an AI that knows it",
    marker: "Ask Me",
    zone: "mountain",
    u: 0.8622,
  },
  // The summit knoll, due south of the Crossroads.
  {
    id: "contact",
    label: "Contact",
    sub: "Hire me, or just say hello",
    marker: "Summit",
    zone: "mountain",
    u: 1.0,
  },
];

export const stopById = (id: string) => STOPS.find((s) => s.id === id);

/** World node for a resume stop. The first resume section is presented at the
 * existing Town Square spawn, while `start` remains the stable content id. */
export function stopNodeId(id: string): string {
  return id === "start" ? "cross" : id;
}
