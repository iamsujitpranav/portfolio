"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "recruiter-mode";
const CHANGE_EVENT = "recruiter-mode-change";

function readEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function writeEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // The event still updates this tab when storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

type RecruiterModeContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
};

const RecruiterModeContext = createContext<RecruiterModeContextValue>({
  enabled: false,
  setEnabled: () => undefined,
  toggle: () => undefined,
});

export function RecruiterModeProvider({ children }: { children: React.ReactNode }) {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => false);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-recruiter-mode", enabled);
    return () => document.documentElement.removeAttribute("data-recruiter-mode");
  }, [enabled]);

  const value = useMemo(
    () => ({
      enabled,
      setEnabled: (next: boolean) => {
        writeEnabled(next);
      },
      toggle: () => {
        writeEnabled(!readEnabled());
      },
    }),
    [enabled],
  );

  return <RecruiterModeContext.Provider value={value}>{children}</RecruiterModeContext.Provider>;
}

export function useRecruiterMode() {
  return useContext(RecruiterModeContext);
}

export function RecruiterModeToggle() {
  const { enabled, toggle } = useRecruiterMode();

  return (
    <button
      className={`recruiterToggle${enabled ? " on" : ""}`}
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Exit recruiter mode" : "Enter recruiter mode"}
      data-cursor
    >
      <span className="recruiterToggleDot" />
      <span>{enabled ? "Recruiter mode" : "Recruiter view"}</span>
    </button>
  );
}
