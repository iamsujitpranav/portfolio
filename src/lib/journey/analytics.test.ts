import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  track,
  flushEvents,
  analyticsEnabled,
  analyticsOptedOut,
  setAnalyticsOptOut,
  setAnalyticsContext,
  __resetAnalytics,
} from "./analytics";

/** Capture what would go over the wire without a network. */
function beacon() {
  const sent: string[] = [];
  const fn = vi.fn((_url: string, body: BodyInit) => {
    sent.push(typeof body === "string" ? body : "[blob]");
    return true;
  });
  // jsdom has no sendBeacon; define it, and read the Blob back as text is not
  // synchronous — so stringify by intercepting the Blob's own parts instead.
  Object.defineProperty(navigator, "sendBeacon", { value: fn, configurable: true });
  return { fn, sent };
}

/** jsdom exposes doNotTrack as a plain property, so set it rather than spy. */
function dnt(value: string | null) {
  Object.defineProperty(navigator, "doNotTrack", { value, configurable: true });
  __resetAnalytics();
}

beforeEach(() => {
  __resetAnalytics();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("consent", () => {
  it("collects by default", () => {
    expect(analyticsEnabled()).toBe(true);
  });

  it("honours Do-Not-Track", () => {
    dnt("1");
    expect(analyticsEnabled()).toBe(false);
    track("stop_open", { id: "skills" });
    expect(flushEvents()).toBeNull();
    dnt(null);
  });

  it("honours the visitor's own opt-out, and can be turned back on", () => {
    setAnalyticsOptOut(true);
    expect(analyticsOptedOut()).toBe(true);
    expect(analyticsEnabled()).toBe(false);
    track("stop_open");
    expect(flushEvents()).toBeNull();

    setAnalyticsOptOut(false);
    expect(analyticsOptedOut()).toBe(false);
    expect(analyticsEnabled()).toBe(true);
  });

  it("opting out does not re-enable collection for a DNT browser", () => {
    dnt("1");
    setAnalyticsOptOut(false);
    expect(analyticsEnabled()).toBe(false);
    dnt(null);
  });
});

describe("batching", () => {
  it("holds events back, then sends them together", () => {
    const { fn } = beacon();
    track("a");
    track("b");
    expect(fn).not.toHaveBeenCalled(); // still queued

    const batch = flushEvents();
    expect(batch?.events.map((e) => e.name)).toEqual(["a", "b"]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flushes itself once the queue fills", () => {
    const { fn } = beacon();
    for (let i = 0; i < 12; i++) track(`e${i}`);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(flushEvents()).toBeNull(); // nothing left behind
  });

  it("flushes on a timer when the queue never fills", () => {
    vi.useFakeTimers();
    const { fn } = beacon();
    track("slow");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(6000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("carries one stable session id across a batch", () => {
    beacon();
    track("a");
    const first = flushEvents()!.sid;
    track("b");
    expect(flushEvents()!.sid).toBe(first);
    expect(first).toBeTruthy();
  });
});

describe("payload discipline", () => {
  it("merges the visit context into every event", () => {
    beacon();
    setAnalyticsContext({ visit: 3, returning: true });
    track("stop_open", { id: "skills" });
    const e = flushEvents()!.events[0];
    expect(e.props).toMatchObject({ visit: 3, returning: true, id: "skills" });
  });

  it("bounds names, strings and property counts", () => {
    beacon();
    track("x".repeat(200), {
      long: "y".repeat(500),
      a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10,
    });
    const e = flushEvents()!.events[0];
    expect(e.name.length).toBeLessThanOrEqual(48);
    expect(String(e.props!.long).length).toBe(200); // the backend's own ceiling
    expect(Object.keys(e.props!).length).toBeLessThanOrEqual(8);
  });

  it("drops values that can't be serialised meaningfully", () => {
    beacon();
    track("odd", { good: 1.239, nan: Number.NaN, gone: undefined, nothing: null });
    const e = flushEvents()!.events[0];
    expect(e.props).toEqual({ good: 1.24 });
  });

  it("never throws when there is no transport at all", () => {
    Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(() => {
      track("a");
      flushEvents();
    }).not.toThrow();
    fetchSpy.mockRestore();
  });
});
