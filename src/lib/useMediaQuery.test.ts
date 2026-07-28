import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "./useMediaQuery";
import { useReducedMotion } from "./useReducedMotion";

/**
 * A controllable matchMedia: every query gets its own listener set so a test
 * can flip a preference at runtime, the way a user toggling "reduce motion" in
 * their OS does.
 */
function installMatchMedia(initial: Record<string, boolean>) {
  const state = { ...initial };
  const listeners = new Map<string, Set<() => void>>();

  window.matchMedia = ((query: string) => ({
    get matches() {
      return state[query] ?? false;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: () => void) => {
      if (!listeners.has(query)) listeners.set(query, new Set());
      listeners.get(query)!.add(cb);
    },
    removeEventListener: (_: string, cb: () => void) => listeners.get(query)?.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  return {
    set(query: string, value: boolean) {
      state[query] = value;
      act(() => listeners.get(query)?.forEach((cb) => cb()));
    },
    listenerCount: (query: string) => listeners.get(query)?.size ?? 0,
  };
}

const REDUCE = "(prefers-reduced-motion: reduce)";
const FINE = "(pointer: fine)";

afterEach(() => vi.unstubAllGlobals());

describe("useMediaQuery", () => {
  it("reports the query's current state", () => {
    installMatchMedia({ [FINE]: true });
    const { result } = renderHook(() => useMediaQuery(FINE));
    expect(result.current).toBe(true);
  });

  it("reports false for a query that doesn't match", () => {
    installMatchMedia({ [FINE]: false });
    const { result } = renderHook(() => useMediaQuery(FINE));
    expect(result.current).toBe(false);
  });

  it("re-renders when the preference changes", () => {
    const mm = installMatchMedia({ [REDUCE]: false });
    const { result } = renderHook(() => useMediaQuery(REDUCE));

    expect(result.current).toBe(false);
    mm.set(REDUCE, true);
    expect(result.current).toBe(true);
  });

  it("tracks each query independently", () => {
    installMatchMedia({ [FINE]: true, [REDUCE]: false });
    const { result } = renderHook(() => ({
      fine: useMediaQuery(FINE),
      reduce: useMediaQuery(REDUCE),
    }));

    expect(result.current).toEqual({ fine: true, reduce: false });
  });

  it("unsubscribes on unmount so listeners can't pile up", () => {
    const mm = installMatchMedia({ [FINE]: true });
    const { unmount } = renderHook(() => useMediaQuery(FINE));

    expect(mm.listenerCount(FINE)).toBe(1);
    unmount();
    expect(mm.listenerCount(FINE)).toBe(0);
  });
});

describe("useReducedMotion", () => {
  it("is false when motion is allowed and true when it isn't", () => {
    const mm = installMatchMedia({ [REDUCE]: false });
    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
    mm.set(REDUCE, true);
    expect(result.current).toBe(true);
  });
});
