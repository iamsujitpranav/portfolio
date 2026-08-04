// JOURNEY ANALYTICS — what people actually do in here.
//
// The world has ten landmarks, five games, six secrets and a guided tour, and
// until now there was no way to know whether a single visitor ever reached the
// Summit. That matters more for this site than for most: the whole point is a
// recruiter reading the work, and "which stop did they open, and where did they
// leave?" is the feedback loop for every content decision on the trail.
//
// WHAT THIS IS NOT: it is not a tracker. There is no third-party script, no
// cookie, no fingerprint, no IP stored, no cross-site anything. An event is a
// short name, a bag of small scalars, and a RANDOM per-tab session id that lives
// in sessionStorage and dies with the tab. Do-Not-Track and Global Privacy
// Control are honoured by switching the whole module off.
//
// Delivery is best-effort by design: batched, `keepalive`, and beaconed on
// pagehide so the last events of a visit survive the tab closing. Nothing here
// can throw into a caller and nothing here awaits — a dead backend must cost a
// visitor exactly nothing.

export type EventProps = Record<string, string | number | boolean | null | undefined>;

type QueuedEvent = {
  name: string;
  t: number; // ms since the session started — no wall-clock timestamps needed
  props?: EventProps;
};

const ENDPOINT = "/api/events";
const SID_KEY = "sujit.journey.sid";
const OPT_OUT_KEY = "sujit.journey.notrack";

const FLUSH_AT = 12; // events queued before an early flush
const FLUSH_MS = 6000;
const MAX_QUEUE = 60; // hard cap; a runaway loop must not eat memory
const MAX_NAME = 48;
const MAX_PROPS = 8;
// Matches the backend's own per-string ceiling, so a value is truncated once by
// an agreed number rather than twice by two different ones. Every id and mode
// on the trail is far shorter; the one prop that gets near it is the text of a
// question put to the assistant, and a question cut off mid-sentence is a
// question you can't learn anything from.
const MAX_STR = 200;

const state = {
  started: 0,
  sid: "",
  /** Merged into every event — the visit's shape, set once the world is up. */
  context: {} as EventProps,
  queue: [] as QueuedEvent[],
  timer: null as ReturnType<typeof setTimeout> | null,
  enabled: null as boolean | null,
  bound: false,
};

// --- consent ---------------------------------------------------------------

function readOptOut(): boolean {
  try {
    return window.localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether anything is collected at all. Decided once, per page load. */
export function analyticsEnabled(): boolean {
  if (state.enabled !== null) return state.enabled;
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    state.enabled = false;
    return false;
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const dnt =
    nav.doNotTrack === "1" ||
    nav.msDoNotTrack === "1" ||
    (window as unknown as { doNotTrack?: string }).doNotTrack === "1" ||
    nav.globalPrivacyControl === true;
  state.enabled = !dnt && !readOptOut();
  return state.enabled;
}

/** The visitor's own switch, surfaced in the passport card. */
export function setAnalyticsOptOut(off: boolean): void {
  try {
    if (off) window.localStorage.setItem(OPT_OUT_KEY, "1");
    else window.localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* storage unavailable — the in-memory flag below still holds for this tab */
  }
  // Re-decide from scratch on the next call: switching the site flag back off
  // must not re-enable collection for someone whose browser sends DNT.
  state.enabled = null;
  if (off) state.queue.length = 0;
}

export function analyticsOptedOut(): boolean {
  return typeof window !== "undefined" && readOptOut();
}

// --- session ---------------------------------------------------------------

function sessionId(): string {
  if (state.sid) return state.sid;
  let sid = "";
  try {
    sid = window.sessionStorage.getItem(SID_KEY) ?? "";
  } catch {
    /* private mode — fall through to a memory-only id */
  }
  if (!sid) {
    sid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    try {
      window.sessionStorage.setItem(SID_KEY, sid);
    } catch {
      /* memory-only id is fine: it just means a reload starts a new session */
    }
  }
  state.sid = sid;
  return sid;
}

// --- sanitising ------------------------------------------------------------
// Everything crossing the wire is bounded here rather than trusted at the API.
// The backend validates too, but a client that can't overrun its own payload
// never gets a 422 in the first place.

function cleanProps(props?: EventProps): EventProps | undefined {
  if (!props) return undefined;
  const out: EventProps = {};
  let n = 0;
  for (const [k, v] of Object.entries(props)) {
    if (n >= MAX_PROPS) break;
    if (v === undefined || v === null) continue;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) continue;
      out[k.slice(0, 32)] = Math.round(v * 100) / 100;
    } else if (typeof v === "boolean") {
      out[k.slice(0, 32)] = v;
    } else {
      out[k.slice(0, 32)] = String(v).slice(0, MAX_STR);
    }
    n++;
  }
  return n ? out : undefined;
}

// --- transport -------------------------------------------------------------

function post(body: string): void {
  try {
    // sendBeacon survives the page going away, which is exactly when the most
    // interesting event (how far they got) is emitted.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never surface an error to a visitor */
  }
}

/** Send whatever is queued. Returns the batch sent, or null — handy in tests. */
export function flushEvents(): { sid: string; events: QueuedEvent[] } | null {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (!state.queue.length || !analyticsEnabled()) return null;
  const batch = { sid: sessionId(), events: state.queue.slice() };
  state.queue.length = 0;
  post(JSON.stringify(batch));
  return batch;
}

function bindFlush() {
  if (state.bound || typeof window === "undefined") return;
  state.bound = true;
  window.addEventListener("pagehide", () => {
    track("session_end", { seconds: Math.round((Date.now() - state.started) / 1000) });
    flushEvents();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushEvents();
  });
}

// --- the API ---------------------------------------------------------------

/**
 * Facts true of the whole visit — completion %, returning visitor, capability —
 * merged into every subsequent event so each one can be read on its own.
 */
export function setAnalyticsContext(props: EventProps): void {
  const clean = cleanProps(props);
  if (clean) state.context = { ...state.context, ...clean };
}

/**
 * Record something a visitor did. Fire-and-forget: no await, no return value to
 * check, no path out of here that throws.
 */
export function track(name: string, props?: EventProps): void {
  if (!analyticsEnabled()) return;
  if (!state.started) {
    state.started = Date.now();
    bindFlush();
  }
  const evt: QueuedEvent = {
    name: String(name).slice(0, MAX_NAME),
    t: Date.now() - state.started,
    props: cleanProps({ ...state.context, ...props }),
  };

  // Mirror into a first-party analytics script if the site ever grows one, so
  // adding Plausible/GA is a script tag and nothing else.
  const w = window as unknown as {
    plausible?: (n: string, o?: { props?: EventProps }) => void;
    gtag?: (kind: string, n: string, o?: EventProps) => void;
  };
  try {
    w.plausible?.(evt.name, evt.props ? { props: evt.props } : undefined);
    w.gtag?.("event", evt.name, evt.props);
  } catch {
    /* a broken third-party shim is not this module's problem */
  }

  if (state.queue.length >= MAX_QUEUE) state.queue.shift();
  state.queue.push(evt);

  if (state.queue.length >= FLUSH_AT) {
    flushEvents();
    return;
  }
  if (!state.timer) state.timer = setTimeout(flushEvents, FLUSH_MS);
}

/** Test seam — drops queued events, consent memo, session and context. */
export function __resetAnalytics(): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  state.queue.length = 0;
  state.enabled = null;
  state.sid = "";
  state.started = 0;
  state.context = {};
  state.bound = false;
}
