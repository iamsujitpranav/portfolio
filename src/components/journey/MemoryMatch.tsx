"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pushToast, celebrate } from "@/lib/journey/game";
import { markGame } from "@/lib/journey/passport";
import { track } from "@/lib/journey/analytics";

// "Stack match" — the second rest-stop diversion, opened from the shed kiosk in
// the village. Six pairs of the tools this site is actually built with, face
// down; turn two at a time and clear the board. Scoring rewards a tidy game: a
// perfect run (12 turns, no repeats) pays double what a scrappy one does, so
// there's a reason to actually remember rather than brute-force it.
//
// Pure DOM/React, same modal shell as TicTacToe.

const FACES = ["React", "Next", "R3F", "FastAPI", "Postgres", "Claude"] as const;
const PERFECT_TURNS = FACES.length * 2; // fewest turns a flawless game can take
const FLIP_BACK_MS = 900;

type Card = { id: number; face: string; done: boolean };

function deal(): Card[] {
  const cards = [...FACES, ...FACES].map((face, id) => ({ id, face, done: false }));
  // Fisher–Yates.
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export default function MemoryMatch({ onClose }: { onClose: () => void }) {
  const [cards, setCards] = useState<Card[]>(deal);
  const [open, setOpen] = useState<number[]>([]); // indices currently face-up
  const [turns, setTurns] = useState(0);
  // "Already announced this board" latch. A ref, not state: nothing renders it,
  // and setting it from the win effect would be a cascading render.
  const scored = useRef(false);

  const won = useMemo(() => cards.every((c) => c.done), [cards]);
  const locked = open.length >= 2;

  const reset = useCallback(() => {
    setCards(deal());
    setOpen([]);
    setTurns(0);
    scored.current = false;
  }, []);

  const flip = (i: number) => {
    if (locked || won) return;
    if (cards[i].done || open.includes(i)) return;
    // Turning the second card is what completes a turn — count it here, in the
    // event that caused it, rather than from the resolve effect below.
    if (open.length === 1) setTurns((t) => t + 1);
    setOpen((o) => (o.length < 2 ? [...o, i] : o));
  };

  // Resolve a pair once two cards are showing: keep them if they match,
  // otherwise turn both back after a beat so there's time to memorise them.
  useEffect(() => {
    if (open.length !== 2) return;
    const [a, b] = open;
    if (cards[a].face === cards[b].face) {
      const t = setTimeout(() => {
        setCards((cs) => cs.map((c, i) => (i === a || i === b ? { ...c, done: true } : c)));
        setOpen([]);
      }, 320);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setOpen([]), FLIP_BACK_MS);
    return () => clearTimeout(t);
  }, [open, cards]);

  // Announce once, when the board is cleared.
  useEffect(() => {
    if (!won || scored.current) return;
    scored.current = true;
    pushToast(
      turns <= PERFECT_TURNS
        ? "Flawless memory!"
        : `Board cleared in ${turns} turns.`,
      "board",
    );
    celebrate(turns <= PERFECT_TURNS); // a flawless board earns the big routine
    markGame("match", "won"); // clearing the board IS the win condition here
    track("game_result", { game: "match", result: "won", turns });
  }, [won, turns]);

  const status = won
    ? `Cleared in ${turns} turns.`
    : `${cards.filter((c) => c.done).length / 2} of ${FACES.length} pairs · ${turns} turns`;

  return (
    <div className="jrnModalWrap" role="dialog" aria-modal="true" aria-label="Stack match">
      <div className="jrnModalBackdrop" onClick={onClose} />
      <div className="jrnModal">
        <button className="jrnPanelClose" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="jrnEyebrow">Rest stop</div>
        <h3 className="jrnModalTitle">Stack match</h3>
        <p className="jrnTtStatus" data-win={won ? "1" : undefined}>
          {status}
        </p>
        <div className="jrnMatchGrid" data-locked={locked ? "1" : undefined}>
          {cards.map((c, i) => {
            const face = c.done || open.includes(i);
            return (
              <button
                key={c.id}
                className="jrnMatchCard"
                data-face={face ? "1" : undefined}
                data-done={c.done ? "1" : undefined}
                onClick={() => flip(i)}
                disabled={face || locked || won}
                aria-label={face ? c.face : "face-down card"}
              >
                {face ? c.face : "❄"}
              </button>
            );
          })}
        </div>
        <div className="jrnTtActions">
          <button className="jrnTtBtn" onClick={reset}>
            {won ? "Deal again" : "Shuffle"}
          </button>
          <button className="jrnTtBtn ghost" onClick={onClose}>
            Back to the trail
          </button>
        </div>
      </div>
    </div>
  );
}
