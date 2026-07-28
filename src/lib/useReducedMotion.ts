"use client";

import { useMediaQuery } from "./useMediaQuery";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Reactive `prefers-reduced-motion` without a setState-in-effect.
 * SSR-safe: the server snapshot assumes motion is allowed; the client
 * re-reads (and subscribes to changes) after hydration.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery(QUERY);
}
