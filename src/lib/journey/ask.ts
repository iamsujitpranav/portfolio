// THE IN-WORLD ASSISTANT — the résumé chat, and the thing that makes it more
// than a chat box: TOPIC ROUTING.
//
// The Ask stop used to say "open the assistant" and bounce you out of the 3D
// world into the classic site, which is the worst possible moment to lose
// someone. Now the assistant lives at a terminal in the world, and when it
// answers a question about a piece of the work it WALKS YOU TO THAT PIECE — the
// Foundry for the migration, the Watchtower for the search work, the Summit for
// "is he available?". An assistant that physically moves through the world it's
// describing is the part people remember.
//
// The routing is deliberately CLIENT-SIDE and keyword-driven rather than asking
// the model for a destination. Three reasons: the backend contract stays
// untouched, it costs no tokens and no latency, and — most importantly — it
// cannot fail open. A model asked for a landmark id will occasionally invent
// one; a keyword table either matches something real or matches nothing, and
// matching nothing simply means the avatar stays put. The blast radius of a bad
// match is a short walk.
//
// THREE-free, like every lib/journey module.

import { PROJECT_SITES } from "./projects";

export type Anchor = { edgeId: string; tAB: number };

// --- the terminal itself ------------------------------------------------------
// Audited placement (scratchpad/tour_audit.ts): 7.0 m off the Crossroads→Ask
// lane and 10.0 m from the Ask node, so it is the thing you are standing beside
// when the walk delivers you — with 2.5 m of clearance past everything else and
// near-flat ground under it (slope 0.04). Clear of the stop's own signpost,
// which stands at the node + (-2.6, -2.5).
export const ASK_TERMINAL = {
  x: -26.12,
  z: -114.21,
  fx: -0.814, // unit vector toward the road — the terminal's front
  fz: 0.581,
  clearR: 4.5,
  yaw: Math.atan2(-0.814, 0.581),
  anchor: { edgeId: "cross~ask", tAB: 0.8707 } as Anchor,
};

// --- where an answer points ---------------------------------------------------
export type AskDest = {
  id: string;
  /** Where the avatar is being sent, in words. */
  label: string;
  /** A résumé stop node to route to… */
  stopId?: string;
  /** …or a project landmark's anchor point on the road. */
  anchor?: Anchor;
};

type Topic = AskDest & {
  /**
   * Lowercase needles matched as plain substrings — which is on purpose at the
   * END of a word ("consolidat" catches consolidate/consolidated/consolidation
   * without dragging in a stemmer) and a TRAP at the start of one. A bare "rag"
   * matches *ave**rag**e* and *sto**rag**e*; a bare "search" matches
   * *re**search***. So any key whose start needs to be a word boundary is
   * written with a LEADING SPACE, which `norm` below makes reliable by
   * flattening punctuation and runs of whitespace to single spaces.
   */
  keys: string[];
  /** Per-key score. Company names are the strongest signal there is. */
  weight: number;
};

/**
 * Fold text into the shape the keys are matched against: lowercase, one space
 * between everything, wrapped in spaces so a leading-space key can match the
 * first word. Punctuation becomes whitespace so "(search)" and "search," both
 * match " search" — apostrophes and hyphens survive, because "who's" and
 * "multi-tenant" are keys.
 */
const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[,;:!?()"[\]{}*_<>|\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

// Company names come out of content/resume.json via projects.ts, so a rename
// there keeps matching. Short and generic words are dropped — "bias" (from
// Collective Bias) would otherwise fire on any answer discussing model bias.
const STOPWORDS = new Set([
  "solutions", "solution", "india", "intelligence", "analysis", "collective",
  "technologies", "private", "limited", "construction",
  // Ordinary English that happens to be in a company name — "he claims to…"
  // must not be read as the Denken claims platform.
  "claims",
]);
const companyKeys = (c: string) =>
  c
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5 && !STOPWORDS.has(w));

// What each landmark is *about*, in the words a visitor would actually use.
const SITE_KEYS: Record<string, string[]> = {
  "reading-room": [
    " rag", "retrieval", "vector", "pgvector", "embedding", "semantic",
    "résumé pars", "resume pars", " nlp", "claude", "anthropic", " llm",
    "agentic", " mcp", "candidate",
  ],
  foundry: [
    "monolith", "microservice", "modernis", "moderniz", "decompos",
    "docker", "kubernetes", "devops", "github actions", "e-commerce",
    "ecommerce", "release velocity",
  ],
  mill: [
    "tensorflow", "predictive", "forecast", "machine learning", "deep learning",
    "influencer", "campaign", " roi", "budget", "optimis", "optimiz",
  ],
  watchtower: ["elasticsearch", "elastic search", "kibana", "indexing", " search"],
  depot: [
    "ci/cd", "cicd", "continuous integration", "continuous deployment",
    "jenkins", "pipeline", "zero-downtime", "zero downtime", "cloudwatch",
    "claims platform",
  ],
  signal: [
    "observability", "grafana", "new relic", "incident", "monitoring",
    "alerting", "instrument",
  ],
  exchange: [
    "multi-tenant", "multitenant", "multi tenant", "tenant", "rails engines",
    "consolidat", "maintenance cost",
  ],
};

// The résumé stops — broader nets, scored lower, so a landmark always wins a
// tie. These are what catch the questions that aren't about one project:
// "what's his stack?", "is he available?", "who is he?".
const STOP_TOPICS: Topic[] = [
  {
    id: "skills",
    label: "Skills",
    stopId: "skills",
    weight: 1.5,
    keys: [
      "skill", "stack", "language", "framework", "technolog", " aws", "azure",
      "postgres", "redis", " react", "typescript", "javascript", " rails",
      " ruby", "python", "fastapi", " sql", "terraform", "proficient",
    ],
  },
  {
    id: "experience",
    label: "Experience",
    stopId: "experience",
    weight: 1.5,
    keys: [
      "experience", "worked", "career", " role", "position", " job", "employer",
      " team", " led ", "leadership", "mentor", "manage", "years",
    ],
  },
  {
    id: "contact",
    label: "the Summit",
    stopId: "contact",
    weight: 1.5,
    keys: [
      "contact", "email", "reach him", "get in touch", "hire", "hiring",
      "available", "availability", "remote", "relocat", "notice period",
      "opportunit", "open to",
    ],
  },
  {
    id: "start",
    label: "the Root",
    stopId: "start",
    weight: 1.5,
    keys: ["who is", "who's", "about him", "introduce", "summary", "background"],
  },
  {
    id: "thesis",
    label: "the Arc",
    stopId: "thesis",
    weight: 1.5,
    // Not "the arc" — it is a prefix of "the architecture", which is a phrase
    // this résumé's answers use constantly.
    keys: ["trajectory", "career arc", "big picture", "overall", "philosoph", "what drives"],
  },
];

const TOPICS: Topic[] = [
  ...PROJECT_SITES.map((s) => ({
    id: s.id,
    label: s.title,
    anchor: s.anchor,
    weight: 2,
    keys: [...(SITE_KEYS[s.id] ?? []), ...companyKeys(s.company), s.title.toLowerCase()],
  })),
  ...STOP_TOPICS,
];

// A company name in the question is nearly proof; a topic word in a long answer
// is a hint. Below this, nobody moves — staying put is the safe default.
const MIN_SCORE = 3;
const IN_QUESTION = 2; // multiplier

/**
 * Where an exchange points, or null if nothing does. Presence-scored, not
 * frequency-scored: one word repeated eight times shouldn't outweigh three
 * different signals.
 */
export function destinationFor(question: string, answer: string): AskDest | null {
  const q = norm(question);
  const a = norm(answer);
  let best: { t: Topic; score: number } | null = null;

  for (const t of TOPICS) {
    let score = 0;
    for (const k of t.keys) {
      const inQ = q.includes(k);
      const inA = a.includes(k);
      if (!inQ && !inA) continue;
      score += t.weight * (inQ ? IN_QUESTION : 1);
    }
    if (score >= MIN_SCORE && (!best || score > best.score)) best = { t, score };
  }

  if (!best) return null;
  const { id, label, stopId, anchor } = best.t;
  return { id, label, stopId, anchor };
}
