"""End-to-end rate limiting: the abuse protections as a caller experiences them.

Counts are derived from the configured rules rather than hard-coded, so tuning
a budget in config.py doesn't silently invalidate these tests.
"""
from __future__ import annotations

from app import config, ratelimit

from conftest import ip

CHAT = {"messages": [{"role": "user", "content": "tell me about your work"}]}
LEAD = {
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "message": "I would like to talk about an engineering role.",
}


def burst_of(limiter: ratelimit.RateLimiter) -> int:
    """The narrowest rule's limit — the first one a caller will hit."""
    return limiter.rules[0].limit


# --------------------------------------------------------------------------- #
# /api/chat — the endpoint that costs Claude tokens
# --------------------------------------------------------------------------- #
def test_chat_blocks_the_request_after_the_burst_budget(client):
    allowed = burst_of(ratelimit.chat_limiter)
    headers = ip("3.0.0.1")

    for _ in range(allowed):
        assert client.post("/api/chat", json=CHAT, headers=headers).status_code != 429

    blocked = client.post("/api/chat", json=CHAT, headers=headers)

    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
    assert "Too many requests" in blocked.json()["detail"]


def test_chat_budgets_are_per_ip(client):
    allowed = burst_of(ratelimit.chat_limiter)
    for _ in range(allowed + 1):
        client.post("/api/chat", json=CHAT, headers=ip("3.0.0.2"))

    # A different caller is untouched by the first one's spending.
    assert client.post("/api/chat", json=CHAT, headers=ip("3.0.0.3")).status_code != 429


def test_invalid_chat_payloads_still_cost_budget(client):
    """Otherwise malformed spam would be a free way to bypass the limiter."""
    allowed = burst_of(ratelimit.chat_limiter)
    headers = ip("3.0.0.4")

    for _ in range(allowed):
        assert client.post("/api/chat", json={"messages": []}, headers=headers).status_code == 422

    assert client.post("/api/chat", json=CHAT, headers=headers).status_code == 429


# --------------------------------------------------------------------------- #
# /api/contact — inbox spam
# --------------------------------------------------------------------------- #
def test_contact_blocks_after_the_burst_budget(client):
    allowed = burst_of(ratelimit.contact_limiter)
    headers = ip("4.0.0.1")

    for _ in range(allowed):
        assert client.post("/api/contact", json=LEAD, headers=headers).status_code == 200

    blocked = client.post("/api/contact", json=LEAD, headers=headers)

    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers


def test_contact_and_chat_budgets_are_separate(client):
    """Filling one endpoint's budget must not lock a visitor out of the other."""
    headers = ip("4.0.0.2")
    for _ in range(burst_of(ratelimit.contact_limiter) + 1):
        client.post("/api/contact", json=LEAD, headers=headers)

    assert client.post("/api/chat", json=CHAT, headers=headers).status_code != 429


# --------------------------------------------------------------------------- #
# Kill switch and proxy trust
# --------------------------------------------------------------------------- #
def test_no_limiting_when_the_kill_switch_is_off(client, monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_ENABLED", False)
    headers = ip("5.0.0.1")

    for _ in range(burst_of(ratelimit.contact_limiter) + 5):
        assert client.post("/api/contact", json=LEAD, headers=headers).status_code == 200


def test_spoofed_forwarded_header_cannot_dodge_the_limit(client, monkeypatch):
    """With proxy headers untrusted, every caller shares the socket-peer identity,
    so rotating X-Forwarded-For buys an attacker nothing."""
    monkeypatch.setattr(config, "TRUST_PROXY_HEADERS", False)
    allowed = burst_of(ratelimit.contact_limiter)

    for n in range(allowed):
        r = client.post("/api/contact", json=LEAD, headers={"x-forwarded-for": f"9.9.9.{n}"})
        assert r.status_code == 200

    r = client.post("/api/contact", json=LEAD, headers={"x-forwarded-for": "9.9.9.250"})
    assert r.status_code == 429
