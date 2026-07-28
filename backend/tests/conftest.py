"""Shared fixtures.

Every test runs against a deliberately *unconfigured* app: no Anthropic key, no
database, no SMTP. That is not a limitation — it is the point. It guarantees a
test run can never spend Claude tokens, write to the real Postgres or send mail,
so the suite is safe to run anywhere, including CI with no secrets.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app import config, ratelimit
from app.main import app


@pytest.fixture(autouse=True)
def neutral_config(monkeypatch):
    """Disable every external sink and hand each test empty limiter state."""
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(config, "DB_ENABLED", False)
    monkeypatch.setattr(config, "SMTP_ENABLED", False)
    monkeypatch.setattr(config, "ADMIN_ENABLED", False)
    monkeypatch.setattr(config, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(config, "TRUST_PROXY_HEADERS", True)

    # Limiters are module-level singletons, so state leaks between tests unless
    # it's explicitly dropped on both sides of the test.
    for limiter in ratelimit.ALL_LIMITERS:
        limiter.clear()
    yield
    for limiter in ratelimit.ALL_LIMITERS:
        limiter.clear()


@pytest.fixture
def client():
    # Context manager form so the lifespan (best-effort init_db) runs too.
    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin_enabled(monkeypatch):
    """Turn admin auth on with throwaway credentials."""
    monkeypatch.setattr(config, "ADMIN_PASSWORD", "correct-horse-battery")
    monkeypatch.setattr(config, "SESSION_SECRET", "test-session-secret")
    monkeypatch.setattr(config, "ADMIN_ENABLED", True)
    return "correct-horse-battery"


def ip(addr: str) -> dict[str, str]:
    """Headers pinning the caller IP, so each test gets its own limiter budget."""
    return {"x-real-ip": addr}


def make_request(headers: dict[str, str] | None = None, client=("10.0.0.1", 1234)) -> Request:
    """A bare Starlette Request — enough to exercise ratelimit.client_ip()."""
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "scheme": "http",
            "server": ("testserver", 80),
            "query_string": b"",
            "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
            "client": client,
        }
    )


class FakeClock:
    """Injectable monotonic clock so window tests don't sleep."""

    def __init__(self, start: float = 1_000.0):
        self.t = start

    def __call__(self) -> float:
        return self.t

    def advance(self, dt: float) -> None:
        self.t += dt
