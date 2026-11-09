import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminGate from "./AdminGate";
import ResumeActivityDashboard from "./ResumeActivityDashboard";
import type { ResumeActivityPayload } from "@/lib/adminAnalytics";

const TOKEN_KEY = "sujit.admin.token";

function samplePayload(over: Partial<ResumeActivityPayload> = {}): ResumeActivityPayload {
  return {
    summary: {
      total_downloads: 14,
      total_views: 42,
      unique_ips: 9,
      days: 30,
    },
    recent: [
      {
        id: 1,
        action: "download_pdf",
        section: "full_pdf",
        ip_address: "142.250.190.46",
        city: "Mountain View",
        region: "California",
        country: "United States",
        country_code: "US",
        org: "Google LLC",
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        referer: "https://www.linkedin.com/in/sujitpranav",
        created_at: "2026-11-09T10:30:00Z",
      },
      {
        id: 2,
        action: "view_online",
        section: "experience",
        ip_address: "203.0.113.195",
        city: "Bengaluru",
        region: "Karnataka",
        country: "India",
        country_code: "IN",
        org: "Amazon Data Services",
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        referer: "",
        created_at: "2026-11-09T10:15:00Z",
      },
    ],
    top_countries: [
      { country: "United States", country_code: "US", count: 18 },
      { country: "India", country_code: "IN", count: 12 },
    ],
    top_cities: [
      { city: "Mountain View", country: "United States", count: 10 },
      { city: "Bengaluru", country: "India", count: 8 },
    ],
    top_orgs: [
      { org: "Google LLC", count: 10, unique_ips: 4 },
      { org: "Amazon Data Services", count: 8, unique_ips: 3 },
    ],
    by_day: [
      { day: "2026-11-08", downloads: 5, views: 15, total: 20 },
      { day: "2026-11-09", downloads: 9, views: 27, total: 36 },
    ],
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

describe("ResumeActivityDashboard", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.sessionStorage.setItem(TOKEN_KEY, "fake.jwt.token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders loading state then displays summary metrics", async () => {
    stubFetch([200, samplePayload()]);

    render(
      <AdminGate title="Résumé Activity">
        <ResumeActivityDashboard />
      </AdminGate>,
    );

    expect(screen.getByText(/loading résumé activity/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Total Downloads")).toBeInTheDocument();
    });

    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("renders organization and location sections", async () => {
    stubFetch([200, samplePayload()]);

    render(
      <AdminGate title="Résumé Activity">
        <ResumeActivityDashboard />
      </AdminGate>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Google LLC").length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getAllByText("Amazon Data Services").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("United States").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("India").length).toBeGreaterThanOrEqual(1);
  });

  it("renders live access log with caller IPs and actions", async () => {
    stubFetch([200, samplePayload()]);

    render(
      <AdminGate title="Résumé Activity">
        <ResumeActivityDashboard />
      </AdminGate>,
    );

    await waitFor(() => {
      expect(screen.getByText("142.250.190.46")).toBeInTheDocument();
    });

    expect(screen.getByText("203.0.113.195")).toBeInTheDocument();
    expect(screen.getByText("PDF Download")).toBeInTheDocument();
    expect(screen.getByText("Web View")).toBeInTheDocument();
  });

  it("allows switching time ranges", async () => {
    const fetchMock = stubFetch(
      [200, samplePayload()],
      [200, samplePayload({ summary: { total_downloads: 3, total_views: 7, unique_ips: 2, days: 7 } })],
    );

    render(
      <AdminGate title="Résumé Activity">
        <ResumeActivityDashboard />
      </AdminGate>,
    );

    await waitFor(() => {
      expect(screen.getByText("14")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const btn7d = screen.getByRole("button", { name: "7d" });
    await user.click(btn7d);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("days=7"),
        expect.anything(),
      );
    });
  });
});
