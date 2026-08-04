"""The read side of journey telemetry: the endpoint's gates and, mostly, the
aggregator itself.

`aggregate()` is a pure function over rows, so the interesting half of this
module is tested without a database at all — which matters, because the suite
deliberately runs against an unconfigured app (see conftest) and the endpoint
therefore never gets as far as a query.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app import config
from app.analytics import Row, aggregate

from conftest import ip

T0 = datetime(2026, 8, 1, 12, 0, 0, tzinfo=timezone.utc)


def row(sid: str, name: str, props: dict | None = None, *, t: float = 0.0, at: datetime | None = None) -> Row:
    return Row(session_id=sid, name=name, offset_s=t, props=props, created_at=at or T0)


def visit(sid: str, *, capable: bool = True, ready: bool = True, **gate) -> list[Row]:
    """The rows a normal session lays down, up to the world coming up."""
    rows = [row(sid, "journey_gate", {"capable": capable, "webgl": True, **gate})]
    if capable:
        rows.append(row(sid, "journey_start"))
        if ready:
            rows.append(row(sid, "world_ready"))
    return rows


def step(payload: dict, name: str) -> dict:
    return next(s for s in payload["funnel"] if s["step"] == name)


def bench(payload: dict, section: str, ident: str) -> dict | None:
    key = "mode" if section == "travel_modes" else "id"
    return next((x for x in payload[section] if x[key] == ident), None)


# --------------------------------------------------------------------------- #
# Endpoint gates
# --------------------------------------------------------------------------- #
def test_analytics_requires_admin_to_be_configured(client):
    assert client.get("/api/admin/analytics").status_code == 503


def test_analytics_rejects_a_caller_without_a_token(client, admin_enabled):
    r = client.get("/api/admin/analytics")
    assert r.status_code == 401


def test_analytics_rejects_a_forged_token(client, admin_enabled):
    r = client.get("/api/admin/analytics", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


def test_analytics_503s_when_there_is_no_database(client, admin_enabled):
    token = client.post(
        "/api/admin/login", json={"password": admin_enabled}, headers=ip("9.1.0.1")
    ).json()["token"]
    r = client.get("/api/admin/analytics", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 503
    assert "database" in r.json()["detail"]


def test_analytics_bounds_the_window(client, admin_enabled):
    token = client.post(
        "/api/admin/login", json={"password": admin_enabled}, headers=ip("9.1.0.2")
    ).json()["token"]
    auth = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/admin/analytics?days=0", headers=auth).status_code == 422
    assert client.get("/api/admin/analytics?days=366", headers=auth).status_code == 422


# --------------------------------------------------------------------------- #
# Aggregation — the shape of a visit
# --------------------------------------------------------------------------- #
def test_empty_input_is_a_valid_empty_dashboard():
    out = aggregate([], days=30)
    assert out["range"] == {"days": 30, "sessions": 0, "events": 0, "truncated": False}
    assert step(out, "landed")["sessions"] == 0
    # Never a division by zero on a site nobody has visited yet.
    assert step(out, "landed")["pct"] == 0.0
    assert out["engagement"]["median_seconds"] == 0.0


def test_counts_sessions_not_events():
    rows = [*visit("a"), *visit("b"), row("a", "stop_open", {"id": "skills"})]
    out = aggregate(rows, days=30)
    assert out["range"]["sessions"] == 2
    assert out["range"]["events"] == 7


def test_funnel_steps_nest_and_report_a_share_of_arrivals():
    rows = [
        *visit("a"),
        row("a", "stop_open", {"id": "skills", "via": "walk"}),
        row("a", "stop_open", {"id": "contact", "via": "teleport"}),
        *visit("b"),  # got in, explored nothing
        *visit("c", capable=False, coarse=True),  # bounced at the gate
        *visit("d", ready=False),  # left while the world was loading
    ]
    out = aggregate(rows, days=30)
    assert step(out, "landed")["sessions"] == 4
    assert step(out, "capable")["sessions"] == 3
    assert step(out, "started")["sessions"] == 3
    assert step(out, "ready")["sessions"] == 2
    assert step(out, "explored")["sessions"] == 1
    assert step(out, "contact")["sessions"] == 1
    assert step(out, "capable")["pct"] == 75.0


def test_a_session_that_only_ever_started_still_counts_as_capable():
    # Events can land out of order (the gate beacon is the first thing queued
    # and the last thing flushed). Having started IS proof the gate passed.
    out = aggregate([row("a", "journey_start"), row("a", "world_ready")], days=30)
    assert step(out, "capable")["sessions"] == 1


def test_a_reloaded_tab_that_passes_the_second_time_is_not_counted_as_blocked():
    rows = [
        row("a", "journey_gate", {"capable": False, "webgl": True, "small": True}),
        row("a", "journey_gate", {"capable": True, "webgl": True}),
    ]
    out = aggregate(rows, days=30)
    assert out["gate"]["blocked"] == 0
    assert step(out, "capable")["sessions"] == 1


def test_gate_reasons_read_webgl_positively_and_the_rest_negatively():
    rows = [
        row("a", "journey_gate", {"capable": False, "webgl": False}),
        row("b", "journey_gate", {"capable": False, "webgl": True, "coarse": True, "small": True}),
        row("c", "journey_gate", {"capable": True, "webgl": True, "coarse": False}),
    ]
    out = aggregate(rows, days=30)
    reasons = {r["id"]: r["count"] for r in out["gate"]["reasons"]}
    assert reasons == {"webgl": 1, "coarse": 1, "small": 1}
    assert out["gate"]["seen"] == 3
    assert out["gate"]["blocked"] == 2


def test_props_that_survived_json_as_strings_are_still_booleans():
    out = aggregate([row("a", "journey_gate", {"capable": "false", "webgl": "true"})], days=30)
    assert step(out, "capable")["sessions"] == 0
    assert out["gate"]["blocked"] == 1


# --------------------------------------------------------------------------- #
# Aggregation — content
# --------------------------------------------------------------------------- #
def test_stops_rank_by_opens_and_split_walking_from_teleporting():
    rows = [
        row("a", "stop_open", {"id": "skills", "via": "walk"}),
        row("b", "stop_open", {"id": "skills", "via": "teleport"}),
        row("b", "stop_open", {"id": "skills", "via": "walk"}),
        row("a", "stop_open", {"id": "contact", "via": "teleport"}),
    ]
    out = aggregate(rows, days=30)
    assert [s["id"] for s in out["stops"]] == ["skills", "contact"]
    skills = out["stops"][0]
    assert skills["count"] == 3
    assert skills["sessions"] == 2  # the same visitor opening it twice is one visitor
    assert skills["walk"] == 2
    assert skills["teleport"] == 1


def test_a_stop_open_without_an_id_is_dropped_rather_than_counted_as_blank():
    out = aggregate([row("a", "stop_open"), row("a", "stop_open", {"id": ""})], days=30)
    assert out["stops"] == []
    # …but the session still explored nothing, and the raw event tally is honest.
    assert step(out, "explored")["sessions"] == 1
    assert out["events"][0] == {"name": "stop_open", "count": 2, "sessions": 1}


def test_landmark_boards_are_reported_separately_from_stops():
    rows = [
        row("a", "display_open", {"id": "foundry"}),
        row("b", "display_open", {"id": "foundry"}),
        row("a", "display_open", {"id": "mill"}),
    ]
    out = aggregate(rows, days=30)
    assert out["displays"][0] == {"id": "foundry", "count": 2, "sessions": 2}
    assert out["stops"] == []


def test_reaching_contact_counts_from_either_a_walk_or_a_board():
    out = aggregate([row("a", "display_open", {"id": "contact"})], days=30)
    assert step(out, "contact")["sessions"] == 1


def test_tour_reports_where_it_loses_people():
    rows = [
        row("a", "tour_start"),
        row("a", "tour_beat", {"beat": 1, "id": "start"}),
        row("a", "tour_beat", {"beat": 2, "id": "thesis"}),
        row("a", "tour_complete"),
        row("b", "tour_start"),
        row("b", "tour_beat", {"beat": 1, "id": "start"}),
        row("b", "tour_abandon"),
    ]
    out = aggregate(rows, days=30)
    assert out["tour"]["started"] == 2
    assert out["tour"]["completed"] == 1
    assert out["tour"]["abandoned"] == 1
    assert out["tour"]["beats"] == [
        {"beat": 1, "id": "start", "count": 2},
        {"beat": 2, "id": "thesis", "count": 1},
    ]


def test_a_malformed_beat_number_is_skipped_not_crashed():
    out = aggregate([row("a", "tour_beat", {"beat": "third"})], days=30)
    assert out["tour"]["beats"] == []


def test_games_pair_opens_with_outcomes():
    rows = [
        row("a", "game_open", {"game": "tictactoe"}),
        row("a", "game_result", {"game": "tictactoe", "result": "won"}),
        row("b", "game_open", {"game": "tictactoe"}),
        row("b", "game_result", {"game": "tictactoe", "result": "lost"}),
        row("c", "game_open", {"game": "match"}),
    ]
    out = aggregate(rows, days=30)
    assert bench(out, "games", "tictactoe") == {
        "id": "tictactoe",
        "opens": 2,
        "won": 1,
        "lost": 1,
        "draw": 0,
    }
    assert bench(out, "games", "match")["opens"] == 1


def test_secrets_rank_by_how_often_they_are_found():
    rows = [
        row("a", "secret_found", {"secret": "stack"}),
        row("b", "secret_found", {"secret": "stack"}),
        row("b", "secret_found", {"secret": "open"}),
    ]
    out = aggregate(rows, days=30)
    assert out["secrets"] == [{"id": "stack", "count": 2}, {"id": "open", "count": 1}]


def test_travel_modes_and_exits_are_tallied():
    rows = [
        row("a", "travel_mode", {"mode": "walk"}),
        row("b", "travel_mode", {"mode": "warp"}),
        row("b", "travel_mode", {"mode": "warp"}),
        row("a", "leave_to_classic", {"hash": "#projects"}),
        row("b", "leave_to_classic", {"hash": ""}),
    ]
    out = aggregate(rows, days=30)
    assert out["travel_modes"] == [{"mode": "warp", "count": 2}, {"mode": "walk", "count": 1}]
    assert out["exits"]["to_classic"] == 2
    assert {e["hash"] for e in out["exits"]["targets"]} == {"#projects", "(top)"}


# --------------------------------------------------------------------------- #
# Aggregation — the assistant
# --------------------------------------------------------------------------- #
def test_ask_funnel_counts_every_stage():
    rows = [
        row("a", "ask_open", {"nearby": "depot"}),
        row("a", "ask_question", {"chars": 30}),
        row("a", "ask_routed", {"to": "watchtower"}),
        row("a", "ask_walkto", {"to": "watchtower"}),
        row("a", "ask_voice"),
    ]
    out = aggregate(rows, days=30)
    assert out["ask"]["opened"] == 1
    assert out["ask"]["questions"] == 1
    assert out["ask"]["routed"] == 1
    assert out["ask"]["walked"] == 1
    assert out["ask"]["voice"] == 1
    # A destination proposed AND taken counts on both sides of the same name.
    assert out["ask"]["destinations"] == [{"id": "watchtower", "count": 2}]


def test_question_text_appears_only_when_it_was_stored():
    rows = [row("a", "ask_question", {"chars": 12}), row("a", "ask_question", {"chars": 9})]
    assert aggregate(rows, days=30)["ask"]["recent"] == []


def test_stored_questions_come_back_newest_first():
    rows = [
        row("a", "ask_question", {"q": "first"}, at=T0),
        row("a", "ask_question", {"q": "second"}, at=T0 + timedelta(minutes=1)),
        row("a", "ask_question", {"q": "   "}),  # whitespace is not a question
    ]
    out = aggregate(rows, days=30)
    assert [q["text"] for q in out["ask"]["recent"]] == ["second", "first"]


# --------------------------------------------------------------------------- #
# Aggregation — engagement
# --------------------------------------------------------------------------- #
def test_session_length_prefers_the_reported_end_over_the_last_offset():
    rows = [
        row("a", "world_ready", t=30.0),
        row("a", "session_end", {"seconds": 240}, t=200.0),
    ]
    out = aggregate(rows, days=30)
    assert out["engagement"]["median_seconds"] == 240.0
    assert bench_bucket(out, "2–5m") == 1


def bench_bucket(payload: dict, label: str) -> int:
    return next(b["sessions"] for b in payload["engagement"]["buckets"] if b["label"] == label)


def test_a_session_that_never_reported_an_end_falls_back_to_its_last_offset():
    out = aggregate([row("a", "world_ready", t=45.0)], days=30)
    assert out["engagement"]["median_seconds"] == 45.0
    assert bench_bucket(out, "30s–2m") == 1


def test_median_of_an_even_number_of_sessions_is_the_midpoint():
    rows = [
        row("a", "session_end", {"seconds": 10}),
        row("b", "session_end", {"seconds": 20}),
        row("c", "session_end", {"seconds": 30}),
        row("d", "session_end", {"seconds": 100}),
    ]
    assert aggregate(rows, days=30)["engagement"]["median_seconds"] == 25.0


def test_returning_visitors_are_split_out_of_the_ones_we_cannot_tell():
    rows = [
        row("a", "world_ready", {"returning": True, "visit": 3}),
        row("b", "world_ready", {"returning": False, "visit": 1}),
        row("c", "world_ready"),  # context never got attached
    ]
    out = aggregate(rows, days=30)
    assert out["engagement"]["returning"] == 1
    assert out["engagement"]["new"] == 1


def test_days_are_grouped_in_order():
    rows = [
        row("a", "world_ready", at=T0),
        row("b", "world_ready", at=T0 + timedelta(days=2)),
        row("c", "world_ready", at=T0 + timedelta(days=2, hours=3)),
    ]
    out = aggregate(rows, days=30)
    assert out["engagement"]["by_day"] == [
        {"day": "2026-08-01", "sessions": 1, "events": 1},
        {"day": "2026-08-03", "sessions": 2, "events": 2},
    ]


def test_a_truncated_window_says_so():
    out = aggregate([row("a", "world_ready")], days=7, truncated=True)
    assert out["range"]["truncated"] is True


def test_questions_enabled_mirrors_the_server_flag(monkeypatch):
    monkeypatch.setattr(config, "ANALYTICS_QUESTIONS", True)
    assert aggregate([], days=30)["ask"]["questions_enabled"] is True
