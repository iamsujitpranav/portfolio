"""Admin auth: password login, signed tokens, and brute-force lockout."""
from __future__ import annotations

import pytest
from itsdangerous import URLSafeTimedSerializer

from app import config, ratelimit
from app.admin import estimate_reading_time, slugify

from conftest import ip


def login(client, password: str, addr: str = "7.0.0.1"):
    return client.post("/api/admin/login", json={"password": password}, headers=ip(addr))


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# Inert until configured
# --------------------------------------------------------------------------- #
def test_login_503s_when_admin_is_not_configured(client):
    r = login(client, "anything")
    assert r.status_code == 503
    assert "not configured" in r.json()["detail"]


def test_verify_503s_when_admin_is_not_configured(client):
    r = client.get("/api/admin/verify", headers=bearer("whatever"))
    assert r.status_code == 503


# --------------------------------------------------------------------------- #
# Password login
# --------------------------------------------------------------------------- #
def test_correct_password_mints_a_token(client, admin_enabled):
    r = login(client, admin_enabled)

    assert r.status_code == 200
    body = r.json()
    assert body["token"]
    assert body["expires_in"] == config.ADMIN_TOKEN_TTL


def test_wrong_password_is_rejected(client, admin_enabled):
    r = login(client, "wrong")
    assert r.status_code == 401
    assert r.json()["detail"] == "invalid password"


def test_password_comparison_is_not_a_prefix_match(client, admin_enabled):
    assert login(client, admin_enabled[:-1]).status_code == 401
    assert login(client, admin_enabled + "x", addr="7.0.0.2").status_code == 401


def test_login_requires_a_password_field(client, admin_enabled):
    r = client.post("/api/admin/login", json={}, headers=ip("7.0.0.3"))
    assert r.status_code == 422


# --------------------------------------------------------------------------- #
# Token gate
# --------------------------------------------------------------------------- #
def test_a_fresh_token_passes_verify(client, admin_enabled):
    token = login(client, admin_enabled).json()["token"]
    assert client.get("/api/admin/verify", headers=bearer(token)).status_code == 200


@pytest.mark.parametrize(
    "headers",
    [
        {},                                            # nothing at all
        {"Authorization": "Bearer "},                  # empty token
        {"Authorization": "not-a-bearer-token"},       # wrong scheme
        {"Authorization": "Bearer garbage.token.xyz"},  # unsigned junk
    ],
)
def test_verify_rejects_missing_or_malformed_credentials(client, admin_enabled, headers):
    assert client.get("/api/admin/verify", headers=headers).status_code == 401


def test_a_token_signed_with_another_secret_is_rejected(client, admin_enabled):
    forged = URLSafeTimedSerializer("attacker-secret", salt="portfolio-admin").dumps({"admin": True})
    r = client.get("/api/admin/verify", headers=bearer(forged))
    assert r.status_code == 401
    assert r.json()["detail"] == "invalid session token"


def test_a_token_past_its_ttl_is_rejected(client, admin_enabled, monkeypatch):
    token = login(client, admin_enabled).json()["token"]
    monkeypatch.setattr(config, "ADMIN_TOKEN_TTL", -1)  # everything is now stale

    r = client.get("/api/admin/verify", headers=bearer(token))

    assert r.status_code == 401
    assert "expired" in r.json()["detail"]


# --------------------------------------------------------------------------- #
# Brute-force lockout
# --------------------------------------------------------------------------- #
def test_repeated_wrong_passwords_lock_the_caller_out(client, admin_enabled):
    allowed = ratelimit.login_limiter.rules[0].limit
    addr = "8.0.0.1"

    for _ in range(allowed):
        assert login(client, "wrong", addr).status_code == 401

    blocked = login(client, "wrong", addr)
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0


def test_lockout_also_blocks_the_right_password(client, admin_enabled):
    """Once locked out, guessing correctly must not be a way back in."""
    allowed = ratelimit.login_limiter.rules[0].limit
    addr = "8.0.0.2"
    for _ in range(allowed):
        login(client, "wrong", addr)

    assert login(client, admin_enabled, addr).status_code == 429


def test_a_successful_login_refunds_the_budget(client, admin_enabled):
    """A legitimate admin who fat-fingers the password a few times must not be
    left one typo away from a lockout."""
    allowed = ratelimit.login_limiter.rules[0].limit
    addr = "8.0.0.3"

    for _ in range(allowed - 1):
        assert login(client, "wrong", addr).status_code == 401
    assert login(client, admin_enabled, addr).status_code == 200

    # Budget is back to full: another near-miss run still only 401s.
    for _ in range(allowed):
        assert login(client, "wrong", addr).status_code == 401
    assert login(client, "wrong", addr).status_code == 429


def test_lockout_is_per_ip(client, admin_enabled):
    allowed = ratelimit.login_limiter.rules[0].limit
    for _ in range(allowed + 1):
        login(client, "wrong", "8.0.0.4")

    assert login(client, admin_enabled, "8.0.0.5").status_code == 200


# --------------------------------------------------------------------------- #
# Write routes stay gated
# --------------------------------------------------------------------------- #
ARTICLE = {"title": "Hello", "body": "Some words about things."}


@pytest.mark.parametrize(
    "method, path",
    [
        ("get", "/api/admin/articles"),
        ("get", "/api/admin/articles/x"),
        ("post", "/api/admin/articles"),
        ("put", "/api/admin/articles/x"),
        ("delete", "/api/admin/articles/x"),
    ],
)
def test_article_writes_require_a_token(client, admin_enabled, method, path):
    r = getattr(client, method)(path, json=ARTICLE) if method in {"post", "put"} else getattr(client, method)(path)
    assert r.status_code == 401


def test_article_routes_report_a_missing_database(client, admin_enabled):
    token = login(client, admin_enabled).json()["token"]
    r = client.get("/api/admin/articles", headers=bearer(token))
    assert r.status_code == 503
    assert "database" in r.json()["detail"]


# --------------------------------------------------------------------------- #
# Pure helpers
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "title, expected",
    [
        ("Hello World", "hello-world"),
        ("  Trailing & leading  ", "trailing-leading"),
        # Non-ASCII is dropped rather than transliterated, and each run of
        # dropped characters collapses to a single dash.
        ("Ünïcode 123", "n-code-123"),
        ("!!!", "post"),        # nothing usable left => stable fallback
        ("", "post"),
        ("A/B testing", "a-b-testing"),
    ],
)
def test_slugify(title, expected):
    assert slugify(title) == expected


def test_reading_time_scales_with_length():
    assert estimate_reading_time("word " * 200) == "1 min read"
    assert estimate_reading_time("word " * 1000) == "5 min read"
    # Never advertises "0 min read", however short the post is.
    assert estimate_reading_time("hi") == "1 min read"
