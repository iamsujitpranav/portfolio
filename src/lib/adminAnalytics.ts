// The shape of GET /api/admin/analytics, and the id → name lookup the backend
// deliberately doesn't have.
//
// `journey_events` stores ids ("foundry", "thesis", "tictactoe") because the
// world's names live in the frontend modules that define the world. Renaming a
// stop on the trail therefore renames it on the dashboard, with no second copy
// to forget. Anything unrecognised falls through to its raw id rather than
// vanishing — an event from a landmark that has since been removed is still a
// fact about what visitors did.

import { STOPS } from "./journey/sections";
import { PROJECT_SITES, PROJECT_PANEL_PREFIX } from "./journey/projects";
import { SECRETS } from "./journey/secrets";
import { TRACKED_GAMES } from "./journey/passport";

export type Ranked = { id: string; count: number; sessions?: number };

export type AnalyticsPayload = {
  range: { days: number; sessions: number; events: number; truncated: boolean };
  funnel: { step: string; label: string; sessions: number; pct: number }[];
  gate: {
    seen: number;
    blocked: number;
    reasons: { id: string; label: string; count: number }[];
  };
  stops: { id: string; count: number; sessions: number; walk: number; teleport: number }[];
  displays: { id: string; count: number; sessions: number }[];
  tour: {
    started: number;
    completed: number;
    abandoned: number;
    beats: { beat: number; id: string; count: number }[];
  };
  games: { id: string; opens: number; won: number; lost: number; draw: number }[];
  secrets: Ranked[];
  ask: {
    opened: number;
    questions: number;
    voice: number;
    routed: number;
    walked: number;
    destinations: Ranked[];
    questions_enabled: boolean;
    recent: { text: string; at: string }[];
  };
  engagement: {
    median_seconds: number;
    buckets: { label: string; sessions: number }[];
    returning: number;
    new: number;
    by_day: { day: string; sessions: number; events: number }[];
  };
  travel_modes: { mode: string; count: number }[];
  exits: { to_classic: number; targets: { hash: string; count: number }[] };
  events: { name: string; count: number; sessions: number }[];
};

// TRACKED_GAMES is the passport's own list of playable things, already kept as
// a literal there because attractions.ts drags in the whole path graph. Reusing
// it means the dashboard and the passport can never disagree about what counts
// as a game.
const gameLabels = new Map(TRACKED_GAMES.map((g) => [g.id, g.label]));
const stopLabels = new Map(STOPS.map((s) => [s.id, s.label]));
const siteLabels = new Map(PROJECT_SITES.map((p) => [p.id, p.title]));
const secretLabels = new Map(SECRETS.map((s) => [s.id, s.fact.replace(/^✦\s*/, "")]));

/**
 * A landmark board is opened by its PANEL id ("project:foundry") because panel
 * ids share one channel with the stops and need the prefix to not collide. The
 * events store what was emitted, so the prefix has to come off here — and it
 * has to come off the ID, not just the label, or "project:foundry" ranks as its
 * own row while "The Foundry" sits at the bottom marked never opened.
 */
export function canonicalId(id: string): string {
  return id.startsWith(PROJECT_PANEL_PREFIX) ? id.slice(PROJECT_PANEL_PREFIX.length) : id;
}

/** A résumé stop, a junction node, or the assistant terminal. */
export function stopLabel(id: string): string {
  const key = canonicalId(id);
  return stopLabels.get(key) ?? siteLabels.get(key) ?? id;
}

/** A board that was actually read — either a stop's or a landmark's. */
export function displayLabel(id: string): string {
  const key = canonicalId(id);
  return siteLabels.get(key) ?? stopLabels.get(key) ?? id;
}

export function gameLabel(id: string): string {
  return gameLabels.get(id) ?? id;
}

export function secretLabel(id: string): string {
  return secretLabels.get(id) ?? id;
}

/** Every landmark that exists, so the dashboard can show the ZEROES too — the
 *  board nobody has ever opened is the finding, and it is invisible in a list
 *  built only from events that happened. */
export function allDisplays(): { id: string; label: string }[] {
  return [
    ...PROJECT_SITES.map((p) => ({ id: p.id, label: p.title })),
    ...STOPS.map((s) => ({ id: s.id, label: s.label })),
  ];
}

export function allStops(): { id: string; label: string }[] {
  return STOPS.map((s) => ({ id: s.id, label: s.label }));
}

export function allGames(): { id: string; label: string }[] {
  return TRACKED_GAMES.map((g) => ({ id: g.id, label: g.label }));
}

export function allSecrets(): { id: string; label: string }[] {
  return SECRETS.map((s) => ({ id: s.id, label: s.fact.replace(/^✦\s*/, "") }));
}

/** "4m 12s" — durations here are minutes, not hours. */
export function formatSeconds(total: number): string {
  if (total <= 0) return "—";
  const s = Math.round(total);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m}m ${rest}s` : `${m}m`;
}

/** Percent of `whole`, safe when nothing has happened yet. */
export function share(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}
