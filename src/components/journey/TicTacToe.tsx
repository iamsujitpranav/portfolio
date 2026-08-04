"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pushToast, celebrate } from "@/lib/journey/game";
import { markGame } from "@/lib/journey/passport";
import { track } from "@/lib/journey/analytics";

// A rest-stop diversion: tic-tac-toe against the résumé's "AI". The opponent
// plays minimax (so it never loses to a careless move) but blunders a small
// fraction of the time, leaving a sharp player a real chance to win — which is
// more fun than a truly unbeatable board. Pure DOM/React; opened from the 3D
// kiosk (GameKiosk.tsx) via the shared `game.modal` flag.

type Cell = "X" | "O" | null;
type Board = Cell[];

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6], // diagonals
];

function winner(b: Board): Cell | "draw" | null {
  for (const [a, c, d] of LINES) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return b.every(Boolean) ? "draw" : null;
}

// Minimax score for the O (AI) player. + favours O, − favours X.
function minimax(b: Board, turn: "X" | "O"): number {
  const w = winner(b);
  if (w === "O") return 10;
  if (w === "X") return -10;
  if (w === "draw") return 0;
  const scores: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    scores.push(minimax(b, turn === "O" ? "X" : "O"));
    b[i] = null;
  }
  return turn === "O" ? Math.max(...scores) : Math.min(...scores);
}

// The AI's move. Optimal by minimax, but with a small chance it plays a random
// legal move instead — the crack a good player can slip a win through.
function aiMove(b: Board): number {
  const open = b.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
  if (open.length === 0) return -1;
  const BLUNDER = 0.16;
  if (Math.random() < BLUNDER) return open[Math.floor(Math.random() * open.length)];
  let best = -Infinity;
  let move = open[0];
  for (const i of open) {
    b[i] = "O";
    const s = minimax(b, "X");
    b[i] = null;
    if (s > best) {
      best = s;
      move = i;
    }
  }
  return move;
}

export default function TicTacToe({ onClose }: { onClose: () => void }) {
  const [board, setBoard] = useState<Board>(() => Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X"); // player is always X, moves first
  // "Already announced this game" latch. A ref, not state: nothing renders it,
  // and setting it from the announce effect would be a cascading render.
  const scored = useRef(false);
  const result = useMemo(() => winner(board), [board]);

  const reset = useCallback(() => {
    setBoard(Array(9).fill(null));
    setTurn("X");
    scored.current = false;
  }, []);

  const play = useCallback(
    (i: number) => {
      if (board[i] || turn !== "X" || result) return;
      const next = board.slice();
      next[i] = "X";
      setBoard(next);
      setTurn("O");
    },
    [board, turn, result],
  );

  // The AI replies a beat after the player, so the move reads as deliberate.
  useEffect(() => {
    if (turn !== "O" || result) return;
    const t = setTimeout(() => {
      setBoard((b) => {
        if (winner(b)) return b;
        const m = aiMove(b.slice());
        if (m < 0) return b;
        const next = b.slice();
        next[m] = "O";
        return next;
      });
      setTurn("X");
    }, 380);
    return () => clearTimeout(t);
  }, [turn, result]);

  // Announce (once) when a game resolves.
  useEffect(() => {
    if (!result || scored.current) return;
    scored.current = true;
    if (result === "X") {
      pushToast("You beat the AI!", "board");
      celebrate(true); // beating the minimax deserves the breakdance
    } else if (result === "draw") {
      pushToast("Stalemate — well played.", "board");
    } else {
      pushToast("The AI takes it. Try again?", "board");
    }
    // A draw against a perfect minimax is the best an optimal player can do, so
    // it earns the stamp too; only a loss leaves the kiosk merely "played".
    markGame("tictactoe", result === "O" ? "played" : "won");
    track("game_result", { game: "tictactoe", result });
  }, [result]);

  const status =
    result === "X"
      ? "You win! 🎉"
      : result === "O"
        ? "The AI wins."
        : result === "draw"
          ? "It's a draw."
          : turn === "X"
            ? "Your move — you're ✕"
            : "Thinking…";

  return (
    <div className="jrnModalWrap" role="dialog" aria-modal="true" aria-label="Tic-tac-toe">
      <div className="jrnModalBackdrop" onClick={onClose} />
      <div className="jrnModal jrnTtt">
        <button className="jrnPanelClose" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="jrnEyebrow">Rest stop</div>
        <h3 className="jrnModalTitle">Tic-tac-toe</h3>
        <p className="jrnTtStatus" data-win={result === "X" ? "1" : undefined}>
          {status}
        </p>
        <div className="jrnBoard" data-locked={result || turn === "O" ? "1" : undefined}>
          {board.map((c, i) => (
            <button
              key={i}
              className="jrnCell"
              data-mark={c ?? undefined}
              onClick={() => play(i)}
              disabled={!!c || !!result || turn === "O"}
              aria-label={`cell ${i + 1}${c ? `, ${c}` : ""}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="jrnTtActions">
          <button className="jrnTtBtn" onClick={reset}>
            {result ? "Play again" : "Restart"}
          </button>
          <button className="jrnTtBtn ghost" onClick={onClose}>
            Back to the trail
          </button>
        </div>
      </div>
    </div>
  );
}
