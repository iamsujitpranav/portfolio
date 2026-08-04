"""Per-IP rate limiting for the public endpoints.

The three public POST routes each cost something real when abused — Claude
tokens (/api/chat), inbox spam (/api/contact) and password guesses
(/api/admin/login) — so each gets its own sliding-window budget.

Scope: this limiter is in-process. Under gunicorn's `-w 2` each worker keeps
its own counters, so the effective ceiling is `workers x limit`. That is fine
as a cost/abuse backstop; the hard edge limit lives in nginx (`limit_req`, see
deploy/nginx.conf), which sees every request regardless of worker.
"""
from __future__ import annotations

import math
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Callable, Deque, Iterable, Optional

from fastapi import HTTPException, Request

from . import config

# Keys idle for longer than the widest rule are dropped on a periodic sweep so
# the dict can't grow without bound.
_SWEEP_INTERVAL = 60.0


# --------------------------------------------------------------------------- #
# Client identity
# --------------------------------------------------------------------------- #
def client_ip(request: Request) -> str:
    """Best-effort caller IP.

    Forwarded headers are only consulted when TRUST_PROXY_HEADERS is on,
    because anyone talking to uvicorn directly can invent them. Nginx sets
    X-Real-IP from $remote_addr, which is the value we trust most; for
    X-Forwarded-For we take the RIGHTMOST entry, since
    `$proxy_add_x_forwarded_for` appends the peer our proxy actually saw —
    everything to its left is client-supplied and spoofable.
    """
    if config.TRUST_PROXY_HEADERS:
        real = (request.headers.get("x-real-ip") or "").strip()
        if real:
            return real
        forwarded = request.headers.get("x-forwarded-for") or ""
        hops = [h.strip() for h in forwarded.split(",") if h.strip()]
        if hops:
            return hops[-1]
    return request.client.host if request.client else "unknown"


# --------------------------------------------------------------------------- #
# Rules
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Rule:
    """At most `limit` hits in any `window` seconds."""

    limit: int
    window: float

    def __post_init__(self) -> None:
        if self.limit < 1 or self.window <= 0:
            raise ValueError(f"invalid rule: {self.limit}/{self.window}")


def parse_rules(spec: str) -> list[Rule]:
    """Parse a `"12/300, 60/3600"` env spec into rules (hits/seconds)."""
    rules: list[Rule] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        limit, _, window = part.partition("/")
        rules.append(Rule(int(limit.strip()), float(window.strip())))
    if not rules:
        raise ValueError(f"no rules in spec: {spec!r}")
    return rules


class RateLimiter:
    """Sliding-window counter over a deque of hit timestamps per key.

    Exact (not approximate like a fixed window) because every timestamp inside
    the widest window is retained — affordable here since the windows are
    minutes and the limits are small.
    """

    def __init__(self, name: str, rules: Iterable[Rule], *, clock: Callable[[], float] = time.monotonic):
        self.name = name
        # Narrowest window first: the tightest burst rule should be the one
        # reported in Retry-After.
        self.rules = sorted(rules, key=lambda r: r.window)
        if not self.rules:
            raise ValueError("a limiter needs at least one rule")
        self._widest = self.rules[-1].window
        self._clock = clock
        self._hits: dict[str, Deque[float]] = {}
        self._lock = threading.Lock()
        self._last_sweep = 0.0

    # -- internals --------------------------------------------------------- #
    def _sweep(self, now: float) -> None:
        if now - self._last_sweep < _SWEEP_INTERVAL:
            return
        self._last_sweep = now
        cutoff = now - self._widest
        for key in [k for k, dq in self._hits.items() if not dq or dq[-1] <= cutoff]:
            del self._hits[key]

    # -- API --------------------------------------------------------------- #
    def check(self, key: str, *, record: bool = True) -> Optional[float]:
        """Return seconds to wait if `key` is over budget, else None.

        When under budget the hit is recorded (unless `record=False`).
        """
        now = self._clock()
        with self._lock:
            self._sweep(now)
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - self._widest:
                hits.popleft()

            for rule in self.rules:
                cutoff = now - rule.window
                # hits is sorted, so everything from the first in-window entry
                # onwards counts towards this rule.
                in_window = [t for t in hits if t > cutoff]
                if len(in_window) >= rule.limit:
                    # Budget frees up when the oldest in-window hit ages out.
                    return max(1.0, rule.window - (now - in_window[0]))

            if record:
                hits.append(now)
            return None

    def reset(self, key: str) -> None:
        """Forget a key's history (e.g. after a successful admin login)."""
        with self._lock:
            self._hits.pop(key, None)

    def clear(self) -> None:
        """Drop all state. Used by tests."""
        with self._lock:
            self._hits.clear()
            self._last_sweep = 0.0

    def enforce(self, key: str, *, record: bool = True) -> None:
        """Raise 429 when `key` is over budget."""
        if not config.RATE_LIMIT_ENABLED:
            return
        retry_after = self.check(key, record=record)
        if retry_after is None:
            return
        seconds = int(math.ceil(retry_after))
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Try again in {seconds}s.",
            headers={"Retry-After": str(seconds)},
        )


# --------------------------------------------------------------------------- #
# The limiters this app uses
# --------------------------------------------------------------------------- #
chat_limiter = RateLimiter("chat", parse_rules(config.CHAT_RATE_LIMIT))
contact_limiter = RateLimiter("contact", parse_rules(config.CONTACT_RATE_LIMIT))
login_limiter = RateLimiter("admin-login", parse_rules(config.LOGIN_RATE_LIMIT))
events_limiter = RateLimiter("events", parse_rules(config.EVENTS_RATE_LIMIT))

ALL_LIMITERS = (chat_limiter, contact_limiter, login_limiter, events_limiter)


def limit(limiter: RateLimiter) -> Callable[[Request], None]:
    """Build a FastAPI dependency that enforces `limiter` on the caller's IP."""

    def dependency(request: Request) -> None:
        limiter.enforce(client_ip(request))

    return dependency
