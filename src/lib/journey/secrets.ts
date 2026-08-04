// The hidden "secrets" strung along the trail — one résumé fact each, collected
// by walking through the gem that hovers over the path.
//
// The data lives here rather than in Collectibles.tsx because the PASSPORT has
// to know how many there are (and what they're called) without importing a THREE
// component, and the map already reads the same list to draw them.

export type Secret = {
  /**
   * Stable id, written into the passport. NEVER renumber or reuse one: a saved
   * passport that says "found `stack`" must still mean the same gem after the
   * list is reordered.
   */
  id: string;
  u: number;
  side: 1 | -1;
  fact: string;
};

// u 0.205 (not 0.14): the tour's 0.13–0.18 stretch is the pond bridge DECK —
// a gem there would hover over open water beside the rails (audited).
export const SECRETS: Secret[] = [
  { id: "years", u: 0.205, side: 1, fact: "✦ 12 years shipping production systems" },
  { id: "monolith", u: 0.3, side: -1, fact: "✦ Modernized large-scale Rails monoliths — 2× release velocity" },
  { id: "agentic", u: 0.44, side: 1, fact: "✦ Builds agentic dev workflows on Claude + MCP" },
  { id: "recsys", u: 0.58, side: -1, fact: "✦ Took recommendation engines from prototype to prod" },
  { id: "stack", u: 0.74, side: 1, fact: "✦ Ruby on Rails · Python · FastAPI" },
  { id: "open", u: 0.94, side: -1, fact: "✦ Open to Staff / Eng-Lead AI roles" },
];

export const SECRET_OFFSET = 1.6;
