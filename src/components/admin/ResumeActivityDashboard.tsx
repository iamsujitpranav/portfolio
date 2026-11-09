"use client";

import { useEffect, useState } from "react";
import { AdminAuthError, adminFetch } from "@/lib/admin";
import { useAdminSession } from "./AdminGate";
import {
  countryFlag,
  share,
  type ResumeActivityPayload,
} from "@/lib/adminAnalytics";

const RANGES = [7, 30, 90, 365];

function deviceFromUA(ua?: string | null): string {
  if (!ua) return "Direct / Bot";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS Device";
  if (/Android/i.test(ua)) return "Android Device";
  if (/Macintosh/i.test(ua)) return "macOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Browser";
}

function actionBadge(action: string) {
  if (action === "download_pdf" || action === "download_click") {
    return <span className="admBadge admBadgeDownload">PDF Download</span>;
  }
  if (action === "ask_chat") {
    return <span className="admBadge admBadgeChat">Ask AI</span>;
  }
  return <span className="admBadge admBadgeView">Web View</span>;
}

export default function ResumeActivityDashboard() {
  const { signOut } = useAdminSession();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ResumeActivityPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    adminFetch<ResumeActivityPayload>(`/api/admin/resume/activity?days=${days}`)
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        if (err instanceof AdminAuthError) {
          signOut();
          return;
        }
        setError(err instanceof Error ? err.message : "could not load resume activity");
        setStatus("error");
      });

    return () => {
      alive = false;
    };
  }, [days, nonce, signOut]);

  const refresh = () => {
    setStatus("loading");
    setNonce((n) => n + 1);
  };

  const pick = (next: number) => {
    if (next === days) return;
    setStatus("loading");
    setDays(next);
  };

  return (
    <div className="admWrap">
      <header className="admHead">
        <div>
          <h1>Résumé Activity & Recruiter Tracking</h1>
          <p className="admSub">
            Live visitor IP addresses, resolved geographic locations, recruiter organizations, and PDF download activity.
          </p>
        </div>
        <div className="admHeadTools">
          <div className="admRanges" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                data-on={r === days ? "1" : undefined}
                onClick={() => pick(r)}
              >
                {r === 365 ? "1y" : `${r}d`}
              </button>
            ))}
          </div>
          <button type="button" className="admGhost" onClick={refresh}>
            Refresh
          </button>
          <button type="button" className="admGhost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {status === "error" && (
        <div className="admNotice admNoticeBad">
          <b>Couldn’t load résumé activity.</b> {error}
        </div>
      )}

      {status === "loading" && !data && <div className="admNotice">Loading résumé activity…</div>}

      {data && (
        <div className="admBody" data-stale={status === "loading" ? "1" : undefined}>
          <div className="admKpis">
            <div className="admKpi">
              <span className="admKpiLabel">Total Downloads</span>
              <span className="admKpiValue">{data.summary.total_downloads}</span>
              <span className="admKpiNote">Direct PDF requests</span>
            </div>
            <div className="admKpi">
              <span className="admKpiLabel">Web Views</span>
              <span className="admKpiValue">{data.summary.total_views}</span>
              <span className="admKpiNote">Sections & AI questions</span>
            </div>
            <div className="admKpi">
              <span className="admKpiLabel">Unique Recruiter IPs</span>
              <span className="admKpiValue">{data.summary.unique_ips}</span>
              <span className="admKpiNote">Distinct callers</span>
            </div>
            <div className="admKpi">
              <span className="admKpiLabel">Top Location</span>
              <span className="admKpiValue" style={{ fontSize: "20px" }}>
                {data.top_countries[0] ? (
                  <>
                    {countryFlag(data.top_countries[0].country_code)} {data.top_countries[0].country}
                  </>
                ) : (
                  "—"
                )}
              </span>
              <span className="admKpiNote">
                {data.top_countries[0] ? `${data.top_countries[0].count} visits` : "No visits"}
              </span>
            </div>
            <div className="admKpi">
              <span className="admKpiLabel">Top Organization</span>
              <span className="admKpiValue" style={{ fontSize: "16px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }} title={data.top_orgs[0]?.org}>
                {data.top_orgs[0]?.org || "—"}
              </span>
              <span className="admKpiNote">
                {data.top_orgs[0] ? `${data.top_orgs[0].count} visits` : "No org data"}
              </span>
            </div>
          </div>

          <div className="admGrid2">
            <section className="admPanel">
              <h2 style={{ fontSize: "16px", margin: "0 0 4px" }}>Recruiter Organizations & Networks</h2>
              <p className="admSub" style={{ marginBottom: "16px" }}>
                Companies, enterprises, or ISPs where visitors accessed your résumé.
              </p>
              {data.top_orgs.length > 0 ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  {data.top_orgs.map((o) => {
                    const maxCount = Math.max(1, ...data.top_orgs.map((x) => x.count));
                    const pct = Math.round((o.count / maxCount) * 100);
                    return (
                      <div key={o.org} style={{ display: "grid", gap: "4px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                          <span style={{ fontWeight: 600 }}>{o.org}</span>
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", fontSize: "11.5px" }}>
                            {o.count} visit{o.count === 1 ? "" : "s"} · {o.unique_ips} IP{o.unique_ips === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="admTrack">
                          <div className="admFill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="admFoot">No organization data in this window.</p>
              )}
            </section>

            <section className="admPanel">
              <h2 style={{ fontSize: "16px", margin: "0 0 4px" }}>Geographic Locations</h2>
              <p className="admSub" style={{ marginBottom: "16px" }}>
                Countries and cities where your résumé is being accessed.
              </p>
              {data.top_countries.length > 0 ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  {data.top_countries.map((c) => {
                    const maxCount = Math.max(1, ...data.top_countries.map((x) => x.count));
                    const pct = Math.round((c.count / maxCount) * 100);
                    return (
                      <div key={c.country} style={{ display: "grid", gap: "4px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                          <span className="admLocBadge">
                            <span>{countryFlag(c.country_code)}</span>
                            <span style={{ fontWeight: 600 }}>{c.country}</span>
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", fontSize: "11.5px" }}>
                            {c.count} ({share(c.count, data.summary.total_downloads + data.summary.total_views)}%)
                          </span>
                        </div>
                        <div className="admTrack">
                          <div className="admFill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="admFoot">No location data in this window.</p>
              )}
            </section>
          </div>

          <section className="admPanel">
            <h2 style={{ fontSize: "16px", margin: "0 0 4px" }}>Live Access Log</h2>
            <p className="admSub" style={{ marginBottom: "16px" }}>
              Individual recruiter interactions, showing caller IP address, city/country, company network, and timestamp.
            </p>

            {data.recent.length > 0 ? (
              <div className="admScroll">
                <table className="admTable">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Location</th>
                      <th>Organization / ISP</th>
                      <th>IP Address</th>
                      <th>Section</th>
                      <th>Device / Referrer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((item) => (
                      <tr key={item.id}>
                        <td style={{ whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                          {new Date(item.created_at).toLocaleString()}
                        </td>
                        <td>{actionBadge(item.action)}</td>
                        <td>
                          <span className="admLocBadge">
                            <span>{countryFlag(item.country_code)}</span>
                            <span>
                              {item.city ? `${item.city}, ` : ""}
                              {item.country || "Unknown"}
                            </span>
                          </span>
                        </td>
                        <td style={{ fontWeight: 500, maxWidth: "220px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }} title={item.org || undefined}>
                          {item.org || "—"}
                        </td>
                        <td>
                          <code className="admIpChip">{item.ip_address}</code>
                        </td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--muted)" }}>
                          {item.section || "full_pdf"}
                        </td>
                        <td style={{ fontSize: "12px", color: "var(--muted)" }}>
                          <span>{deviceFromUA(item.user_agent)}</span>
                          {item.referer && (
                            <span style={{ display: "block", fontSize: "11px", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.referer}>
                              ↳ {item.referer.replace(/^https?:\/\//, "")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admNotice">
                No résumé activity recorded in the last {days} days yet. Try clicking &quot;Download résumé&quot; on the live site to generate your first tracked event!
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
