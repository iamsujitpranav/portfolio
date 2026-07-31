"use client";

import { useEffect, useRef, useState } from "react";
import { game, queueJump, closeModal, openModal, setSprint } from "@/lib/journey/game";
import type { Toast, ModalGame } from "@/lib/journey/game";
import { ATTRACTIONS, AT_RANGE_M, metresTo, type Anchor } from "@/lib/journey/attractions";
import type { Nav } from "./Avatar";
import TicTacToe from "./TicTacToe";
import MemoryMatch from "./MemoryMatch";

// The mini-game HUD (pure DOM, over the canvas). It owns nothing itself — it
// polls the shared `game` singleton once per frame and mirrors the bits people
// need to see: the résumé secrets uncovered so far, and the transient toasts the
// 3D layer emits. (There is no score — the games are flavour, not a contest.) It
// also binds the keyboard controls, lists what there is to play (and walks you
// to it), and mounts whichever kiosk game `game.modal` opens.

const TOAST_MS = 3200;
// The route-cursor position is quantised to ~0.5 % of an edge before it hits
// React state, so the distance rows re-render a few times a second, not every
// frame.
const T_STEP = 0.005;

type Snapshot = {
  secretsFound: number;
  secretsTotal: number;
  toasts: Toast[];
  modal: ModalGame | null;
  sprint: boolean;
  edgeId: string;
  tAB: number;
};

export default function GameHud({
  active,
  nav,
  onGoTo,
  panelOpen = false,
}: {
  active: boolean;
  nav: Nav;
  /** Put the avatar at `anchor`. `look` is the game itself, when it has a
   *  place of its own — the arrival shot turns to frame it. */
  onGoTo: (anchor: Anchor, look?: { x: number; z: number }) => void;
  /** A résumé panel is open on the right. The play controls live in that same
   *  column, so they step aside — reading about Sujit is the point of the site,
   *  and the games shouldn't sit on top of it. */
  panelOpen?: boolean;
}) {
  const [snap, setSnap] = useState<Snapshot>({
    secretsFound: 0,
    secretsTotal: 0,
    toasts: [],
    modal: null,
    sprint: false,
    edgeId: "",
    tAB: 0,
  });
  const [hintGone, setHintGone] = useState(false);
  // Games directory starts collapsed — the "🎮 Games" header stays as the
  // affordance, so the trail isn't cluttered until someone opens it.
  const [listOpen, setListOpen] = useState(false);
  // Last values we pushed to state — the poll diffs against this ref so it
  // re-renders exactly when something visible changes (and never churns).
  const last = useRef({
    secretsFound: -1,
    secretsTotal: -1,
    toastKey: "",
    modal: null as ModalGame | null,
    sprint: false,
    edgeId: "",
    tq: -1,
  });

  // Mark the journey live for the game systems, and bind the two keys: Space to
  // hop, Shift (held) to accelerate. Sprint is also a HUD toggle below, so it
  // works without a keyboard.
  useEffect(() => {
    if (!active) return;
    game.active = true;
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el?.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (game.modal) return; // no hopping or sprinting while a kiosk game is up
      if (e.key === "Shift") {
        if (!game.sprint) setSprint(true);
        return;
      }
      if (e.code !== "Space" && e.key !== " ") return;
      // Ignore only genuine text entry — otherwise Space always jumps (even with
      // a trail button focused, so it never doubles as a "re-walk" activation).
      if (typing()) return;
      e.preventDefault();
      queueJump();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift" && game.sprint) setSprint(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      game.active = false;
      game.sprint = false;
    };
  }, [active]);

  // Poll the shared state once per frame on a single stable loop. Re-render only
  // when a visible value actually changes — secrets, the open kiosk game, or the
  // set of live (un-expired) toasts.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      const nowT = typeof performance !== "undefined" ? performance.now() : 0;
      const fresh = game.toasts.filter((t) => nowT - t.born < TOAST_MS);
      const toastKey = fresh.map((t) => t.id).join(",");
      const tq = Math.round(nav.tAB / T_STEP);
      const l = last.current;
      if (
        game.secretsFound !== l.secretsFound ||
        game.secretsTotal !== l.secretsTotal ||
        game.modal !== l.modal ||
        game.sprint !== l.sprint ||
        nav.edgeId !== l.edgeId ||
        tq !== l.tq ||
        toastKey !== l.toastKey
      ) {
        l.secretsFound = game.secretsFound;
        l.secretsTotal = game.secretsTotal;
        l.modal = game.modal;
        l.sprint = game.sprint;
        l.edgeId = nav.edgeId;
        l.tq = tq;
        l.toastKey = toastKey;
        setSnap({
          secretsFound: game.secretsFound,
          secretsTotal: game.secretsTotal,
          toasts: fresh,
          modal: game.modal,
          sprint: game.sprint,
          edgeId: nav.edgeId,
          tAB: tq * T_STEP,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, nav]);

  // Auto-dismiss the controls hint after a while (once they've had a look).
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setHintGone(true), 11000);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;

  // Everything with a fixed spot, nearest first, with the real WALKING distance
  // over the path graph. The nearest one that's actually within reach drives the
  // standing prompt — without it the kiosks and the pond are just scenery.
  const spots = ATTRACTIONS.filter((a) => a.anchor !== null)
    .map((a) => ({ a, m: metresTo(a, snap.edgeId, snap.tAB) }))
    .sort((x, y) => x.m - y.m);
  const here = spots.find((s) => s.m <= AT_RANGE_M);
  const roaming = ATTRACTIONS.filter((a) => a.anchor === null);

  return (
    <>
      {/* The one thing worth counting: résumé facts uncovered by walking the
          trail. Top-center, out of the way of the side menu. */}
      {snap.secretsTotal > 0 && (
        <div className="jrnScore">
          <div className="jrnSecrets" title="Hidden résumé facts found along the trail">
            ✦ {snap.secretsFound}/{snap.secretsTotal}
            <span>résumé facts found</span>
          </div>
        </div>
      )}

      {/* Toast feed — secrets found, moves landed, board results. */}
      <div className="jrnToasts">
        {snap.toasts.map((t) => (
          <div key={t.id} className="jrnToast" data-kind={t.kind}>
            {t.text}
          </div>
        ))}
      </div>

      {/* Accelerator — the trail is a ~2.5 min walk at base pace, and not
          everyone wants to stroll it. Hold Shift to jog, or latch it here.
          Hidden behind an open résumé panel: it shares that column. */}
      {!panelOpen && (
        <button
          className="jrnSprint"
          data-on={snap.sprint ? "1" : undefined}
          onClick={() => setSprint(!game.sprint)}
          title="Break into a jog (or hold Shift)"
        >
          {snap.sprint ? "▶▶ jog" : "▶ walk"}
        </button>
      )}

      {/* What there is to play, and how to get to it. The games all live at
          fixed points on a 334 m trail, so "Go" runs the avatar there and stops;
          once you're standing at one, the row turns into the way to play it.
          While a résumé panel is open this steps aside entirely — the panel
          fills the same right-hand column, and the content comes first. */}
      {!panelOpen && (
        <div className="jrnGames" data-open={listOpen ? "1" : undefined}>
          <button
            className="jrnGamesHead"
            onClick={() => setListOpen((v) => !v)}
            aria-expanded={listOpen}
          >
            <span>🎮 Games</span>
            <span className="jrnGamesChev">{listOpen ? "▾" : "▸"}</span>
          </button>
          {listOpen && (
            <div className="jrnGamesBody" data-lenis-prevent>
              {spots.map(({ a, m }) => {
                const atIt = m <= AT_RANGE_M;
                return (
                  <div key={a.id} className="jrnGameRow" data-here={atIt ? "1" : undefined}>
                    <div className="jrnGameMain">
                      <b>{a.label}</b>
                      <span>{atIt ? a.how : `${Math.round(m)} m away`}</span>
                    </div>
                    {atIt && a.modal ? (
                      <button className="jrnGameBtn" onClick={() => openModal(a.modal!)}>
                        Play
                      </button>
                    ) : atIt ? (
                      <span className="jrnGameAt">here</span>
                    ) : (
                      <button className="jrnGameBtn" onClick={() => onGoTo(a.anchor!, a.at)}>
                        Go
                      </button>
                    )}
                  </div>
                );
              })}
              {roaming.map((a) => (
                <div key={a.id} className="jrnGameRow" data-roam="1">
                  <div className="jrnGameMain">
                    <b>{a.label}</b>
                    <span>{a.how}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Standing at something playable — say so, loudly. */}
      {here && !snap.modal && !panelOpen && (
        <div className="jrnAtSpot">
          <b>{here.a.label}</b>
          <span>{here.a.how}</span>
          {here.a.modal && (
            <button className="jrnGameBtn" onClick={() => openModal(here.a.modal!)}>
              Play now
            </button>
          )}
        </div>
      )}

      {/* One-time controls hint. */}
      {!hintGone && (
        <div className="jrnControls">
          <b>Space</b> to vault obstacles — or walk into one and watch the kick ·{" "}
          <b>Shift</b> to jog · <b>click a snowman</b> to pelt it · <b>drag</b> to
          look around · everything there is to play is in <b>🎮 Games</b>
        </div>
      )}

      {snap.modal === "tictactoe" && <TicTacToe onClose={closeModal} />}
      {snap.modal === "match" && <MemoryMatch onClose={closeModal} />}
    </>
  );
}
