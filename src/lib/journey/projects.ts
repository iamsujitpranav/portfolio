// THE PROJECT LANDMARKS — the work itself, built into the world.
//
// The trail used to be scenery with the résumé bolted on: cabins and pines you
// walked past, and every actual fact about Sujit living in a 2D panel that slid
// in from the right. Delete the panels and the world said nothing. These sites
// fix that — each is a structure whose SHAPE is a real project, standing beside
// the road that leads to the résumé stop its story belongs to. Walk up, read the
// plaque, and the world is doing the talking.
//
// THREE-free and deliberately free of a `graph` import: positions are audited
// LITERALS (scratchpad/landmark_audit.ts places each one with besideEdge() in
// its road's own frame, then measures clearance against every lane, plot, the
// pond, the bridge, the fountains, the boards, the kiosks and every game item).
// That's the same way the RURAL homesteads were authored, and it's what keeps
// graph → terrain → settlement → projects from closing into an import cycle.
//
// PERIOD / ROLE / STACK are NOT duplicated here — the panel looks them up in
// content/resume.json by `company`, so the résumé stays the single source of
// truth and these cards can never drift out of date.

/** Which structure Landmarks.tsx builds. `null` = the card hangs on a building
 *  that already exists in the world (the town library). */
export type ProjectStructure =
  | "foundry"
  | "mill"
  | "watchtower"
  | "depot"
  | "signal"
  | "exchange"
  | null;

export type ProjectSite = {
  id: string;
  /** The landmark's name in the world — what's carved on the plaque. */
  title: string;
  /** The real project behind the metaphor. */
  project: string;
  /** Exact `company` string in content/resume.json → period, role and stack. */
  company: string;
  /** What the work actually was, in plain words. */
  blurb: string;
  /** Why the building looks the way it does — the metaphor, said out loud. */
  reads: string;
  /** The number worth remembering, when there is one. */
  metric?: { value: string; label: string };
  structure: ProjectStructure;
  x: number;
  z: number;
  /** Unit vector from the site toward its road — the building's front. */
  fx: number;
  fz: number;
  clearR: number;
  /**
   * How far in front of the site origin the plaque post is planted, in metres
   * along the front vector. Defaults to a fraction of clearR, which assumes the
   * structure's own geometry stays well inside its clearing — NOT true when a
   * landmark pushes buildings forward (the Foundry's workshops sit at +5.6),
   * which plants the board inside a wall. Set it explicitly in that case:
   * clear of the front-most solid, still short of the road.
   */
  plaqueZ?: number;
  /** Where "walk me there" delivers you (nearest path point). */
  anchor: { edgeId: string; tAB: number };
};

// Ordered as a visitor meets them heading out of town — which is also roughly
// newest-first, so the further you walk, the further back the career goes.
const SITES: Omit<ProjectSite, "yaw">[] = [
  {
    id: "reading-room",
    title: "The Reading Room",
    project: "AI résumé parsing & candidate intelligence",
    company: "Arccaa Analysis & IT Solutions",
    blurb:
      "A platform that reads résumés the way a recruiter would: NLP skill extraction, semantic matching and ranking over a vector index, with LLM workflows and agentic dev pipelines behind it.",
    reads:
      "It's the town library — a building whose whole job is taking documents in, indexing them, and answering questions about them.",
    metric: { value: "RAG", label: "over pgvector + Claude" },
    // No structure of its own: the library was already standing here, and it is
    // the metaphor. The plaque sits beside its steps, clear of the forecourt
    // fountain (5.97 m from the water, 9.40 m off the nearest lane).
    structure: null,
    x: 4.6,
    z: 16.2,
    fx: -0.6,
    fz: -0.8,
    clearR: 0, // shares the library plot's clearing — adds no plot of its own
    anchor: { edgeId: "start~thesis", tAB: 0.0 },
  },
  {
    id: "foundry",
    title: "The Foundry",
    project: "Large-scale monolith modernization",
    company: "Emami Frankross",
    blurb:
      "Led the backend modernization of a large-scale e-commerce monolith carrying thousands of daily transactions — rebuilt from the inside without stopping the business — and built the DevOps stack (AWS, Docker, GitHub Actions) that let it ship continuously.",
    reads:
      "One huge hall under scaffolding — being rebuilt from the inside rather than knocked down — with newer workshops standing alongside it, each lit, joined by the pipes that carry traffic between them.",
    metric: { value: "2×", label: "release velocity" },
    structure: "foundry",
    x: 48.05,
    z: -14.72,
    fx: -0.387,
    fz: -0.922,
    clearR: 11,
    // The three workshops stand at +5.6 with a 3.6-deep pad, so the front-most
    // solid is z=7.4 — past the clearR*0.62 (6.82) default, which planted the
    // board inside the middle workshop. 9.0 clears the pad by 1.6 m and still
    // leaves 4.0 m to the road (site→road is 13.0).
    plaqueZ: 9.0,
    anchor: { edgeId: "waterfront~experience", tAB: 0.3491 },
  },
  {
    id: "signal",
    title: "The Signal Station",
    project: "Observability & incident response",
    company: "Emami Frankross",
    blurb:
      "Instrumented the platform end to end with Grafana and New Relic so failures announced themselves instead of being discovered by customers.",
    reads:
      "A mast on the high ground south of the square, dashboards glowing on its face, sweeping the valley for trouble.",
    metric: { value: "40%↓", label: "incident response time" },
    structure: "signal",
    x: 17.38,
    z: -117.88,
    fx: -0.965,
    fz: -0.261,
    clearR: 8,
    // Was a hard-coded exception in Landmarks.tsx; same value, kept with the
    // rest of the site's numbers.
    plaqueZ: 6.2,
    anchor: { edgeId: "cross~contact", tAB: 0.7396 },
  },
  {
    id: "mill",
    title: "The Forecast Mill",
    project: "Predictive analytics & budget optimisation",
    company: "Inmar Intelligence - Collective Bias",
    blurb:
      "TensorFlow models estimating influencer engagement, reach and campaign ROI, plus optimisation over historical and costing data to decide where the budget should actually go.",
    reads:
      "Raw material rides in on the conveyor, gets weighed and sorted, and leaves as neat labelled crates — a mill that turns history into a forecast.",
    structure: "mill",
    x: 44.94,
    z: -76.29,
    fx: -0.348,
    fz: 0.938,
    clearR: 9,
    anchor: { edgeId: "cross~experience", tAB: 0.4703 },
  },
  {
    id: "watchtower",
    title: "The Watchtower",
    project: "Search & indexing",
    company: "SunRay Construction Solutions",
    blurb:
      "Rebuilt search on ElasticSearch with Kibana on top, tuned the queries behind it, and put a zero-downtime deployment pipeline under the whole application.",
    reads:
      "A timber lookout with a beam that sweeps the dark — the thing that finds what you're looking for before you've finished asking.",
    metric: { value: "10%↑", label: "overall performance" },
    structure: "watchtower",
    x: -34.39,
    z: -42.65,
    fx: -0.811,
    fz: 0.585,
    clearR: 8,
    anchor: { edgeId: "start~skills", tAB: 0.7207 },
  },
  {
    id: "depot",
    title: "The Depot",
    project: "Platform build-out & delivery pipeline",
    company: "Denken Solutions - Auto Refund Claims",
    blurb:
      "Architected a claims platform end to end — schema, APIs, auth, workflows — then built the CI/CD around it on Jenkins and AWS with Docker environments and CloudWatch alerting.",
    reads:
      "A loading dock on the south road: crates come off the line, get stamped, and go straight out on the truck. Build, test, ship — on a loop.",
    structure: "depot",
    x: -5.96,
    z: -45.63,
    fx: 0.926,
    fz: -0.378,
    clearR: 9.5,
    anchor: { edgeId: "villagegate~cross", tAB: 0.4807 },
  },
  {
    id: "exchange",
    title: "The Exchange",
    project: "Multi-tenant consolidation",
    company: "LotVue India (LotVue LLC, USA)",
    blurb:
      "Folded several separate codebases into one multi-tenant Rails Engines platform, so a fix shipped once instead of being ported five times.",
    reads:
      "Five old cabins pulled into a single many-doored hall — every tenant still has their own front door, but there's only one building to maintain now. Their empty foundations are still in the snow beside it.",
    metric: { value: "80%↓", label: "maintenance cost" },
    structure: "exchange",
    x: -35.61,
    z: -86.5,
    fx: -0.863,
    fz: -0.505,
    clearR: 9,
    anchor: { edgeId: "skills~ask", tAB: 0.6301 },
  },
];

/** Every landmark, with the facing yaw derived the same way plots do it. */
export const PROJECT_SITES: (ProjectSite & { yaw: number })[] = SITES.map((s) => ({
  ...s,
  yaw: Math.atan2(s.fx, s.fz),
}));

export const projectById = (id: string) => PROJECT_SITES.find((p) => p.id === id);

/** The sites that put a NEW building in the world (i.e. need a terrain pad and
 *  a hole in the forest). The Reading Room is excluded — it's the library. */
export const BUILT_SITES = PROJECT_SITES.filter((p) => p.structure !== null);

/** Panel id ⇄ project id. Keeps the landmark panels in the same `panelId`
 *  channel as the résumé stops without either being able to shadow the other. */
export const PROJECT_PANEL_PREFIX = "project:";
export const projectPanelId = (id: string) => `${PROJECT_PANEL_PREFIX}${id}`;
export const panelProject = (panelId: string) =>
  panelId.startsWith(PROJECT_PANEL_PREFIX)
    ? projectById(panelId.slice(PROJECT_PANEL_PREFIX.length))
    : undefined;
