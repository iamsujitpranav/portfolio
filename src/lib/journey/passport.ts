// THE TRAIL PASSPORT — the only thing on this site that remembers you.
//
// Every other piece of journey state is per-run: `game` resets on launch, `nav`
// starts at the spawn node, the gems respawn. That made the whole world a
// one-shot demo — a visitor who found four of six secrets and came back the next
// day started again at zero, so there was never a reason to come back at all.
//
// This module is the counter-weight. It records, in localStorage, the things a
// visitor did that are worth keeping: which résumé stops they opened, which
// landmarks they read, which secrets they turned up, which games they beat, how
// far they actually walked. From that it derives a COMPLETION figure, which is
// what the HUD shows and what makes the second visit a continuation instead of a
// restart.
//
// Design rules, in order of importance:
//
//  1. NEVER lose progress. Unknown fields from a newer build are preserved on
//     load, ids are stable strings (never array indices), and a corrupt or
//     unreadable store degrades to a fresh passport rather than throwing.
//  2. NEVER block a frame. `addMetres` is called from the avatar's frame loop,
//     so writes are debounced and the disk hit is one JSON.stringify a second at
//     worst, flushed for real on pagehide.
//  3. THREE-free and SSR-safe, like every lib/journey module. Import it from a
//     server component and it is inert, not a crash.

import { STOPS } from "./sections";
import { PROJECT_SITES, PROJECT_PANEL_PREFIX } from "./projects";
import { SECRETS } from "./secrets";

const KEY = "sujit.journey.passport.v1";
const SAVE_DEBOUNCE_MS = 900;

/** A game is "played" once it's been opened/attempted, "won" once it's beaten. */
export type GameResult = "played" | "won";

export type PassportData = {
  v: 1;
  /** Epoch ms. `firstSeen` is what makes "you first walked this in March" true. */
  firstSeen: number;
  lastSeen: number;
  visits: number;
  secrets: string[];
  stops: string[];
  landmarks: string[];
  games: Record<string, GameResult>;
  metres: number;
  /** Questions put to the résumé assistant, all-time. */
  asked: number;
  /** The guided tour was watched to the end. */
  tour: boolean;
};

// The playable things worth a passport stamp. The ids mirror ATTRACTIONS in
// attractions.ts — kept as a literal here rather than imported, because that
// module pulls in the whole path graph and the passport must stay cheap enough
// to load before the world does.
export const TRACKED_GAMES: { id: string; label: string }[] = [
  { id: "tictactoe", label: "Tic-tac-toe kiosk" },
  { id: "match", label: "Stack match kiosk" },
  { id: "curling", label: "Curling on the pond" },
  { id: "obstacles", label: "Obstacle run" },
  { id: "snowmen", label: "Snowball targets" },
];

function fresh(): PassportData {
  return {
    v: 1,
    firstSeen: 0,
    lastSeen: 0,
    visits: 0,
    secrets: [],
    stops: [],
    landmarks: [],
    games: {},
    metres: 0,
    asked: 0,
    tour: false,
  };
}

/**
 * The live passport. Mutable module singleton, read by pollers the same way the
 * HUD polls `game` — `rev` bumps on every discrete unlock so a rAF loop can
 * diff cheaply instead of deep-comparing the record.
 */
export const passport = {
  /** `loadPassport()` has run (in the browser). */
  ready: false,
  /** This load found a previous visit — the "welcome back" signal. */
  returning: false,
  data: fresh(),
  rev: 0,
};

// --- storage ---------------------------------------------------------------

function store(): Storage | null {
  // Safari in private mode throws on ACCESS, not just on write.
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");

/**
 * Coerce whatever was on disk into a PassportData. Anything malformed falls back
 * to the fresh value for that field alone — one corrupt array must not throw
 * away the other five things the visitor did.
 */
function coerce(raw: unknown): PassportData {
  const d = fresh();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  if (typeof o.firstSeen === "number") d.firstSeen = o.firstSeen;
  if (typeof o.lastSeen === "number") d.lastSeen = o.lastSeen;
  if (typeof o.visits === "number") d.visits = Math.max(0, Math.floor(o.visits));
  if (isStrArray(o.secrets)) d.secrets = [...new Set(o.secrets)];
  if (isStrArray(o.stops)) d.stops = [...new Set(o.stops)];
  if (isStrArray(o.landmarks)) d.landmarks = [...new Set(o.landmarks)];
  if (typeof o.metres === "number" && Number.isFinite(o.metres)) d.metres = Math.max(0, o.metres);
  if (typeof o.asked === "number") d.asked = Math.max(0, Math.floor(o.asked));
  if (o.tour === true) d.tour = true;
  if (o.games && typeof o.games === "object") {
    for (const [k, v] of Object.entries(o.games as Record<string, unknown>)) {
      if (v === "won" || v === "played") d.games[k] = v;
    }
  }
  return d;
}

function readDisk(): PassportData | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    return raw ? coerce(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * Fold whatever is on disk into the in-memory record. Progress is MONOTONIC —
 * every field here can only grow — so this is safe to apply on every write and
 * it never invents a stamp neither side earned.
 *
 * Why it exists: two tabs of the journey each hold their own copy, and both
 * flush on pagehide. Without a merge the last tab to close would overwrite the
 * other's finds with its own older record — the visitor watches progress
 * disappear for no reason they can see. Metres take the max rather than the sum
 * because both tabs counted up from the same starting total.
 */
function mergeDisk(disk: PassportData) {
  const d = passport.data;
  const union = (mine: string[], theirs: string[]) => [...new Set([...mine, ...theirs])];
  d.secrets = union(d.secrets, disk.secrets);
  d.stops = union(d.stops, disk.stops);
  d.landmarks = union(d.landmarks, disk.landmarks);
  for (const [k, v] of Object.entries(disk.games)) {
    if (d.games[k] !== "won") d.games[k] = d.games[k] === "played" && v === "played" ? "played" : v;
  }
  d.metres = Math.max(d.metres, disk.metres);
  d.asked = Math.max(d.asked, disk.asked);
  d.visits = Math.max(d.visits, disk.visits);
  d.tour = d.tour || disk.tour;
  if (disk.firstSeen) d.firstSeen = d.firstSeen ? Math.min(d.firstSeen, disk.firstSeen) : disk.firstSeen;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
// Set for the duration of resetPassport, which is the ONE write that must not
// merge — "reset progress" means the disk record is what's being thrown away.
let skipMerge = false;

function writeNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const s = store();
  if (!s) return;
  try {
    if (!skipMerge) {
      const disk = readDisk();
      if (disk) mergeDisk(disk);
    }
    passport.data.lastSeen = Date.now();
    s.setItem(KEY, JSON.stringify(passport.data));
  } catch {
    // Quota exceeded / private mode. The session still works from memory, and
    // a passport is not worth interrupting a visit over.
  }
}

/** Queue a save. Called from per-frame code, so it must stay this cheap. */
function touch(notify: boolean) {
  if (notify) passport.rev++;
  if (!saveTimer) saveTimer = setTimeout(writeNow, SAVE_DEBOUNCE_MS);
}

/** Write the pending record out now rather than at the end of the debounce. */
export function flushPassport(): void {
  writeNow();
}

/**
 * Hydrate from disk and count this visit. Idempotent — the overlay calls it on
 * mount and every marker below calls it defensively, so a stamp can never land
 * on an un-hydrated passport and wipe the record it hasn't read yet.
 */
export function loadPassport(): PassportData {
  if (passport.ready) return passport.data;
  passport.ready = true;
  const s = store();
  if (s) {
    try {
      const raw = s.getItem(KEY);
      if (raw) {
        passport.data = coerce(JSON.parse(raw));
        passport.returning = passport.data.visits > 0;
      }
    } catch {
      passport.data = fresh();
    }
  }
  const now = Date.now();
  passport.data.visits += 1;
  if (!passport.data.firstSeen) passport.data.firstSeen = now;
  passport.data.lastSeen = now;
  passport.rev++;
  writeNow();
  // A tab closed mid-walk still keeps the metres it covered.
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", writeNow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") writeNow();
    });
  }
  return passport.data;
}

// --- stamps ----------------------------------------------------------------
// Each returns true only the FIRST time it records something, so callers can
// toast, celebrate or fire an analytics event on the transition and stay quiet
// on the twentieth walk past the same gem.

function addTo(list: string[], id: string): boolean {
  if (!id || list.includes(id)) return false;
  list.push(id);
  touch(true);
  return true;
}

export function markSecret(id: string): boolean {
  loadPassport();
  return addTo(passport.data.secrets, id);
}

export function markStop(id: string): boolean {
  loadPassport();
  if (!STOPS.some((s) => s.id === id)) return false;
  return addTo(passport.data.stops, id);
}

export function markLandmark(id: string): boolean {
  loadPassport();
  // A landmark board is opened by its PANEL id ("project:foundry") — panel ids
  // share one channel with the résumé stops and carry the prefix so the two
  // can't shadow each other. Only the bare id is a landmark, so the prefix has
  // to come off or every landmark stamp is silently refused.
  const key = id.startsWith(PROJECT_PANEL_PREFIX) ? id.slice(PROJECT_PANEL_PREFIX.length) : id;
  if (!PROJECT_SITES.some((p) => p.id === key)) return false;
  return addTo(passport.data.landmarks, key);
}

/** Record a game. A win never downgrades to "played" on a later loss. */
export function markGame(id: string, result: GameResult): boolean {
  loadPassport();
  const cur = passport.data.games[id];
  if (cur === result || (cur === "won" && result === "played")) return false;
  passport.data.games[id] = result;
  touch(true);
  return true;
}

export function markTourComplete(): boolean {
  loadPassport();
  if (passport.data.tour) return false;
  passport.data.tour = true;
  touch(true);
  return true;
}

export function markAsked(): void {
  loadPassport();
  passport.data.asked += 1;
  touch(true);
}

/**
 * Ground covered, in metres. Called from the avatar's route integrator every
 * frame it moves — no notify, because a distance ticking up is not an unlock and
 * re-rendering the HUD 60 times a second for it would be absurd. Pollers read
 * `passport.data.metres` directly.
 */
export function addMetres(m: number): void {
  if (!(m > 0) || !Number.isFinite(m)) return;
  loadPassport();
  passport.data.metres += m;
  touch(false);
}

/** Wipe the record and start over (the passport card's own button). */
export function resetPassport(): void {
  passport.data = fresh();
  passport.data.visits = 1;
  passport.data.firstSeen = Date.now();
  passport.returning = false;
  passport.rev++;
  const s = store();
  try {
    s?.removeItem(KEY);
  } catch {
    /* nothing to do — the in-memory wipe above already happened */
  }
  // Written WITHOUT the merge: a reset is the one moment the disk record is
  // meant to lose, and merging would hand every stamp straight back.
  skipMerge = true;
  try {
    writeNow();
  } finally {
    skipMerge = false;
  }
}

// --- completion ------------------------------------------------------------

export type PassportItem = { id: string; label: string; done: boolean };
export type PassportSection = {
  id: string;
  label: string;
  done: number;
  total: number;
  items: PassportItem[];
};
export type PassportSummary = {
  pct: number;
  done: number;
  total: number;
  sections: PassportSection[];
  metres: number;
  visits: number;
  /** True the moment every stamp is collected — the thing worth chasing. */
  complete: boolean;
};

const section = (
  id: string,
  label: string,
  items: PassportItem[],
): PassportSection => ({
  id,
  label,
  items,
  done: items.filter((i) => i.done).length,
  total: items.length,
});

/**
 * The passport as the UI wants it: every stamp there is, which are earned, and
 * one honest percentage over the lot. Cheap enough to call from a poll — it is
 * a few dozen array lookups — but callers should still gate it on `passport.rev`.
 */
export function passportSummary(): PassportSummary {
  const d = passport.data;
  const sections: PassportSection[] = [
    section(
      "stops",
      "Résumé stops",
      STOPS.map((s) => ({
        id: s.id,
        label: s.id === "start" ? "The Architect" : s.label,
        done: d.stops.includes(s.id),
      })),
    ),
    section(
      "landmarks",
      "Project landmarks",
      PROJECT_SITES.map((p) => ({
        id: p.id,
        label: p.title,
        done: d.landmarks.includes(p.id),
      })),
    ),
    section(
      "secrets",
      "Hidden résumé facts",
      SECRETS.map((s, i) => ({
        id: s.id,
        // Un-found secrets must not spoil themselves — the fact is the reward.
        label: d.secrets.includes(s.id) ? s.fact.replace(/^✦\s*/, "") : `Secret ${i + 1}`,
        done: d.secrets.includes(s.id),
      })),
    ),
    section(
      "games",
      "Games",
      TRACKED_GAMES.map((g) => ({
        id: g.id,
        label: g.label,
        done: d.games[g.id] === "won",
      })),
    ),
    section("extras", "Extras", [
      { id: "tour", label: "Watched the guided tour", done: d.tour },
      { id: "ask", label: "Asked the résumé a question", done: d.asked > 0 },
    ]),
  ];

  const done = sections.reduce((n, s) => n + s.done, 0);
  const total = sections.reduce((n, s) => n + s.total, 0);
  return {
    sections,
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    metres: Math.round(d.metres),
    visits: d.visits,
    complete: total > 0 && done === total,
  };
}
