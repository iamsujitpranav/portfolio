"use client";

import { createContext, useCallback, useContext, useState, useSyncExternalStore } from "react";
import { adminLogin, adminLogout, adminToken } from "@/lib/admin";

// The password wall in front of everything under /admin.
//
// It renders nothing but the form until a token exists, and hands its children
// a `signOut` so a request that comes back 401 (an expired token — they last a
// week) drops straight back to the form instead of showing an error about a
// session the person can't do anything about.

type Session = { signOut: () => void };

const SessionContext = createContext<Session>({ signOut: () => {} });

/** For anything rendered inside the gate that talks to an admin endpoint. */
export function useAdminSession(): Session {
  return useContext(SessionContext);
}

// sessionStorage doesn't exist while this renders on the server, and reading it
// during the first client render would disagree with the HTML that was sent.
// useSyncExternalStore is how React is told "this value comes from outside and
// the server's answer is no". Nothing pushes changes at us — logging in and out
// both happen inside this component — so the subscription is a no-op and the
// component's own state overrides the stored answer afterwards.
const subscribeNothing = () => () => {};
const hasStoredToken = () => !!adminToken();
const noTokenOnServer = () => false;

export default function AdminGate({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const stored = useSyncExternalStore(subscribeNothing, hasStoredToken, noTokenOnServer);
  // null = "no opinion yet, go by what's in storage".
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const authed = signedIn ?? stored;

  const signOut = useCallback(() => {
    adminLogout();
    setSignedIn(false);
    setPassword("");
    setOtp("");
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await adminLogin(password, otp);
      setPassword("");
      setOtp("");
      setSignedIn(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "login failed");
    } finally {
      setBusy(false);
    }
  };

  if (!authed) {
    return (
      <div className="admLoginWrap">
        <form className="admLogin" onSubmit={submit}>
          <h1>{title}</h1>
          <p className="admLoginSub">Admin only. The session lasts until this tab closes.</p>
          <label className="admField">
            <span>Password</span>
            <input
              type="password"
              value={password}
              autoFocus
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />
          </label>
          <label className="admField">
            <span>Authenticator code (if enabled)</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
            />
          </label>
          {error && <p className="admError">{error}</p>}
          <button type="submit" className="admPrimary" disabled={busy || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return <SessionContext.Provider value={{ signOut }}>{children}</SessionContext.Provider>;
}
