"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Reactive CSS media query without a setState-in-effect.
 *
 * SSR-safe: the server snapshot is always `false` (the server has no viewport),
 * and the client re-reads — and subscribes to changes — after hydration. Use
 * this instead of `useState(false)` + `useEffect(() => setState(mq.matches))`,
 * which is a cascading render and trips `react-hooks/set-state-in-effect`.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
