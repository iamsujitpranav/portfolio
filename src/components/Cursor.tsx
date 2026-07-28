"use client";

import { useEffect, useRef } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useReducedMotion } from "@/lib/useReducedMotion";

// Elements that should grow the ring / signal interactivity.
const INTERACTIVE = "a, button, [data-cursor], input, textarea, .chip, .cell li, .suggest span";

/**
 * Custom cursor: a small dot that tracks 1:1 and a ring that lags with easing.
 * Only mounts on fine-pointer, motion-allowed devices; otherwise the native
 * cursor is left untouched (see `.cursor-ready` gating in globals.css).
 */
export default function Cursor() {
  // Read straight from the media queries rather than mirroring them into state
  // from an effect: `enabled` is false on the server and during hydration, then
  // flips once the client snapshot lands — same sequence as before, no
  // cascading render.
  const fine = useMediaQuery("(pointer: fine)");
  const reduce = useReducedMotion();
  const enabled = fine && !reduce;
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add("cursor-ready");
    return () => document.documentElement.classList.remove("cursor-ready");
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const ringPos = { ...target };
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      if (dot.current) dot.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    };
    const onOver = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (el?.closest?.(INTERACTIVE)) ring.current?.classList.add("hover");
    };
    const onOut = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (el?.closest?.(INTERACTIVE)) ring.current?.classList.remove("hover");
    };
    const onDown = () => ring.current?.classList.add("down");
    const onUp = () => ring.current?.classList.remove("down");

    const loop = () => {
      ringPos.x += (target.x - ringPos.x) * 0.18;
      ringPos.y += (target.y - ringPos.y) * 0.18;
      if (ring.current) ring.current.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    window.addEventListener("pointerout", onOut, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("pointerout", onOut);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <div ref={ring} className="cursor-ring" aria-hidden="true" />
      <div ref={dot} className="cursor-dot" aria-hidden="true" />
    </>
  );
}
