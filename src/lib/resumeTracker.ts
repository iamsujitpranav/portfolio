/**
 * Client-side resume activity tracker.
 *
 * Emits non-blocking beacons when visitors/recruiters interact with the resume
 * (viewing online sections, clicking download buttons, or chatting with AskResume).
 */

type ResumeAction = "download_click" | "view_online" | "view_section" | "ask_chat";

export function trackResumeActivity(action: ResumeAction, section?: string, referer?: string): void {
  if (typeof window === "undefined") return;

  try {
    let sessionId: string | undefined;
    try {
      sessionId = window.sessionStorage.getItem("sujit.journey.sid") ?? undefined;
    } catch {
      // Ignore private mode restriction
    }

    const payload = JSON.stringify({
      action,
      section: section || undefined,
      session_id: sessionId,
      referer: referer || (typeof document !== "undefined" ? document.referrer : undefined),
    });

    const endpoint = "/api/resume/track";

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(endpoint, blob)) return;
    }

    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Fire-and-forget: failure must never impact the visitor
    });
  } catch {
    // Non-blocking
  }
}
