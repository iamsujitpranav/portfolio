import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResumeVersionManager from "./ResumeVersionManager";
import type { ResumeData, ResumeVersionDetail, ResumeVersionSummary } from "@/lib/resumeTypes";

const TOKEN_KEY = "sujit.admin.token";

const mockResumeData: ResumeData = {
  profile: {
    name: "Sujit Pranav Reddy",
    title: "Engineering Head",
    yearsExperience: 12,
    yearsAI: 5,
    location: "Hyderabad, India",
    email: "contact@sujitpranavreddy.dev",
    website: "https://www.sujitpranavreddy.dev",
    linkedin: "https://www.linkedin.com/in/sujitpranav",
    github: "https://github.com/iamsujitpranav",
    phone: "+91 7989393646",
    summary: "Engineering leader with 12+ years...",
    openTo: "Open to Engineering Leadership",
    education: "B.Tech, JNTU Hyderabad",
    languages: ["English", "Telugu"],
    dateOfBirth: "6th February 1991",
    hobbies: ["Scuba Diving", "Cricket"],
    maritalStatus: "Married",
  },
  metrics: [{ value: "12+", label: "years engineering" }],
  highlights: [{ title: "Technical direction", text: "Sets architecture for whole products." }],
  experience: [
    {
      role: "Engineering Head",
      company: "Arccaa",
      period: "Oct 2025 - present",
      now: true,
      summary: "Built and run engineering...",
      projects: [{ name: "ATS", summary: "Multi-tenant recruitment platform." }],
      stack: ["Ruby on Rails 8", "FastAPI"],
    },
  ],
  sideProjects: [{ name: "AI Assistant", summary: "Chat assistant on portfolio", stack: ["FastAPI", "Next.js"] }],
  skillGroups: [{ title: "Languages", star: ["Ruby", "Python"], skills: ["TypeScript", "Go"] }],
};

const mockVersions: ResumeVersionSummary[] = [
  {
    id: "v1",
    versionNumber: 1,
    label: "V1_#+91 7989393646_contact@sujitpranavreddy.dev",
    createdAt: "2026-11-09T10:00:00Z",
    updatedAt: "2026-11-09T10:00:00Z",
  },
];

const mockVersionDetail: ResumeVersionDetail = {
  id: "v1",
  versionNumber: 1,
  label: "V1_#+91 7989393646_contact@sujitpranavreddy.dev",
  createdAt: "2026-11-09T10:00:00Z",
  updatedAt: "2026-11-09T10:00:00Z",
  data: mockResumeData,
};

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem(TOKEN_KEY, "test-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResumeVersionManager", () => {
  it("loads versions and displays the V1_#{phone}_{email} dropdown option", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/admin/resume/versions") return Promise.resolve(reply(mockVersions));
        if (url.includes("/api/admin/resume/versions/v1")) return Promise.resolve(reply(mockVersionDetail));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    render(<ResumeVersionManager />);

    expect(screen.getByText("Loading resume version…")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByDisplayValue("V1_#+91 7989393646_contact@sujitpranavreddy.dev")).toBeInTheDocument();
    });

    // Check preview shows the loaded name
    await waitFor(() => {
      expect(screen.getAllByText("Sujit Pranav Reddy").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Engineering Head").length).toBeGreaterThan(0);
    });
  });

  it("updates live preview immediately in real time when input changes", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/admin/resume/versions") return Promise.resolve(reply(mockVersions));
        if (url.includes("/api/admin/resume/versions/v1")) return Promise.resolve(reply(mockVersionDetail));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    render(<ResumeVersionManager />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Sujit Pranav Reddy")).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue("Sujit Pranav Reddy");
    await user.clear(nameInput);
    await user.type(nameInput, "Jane Doe");

    // Preview should reflect "Jane Doe" in real-time
    expect(screen.getByRole("heading", { name: "Jane Doe" })).toBeInTheDocument();

    // Dirty badge should be visible
    expect(screen.getByText("● Unsaved Changes")).toBeInTheDocument();
  });

  it("updates dropdown label dynamically when phone or email changes", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/admin/resume/versions") return Promise.resolve(reply(mockVersions));
        if (url.includes("/api/admin/resume/versions/v1")) return Promise.resolve(reply(mockVersionDetail));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    render(<ResumeVersionManager />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("+91 7989393646")).toBeInTheDocument();
    });

    const phoneInput = screen.getByDisplayValue("+91 7989393646");
    await user.clear(phoneInput);
    await user.type(phoneInput, "+1 555-0100");

    // Dropdown option should now reflect the updated phone number
    expect(screen.getByText("V1_#+1 555-0100_contact@sujitpranavreddy.dev")).toBeInTheDocument();
  });

  it("saves changes when Save Version is clicked", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/admin/resume/versions") return Promise.resolve(reply(mockVersions));
      if (url.includes("/api/admin/resume/versions/v1") && init?.method === "PUT") {
        const body = JSON.parse(init.body as string);
        return Promise.resolve(
          reply({
            ...mockVersionDetail,
            data: body,
          }),
        );
      }
      if (url.includes("/api/admin/resume/versions/v1")) return Promise.resolve(reply(mockVersionDetail));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ResumeVersionManager />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Sujit Pranav Reddy")).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue("Sujit Pranav Reddy");
    await user.type(nameInput, " Jr.");

    const saveBtn = screen.getByRole("button", { name: "Save Version" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("✓ Saved!")).toBeInTheDocument();
    });

    const putCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("/api/admin/resume/versions/v1") && c[1]?.method === "PUT",
    );
    expect(putCall).toBeDefined();
  });

  it("triggers PDF download when Download Résumé is clicked", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/admin/resume/versions") return Promise.resolve(reply(mockVersions));
      if (url.includes("/api/admin/resume/download/v1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: async () => ({ size: 500 }),
        });
      }
      if (url.includes("/api/admin/resume/versions/v1")) return Promise.resolve(reply(mockVersionDetail));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const createObjectURLMock = vi.fn().mockReturnValue("blob:fake-url");
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    render(<ResumeVersionManager />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Sujit Pranav Reddy")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Download Résumé (PDF)" })).not.toBeDisabled();
    });

    const downloadBtn = screen.getByRole("button", { name: "Download Résumé (PDF)" });
    await user.click(downloadBtn);

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalled();
    });
  });
});
