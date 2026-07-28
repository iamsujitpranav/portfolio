import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MemoryMatch from "./MemoryMatch";

const toasts = vi.hoisted(() => [] as string[]);
const celebrations = vi.hoisted(() => [] as boolean[]);
vi.mock("@/lib/journey/game", () => ({
  pushToast: (text: string) => toasts.push(text),
  celebrate: (big: boolean) => celebrations.push(big),
}));

const grid = () => document.querySelector(".jrnMatchGrid") as HTMLElement;
const cards = () => Array.from(grid().querySelectorAll("button")) as HTMLButtonElement[];
const faceOf = (card: HTMLButtonElement) => card.textContent ?? "";
const isDown = (card: HTMLButtonElement) => faceOf(card) === "❄";
const status = () => document.querySelector(".jrnTtStatus")!.textContent ?? "";
const turnCount = () => Number(/(\d+) turns/.exec(status())?.[1] ?? -1);

// The deal is a Fisher–Yates shuffle over Math.random(). Pinning it to 0 makes
// every swap `cards[i] <-> cards[0]`, which lands the twelve cards in a fixed
// order — so the test knows, without peeking, that slot 0 and slot 6 hold a
// matching pair and slot 0 and slot 1 do not. Each test asserts that
// assumption before relying on it, so a change to the deal fails loudly.
const PAIR = [0, 6] as const;
const MISMATCH = [0, 1] as const;

beforeEach(() => {
  toasts.length = 0;
  celebrations.length = 0;
  vi.spyOn(Math, "random").mockReturnValue(0);
});

describe("MemoryMatch", () => {
  it("deals twelve face-down cards", () => {
    render(<MemoryMatch onClose={() => {}} />);

    expect(cards()).toHaveLength(12);
    expect(within(grid()).getAllByLabelText("face-down card")).toHaveLength(12);
    expect(status()).toContain("0 of 6 pairs");
    expect(turnCount()).toBe(0);
  });

  it("turning one card reveals it but doesn't spend a turn", async () => {
    const user = userEvent.setup();
    render(<MemoryMatch onClose={() => {}} />);

    await user.click(cards()[0]);

    expect(isDown(cards()[0])).toBe(false);
    expect(turnCount()).toBe(0);
  });

  it("counts exactly one turn per pair of cards turned", async () => {
    const user = userEvent.setup();
    render(<MemoryMatch onClose={() => {}} />);

    await user.click(cards()[MISMATCH[0]]);
    await user.click(cards()[MISMATCH[1]]);

    // One turn — not two, and not one per re-render while the pair resolves.
    expect(turnCount()).toBe(1);
  });

  it("keeps a matched pair face-up and scores the pair", async () => {
    const user = userEvent.setup();
    render(<MemoryMatch onClose={() => {}} />);
    const [a, b] = PAIR;

    await user.click(cards()[a]);
    await user.click(cards()[b]);
    expect(faceOf(cards()[a])).toBe(faceOf(cards()[b])); // the deal really is a pair

    await waitFor(() => {
      expect(cards()[a].dataset.done).toBe("1");
      expect(cards()[b].dataset.done).toBe("1");
    });
    expect(status()).toContain("1 of 6 pairs");
    expect(turnCount()).toBe(1);
  });

  it("turns a mismatched pair back over after a beat", async () => {
    const user = userEvent.setup();
    render(<MemoryMatch onClose={() => {}} />);
    const [a, b] = MISMATCH;

    await user.click(cards()[a]);
    await user.click(cards()[b]);
    expect(faceOf(cards()[a])).not.toBe(faceOf(cards()[b])); // really a mismatch

    await waitFor(
      () => {
        expect(isDown(cards()[a])).toBe(true);
        expect(isDown(cards()[b])).toBe(true);
      },
      { timeout: 3000 },
    );
    expect(status()).toContain("0 of 6 pairs");
  });

  it("ignores a third card while two are showing", async () => {
    const user = userEvent.setup();
    render(<MemoryMatch onClose={() => {}} />);

    await user.click(cards()[0]);
    await user.click(cards()[1]);
    await user.click(cards()[2]);

    expect(isDown(cards()[2])).toBe(true);
    expect(cards()[2]).toBeDisabled();
  });

  it("clearing the board announces it exactly once", async () => {
    const user = userEvent.setup();
    render(<MemoryMatch onClose={() => {}} />);

    // With the pinned deal, slot i pairs with slot i+6.
    for (let i = 0; i < 6; i++) {
      await user.click(cards()[i]);
      await user.click(cards()[i + 6]);
      await waitFor(() => expect(cards()[i].dataset.done).toBe("1"));
    }

    expect(status()).toContain("Cleared in 6 turns");
    expect(toasts).toEqual(["Flawless memory!"]);
    expect(celebrations).toEqual([true]); // a flawless board earns the big routine

    // The latch must not re-fire on later re-renders.
    await new Promise((r) => setTimeout(r, 250));
    expect(toasts).toHaveLength(1);
  });

  it("reshuffles and resets the counter", async () => {
    const user = userEvent.setup();
    render(<MemoryMatch onClose={() => {}} />);

    await user.click(cards()[MISMATCH[0]]);
    await user.click(cards()[MISMATCH[1]]);
    expect(turnCount()).toBe(1);

    await user.click(screen.getByRole("button", { name: "Shuffle" }));

    expect(turnCount()).toBe(0);
    expect(status()).toContain("0 of 6 pairs");
  });

  it("closes from the button and the backdrop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<MemoryMatch onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(container.querySelector(".jrnModalBackdrop")!);

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
