"""The journey telemetry endpoint: contract, ceilings and its no-op behaviour.

Like the rest of the suite this runs against an unconfigured app (DB off), which
is exactly the case that matters most here — a browser beacons events on
pagehide where nothing can be retried, so an un-provisioned or failing sink must
still answer 200 rather than surfacing an error the page can't handle.
"""
from __future__ import annotations

from app import config
from app.main import JourneyEventIn, _scrub

from conftest import ip


def batch(*names: str, sid: str = "sess-1") -> dict:
    return {"sid": sid, "events": [{"name": n, "t": 100.0} for n in names]}


# --------------------------------------------------------------------------- #
# Contract
# --------------------------------------------------------------------------- #
def test_accepts_a_batch_and_stores_nothing_without_a_database(client):
    r = client.post("/api/events", json=batch("world_ready", "stop_open"), headers=ip("2.0.0.1"))
    assert r.status_code == 200
    assert r.json() == {"ok": True, "stored": 0}


def test_accepts_properties(client):
    payload = {
        "sid": "sess-2",
        "events": [{"name": "stop_open", "t": 12.5, "props": {"id": "skills", "via": "walk"}}],
    }
    assert client.post("/api/events", json=payload, headers=ip("2.0.0.2")).status_code == 200


def test_discards_everything_when_analytics_is_switched_off(client, monkeypatch):
    monkeypatch.setattr(config, "ANALYTICS_ENABLED", False)
    r = client.post("/api/events", json=batch("world_ready"), headers=ip("2.0.0.3"))
    assert r.status_code == 200
    assert r.json()["stored"] == 0


# --------------------------------------------------------------------------- #
# Ceilings — an unbounded payload is an unbounded write
# --------------------------------------------------------------------------- #
def test_rejects_an_empty_batch(client):
    r = client.post("/api/events", json={"sid": "s", "events": []}, headers=ip("2.0.1.1"))
    assert r.status_code == 422


def test_rejects_an_oversized_batch(client):
    events = [{"name": "e", "t": 0.0} for _ in range(config.EVENTS_MAX_PER_BATCH + 1)]
    r = client.post("/api/events", json={"sid": "s", "events": events}, headers=ip("2.0.1.2"))
    assert r.status_code == 422


def test_rejects_an_oversized_event_name(client):
    payload = {"sid": "s", "events": [{"name": "x" * 65, "t": 0.0}]}
    assert client.post("/api/events", json=payload, headers=ip("2.0.1.3")).status_code == 422


def test_rejects_an_oversized_session_id(client):
    payload = {"sid": "s" * 65, "events": [{"name": "e", "t": 0.0}]}
    assert client.post("/api/events", json=payload, headers=ip("2.0.1.4")).status_code == 422


def test_rejects_too_many_properties_on_one_event(client):
    props = {f"k{i}": i for i in range(13)}
    payload = {"sid": "s", "events": [{"name": "e", "t": 0.0, "props": props}]}
    assert client.post("/api/events", json=payload, headers=ip("2.0.1.5")).status_code == 422


def test_rejects_a_nonsense_offset(client):
    payload = {"sid": "s", "events": [{"name": "e", "t": -1}]}
    assert client.post("/api/events", json=payload, headers=ip("2.0.1.6")).status_code == 422


def test_rejects_a_non_scalar_property(client):
    payload = {"sid": "s", "events": [{"name": "e", "t": 0.0, "props": {"nested": {"a": 1}}}]}
    assert client.post("/api/events", json=payload, headers=ip("2.0.1.7")).status_code == 422


# --------------------------------------------------------------------------- #
# Abuse
# --------------------------------------------------------------------------- #
def test_rate_limits_a_flood_from_one_ip(client):
    # The default budget is 60/60 — the 61st request in the window is refused.
    headers = ip("2.0.2.1")
    for _ in range(60):
        assert client.post("/api/events", json=batch("e"), headers=headers).status_code == 200
    r = client.post("/api/events", json=batch("e"), headers=headers)
    assert r.status_code == 429
    assert "Retry-After" in r.headers


def test_one_ip_being_limited_does_not_affect_another(client):
    for _ in range(60):
        client.post("/api/events", json=batch("e"), headers=ip("2.0.2.2"))
    assert client.post("/api/events", json=batch("e"), headers=ip("2.0.2.3")).status_code == 200


# --------------------------------------------------------------------------- #
# Free text — dropped at the door unless it was explicitly opted into
# --------------------------------------------------------------------------- #
def asked(question: str) -> JourneyEventIn:
    return JourneyEventIn(name="ask_question", t=0.0, props={"q": question, "chars": len(question)})


def test_question_text_is_discarded_by_default():
    props = _scrub(asked("what has he shipped?"))
    assert props == {"chars": 20}


def test_question_text_is_kept_once_the_flag_is_on(monkeypatch):
    monkeypatch.setattr(config, "ANALYTICS_QUESTIONS", True)
    assert _scrub(asked("what has he shipped?"))["q"] == "what has he shipped?"


def test_an_event_whose_only_property_was_text_ends_up_with_none():
    event = JourneyEventIn(name="ask_question", t=0.0, props={"q": "hello"})
    assert _scrub(event) is None


def test_scrubbing_leaves_every_other_event_alone():
    event = JourneyEventIn(name="stop_open", t=0.0, props={"id": "skills", "via": "walk"})
    assert _scrub(event) == {"id": "skills", "via": "walk"}
