import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { cssColor, currentTheme, toggleTheme } from "./theme";
import { useTheme } from "./useTheme";

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
  // Default the OS preference to light unless a test says otherwise.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

describe("currentTheme", () => {
  it("prefers an explicit data-theme attribute", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    expect(currentTheme()).toBe("dark");
  });

  it("falls back to the OS preference when nothing is pinned", () => {
    expect(currentTheme()).toBe("light");
  });

  it("ignores a junk attribute value", () => {
    document.documentElement.setAttribute("data-theme", "chartreuse");
    expect(currentTheme()).toBe("light");
  });
});

describe("toggleTheme", () => {
  it("flips the attribute, persists it, and reports the new value", () => {
    expect(toggleTheme()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");

    expect(toggleTheme()).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("announces the change so listeners can react", () => {
    const seen: string[] = [];
    const onChange = (e: Event) => seen.push((e as CustomEvent<string>).detail);
    window.addEventListener("themechange", onChange);

    toggleTheme();
    window.removeEventListener("themechange", onChange);

    expect(seen).toEqual(["dark"]);
  });
});

describe("useTheme", () => {
  it("returns the active theme and follows toggles", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current).toBe("light");

    act(() => {
      toggleTheme();
    });

    expect(result.current).toBe("dark");
  });

  it("stops listening after unmount", () => {
    const { result, unmount } = renderHook(() => useTheme());
    unmount();

    act(() => {
      toggleTheme();
    });

    // No state update, and crucially no "update on unmounted component" warning.
    expect(result.current).toBe("light");
  });
});

describe("cssColor", () => {
  it("parses a 6-digit hex custom property into 0..1 RGB", () => {
    document.body.style.setProperty("--probe", "#ff8000");
    const [r, g, b] = cssColor("--probe");
    expect(r).toBeCloseTo(1, 5);
    expect(g).toBeCloseTo(128 / 255, 5);
    expect(b).toBeCloseTo(0, 5);
  });

  it("expands 3-digit hex shorthand", () => {
    document.body.style.setProperty("--probe", "#fff");
    expect(cssColor("--probe")).toEqual([1, 1, 1]);
  });

  it("parses rgb() and rgba() values", () => {
    document.body.style.setProperty("--probe", "rgb(0, 255, 51)");
    const [r, g, b] = cssColor("--probe");
    expect(r).toBe(0);
    expect(g).toBe(1);
    expect(b).toBeCloseTo(0.2, 5);
  });

  it("falls back to the dark base color for anything unparseable", () => {
    document.body.style.setProperty("--probe", "papayawhip");
    expect(cssColor("--probe")).toEqual([0.06, 0.07, 0.09]);
  });
});
