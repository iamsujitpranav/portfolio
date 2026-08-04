"use client";

import { useEffect, useState } from "react";
import {
  passport,
  passportSummary,
  resetPassport,
  type PassportSummary,
} from "@/lib/journey/passport";
import {
  analyticsOptedOut,
  setAnalyticsOptOut,
  track,
} from "@/lib/journey/analytics";

// THE TRAIL PASSPORT, on screen.
//
// The HUD used to show one number — secrets found — and nothing else a visitor
// did was ever acknowledged. This is the same slot, promoted: a completion
// figure for the whole world (stops read, landmarks visited, secrets, games,
// the tour, the assistant), which clicks open into the actual checklist.
//
// It polls `passport.rev` on the same rAF idiom as GameHud rather than
// subscribing, because the passport is a mutable singleton written from the 3D
// frame loop — one poll that re-renders only on a real change is cheaper and far
// harder to get wrong than a callback fired mid-frame.

/** Metres → a sentence a person reads without doing arithmetic. */
function distance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km walked` : `${Math.round(m)} m walked`;
}

export default function Passport({ active, hidden }: { active: boolean; hidden?: boolean }) {
  const [sum, setSum] = useState<PassportSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [optedOut, setOptedOut] = useState(false);
  // The completion figure the last render drew. Held so an increase can flash
  // the chip — a stamp that lands silently isn't a reward.
  const [bumped, setBumped] = useState(false);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let seen = -1;
    let lastDone = -1;
    const tick = () => {
      // Read inside the frame callback rather than the effect body: it's the
      // same external-state poll as the passport itself, and the updater form
      // means an unchanged value costs no render.
      const off = analyticsOptedOut();
      setOptedOut((v) => (v === off ? v : off));
      if (passport.rev !== seen) {
        seen = passport.rev;
        const next = passportSummary();
        setSum(next);
        if (lastDone >= 0 && next.done > lastDone) {
          setBumped(true);
          window.setTimeout(() => setBumped(false), 900);
        }
        lastDone = next.done;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active || !sum) return null;

  return (
    <>
      {!hidden && (
        <button
          className="jrnScore"
          data-bump={bumped ? "1" : undefined}
          data-open={open ? "1" : undefined}
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next) track("passport_open", { pct: sum.pct });
          }}
          aria-expanded={open}
          title="Everything there is to find on this trail — click for the list"
        >
          <span className="jrnScoreMain">
            <b>✦ {sum.pct}%</b>
            <span>Trail passport</span>
          </span>
          <span className="jrnScoreBar" aria-hidden="true">
            <i style={{ transform: `scaleX(${sum.done / Math.max(1, sum.total)})` }} />
          </span>
          <span className="jrnScoreCount">
            {sum.done}/{sum.total}
          </span>
        </button>
      )}

      {open && (
        <aside className="jrnPassport" aria-label="Trail passport" data-lenis-prevent>
          <header className="jrnPassportHead">
            <div>
              <span className="jrnEyebrow">Trail passport</span>
              <b>
                {sum.complete
                  ? "Every stamp collected."
                  : `${sum.done} of ${sum.total} stamps`}
              </b>
            </div>
            <button
              className="jrnPassportClose"
              onClick={() => setOpen(false)}
              aria-label="Close passport"
            >
              ×
            </button>
          </header>

          <p className="jrnPassportMeta">
            {distance(sum.metres)} · {sum.visits === 1 ? "first visit" : `visit ${sum.visits}`}
            {sum.complete ? " · nothing left to find" : ""}
          </p>

          <div className="jrnPassportBody">
            {sum.sections.map((s) => (
              <section key={s.id} className="jrnPassportSection">
                <h4>
                  {s.label}
                  <em>
                    {s.done}/{s.total}
                  </em>
                </h4>
                <ul>
                  {s.items.map((i) => (
                    <li key={i.id} data-done={i.done ? "1" : undefined}>
                      <span aria-hidden="true">{i.done ? "✓" : "○"}</span>
                      {i.label}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <footer className="jrnPassportFoot">
            {/* Said plainly, in the one place a visitor is already looking at
                what the site remembers about them. */}
            <label className="jrnPassportOpt">
              <input
                type="checkbox"
                checked={!optedOut}
                onChange={(e) => {
                  const on = e.target.checked;
                  setAnalyticsOptOut(!on);
                  setOptedOut(!on);
                }}
              />
              <span>
                Anonymous visit stats
                <em>No cookies, no IP, no third party — just which stops get opened.</em>
              </span>
            </label>
            <button
              className="jrnPassportReset"
              onClick={() => {
                resetPassport();
                track("passport_reset");
              }}
            >
              Reset progress
            </button>
          </footer>
        </aside>
      )}
    </>
  );
}
