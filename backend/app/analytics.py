"""Read side of the journey telemetry — one aggregated snapshot for the admin UI.

`/api/events` (main.py) is the write side: it appends rows to `journey_events`
and nothing ever read them back. This module is the other half — a single
admin-only endpoint that turns those rows into the four things actually worth
knowing about the 3D journey:

  * where visitors evaporate (the funnel, and WHY the gate turned them away),
  * which stops and landmarks get opened — and which never do,
  * which tour beat loses people,
  * what they asked the résumé assistant.

Deliberately id-only: the backend has no idea that `foundry` is "The Foundry".
Labels live in the frontend's own world modules (sections.ts / projects.ts /
secrets.ts), which are already the single source of truth for them, so a stop
renamed on the trail can never drift out of sync with a copy kept here.

The aggregation is plain Python over a bounded row window rather than a dozen
GROUP BYs. At portfolio scale that is one round trip and a few milliseconds, it
keeps every rule in one readable place, and `aggregate()` is a pure function —
so the interesting half is unit-testable without a database at all.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, NamedTuple, Optional, Sequence

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from . import config
from .admin import require_admin
from .db import JourneyEvent, get_sessionmaker

router = APIRouter(prefix="/api/admin", tags=["admin"])

# A window this big is already far past "a person reading a dashboard"; the cap
# exists so a bot storm can never turn one admin page load into an OOM.
MAX_ROWS = 200_000
# Enough to read through in one sitting. The newest are the interesting ones.
MAX_QUESTIONS = 200


class Row(NamedTuple):
    """One stored event, free of the ORM so tests can build them literally."""

    session_id: str
    name: str
    offset_s: float
    props: Optional[dict[str, Any]]
    created_at: datetime


# The visit, step by step. Each step is a superset test over one session's
# events, so the counts nest and the drop between two rows is a real drop.
FUNNEL: list[tuple[str, str]] = [
    ("landed", "Opened the site"),
    ("capable", "Device could run the 3D world"),
    ("started", "Entered the journey"),
    ("ready", "World finished loading"),
    ("explored", "Opened a stop or a landmark board"),
    ("contact", "Reached Contact"),
]

# Why the gate sent someone to the classic site. Prop name → what to call it.
GATE_REASONS: list[tuple[str, str]] = [
    ("webgl", "No WebGL"),
    ("coarse", "Touch / coarse pointer"),
    ("small", "Screen too small"),
    ("reduced", "Prefers reduced motion"),
]

DURATION_BUCKETS: list[tuple[str, float, float]] = [
    ("< 10s", 0, 10),
    ("10–30s", 10, 30),
    ("30s–2m", 30, 120),
    ("2–5m", 120, 300),
    ("5–15m", 300, 900),
    ("15m+", 900, float("inf")),
]


def _prop(props: Optional[dict[str, Any]], key: str, default: Any = None) -> Any:
    if not props:
        return default
    value = props.get(key)
    return default if value is None else value


def _truthy(value: Any) -> bool:
    """Props survive JSON, so a boolean may arrive as a string or a number."""
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes"}
    return bool(value)


class _Session:
    """Everything worth knowing about one visit, folded in as rows stream by."""

    __slots__ = ("names", "seconds", "day", "returning", "gate_seen", "capable", "reached_contact")

    def __init__(self) -> None:
        self.names: set[str] = set()
        self.seconds: float = 0.0
        self.day: str = ""
        self.returning: Optional[bool] = None
        self.gate_seen: bool = False
        self.capable: Optional[bool] = None
        self.reached_contact: bool = False


def _rank(pairs: Counter, sessions: Counter | None = None, key: str = "id") -> list[dict[str, Any]]:
    """Counter → the list shape every ranked panel in the UI consumes."""
    out = []
    for item, count in pairs.most_common():
        row: dict[str, Any] = {key: item, "count": count}
        if sessions is not None:
            row["sessions"] = sessions.get(item, 0)
        out.append(row)
    return out


def _median(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return round(ordered[mid], 1)
    return round((ordered[mid - 1] + ordered[mid]) / 2, 1)


def aggregate(rows: Sequence[Row], *, days: int, truncated: bool = False) -> dict[str, Any]:
    """Fold raw events into the dashboard payload. Pure — no DB, no clock."""
    sessions: dict[str, _Session] = defaultdict(_Session)

    by_name = Counter()
    name_sessions: dict[str, set[str]] = defaultdict(set)
    by_day_events = Counter()
    by_day_sessions: dict[str, set[str]] = defaultdict(set)

    stop_opens = Counter()
    stop_sessions: dict[str, set[str]] = defaultdict(set)
    stop_via = defaultdict(Counter)
    display_opens = Counter()
    display_sessions: dict[str, set[str]] = defaultdict(set)

    gate_reasons = Counter()
    tour_beats = Counter()
    tour_beat_ids: dict[int, str] = {}
    game_opens = Counter()
    game_results = defaultdict(Counter)
    secret_finds = Counter()
    ask_routes = Counter()
    travel_modes = Counter()
    exit_hashes = Counter()
    questions: list[dict[str, Any]] = []

    for row in rows:
        sess = sessions[row.session_id]
        sess.names.add(row.name)
        sess.seconds = max(sess.seconds, row.offset_s or 0.0)
        day = row.created_at.date().isoformat()
        if not sess.day:
            sess.day = day

        by_name[row.name] += 1
        name_sessions[row.name].add(row.session_id)
        by_day_events[day] += 1
        by_day_sessions[day].add(row.session_id)

        props = row.props
        if sess.returning is None and props is not None and "returning" in props:
            sess.returning = _truthy(props["returning"])

        if row.name == "journey_gate":
            sess.gate_seen = True
            capable = _truthy(_prop(props, "capable"))
            # A session can report the gate more than once (a reload inside the
            # same tab); once it passed, it passed.
            sess.capable = capable or bool(sess.capable)
            if not capable:
                for key, _label in GATE_REASONS:
                    # `capable`/`webgl` are stated positively, the rest negatively.
                    blocked = not _truthy(_prop(props, key, True)) if key == "webgl" else _truthy(_prop(props, key))
                    if blocked:
                        gate_reasons[key] += 1

        elif row.name == "stop_open":
            sid = str(_prop(props, "id", "") or "")
            if sid:
                stop_opens[sid] += 1
                stop_sessions[sid].add(row.session_id)
                stop_via[sid][str(_prop(props, "via", "?"))] += 1
                if sid == "contact":
                    sess.reached_contact = True

        elif row.name == "display_open":
            did = str(_prop(props, "id", "") or "")
            if did:
                display_opens[did] += 1
                display_sessions[did].add(row.session_id)
                if did == "contact":
                    sess.reached_contact = True

        elif row.name == "tour_beat":
            try:
                beat = int(_prop(props, "beat", 0) or 0)
            except (TypeError, ValueError):
                beat = 0
            if beat > 0:
                tour_beats[beat] += 1
                tour_beat_ids.setdefault(beat, str(_prop(props, "id", "") or ""))

        elif row.name == "game_open":
            game = str(_prop(props, "game", "") or "")
            if game:
                game_opens[game] += 1

        elif row.name == "game_result":
            game = str(_prop(props, "game", "") or "")
            if game:
                game_results[game][str(_prop(props, "result", "?"))] += 1

        elif row.name == "secret_found":
            secret = str(_prop(props, "secret", "") or "")
            if secret:
                secret_finds[secret] += 1

        elif row.name in {"ask_routed", "ask_walkto"}:
            to = str(_prop(props, "to", "") or "")
            if to:
                ask_routes[to] += 1

        elif row.name == "travel_mode":
            travel_modes[str(_prop(props, "mode", "?"))] += 1

        elif row.name == "leave_to_classic":
            exit_hashes[str(_prop(props, "hash", "") or "(top)")] += 1

        elif row.name == "ask_question":
            text = _prop(props, "q")
            if isinstance(text, str) and text.strip():
                questions.append({"text": text, "at": row.created_at.isoformat()})

        elif row.name == "session_end":
            try:
                sess.seconds = max(sess.seconds, float(_prop(props, "seconds", 0) or 0))
            except (TypeError, ValueError):
                pass

    total_sessions = len(sessions)

    # --- funnel ------------------------------------------------------------- #
    reached = Counter()
    for sess in sessions.values():
        reached["landed"] += 1
        # No gate event at all can only mean the events arrived out of order —
        # having started the journey is itself proof the gate let them through.
        capable = sess.capable if sess.gate_seen else ("journey_start" in sess.names)
        if capable:
            reached["capable"] += 1
        if "journey_start" in sess.names:
            reached["started"] += 1
        if "world_ready" in sess.names:
            reached["ready"] += 1
        if sess.names & {"stop_open", "display_open"}:
            reached["explored"] += 1
        if sess.reached_contact:
            reached["contact"] += 1

    base = reached["landed"] or 1
    funnel = [
        {
            "step": step,
            "label": label,
            "sessions": reached[step],
            "pct": round(reached[step] * 100 / base, 1),
        }
        for step, label in FUNNEL
    ]

    # --- engagement --------------------------------------------------------- #
    durations = [s.seconds for s in sessions.values() if s.seconds > 0]
    buckets = []
    for label, low, high in DURATION_BUCKETS:
        n = sum(1 for d in durations if low <= d < high)
        buckets.append({"label": label, "sessions": n})

    returning = sum(1 for s in sessions.values() if s.returning is True)
    known_visit_kind = sum(1 for s in sessions.values() if s.returning is not None)

    by_day = [
        {"day": day, "sessions": len(by_day_sessions[day]), "events": by_day_events[day]}
        for day in sorted(by_day_events)
    ]

    # --- tour --------------------------------------------------------------- #
    tour_started = len(name_sessions.get("tour_start", ()))
    beats = [
        {"beat": beat, "id": tour_beat_ids.get(beat, ""), "count": tour_beats[beat]}
        for beat in sorted(tour_beats)
    ]

    games = [
        {
            "id": game,
            "opens": game_opens.get(game, 0),
            "won": game_results[game].get("won", 0),
            "lost": game_results[game].get("lost", 0),
            "draw": game_results[game].get("draw", 0),
        }
        for game in sorted(set(game_opens) | set(game_results), key=lambda g: -game_opens.get(g, 0))
    ]

    stops = [
        {
            "id": sid,
            "count": count,
            "sessions": len(stop_sessions[sid]),
            "walk": stop_via[sid].get("walk", 0),
            "teleport": stop_via[sid].get("teleport", 0),
        }
        for sid, count in stop_opens.most_common()
    ]

    return {
        "range": {
            "days": days,
            "sessions": total_sessions,
            "events": sum(by_name.values()),
            "truncated": truncated,
        },
        "funnel": funnel,
        "gate": {
            "seen": len(name_sessions.get("journey_gate", ())),
            "blocked": sum(1 for s in sessions.values() if s.gate_seen and not s.capable),
            "reasons": [
                {"id": key, "label": label, "count": gate_reasons[key]}
                for key, label in GATE_REASONS
                if gate_reasons[key]
            ],
        },
        "stops": stops,
        "displays": [
            {"id": did, "count": count, "sessions": len(display_sessions[did])}
            for did, count in display_opens.most_common()
        ],
        "tour": {
            "started": tour_started,
            "completed": len(name_sessions.get("tour_complete", ())),
            "abandoned": len(name_sessions.get("tour_abandon", ())),
            "beats": beats,
        },
        "games": games,
        "secrets": _rank(secret_finds),
        "ask": {
            "opened": by_name.get("ask_open", 0),
            "questions": by_name.get("ask_question", 0),
            "voice": by_name.get("ask_voice", 0),
            "routed": by_name.get("ask_routed", 0),
            "walked": by_name.get("ask_walkto", 0),
            "destinations": _rank(ask_routes),
            "questions_enabled": config.ANALYTICS_QUESTIONS,
            # Newest first: what people are asking NOW is the useful end.
            "recent": list(reversed(questions[-MAX_QUESTIONS:])),
        },
        "engagement": {
            "median_seconds": _median(durations),
            "buckets": buckets,
            "returning": returning,
            "new": known_visit_kind - returning,
            "by_day": by_day,
        },
        "travel_modes": _rank(travel_modes, key="mode"),
        "exits": {
            "to_classic": by_name.get("leave_to_classic", 0),
            "targets": _rank(exit_hashes, key="hash"),
        },
        "events": [
            {"name": name, "count": count, "sessions": len(name_sessions[name])}
            for name, count in by_name.most_common()
        ],
    }


@router.get("/analytics")
async def analytics(
    days: int = Query(default=30, ge=1, le=365),
    _: bool = Depends(require_admin),
) -> dict[str, Any]:
    """The whole dashboard in one response — a page load is a single request."""
    sm = get_sessionmaker()
    if sm is None:
        raise HTTPException(status_code=503, detail="database is not configured")

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    async with sm() as session:
        result = await session.execute(
            select(
                JourneyEvent.session_id,
                JourneyEvent.name,
                JourneyEvent.offset_s,
                JourneyEvent.props,
                JourneyEvent.created_at,
            )
            .where(JourneyEvent.created_at >= cutoff)
            .order_by(JourneyEvent.id)
            .limit(MAX_ROWS)
        )
        rows = [Row(*r) for r in result.all()]

    return aggregate(rows, days=days, truncated=len(rows) >= MAX_ROWS)
