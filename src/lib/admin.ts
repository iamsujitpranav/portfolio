// Admin session for the browser: log in once, hold the token, send it along.
//
// The token is a signed, time-limited blob minted by POST /api/admin/login. It
// lives in sessionStorage rather than localStorage on purpose — an admin token
// should not outlive the tab it was typed into, and the cost of that choice is
// one password entry per session.
//
// Everything here is browser-only ("use client" callers). Storage access is
// wrapped because Safari private mode throws on it rather than returning null.

const TOKEN_KEY = "sujit.admin.token";

export class AdminAuthError extends Error {}

function read(): string {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function write(token: string): void {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — the caller keeps the token in memory for this page */
  }
}

export function adminToken(): string {
  return typeof window === "undefined" ? "" : read();
}

export function adminLogout(): void {
  write("");
}

/** Exchange the password for a token, and remember it. */
export async function adminLogin(password: string): Promise<void> {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    throw new Error(await detail(res));
  }
  const body: { token?: string } = await res.json();
  if (!body.token) throw new Error("the server did not return a session token");
  write(body.token);
}

/**
 * GET an admin endpoint as JSON.
 *
 * A 401 means the stored token is spent — it is dropped and reported as an
 * AdminAuthError so the caller shows the login form again rather than an error
 * banner about a session the visitor can't do anything about.
 */
export async function adminFetch<T>(path: string): Promise<T> {
  const token = adminToken();
  if (!token) throw new AdminAuthError("not signed in");

  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) {
    adminLogout();
    throw new AdminAuthError(await detail(res));
  }
  if (!res.ok) throw new Error(await detail(res));
  return (await res.json()) as T;
}

/** FastAPI puts the human-readable reason in `detail`; fall back to the status. */
async function detail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    /* not JSON — the status line is all we have */
  }
  return `request failed (${res.status})`;
}
