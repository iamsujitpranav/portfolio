import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CountUp from "./CountUp";

// The element is never actually on screen in jsdom, so drive `useInView`
// directly — that's the only thing this component needs from framer-motion.
const inView = vi.hoisted(() => ({ value: true }));
vi.mock("framer-motion", () => ({ useInView: () => inView.value }));

const reduced = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/useReducedMotion", () => ({ useReducedMotion: () => reduced.value }));

beforeEach(() => {
  inView.value = true;
  reduced.value = false;
});

describe("CountUp", () => {
  it("renders a non-numeric value verbatim", () => {
    render(<CountUp value="N/A" />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("splits the number from its unit suffix", async () => {
    reduced.value = true;
    const { container } = render(<CountUp value="40%" />);

    expect(container.querySelector(".n")).toHaveTextContent("40%");
    expect(container.querySelector(".u")).toHaveTextContent("%");
  });

  it("jumps straight to the final value under reduced motion", () => {
    reduced.value = true;
    const { container } = render(<CountUp value="11+" />);

    // No RAF ramp, no waiting: the value is there on the first paint.
    expect(container.querySelector(".n")?.textContent).toBe("11+");
  });

  it("keeps the source precision", () => {
    reduced.value = true;
    const { container } = render(<CountUp value="2.5×" />);
    expect(container.querySelector(".n")?.textContent).toBe("2.5×");
  });

  it("shows 0 under reduced motion until it scrolls into view", () => {
    reduced.value = true;
    inView.value = false;
    const { container } = render(<CountUp value="40%" />);

    expect(container.querySelector(".n")?.textContent).toBe("0%");
  });

  it("animates from 0 up to the target when motion is allowed", async () => {
    const { container } = render(<CountUp value="40%" />);
    expect(container.querySelector(".n")?.textContent).toBe("0%");

    await waitFor(
      () => expect(container.querySelector(".n")?.textContent).toBe("40%"),
      { timeout: 4000 },
    );
  });

  it("stays at 0 while off screen", async () => {
    inView.value = false;
    const { container } = render(<CountUp value="40%" />);

    await new Promise((r) => setTimeout(r, 60));
    expect(container.querySelector(".n")?.textContent).toBe("0%");
  });
});
