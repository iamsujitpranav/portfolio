"use client";

import { useEffect, useState } from "react";
import { AdminAuthError, adminFetch } from "@/lib/admin";
import { useAdminSession } from "./AdminGate";
import {
  allDisplays,
  allGames,
  allSecrets,
  allStops,
  canonicalId,
  displayLabel,
  formatSeconds,
  gameLabel,
  secretLabel,
  share,
  stopLabel,
  type AnalyticsPayload,
} from "@/lib/adminAnalytics";

// WHAT PEOPLE ACTUALLY DO IN THE 3D JOURNEY.
//
// The whole page is one request: /api/admin/analytics aggregates server-side
// and never ships a raw event row to the browser, so a busy month costs the
// same page weight as a quiet one.
//
// The bias throughout is toward the ZEROES. A list built only from events that
// happened hides the finding — the landmark nobody has ever opened, the game
// nobody has ever won — so every ranked panel is merged against the full set of
// things that exist in the world and the empty ones are shown, greyed, at the
// bottom. That is the number that changes what you build next.

const RANGES = [7, 30, 90, 365];

type Row = { id: string; label: string; count: number; sessions: number };

/** Rank real counts against everything that COULD have been counted. */
function merge(
  universe: { id: string; label: string }[],
  rows: { id: string; count: number; sessions?: number }[],
  label: (id: string) => string,
): Row[] {
  const out = new Map<string, Row>();
  for (const u of universe) out.set(u.id, { ...u, count: 0, sessions: 0 });
  for (const r of rows) {
    // A landmark board arrives as its panel id; fold it onto the landmark it is.
    const id = canonicalId(r.id);
    const cur = out.get(id) ?? { id, label: label(id), count: 0, sessions: 0 };
    cur.count += r.count;
    cur.sessions += r.sessions ?? 0;
    out.set(id, cur);
  }
  return [...out.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Fill the gaps so a quiet Tuesday reads as a quiet Tuesday, not as nothing. */
function densify(by: { day: string; sessions: number }[]): { day: string; sessions: number }[] {
  if (by.length < 2) return by;
  const DAY = 86_400_000;
  const known = new Map(by.map((d) => [d.day, d.sessions]));
  const start = Date.parse(`${by[0].day}T00:00:00Z`);
  const end = Date.parse(`${by[by.length - 1].day}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return by;
  const out: { day: string; sessions: number }[] = [];
  for (let t = start; t <= end; t += DAY) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ day, sessions: known.get(day) ?? 0 });
  }
  return out;
}

export default function AnalyticsDashboard() {
  const { signOut } = useAdminSession();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  // Bumped to ask for the same window again (Refresh); the range itself is the
  // other trigger.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    // `alive` is not just tidiness: switch 30d → 7d and the slower first
    // response must not land on top of the second and show the wrong window's
    // numbers under the wrong button.
    let alive = true;
    adminFetch<AnalyticsPayload>(`/api/admin/analytics?days=${days}`)
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        // An expired token isn't an error to report — it's a login to redo.
        if (err instanceof AdminAuthError) {
          signOut();
          return;
        }
        setError(err instanceof Error ? err.message : "could not load analytics");
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
          <h1>Journey analytics</h1>
          <p className="admSub">
            First-party, anonymous. No IP, no cookie, no third-party script — see{" "}
            <code>journey_events</code>.
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
          <b>Couldn’t load analytics.</b> {error}
        </div>
      )}

      {status === "loading" && !data && <div className="admNotice">Loading…</div>}

      {data && (
        <div className="admBody" data-stale={status === "loading" ? "1" : undefined}>
          <Dashboard data={data} />
        </div>
      )}
    </div>
  );
}

function Dashboard({ data }: { data: AnalyticsPayload }) {
  const { range, funnel, gate, tour, ask, engagement, exits } = data;

  if (range.events === 0) {
    return (
      <div className="admNotice">
        <b>No events in the last {range.days} days.</b> Either nobody has opened the journey yet, or
        analytics is switched off on the backend (<code>ANALYTICS_ENABLED</code>).
      </div>
    );
  }

  const landed = funnel[0]?.sessions ?? 0;
  const ready = funnel.find((f) => f.step === "ready")?.sessions ?? 0;
  const stops = merge(allStops(), data.stops, stopLabel);
  const boards = merge(allDisplays(), data.displays, displayLabel);
  const secrets = merge(allSecrets(), data.secrets, secretLabel);
  const games = merge(
    allGames(),
    data.games.map((g) => ({ id: g.id, count: g.opens })),
    gameLabel,
  );
  const wins = new Map(data.games.map((g) => [g.id, g.won]));
  const byDay = densify(engagement.by_day);
  const peakDay = Math.max(1, ...byDay.map((d) => d.sessions));

  return (
    <>
      {range.truncated && (
        <div className="admNotice admNoticeBad">
          More events than one page can aggregate — the numbers below cover only the earliest part
          of this window. Pick a shorter range.
        </div>
      )}

      <div className="admKpis">
        <Kpi label="Sessions" value={String(range.sessions)} note={`${range.events} events`} />
        <Kpi
          label="Median visit"
          value={formatSeconds(engagement.median_seconds)}
          note="from arrival to close"
        />
        <Kpi
          label="Reached the world"
          value={`${share(ready, landed)}%`}
          note={`${ready} of ${landed} arrivals`}
        />
        <Kpi
          label="Came back"
          value={String(engagement.returning)}
          note={`${engagement.new} first-time`}
        />
        <Kpi
          label="Asked the assistant"
          value={String(ask.questions)}
          note={`${ask.opened} opened it`}
        />
        <Kpi
          label="Left for the classic site"
          value={String(exits.to_classic)}
          note={gate.blocked ? `${gate.blocked} ${gate.blocked === 1 ? "was" : "were"} sent there` : "all by choice"}
        />
      </div>

      <Panel
        title="The funnel"
        hint="Where visitors evaporate. Each step is a subset of the one above it."
      >
        <div className="admFunnel">
          {funnel.map((f, i) => {
            const prev = i > 0 ? funnel[i - 1].sessions : f.sessions;
            const lost = prev - f.sessions;
            return (
              <div key={f.step} className="admFunnelRow">
                <div className="admFunnelHead">
                  <span>{f.label}</span>
                  <b>
                    {f.sessions}
                    <em>{f.pct}%</em>
                  </b>
                </div>
                <div className="admTrack">
                  <div className="admFill" style={{ width: `${f.pct}%` }} />
                </div>
                {i > 0 && lost > 0 && (
                  <div className="admDrop">
                    −{lost} lost here ({share(lost, prev)}% of the step above)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {gate.reasons.length > 0 && (
        <Panel
          title="Who never got offered the world"
          hint="The gate sends these visitors to the classic site instead. One session can trip more than one reason."
        >
          <Bars
            rows={gate.reasons.map((r) => ({
              id: r.id,
              label: r.label,
              count: r.count,
              sessions: 0,
            }))}
            total={gate.seen}
            unit="session"
          />
          <p className="admFoot">
            {gate.blocked} of {gate.seen} sessions that reached the gate were turned away
            {gate.seen > 0 ? ` (${share(gate.blocked, gate.seen)}%)` : ""}.
          </p>
        </Panel>
      )}

      <div className="admGrid2">
        <Panel title="Where visitors went" hint="Stops arrived at, on foot or by teleport.">
          <Bars rows={stops} total={Math.max(1, ...stops.map((s) => s.count))} unit="open" />
          <p className="admFoot">
            {data.stops.reduce((n, s) => n + s.walk, 0)} arrivals on foot ·{" "}
            {data.stops.reduce((n, s) => n + s.teleport, 0)} by teleport
          </p>
        </Panel>

        <Panel
          title="What visitors read"
          hint="Boards actually opened — the strongest signal that content was consumed."
        >
          <Bars rows={boards} total={Math.max(1, ...boards.map((b) => b.count))} unit="read" />
        </Panel>
      </div>

      <Panel
        title="The guided tour"
        hint="Which beat loses people. A beat is one stop of the automated walkthrough."
      >
        <div className="admTourTop">
          <span>
            <b>{tour.started}</b> started
          </span>
          <span>
            <b>{tour.completed}</b> finished
          </span>
          <span>
            <b>{tour.abandoned}</b> abandoned
          </span>
          {tour.started > 0 && (
            <span className="admTourRate">{share(tour.completed, tour.started)}% completion</span>
          )}
        </div>
        {tour.beats.length > 0 ? (
          <Bars
            rows={tour.beats.map((b) => ({
              id: String(b.beat),
              label: `Beat ${b.beat}${b.id ? ` — ${stopLabel(b.id)}` : ""}`,
              count: b.count,
              sessions: 0,
            }))}
            total={Math.max(1, ...tour.beats.map((b) => b.count))}
            unit="time"
          />
        ) : (
          <p className="admFoot">Nobody has started the tour in this window.</p>
        )}
      </Panel>

      <Panel
        title="The assistant"
        hint="Questions put to the résumé AI, and where its answers sent people next."
      >
        <div className="admTourTop">
          <span>
            <b>{ask.opened}</b> opened
          </span>
          <span>
            <b>{ask.questions}</b> asked
          </span>
          <span>
            <b>{ask.voice}</b> by voice
          </span>
          <span>
            <b>{ask.routed}</b> offered a destination
          </span>
          <span>
            <b>{ask.walked}</b> took it
          </span>
        </div>
        {ask.destinations.length > 0 && (
          <Bars
            rows={ask.destinations.map((d) => ({
              id: d.id,
              label: displayLabel(d.id),
              count: d.count,
              sessions: 0,
            }))}
            total={Math.max(1, ...ask.destinations.map((d) => d.count))}
            unit="time"
          />
        )}
        <h3 className="admSubhead">What they asked</h3>
        {ask.recent.length > 0 ? (
          <ul className="admQuestions">
            {ask.recent.map((q, i) => (
              <li key={`${q.at}-${i}`}>
                <span>{q.text}</span>
                <time dateTime={q.at}>{new Date(q.at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admFoot">
            {ask.questions_enabled
              ? "No questions asked in this window."
              : "Question text isn’t stored. It’s the highest-signal thing here — a recruiter’s question is them telling you what the résumé failed to answer — but it’s also the one field someone could type their own name into, so it’s off by default. Set ANALYTICS_QUESTIONS=1 on the backend to keep it."}
          </p>
        )}
      </Panel>

      <div className="admGrid2">
        <Panel
          title="Games"
          hint="Opened, and won. The kiosks are flavour — this says whether anyone bites."
        >
          <Bars
            rows={games}
            total={Math.max(1, ...games.map((g) => g.count))}
            unit="open"
            extra={(r) => (wins.get(r.id) ? `${wins.get(r.id)} won` : "")}
          />
        </Panel>

        <Panel title="Secrets found" hint="The six collectibles hidden along the trail.">
          <Bars rows={secrets} total={Math.max(1, ...secrets.map((s) => s.count))} unit="find" />
        </Panel>
      </div>

      <div className="admGrid2">
        <Panel title="How long they stayed">
          <Bars
            rows={engagement.buckets.map((b) => ({
              id: b.label,
              label: b.label,
              count: b.sessions,
              sessions: 0,
            }))}
            total={Math.max(1, ...engagement.buckets.map((b) => b.sessions))}
            unit="session"
          />
        </Panel>

        <Panel title="Sessions by day">
          <div className="admSpark" role="img" aria-label={`${byDay.length} days of sessions`}>
            {byDay.map((d) => (
              <div
                key={d.day}
                className="admSparkBar"
                style={{
                  height: `${Math.max(2, (d.sessions / peakDay) * 100)}%`,
                }}
                title={`${d.day} — ${d.sessions} session${d.sessions === 1 ? "" : "s"}`}
              />
            ))}
          </div>
          {byDay.length > 0 && (
            <p className="admFoot">
              {byDay[0].day} → {byDay[byDay.length - 1].day} · peak {peakDay}
              /day
            </p>
          )}
        </Panel>
      </div>

      <Panel title="Every event" hint="The raw tally, so nothing tracked is invisible here.">
        {/* Scrolls inside its own box on a phone — the page itself must never
            scroll sideways. */}
        <div className="admScroll">
          <table className="admTable">
            <thead>
              <tr>
                <th>Event</th>
                <th>Count</th>
                <th>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.name}>
                  <td>
                    <code>{e.name}</code>
                  </td>
                  <td>{e.count}</td>
                  <td>{e.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="admKpi">
      <span className="admKpiLabel">{label}</span>
      <b className="admKpiValue">{value}</b>
      {note && <span className="admKpiNote">{note}</span>}
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="admPanel">
      <h2>{title}</h2>
      {hint && <p className="admHint">{hint}</p>}
      {children}
    </section>
  );
}

/** "1 open", "4 opens" — every unit here pluralises regularly. */
function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

function Bars({
  rows,
  total,
  unit,
  extra,
}: {
  rows: Row[];
  /** Given in the SINGULAR; the count decides. */
  total: number;
  unit: string;
  extra?: (row: Row) => string;
}) {
  return (
    <ul className="admBars">
      {rows.map((r) => {
        const note = extra?.(r);
        return (
          <li key={r.id} data-zero={r.count === 0 ? "1" : undefined}>
            <div className="admBarHead">
              <span>{r.label}</span>
              <b>
                {r.count === 0 ? "never" : plural(r.count, unit)}
                {r.sessions > 0 && r.sessions !== r.count && (
                  <em>{plural(r.sessions, "session")}</em>
                )}
                {note && <em>{note}</em>}
              </b>
            </div>
            <div className="admTrack">
              <div className="admFill" style={{ width: `${share(r.count, total)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
