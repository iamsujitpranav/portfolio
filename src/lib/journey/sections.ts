// The stops along the journey. Stop ids double as PATH-GRAPH node ids (routing
// is by node); `u` is each stop's fraction along the GRAND TOUR (the legacy
// scalar some placements still ride). The measured fractions below come from
// the graph itself (scratchpad len.ts) — re-measure if the road network moves.

export type JourneyStop = {
  id: string;
  label: string; // short nav label — the PLACE in the world
  sub: string; // what you'll actually find there (résumé content, in plain words)
  marker: string; // sign text planted at the waypoint
  zone: "meadow" | "forest" | "mountain";
  u: number; // position along the grand tour [0, 1]
};

// Every stop is a place in the world AND a section of the résumé. The place
// names alone ("Old Town", "The Arc") told a first-time visitor nothing, so each
// carries a `sub` that says what's there — shown under the label in the Trail
// menu, on the in-world signpost, and in the map tooltip.
export const STOPS: JourneyStop[] = [
  // The trailhead panel lives in the OLD TOWN — the street's head, fronted by
  // the town library (the town square itself now sits at the Crossroads).
  {
    id: "start",
    label: "Old Town",
    sub: "Who I am — start here",
    marker: "Old Town",
    zone: "meadow",
    u: 0.0,
  },
  // The Arc stands at the CENTRE of the town square — the journey begins by
  // walking under it. Keep in sync with the `thesis` cut in graph.ts.
  {
    id: "thesis",
    label: "The Arc",
    sub: "My career in one paragraph",
    marker: "The Arc",
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
