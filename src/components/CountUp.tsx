"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Animates the numeric part of a metric (e.g. "40%↓", "11+", "2×") from 0 to
 * its value when it scrolls into view. Any non-numeric suffix is rendered in
 * the accent color via a `.u` span.
 */
export default function CountUp({ value }: { value: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });

  const match = value.match(/^([\d.]+)(.*)$/);
  const isNumeric = !!match;
  const target = match ? parseFloat(match[1]) : 0;
  const suffix = match ? match[2] : "";
  const decimals = match && match[1].includes(".") ? match[1].split(".")[1].length : 0;

  const [n, setN] = useState(isNumeric ? 0 : NaN);

  // Deps are stable primitives ONLY. The parent Hero re-renders every ~40ms
  // (the role typewriter), which would recreate the `match` array each render —
  // if that array were a dependency, every re-render would cancel the RAF and
  // restart the count from 0, so it never climbed off 0. Keying off `isNumeric`
  // + `target` instead lets the animation run once, uninterrupted, to the end.
  useEffect(() => {
    if (!isNumeric) return;
    if (!inView) return;
    if (reduce) return; // handled at render time — see `shown` below
    let raf = 0;
    let start = 0;
    const dur = 1100;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setN(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, target, isNumeric]);

  if (!isNumeric) {
    return (
      <span ref={ref} className="n">
        {value}
      </span>
    );
  }

  // Reduced motion skips the RAF ramp and jumps to the final value once the
  // element scrolls in. Derived here rather than pushed through setState from
  // the effect, which would be a cascading render.
  const shown = reduce ? (inView ? target : 0) : n;

  return (
    <span ref={ref} className="n">
      {shown.toFixed(decimals)}
      <span className="u">{suffix}</span>
    </span>
  );
}
