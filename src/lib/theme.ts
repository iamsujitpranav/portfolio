export function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function toggleTheme(): "light" | "dark" {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("themechange", { detail: next }));
  return next;
}

/** Read a CSS custom property as an [r,g,b] triple in 0..1 (for WebGL uniforms). */
export function cssColor(name: string): [number, number, number] {
  if (typeof document === "undefined") return [0.06, 0.07, 0.09];
  const raw = getComputedStyle(document.body).getPropertyValue(name).trim();
  if (raw.startsWith("#")) {
    let h = raw.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ];
  }
  const m = raw.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(",");
    return [Number(p[0]) / 255, Number(p[1]) / 255, Number(p[2]) / 255];
  }
  return [0.06, 0.07, 0.09];
}
