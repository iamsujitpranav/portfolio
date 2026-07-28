import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TicTacToe from "./TicTacToe";

// The trail's toast/confetti bus is a side effect of a finished game, not part
// of the game — spy on it rather than running the real thing.
const toasts = vi.hoisted(() => [] as { text: string }[]);
const celebrations = vi.hoisted(() => [] as boolean[]);
vi.mock("@/lib/journey/game", () => ({
  pushToast: (text: string) => toasts.push({ text }),
  celebrate: (big: boolean) => celebrations.push(big),
}));

const cell = (n: number) => screen.getByRole("button", { name: new RegExp(`^cell ${n}\\b`) });

/** Click a cell and let the AI take its (delayed) reply. */
async function playAndWaitForAI(user: ReturnType<typeof userEvent.setup>, n: number) {
  await user.click(cell(n));
  await waitFor(() => expect(screen.queryByText("Thinking…")).not.toBeInTheDocument(), {
    timeout: 3000,
  });
}

// The AI blunders on purpose 16% of the time ("the crack a good player can slip
// a win through"), so every test pins Math.random: 0.9 = play it straight,
// anything under 0.16 = force the blunder branch.
const PLAYS_STRAIGHT = 0.9;
const FORCES_BLUNDER = 0.05;

beforeEach(() => {
  toasts.length = 0;
  celebrations.length = 0;
  vi.spyOn(Math, "random").mockReturnValue(PLAYS_STRAIGHT);
});

describe("TicTacToe", () => {
  it("opens with an empty board and the player to move", () => {
    render(<TicTacToe onClose={() => {}} />);

    expect(screen.getByText("Your move — you're ✕")).toBeInTheDocument();
    for (let i = 1; i <= 9; i++) expect(cell(i)).toHaveTextContent("");
  });

  it("marks the clicked cell with X and hands over to the AI", async () => {
    const user = userEvent.setup();
    render(<TicTacToe onClose={() => {}} />);

    await user.click(cell(5));

    expect(cell(5)).toHaveTextContent("X");
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("lets the AI reply, so a taken cell can't be reused", async () => {
    const user = userEvent.setup();
    render(<TicTacToe onClose={() => {}} />);

    await playAndWaitForAI(user, 1);

    const marks = Array.from({ length: 9 }, (_, i) => cell(i + 1).textContent).filter(Boolean);
    expect(marks).toHaveLength(2); // one X, one O
    expect(cell(1)).toBeDisabled();
  });

  it("answers an opening corner with the center when playing straight", async () => {
    const user = userEvent.setup();
    render(<TicTacToe onClose={() => {}} />);

    await playAndWaitForAI(user, 1); // top-left

    expect(cell(5)).toHaveTextContent("O"); // the only non-losing reply
  });

  it("blunders into a plain legal move on its off day", async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, "random").mockReturnValue(FORCES_BLUNDER);
    render(<TicTacToe onClose={() => {}} />);

    await playAndWaitForAI(user, 1);

    // The blunder branch takes the first open cell instead of the center —
    // that's the opening a good player can exploit.
    expect(cell(2)).toHaveTextContent("O");
    expect(cell(5)).toHaveTextContent("");
  });

  it("can't be beaten by greedy play when it isn't blundering", async () => {
    const user = userEvent.setup();
    render(<TicTacToe onClose={() => {}} />);

    // Play into the first free cell each turn until the game resolves.
    for (let round = 0; round < 5; round++) {
      const firstFree = Array.from({ length: 9 }, (_, i) => i + 1).find(
        (n) => !(cell(n) as HTMLButtonElement).disabled,
      );
      if (firstFree === undefined) break;
      await playAndWaitForAI(user, firstFree);
      if (screen.queryByText(/draw|AI wins|You win/)) break;
    }

    await waitFor(() => expect(screen.getByText(/draw|The AI wins\./)).toBeInTheDocument());
    expect(screen.queryByText("You win! 🎉")).not.toBeInTheDocument();
  });

  it("announces the result exactly once", async () => {
    const user = userEvent.setup();
    render(<TicTacToe onClose={() => {}} />);

    for (let round = 0; round < 5; round++) {
      const firstFree = Array.from({ length: 9 }, (_, i) => i + 1).find(
        (n) => !(cell(n) as HTMLButtonElement).disabled,
      );
      if (firstFree === undefined) break;
      await playAndWaitForAI(user, firstFree);
      if (screen.queryByText(/draw|AI wins|You win/)) break;
    }

    await waitFor(() => expect(toasts.length).toBeGreaterThan(0), { timeout: 5000 });
    // The announce latch must not re-fire on later re-renders.
    await new Promise((r) => setTimeout(r, 250));
    expect(toasts).toHaveLength(1);
  });

  it("clears the board and re-arms the announcement on restart", async () => {
    const user = userEvent.setup();
    render(<TicTacToe onClose={() => {}} />);

    await playAndWaitForAI(user, 1);
    await user.click(screen.getByRole("button", { name: /Restart|Play again/ }));

    for (let i = 1; i <= 9; i++) expect(cell(i)).toHaveTextContent("");
    expect(screen.getByText("Your move — you're ✕")).toBeInTheDocument();
  });

  it("closes from both the button and the backdrop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<TicTacToe onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(container.querySelector(".jrnModalBackdrop")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
