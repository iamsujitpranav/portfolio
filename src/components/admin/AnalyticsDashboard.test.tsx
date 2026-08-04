import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminGate from "./AdminGate";
import AnalyticsDashboard from "./AnalyticsDashboard";
import type { AnalyticsPayload } from "@/lib/adminAnalytics";

const TOKEN_KEY = "sujit.admin.token";

/** A payload with every panel populated, so a render exercises all of them. */
function payload(over: Partial<AnalyticsPayload> = {}): AnalyticsPayload {
  return {
    range: { days: 30, sessions: 10, events: 120, truncated: false },
    funnel: [
      { step: "landed", label: "Opened the site", sessions: 10, pct: 100 },
      { step: "capable", label: "Device could run the 3D world", sessions: 8, pct: 80 },
      { step: "started", label: "Entered the journey", sessions: 6, pct: 60 },
      { step: "ready", label: "World finished loading", sessions: 5, pct: 50 },
      { step: "explored", label: "Opened a stop or a landmark board", sessions: 3, pct: 30 },
      { step: "contact", label: "Reached Contact", sessions: 1, pct: 10 },
    ],
    gate: {
      seen: 10,
      blocked: 2,
      reasons: [{ id: "coarse", label: "Touch / coarse pointer", count: 2 }],
    },
    stops: [{ id: "skills", count: 4, sessions: 3, walk: 3, teleport: 1 }],
    displays: [{ id: "foundry", count: 2, sessions: 2 }],
    tour: {
      started: 4,
      completed: 1,
      abandoned: 3,
      beats: [
        { beat: 1, id: "start", count: 4 },
        { beat: 2, id: "thesis", count: 1 },
      ],
    },
    games: [{ id: "tictactoe", opens: 3, won: 2, lost: 1, draw: 0 }],
    secrets: [{ id: "stack", count: 2 }],
    ask: {
      opened: 5,
      questions: 4,
      voice: 1,
      routed: 2,
      walked: 1,
      destinations: [{ id: "foundry", count: 2 }],
      questions_enabled: false,
      recent: [],
    },
    engagement: {
      median_seconds: 252,
      buckets: [{ label: "2–5m", sessions: 6 }],
      returning: 3,
      new: 7,
      by_day: [
        { day: "2026-08-01", sessions: 4, events: 40 },
        { day: "2026-08-03", sessions: 6, events: 80 },
      ],
    },
    travel_modes: [{ mode: "walk", count: 9 }],
    exits: { to_classic: 2, targets: [{ hash: "#projects", count: 2 }] },
    events: [{ name: "world_ready", count: 5, sessions: 5 }],
    ...over,
  };
}

function stubFetch(...responses: Array<[number, unknown]>) {
  const mock = vi.fn();
  for (const [status, body] of responses) {
    mock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** The dashboard only renders inside the gate — it needs the session context. */
function renderDashboard() {
  return render(
    <AdminGate title="Journey analytics">
      <AnalyticsDashboard />
    </AdminGate>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("the password wall", () => {
  it("shows the form when there is no session", async () => {
    stubFetch();
    renderDashboard();
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByText("The funnel")).not.toBeInTheDocument();
  });

  it("logs in and loads the dashboard", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch([200, { token: "tok", expires_in: 60 }], [200, payload()]);
    renderDashboard();

    await user.type(await screen.findByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("The funnel")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/analytics?days=30");
  });

  it("reports a refused password without pretending to be signed in", async () => {
    const user = userEvent.setup();
    stubFetch([401, { detail: "invalid password" }]);
    renderDashboard();

    await user.type(await screen.findByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("invalid password")).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("drops back to the form when the stored token has expired", async () => {
    sessionStorage.setItem(TOKEN_KEY, "stale");
    stubFetch([401, { detail: "session expired — log in again" }]);
    renderDashboard();

    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("shows a real backend failure as an error, keeping the session", async () => {
    sessionStorage.setItem(TOKEN_KEY, "tok");
    stubFetch([503, { detail: "database is not configured" }]);
    renderDashboard();

    expect(await screen.findByText(/database is not configured/)).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe("tok");
  });
});

describe("the dashboard", () => {
  beforeEach(() => {
    sessionStorage.setItem(TOKEN_KEY, "tok");
  });

  it("leads with the numbers worth knowing", async () => {
    stubFetch([200, payload()]);
    renderDashboard();

    const kpi = (label: string) =>
      within(
        screen.getByText(label, { selector: ".admKpiLabel" }).closest(".admKpi") as HTMLElement,
      );
    await screen.findByText("The funnel");

    expect(kpi("Sessions").getByText("10")).toBeInTheDocument();
    expect(kpi("Median visit").getByText("4m 12s")).toBeInTheDocument();
    expect(kpi("Reached the world").getByText("50%")).toBeInTheDocument(); // 5 of 10
    expect(kpi("Came back").getByText("7 first-time")).toBeInTheDocument();
  });

  it("says where each funnel step lost people", async () => {
    stubFetch([200, payload()]);
    renderDashboard();

    const funnel = within((await screen.findByText("The funnel")).closest("section")!);
    // 10 → 8 → 6 → 5 → 3 → 1: five drops, and the first step never has one.
    expect(funnel.getAllByText(/lost here/)).toHaveLength(5);
    expect(funnel.getAllByText(/−2 lost here/)).toHaveLength(4);
    // The drop is a share of the step ABOVE, not of arrivals: 1 of 6, not 1 of 10.
    expect(funnel.getByText(/−1 lost here \(16\.7% of the step above\)/)).toBeInTheDocument();
  });

  it("names ids the backend never knew — labels live in the world modules", async () => {
    stubFetch([200, payload()]);
    renderDashboard();

    const panel = within((await screen.findByText("Where visitors went")).closest("section")!);
    expect(panel.getByText("Skills")).toBeInTheDocument(); // stop id "skills"

    const boards = within(screen.getByText("What visitors read").closest("section")!);
    expect(boards.getByText("The Foundry")).toBeInTheDocument(); // landmark id "foundry"

    expect(screen.getByText("Tic-tac-toe kiosk")).toBeInTheDocument();
    expect(screen.getByText(/Beat 2 — Career Snapshot/)).toBeInTheDocument();
  });

  it("shows what has NEVER been opened, not just what has", async () => {
    // The finding is the board nobody reached; a list of only what happened
    // hides it entirely.
    stubFetch([200, payload()]);
    renderDashboard();

    const panel = (await screen.findByText("Where visitors went")).closest("section")!;
    expect(within(panel).getByText("4 opens")).toBeInTheDocument(); // Skills
    expect(within(panel).getAllByText("never").length).toBeGreaterThan(0);
  });

  it("explains an empty questions panel instead of leaving a blank", async () => {
    stubFetch([200, payload()]);
    renderDashboard();

    await screen.findByText("What they asked");
    expect(screen.getByText(/ANALYTICS_QUESTIONS=1/)).toBeInTheDocument();
  });

  it("lists stored questions newest-first when they are being kept", async () => {
    const data = payload();
    data.ask.questions_enabled = true;
    data.ask.recent = [
      { text: "does he know Rails?", at: "2026-08-03T10:00:00Z" },
      { text: "is he open to remote?", at: "2026-08-02T10:00:00Z" },
    ];
    stubFetch([200, data]);
    renderDashboard();

    expect(await screen.findByText("does he know Rails?")).toBeInTheDocument();
    expect(screen.queryByText(/ANALYTICS_QUESTIONS=1/)).not.toBeInTheDocument();
  });

  it("fills the gap days so a quiet day reads as quiet, not as missing", async () => {
    stubFetch([200, payload()]);
    renderDashboard();

    await screen.findByText("Sessions by day");
    // 1 Aug and 3 Aug came back; 2 Aug is drawn as zero rather than skipped.
    expect(screen.getByTitle("2026-08-02 — 0 sessions")).toBeInTheDocument();
    expect(screen.getByTitle("2026-08-01 — 4 sessions")).toBeInTheDocument();
  });

  it("refetches when the range changes", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch([200, payload()], [200, payload({ range: { days: 7, sessions: 2, events: 9, truncated: false } })]);
    renderDashboard();

    await screen.findByText("The funnel");
    await user.click(screen.getByRole("button", { name: "7d" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/analytics?days=7");
  });

  it("says so plainly when nothing has been recorded yet", async () => {
    stubFetch([200, payload({ range: { days: 30, sessions: 0, events: 0, truncated: false } })]);
    renderDashboard();

    expect(await screen.findByText(/No events in the last 30 days/)).toBeInTheDocument();
    expect(screen.queryByText("The funnel")).not.toBeInTheDocument();
  });

  it("warns when the window was too big to aggregate honestly", async () => {
    stubFetch([200, payload({ range: { days: 365, sessions: 10, events: 200000, truncated: true } })]);
    renderDashboard();

    expect(await screen.findByText(/only the earliest part/)).toBeInTheDocument();
  });

  it("signs out on demand", async () => {
    const user = userEvent.setup();
    stubFetch([200, payload()]);
    renderDashboard();

    await screen.findByText("The funnel");
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
