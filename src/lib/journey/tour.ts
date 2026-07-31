// THE GUIDED TOUR — "show me around".
//
// The world is big and a first-time visitor doesn't know what to do with it:
// they land on the Town Square, look at the snow, and leave without reading a
// word of the résumé. This is the fix. One button, and the avatar walks the
// whole trail on autopilot — every stop, every landmark, cards opening and
// closing on their own, the camera drifting cinematically while you read.
//
// It is a SEQUENCER, nothing more: the beats below are (destination, what the
// guide says, how long the card stays up), and JourneyOverlay drives them with
// the same routing the Trail menu already uses. Nothing here is bespoke
// navigation — which is what keeps it interruptible: cancel at any moment and
// the avatar is simply standing wherever the route got to.
//
// THREE-free, like every other lib/journey module, so the pacing can be
// measured headlessly (scratchpad/tour_audit.ts).

import { projectById, projectPanelId } from "./projects";

export type TourBeat = {
  /** A résumé stop (routes to that graph node) or a project landmark (routes to
   *  the landmark's own anchor point on the road). */
  kind: "stop" | "project";
  id: string;
  /** The guide's line, shown while walking there — so the long legs are
   *  narrated rather than silent. */
  say: string;
  /** Seconds the card stays open before the tour moves on. */
  dwell: number;
};

// ORDER = the résumé's own order: who he is, the arc, the work, the stack, the
// assistant, how to hire him. The landmarks are threaded in where they already
// stand — every one of them sits ON a leg the tour was walking anyway, so they
// cost no extra distance at all (measured: 488 m with them, 488 m without).
//
// The Root is now at the spawn point, so the guided tour begins with the
// introduction instead of making the visitor walk to the retired old stop.
export const TOUR: TourBeat[] = [
  {
    kind: "stop",
    id: "start",
    say: "This is The Root — the introduction at the Town Square, where the journey begins.",
    dwell: 8,
  },
  {
    kind: "project",
    id: "depot",
    say: "Let's start with how the work actually ships. This is the Depot, on the south road.",
    dwell: 6,
  },
  {
    kind: "project",
    id: "reading-room",
    say: "The library on this square isn't decoration — it's the most recent project.",
    dwell: 6,
  },
  {
    kind: "stop",
    id: "thesis",
    say: "A few steps to the Arc, for the whole career in one paragraph.",
    dwell: 8,
  },
  {
    kind: "project",
    id: "foundry",
    say: "East over the pond bridge. That hall coming apart under the scaffolding is the big migration.",
    dwell: 6,
  },
  {
    kind: "stop",
    id: "experience",
    say: "On to Experience — twelve years of it, in order.",
    dwell: 9,
  },
  {
    kind: "project",
    id: "mill",
    say: "Heading back west past the Forecast Mill: history in, predictions out.",
    dwell: 6,
  },
  {
    kind: "stop",
    id: "skills",
    say: "The long leg back across the map, to the stack behind all of it.",
    dwell: 9,
  },
  {
    kind: "project",
    id: "exchange",
    say: "Down the outer ring past the Exchange — five codebases folded into one.",
    dwell: 6,
  },
  {
    kind: "stop",
    id: "ask",
    say: "There's a terminal at the next stop that answers questions about any of this.",
    dwell: 8,
  },
  {
    kind: "stop",
    id: "contact",
    say: "Last climb — the summit, and how to get hold of him.",
    dwell: 10,
  },
];

/** Which panel a beat opens on arrival. */
export function beatPanelId(b: TourBeat): string {
  return b.kind === "stop" ? b.id : projectPanelId(b.id);
}

/** The beat's headline, for the tour bar. */
export function beatTitle(b: TourBeat): string {
  if (b.kind === "project") return projectById(b.id)?.title ?? b.id;
  return STOP_TITLES[b.id] ?? b.id;
}

// Kept local rather than imported from sections.ts: the tour wants the PLACE
// name, and sections.ts is free to reword its nav labels without the tour bar
// suddenly reading differently.
const STOP_TITLES: Record<string, string> = {
  start: "The Root",
  thesis: "The Arc",
  experience: "Experience",
  skills: "Skills",
  ask: "Ask my résumé",
  contact: "The Summit",
};

// Measured end to end by scratchpad/tour_audit.ts over the real path graph —
// re-measure if the beats or the road network change. Used only to tell the
// visitor up front roughly what they're committing to, which matters: five
// minutes is a lot to ask without saying so.
export const TOUR_METRES = 488;
const JOG_MS = 2.42; // the jog the tour travels at (config RUN_MS)

/** Rough minutes, rounded to the nearest half — walking plus reading. */
export const TOUR_MINUTES =
  Math.round(((TOUR_METRES / JOG_MS + TOUR.reduce((s, b) => s + b.dwell, 0)) / 60) * 2) / 2;

/**
 * Shared tour state — a mutable singleton in the same style as `game` and
 * `nav`. The DOM overlay owns the sequencing; this exists so the R3F CAMERA can
 * read it every frame without a prop being threaded through the whole scene.
 */
export const tour = {
  /** A tour is running. */
  active: false,
  /** The avatar is parked at a beat with its card open — the camera drifts. */
  cinematic: false,
  /** The visitor grabbed the camera during this beat: hand it back to them and
   *  stop drifting until the next one. Their input always wins. */
  userLook: false,
};

export function resetTourCamera() {
  tour.cinematic = false;
  tour.userLook = false;
}
