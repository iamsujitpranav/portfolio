"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TRACKS, ensure, getServerSnapshot, getSnapshot, step, subscribe, toggle } from "@/lib/soundtrack";

/**
 * The soundtrack control. Pure UI — the audio itself lives in lib/soundtrack so
 * this can be rendered in the journey overlay AND on the classic résumé without
 * two tracks fighting each other. `data-soundtrack` marks the control so the
 * store's autoplay retry ignores clicks landing inside it.
 *
 * Collapsed it is a single music note and nothing else: the track title was the
 * widest thing in the journey's top-right corner, and in the classic site's
 * status bar it is a caption nobody asked for. Clicking the note opens the
 * details — the title, play/pause and the two skips — as a pill that is
 * absolutely positioned, so opening it never reflows the row it sits in. Which
 * side it unrolls to is the caller's business: left of the note in the journey
 * bar, below it in the status bar (see .navMusic).
 *
 * The note itself reports state: accent + a slow pulse while something is
 * playing, muted while it isn't.
 *
 * There is no volume slider. Every machine that can play this already has a
 * volume control, and duplicating it here cost more width than it was worth;
 * the mix level lives in lib/soundtrack.
 */
export default function Soundtrack({ className = "" }: { className?: string }) {
  const { trackIndex, playing } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensure();
  }, []);

  // A details panel that stays open forever is clutter — close it on Escape or
  // on the next click that lands anywhere else.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const track = TRACKS[trackIndex].title;

  return (
    <div
      ref={root}
      className={`jrnMusic ${className}`.trim()}
      data-open={open ? "1" : undefined}
      data-playing={playing ? "1" : undefined}
      data-soundtrack
      aria-label="Portfolio soundtrack"
    >
      {open && (
        <div className="jrnMusicPanel" id="soundtrack-details">
          <button
            className="jrnMusicToggle"
            type="button"
            onClick={toggle}
            aria-label={playing ? `Pause soundtrack · ${track}` : `Play soundtrack · ${track}`}
          >
            <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
          </button>
          <button className="jrnMusicStep" type="button" onClick={() => step(-1)} aria-label="Previous track">‹</button>
          <b className="jrnMusicTrack" title={track} aria-live="polite">
            {track}
          </b>
          <button className="jrnMusicStep" type="button" onClick={() => step(1)} aria-label="Next track">›</button>
        </div>
      )}
      <button
        className="jrnMusicNote"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="soundtrack-details"
        aria-label={open ? "Hide soundtrack details" : `Soundtrack · ${track} · show details`}
      >
        <span aria-hidden="true">♪</span>
      </button>
    </div>
  );
}
