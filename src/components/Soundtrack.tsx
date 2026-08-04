"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { TRACKS, ensure, getServerSnapshot, getSnapshot, step, subscribe, toggle } from "@/lib/soundtrack";

/**
 * The soundtrack pill. Pure UI — the audio itself lives in lib/soundtrack so
 * this can be rendered in the journey overlay AND on the classic résumé without
 * two tracks fighting each other. `data-soundtrack` marks the control so the
 * store's autoplay retry ignores clicks landing inside it.
 *
 * Collapsed by default: play/pause and the track that's on, nothing else. The
 * skips are for the handful of visitors who go looking for them, and at full
 * width the pill was the widest thing in the journey's top-right corner —
 * where the Trail bar now shares the row.
 *
 * There is no volume slider. Every machine that can play this already has a
 * volume control, and duplicating it here cost more width than it was worth;
 * the mix level lives in lib/soundtrack.
 */
export default function Soundtrack({ className = "" }: { className?: string }) {
  const { trackIndex, playing } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    ensure();
  }, []);

  const track = TRACKS[trackIndex].title;

  return (
    <div
      className={`jrnMusic ${className}`.trim()}
      data-open={open ? "1" : undefined}
      data-soundtrack
      aria-label="Portfolio soundtrack"
    >
      {/* One tap still starts and stops it — collapsing hides the extras, not
          the thing the pill is for. */}
      <button
        className="jrnMusicToggle"
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pause soundtrack · ${track}` : `Play soundtrack · ${track}`}
      >
        <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
        <b className="jrnMusicTrack" title={track} aria-live="polite">
          {track}
        </b>
      </button>
      {open && (
        <>
          <button className="jrnMusicStep" type="button" onClick={() => step(-1)} aria-label="Previous track">‹</button>
          <button className="jrnMusicStep" type="button" onClick={() => step(1)} aria-label="Next track">›</button>
        </>
      )}
      <button
        className="jrnMusicMore"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Hide track skip controls" : "Show track skip controls"}
      >
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
    </div>
  );
}
