"use client";

import { useSyncExternalStore } from "react";
import { currentTheme } from "./theme";

function subscribe(onChange: () => void) {
  // `toggleTheme()` dispatches this after flipping the data-theme attribute.
  window.addEventListener("themechange", onChange);
  return () => window.removeEventListener("themechange", onChange);
}

/**
 * The active theme, reactive to `toggleTheme()`.
 *
 * SSR-safe: the server snapshot is "light" (matching the pre-hydration markup);
 * the client re-reads the real value right after hydration. Reading through an
 * external store keeps this out of an effect, which would cascade a render.
 */
export function useTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, currentTheme, () => "light" as const);
}
