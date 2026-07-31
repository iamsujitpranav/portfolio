"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { RecruiterModeProvider } from "./RecruiterMode";

/**
 * Client providers:
 *  - Lenis: momentum smooth-scroll (the "buttery scroll" from davidlangarica.dev)
 *  - next-nprogress-bar: the route-change top loader
 * Both respect prefers-reduced-motion.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    let rafId = 0;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    // Keep same-page hash anchors working with Lenis.
    const onAnchor = (e: Event) => {
      const a = (e.target as HTMLElement)?.closest?.('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href")!.slice(1);
      const el = document.getElementById(id);
      if (el) {
        e.preventDefault();
        lenis.scrollTo(el, { offset: -60 });
      }
    };
    document.addEventListener("click", onAnchor);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("click", onAnchor);
      lenis.destroy();
    };
  }, []);

  return (
    <RecruiterModeProvider>
      {children}
      <ProgressBar
        height="2px"
        color="var(--accent)"
        options={{ showSpinner: false }}
        shallowRouting
      />
    </RecruiterModeProvider>
  );
}
