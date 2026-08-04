import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AdminAuthError, adminFetch, adminLogin, adminLogout, adminToken } from "./admin";

const KEY = "sujit.admin.token";

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("logging in", () => {
  it("stores the minted token for the tab", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, { token: "tok", expires_in: 60 })));
    await adminLogin("hunter2");
    expect(adminToken()).toBe("tok");
  });

  it("keeps the token out of localStorage — it must die with the tab", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, { token: "tok" })));
    await adminLogin("hunter2");
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBe("tok");
  });

  it("surfaces the server's reason for a refusal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(401, { detail: "invalid password" })));
    await expect(adminLogin("nope")).rejects.toThrow("invalid password");
    expect(adminToken()).toBe("");
  });

  it("falls back to the status when the body isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("gateway down", { status: 502 })));
    await expect(adminLogin("nope")).rejects.toThrow("502");
  });

  it("rejects a 200 that carried no token rather than looking signed in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, { ok: true })));
    await expect(adminLogin("hunter2")).rejects.toThrow(/token/);
    expect(adminToken()).toBe("");
  });

  it("signing out drops the token", () => {
    sessionStorage.setItem(KEY, "tok");
    adminLogout();
    expect(adminToken()).toBe("");
  });
});

describe("calling an admin endpoint", () => {
  it("sends the token as a bearer header", async () => {
    sessionStorage.setItem(KEY, "tok");
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { range: { sessions: 3 } }));
    vi.stubGlobal("fetch", fetchMock);

    const body = await adminFetch<{ range: { sessions: number } }>("/api/admin/analytics");

    expect(body.range.sessions).toBe(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/analytics");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(init.cache).toBe("no-store");
  });

  it("refuses to call at all without a token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(adminFetch("/api/admin/analytics")).rejects.toBeInstanceOf(AdminAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws away a spent token and asks for a login, not an error banner", async () => {
    sessionStorage.setItem(KEY, "stale");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(401, { detail: "session expired" })));

    await expect(adminFetch("/api/admin/analytics")).rejects.toBeInstanceOf(AdminAuthError);
    expect(adminToken()).toBe("");
  });

  it("keeps the token when the failure was the server's, not the session's", async () => {
    sessionStorage.setItem(KEY, "tok");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(503, { detail: "database is not configured" })));

    await expect(adminFetch("/api/admin/analytics")).rejects.toThrow("database is not configured");
    expect(adminToken()).toBe("tok");
  });
});
