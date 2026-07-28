"""Unit tests for the sliding-window limiter itself (no HTTP involved)."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app import config, ratelimit
from app.ratelimit import Rule, RateLimiter, parse_rules

from conftest import FakeClock, make_request


# --------------------------------------------------------------------------- #
# Rule parsing
# --------------------------------------------------------------------------- #
def test_parse_rules_single():
    assert parse_rules("5/60") == [Rule(5, 60.0)]


def test_parse_rules_multiple_and_whitespace():
    assert parse_rules(" 12/300 ,  60/3600 ") == [Rule(12, 300.0), Rule(60, 3600.0)]


def test_parse_rules_rejects_empty_spec():
    with pytest.raises(ValueError):
        parse_rules("   ")


@pytest.mark.parametrize("spec", ["0/60", "-1/60", "5/0", "5/-1"])
def test_rule_rejects_nonsense(spec):
    with pytest.raises(ValueError):
        parse_rules(spec)


def test_parse_rules_rejects_garbage():
    with pytest.raises(ValueError):
        parse_rules("banana")


# --------------------------------------------------------------------------- #
# Window behaviour
# --------------------------------------------------------------------------- #
def test_allows_up_to_the_limit_then_blocks():
    clock = FakeClock()
    lim = RateLimiter("t", [Rule(3, 10)], clock=clock)

    assert [lim.check("a") for _ in range(3)] == [None, None, None]

    wait = lim.check("a")
    assert wait is not None and wait > 0


def test_budget_frees_up_as_the_window_slides():
    clock = FakeClock()
    lim = RateLimiter("t", [Rule(2, 10)], clock=clock)

    lim.check("a")            # t=1000
    clock.advance(5)
    lim.check("a")            # t=1005
    assert lim.check("a") is not None  # both still in window

    # The first hit ages out at t=1010, freeing exactly one slot.
    clock.advance(5.1)
    assert lim.check("a") is None
    assert lim.check("a") is not None


def test_retry_after_counts_down_to_the_oldest_hit_expiring():
    clock = FakeClock()
    lim = RateLimiter("t", [Rule(1, 30)], clock=clock)

    lim.check("a")
    clock.advance(10)
    wait = lim.check("a")
    # 20s left on the window, but never less than the 1s floor.
    assert wait == pytest.approx(20.0, abs=0.01)


def test_wait_never_drops_below_one_second():
    clock = FakeClock()
    lim = RateLimiter("t", [Rule(1, 30)], clock=clock)

    lim.check("a")
    clock.advance(29.99)
    assert lim.check("a") == 1.0


def test_keys_are_independent():
    clock = FakeClock()
    lim = RateLimiter("t", [Rule(1, 10)], clock=clock)

    assert lim.check("a") is None
    assert lim.check("b") is None   # b has its own budget
    assert lim.check("a") is not None


def test_both_rules_are_enforced():
    """A burst rule plus a sustained rule: whichever binds first wins."""
    clock = FakeClock()
    lim = RateLimiter("t", [Rule(2, 10), Rule(3, 100)], clock=clock)

    assert lim.check("a") is None
    assert lim.check("a") is None
    assert lim.check("a") is not None       # burst rule (2/10) binds

    clock.advance(11)                       # burst window clears...
    assert lim.check("a") is None           # ...3rd hit allowed
    assert lim.check("a") is not None       # ...but 3/100 now binds
    clock.advance(11)
    assert lim.check("a") is not None       # still the sustained rule


def test_rules_are_sorted_narrowest_window_first():
    lim = RateLimiter("t", [Rule(60, 3600), Rule(12, 300)])
    assert [r.window for r in lim.rules] == [300.0, 3600.0]


def test_limiter_needs_at_least_one_rule():
    with pytest.raises(ValueError):
        RateLimiter("t", [])


def test_record_false_probes_without_consuming():
    clock = FakeClock()
    lim = RateLimiter("t", [Rule(1, 10)], clock=clock)

    assert lim.check("a", record=False) is None
    assert lim.check("a", record=False) is None  # still nothing recorded
    assert lim.check("a") is None                # the real hit lands
    assert lim.check("a", record=False) is not None


def test_reset_forgets_one_key_only():
    clock = FakeClock()
    lim = RateLimiter("t", [Rule(1, 10)], clock=clock)
    lim.check("a")
    lim.check("b")

    lim.reset("a")

    assert lim.check("a") is None      # refunded
    assert lim.check("b") is not None  # untouched


def test_idle_keys_are_swept_so_the_map_cannot_grow_forever():
    clock = FakeClock()
    lim = RateLimiter("t", [Rule(5, 10)], clock=clock)
    lim.check("stale")
    assert "stale" in lim._hits

    # Past both the widest window and the sweep interval.
    clock.advance(120)
    lim.check("fresh")

    assert "stale" not in lim._hits
    assert "fresh" in lim._hits


# --------------------------------------------------------------------------- #
# enforce() — the HTTP-facing wrapper
# --------------------------------------------------------------------------- #
def test_enforce_raises_429_with_retry_after():
    clock = FakeClock()
    lim = RateLimiter("t", [Rule(1, 45)], clock=clock)
    lim.enforce("a")

    with pytest.raises(HTTPException) as exc:
        lim.enforce("a")

    assert exc.value.status_code == 429
    assert exc.value.headers["Retry-After"] == "45"
    assert "Try again in 45s" in exc.value.detail


def test_enforce_rounds_retry_after_up():
    clock = FakeClock()
    lim = RateLimiter("t", [Rule(1, 30)], clock=clock)
    lim.enforce("a")
    clock.advance(10.5)

    with pytest.raises(HTTPException) as exc:
        lim.enforce("a")

    # 19.5s remaining must advertise 20, never 19 — Retry-After that's a hair
    # short would send the caller back into another 429.
    assert exc.value.headers["Retry-After"] == "20"


def test_enforce_is_a_no_op_when_disabled(monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_ENABLED", False)
    lim = RateLimiter("t", [Rule(1, 10)])

    for _ in range(50):
        lim.enforce("a")  # must not raise


# --------------------------------------------------------------------------- #
# Caller identity
# --------------------------------------------------------------------------- #
def test_client_ip_prefers_x_real_ip(monkeypatch):
    monkeypatch.setattr(config, "TRUST_PROXY_HEADERS", True)
    req = make_request({"x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1"})
    assert ratelimit.client_ip(req) == "9.9.9.9"


def test_client_ip_takes_the_rightmost_forwarded_hop(monkeypatch):
    """Everything left of the last hop is client-supplied, so it's spoofable."""
    monkeypatch.setattr(config, "TRUST_PROXY_HEADERS", True)
    req = make_request({"x-forwarded-for": "6.6.6.6, 7.7.7.7, 8.8.8.8"})
    assert ratelimit.client_ip(req) == "8.8.8.8"


def test_client_ip_ignores_headers_when_proxy_is_not_trusted(monkeypatch):
    monkeypatch.setattr(config, "TRUST_PROXY_HEADERS", False)
    req = make_request({"x-real-ip": "9.9.9.9"}, client=("10.0.0.1", 1))
    assert ratelimit.client_ip(req) == "10.0.0.1"


def test_client_ip_falls_back_to_the_socket_peer(monkeypatch):
    monkeypatch.setattr(config, "TRUST_PROXY_HEADERS", True)
    req = make_request({}, client=("10.0.0.7", 1))
    assert ratelimit.client_ip(req) == "10.0.0.7"


def test_client_ip_handles_a_missing_peer(monkeypatch):
    monkeypatch.setattr(config, "TRUST_PROXY_HEADERS", True)
    req = make_request({}, client=None)
    assert ratelimit.client_ip(req) == "unknown"


def test_configured_limiters_match_the_documented_defaults():
    """Guards the shipped budgets against an accidental loosening."""
    assert parse_rules(config.CHAT_RATE_LIMIT) == ratelimit.chat_limiter.rules
    assert parse_rules(config.CONTACT_RATE_LIMIT) == ratelimit.contact_limiter.rules
    assert parse_rules(config.LOGIN_RATE_LIMIT) == ratelimit.login_limiter.rules
    # Chat is the one that costs Claude tokens, so it must stay the tightest.
    assert ratelimit.chat_limiter.rules[0].limit <= 20
