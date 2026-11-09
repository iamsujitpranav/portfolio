import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AdminAuthError,
  adminDownloadVersionResume,
  adminFetch,
  adminFetchDelete,
  adminFetchPost,
  adminFetchPut,
  adminLogin,
  adminLogout,
  adminToken,
} from "./admin";

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

  it("sends the optional authenticator code when supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { token: "tok" }));
    vi.stubGlobal("fetch", fetchMock);
    await adminLogin("hunter2", "123456");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ password: "hunter2", otp: "123456" });
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

  it("adminFetchPost sends body and Bearer token", async () => {
    sessionStorage.setItem(KEY, "tok");
    const fetchMock = vi.fn().mockResolvedValue(reply(201, { id: "v2" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await adminFetchPost<{ id: string }>("/api/admin/resume/versions", { sourceId: "v1" });
    expect(res.id).toBe("v2");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/resume/versions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ sourceId: "v1" });
  });

  it("adminFetchPut sends body and Bearer token", async () => {
    sessionStorage.setItem(KEY, "tok");
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await adminFetchPut<{ ok: boolean }>("/api/admin/resume/versions/v1", { name: "test" });
    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/resume/versions/v1");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ name: "test" });
  });

  it("adminFetchDelete sends DELETE with Bearer token", async () => {
    sessionStorage.setItem(KEY, "tok");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await adminFetchDelete("/api/admin/resume/versions/v2");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/resume/versions/v2");
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("adminDownloadVersionResume triggers browser download", async () => {
    sessionStorage.setItem(KEY, "tok");
    const fakeBlob = { size: 100 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => fakeBlob,
    });
    vi.stubGlobal("fetch", fetchMock);

    const createObjectURLMock = vi.fn().mockReturnValue("blob:fake-url");
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    await adminDownloadVersionResume("v1", "test.pdf");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/resume/download/v1", {
      headers: { Authorization: "Bearer tok" },
    });
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalled();
  });
});
