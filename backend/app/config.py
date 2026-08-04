"""Environment-backed settings for the FastAPI backend."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env if present.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Repo root => two levels up from this file (backend/app/config.py).
REPO_ROOT = Path(__file__).resolve().parents[2]
CONTENT_DIR = REPO_ROOT / "content"
ARTICLES_DIR = CONTENT_DIR / "articles"

# --- Claude ---
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8")

# --- Database ---
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# --- Embeddings ---
VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY", "").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
EMBED_DIM = int(os.getenv("EMBED_DIM", "1024"))
VOYAGE_MODEL = os.getenv("VOYAGE_MODEL", "voyage-3")
OPENAI_EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")

# --- Contact / SMTP email ---
# Plain SMTP (e.g. Gmail with an app password) — no sender-domain verification
# needed, unlike a transactional API. Port 465 = implicit SSL.
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
# Gmail requires the envelope sender to be the authenticated account, so the
# From address defaults to SMTP_USER.
SMTP_FROM = os.getenv("SMTP_FROM", "").strip() or SMTP_USER
CONTACT_TO_EMAIL = os.getenv("CONTACT_TO_EMAIL", "sujitreddy0602@gmail.com").strip()

# --- CORS ---
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:61991").split(",") if o.strip()]


def _flag(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() not in {"0", "false", "no", "off", ""}


# --- Abuse protection ---
# Rate-limit specs are "hits/seconds" pairs, comma-separated: a short burst
# rule plus a longer sustained one.
RATE_LIMIT_ENABLED = _flag("RATE_LIMIT_ENABLED", "1")
# Claude tokens cost money, so chat is the tightest budget of the three.
CHAT_RATE_LIMIT = os.getenv("CHAT_RATE_LIMIT", "12/300, 60/3600").strip()
CONTACT_RATE_LIMIT = os.getenv("CONTACT_RATE_LIMIT", "3/600, 10/86400").strip()
# Journey telemetry is batched client-side (a dozen events per request), so this
# is generous by comparison — it only needs to stop a script hammering the DB.
EVENTS_RATE_LIMIT = os.getenv("EVENTS_RATE_LIMIT", "60/60, 600/3600").strip()
# Counts only failed admin logins — a success resets the caller's budget.
LOGIN_RATE_LIMIT = os.getenv("LOGIN_RATE_LIMIT", "5/900, 20/86400").strip()

# Trust X-Real-IP / X-Forwarded-For for the caller identity. Correct behind the
# documented nginx front end (deploy/nginx.conf); turn OFF if uvicorn is ever
# exposed directly, since a direct caller can forge those headers and so dodge
# every per-IP limit above.
TRUST_PROXY_HEADERS = _flag("TRUST_PROXY_HEADERS", "1")

# Chat payload ceilings — an unbounded message is an unbounded input-token bill.
CHAT_MAX_MESSAGE_CHARS = int(os.getenv("CHAT_MAX_MESSAGE_CHARS", "2000"))
CHAT_MAX_TOTAL_CHARS = int(os.getenv("CHAT_MAX_TOTAL_CHARS", "12000"))

# --- Chat cost controls ---
# The system prompt asks for 2–4 sentences (~100 tokens). This is the ceiling on
# the worst case, not the target, and output bills several times input — so it
# wants headroom, not a blank cheque.
CHAT_MAX_TOKENS = int(os.getenv("CHAT_MAX_TOKENS", "400"))

# Cache the system block (instructions + résumé) with Anthropic. Worth roughly
# 90% of the input cost of every question, because with RAG off the block is
# byte-identical on every request. Two things silently turn it into a no-op
# rather than an error: a system block under the model's cache minimum (1024
# tokens, 2048 on Haiku — the résumé is ~2.5k, so watch this if resume.json ever
# shrinks), and RAG being ON, which varies the context per query.
CHAT_PROMPT_CACHE = _flag("CHAT_PROMPT_CACHE", "1")

# Screen out prompt injection, "write me a Python script" and the weather before
# a token is spent. See guard.py for why it only rejects on positive evidence.
CHAT_GUARD_ENABLED = _flag("CHAT_GUARD_ENABLED", "1")

# Reuse the answer to an opening question that has been asked before. The
# suggestion chips in AskPanel are one click each and are asked far more than
# anything else, so this is where the hit rate lives.
CHAT_CACHE_ENABLED = _flag("CHAT_CACHE_ENABLED", "1")
CHAT_CACHE_SIZE = int(os.getenv("CHAT_CACHE_SIZE", "256"))
CHAT_CACHE_TTL = int(os.getenv("CHAT_CACHE_TTL", str(24 * 3600)))

# --- Admin auth (single-admin blog authoring) ---
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()
SESSION_SECRET = os.getenv("SESSION_SECRET", "").strip()
ADMIN_TOKEN_TTL = int(os.getenv("ADMIN_TOKEN_TTL", str(7 * 24 * 3600)))  # 7 days

# --- Journey analytics ---
# First-party only: no third-party script, no cookie, no IP stored. Off here
# means /api/events accepts and discards, so the frontend needs no coordination.
ANALYTICS_ENABLED = _flag("ANALYTICS_ENABLED", "1")
EVENTS_MAX_PER_BATCH = int(os.getenv("EVENTS_MAX_PER_BATCH", "50"))
# Store the TEXT of what visitors ask the résumé assistant, not just how many
# asked. It is the highest-signal thing on the site — a recruiter's question is
# them telling you what the résumé failed to answer — but it is also the one
# field a visitor could type their own name into, so it is OFF by default and
# the browser's copy is dropped at the door until you turn it on.
ANALYTICS_QUESTIONS = _flag("ANALYTICS_QUESTIONS", "0")

# --- Feature flags derived from config ---
DB_ENABLED = bool(DATABASE_URL)
ADMIN_ENABLED = bool(ADMIN_PASSWORD and SESSION_SECRET)
EMBEDDINGS_ENABLED = bool(VOYAGE_API_KEY or OPENAI_API_KEY)
RAG_ENABLED = DB_ENABLED and EMBEDDINGS_ENABLED
SMTP_ENABLED = bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)
