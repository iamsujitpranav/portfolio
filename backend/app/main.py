"""FastAPI backend for the portfolio: résumé chat (Claude + pgvector RAG)
and a contact endpoint (PostgreSQL persistence + Resend email)."""
from __future__ import annotations

import contextlib
import smtplib
from email.message import EmailMessage
from typing import Literal

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from starlette.concurrency import run_in_threadpool

from . import config, guard, rag, ratelimit, resume_context
from .admin import router as admin_router
from .analytics import router as analytics_router
from .articles import router as articles_router
from .db import JourneyEvent, Lead, get_sessionmaker, init_db


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI):
    # Best-effort DB bootstrap (extension + tables). No-op if DB disabled.
    with contextlib.suppress(Exception):
        await init_db()
    yield


app = FastAPI(title="Sujit Pranav Reddy — Portfolio API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(articles_router)
app.include_router(admin_router)
app.include_router(analytics_router)


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #
@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "claude": bool(config.ANTHROPIC_API_KEY),
        "db": config.DB_ENABLED,
        "rag": config.RAG_ENABLED,
        "smtp": config.SMTP_ENABLED,
        "admin": config.ADMIN_ENABLED,
        "analytics": config.ANALYTICS_ENABLED,
        "rate_limit": config.RATE_LIMIT_ENABLED,
        "model": config.ANTHROPIC_MODEL,
        # Cost controls, so a deploy can be checked without reading the env.
        "chat_guard": config.CHAT_GUARD_ENABLED,
        "chat_cache": config.CHAT_CACHE_ENABLED,
        "prompt_cache": config.CHAT_PROMPT_CACHE,
        "max_tokens": config.CHAT_MAX_TOKENS,
    }


# --------------------------------------------------------------------------- #
# Chat — streamed Claude answer grounded in résumé context (pgvector RAG)
# --------------------------------------------------------------------------- #
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    # Bounded so one request can't turn into an arbitrarily large Claude bill.
    content: str = Field(min_length=1, max_length=config.CHAT_MAX_MESSAGE_CHARS)

    @field_validator("content")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message content cannot be blank")
        return v


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)

    @model_validator(mode="after")
    def _cap_conversation(self) -> ChatRequest:
        # Per-message caps alone still allow 40 x max-length turns, so bound
        # the transcript as a whole too.
        total = sum(len(m.content) for m in self.messages)
        if total > config.CHAT_MAX_TOTAL_CHARS:
            raise ValueError(
                f"conversation too long ({total} chars, max {config.CHAT_MAX_TOTAL_CHARS})"
            )
        return self


def _system_prompt(context: str) -> str:
    p = resume_context.profile()
    return (
        f"You are the résumé of {p['name']}, answering questions from recruiters and engineers on his "
        f"portfolio site. Answer ONLY from the CONTEXT below. Be concise (2–4 sentences), professional, "
        f"and speak in the third person about \"{p['name'].split()[0]}\". If something isn't in the "
        f"context, say you don't have that detail and suggest emailing {p['email']}. Never invent facts, "
        f"employers, dates, or numbers.\n\nCONTEXT:\n{context}"
    )


def _canned(text: str, source: str, *, chunk: int = 24) -> StreamingResponse:
    """Answer without calling the model, in the shape the browser already reads.

    The frontend consumes a plain-text stream and renders it as it arrives, so a
    guard refusal and a cache hit go back the same way rather than as a distinct
    error shape the client would need teaching about. Chunked, but with no
    artificial delay — a fake typing effect would be latency invented on purpose.
    """

    async def gen():
        for i in range(0, len(text), chunk):
            yield text[i : i + chunk]

    return StreamingResponse(
        gen(),
        media_type="text/plain; charset=utf-8",
        headers={"X-Chat-Source": source},
    )


@app.post("/api/chat", dependencies=[Depends(ratelimit.limit(ratelimit.chat_limiter))])
async def chat(req: ChatRequest):
    last_user = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
    # Only the opening turn is cacheable: after that the answer depends on the
    # conversation, and two visitors who typed the same words are no longer
    # asking the same thing.
    first_turn = len(req.messages) == 1

    # Cheapest path first — both of these answer without a key, a context or a
    # token, so they run ahead of the configuration check.
    verdict = guard.screen(last_user)
    if not verdict.ok:
        return _canned(verdict.reply, f"guard:{verdict.reason}")

    if first_turn:
        cached = guard.ANSWER_CACHE.get(last_user)
        if cached is not None:
            return _canned(cached, "cache")

    if not config.ANTHROPIC_API_KEY:
        return JSONResponse(
            {"error": "chat_unconfigured", "detail": "ANTHROPIC_API_KEY is not set."},
            status_code=503,
        )

    # Retrieve grounding context from the latest user message.
    context = await rag.retrieve_context(last_user)
    # A list of blocks rather than a bare string so the whole thing — instructions
    # and résumé — can be marked cacheable. With RAG off this block is identical
    # on every request, which is exactly the case prompt caching is for.
    system: list[dict] = [{"type": "text", "text": _system_prompt(context)}]
    if config.CHAT_PROMPT_CACHE:
        system[0]["cache_control"] = {"type": "ephemeral"}
    anthropic_messages = [{"role": m.role, "content": m.content} for m in req.messages]

    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)

    async def token_stream():
        parts: list[str] = []
        async with client.messages.stream(
            model=config.ANTHROPIC_MODEL,
            max_tokens=config.CHAT_MAX_TOKENS,
            system=system,
            messages=anthropic_messages,
        ) as stream:
            async for text in stream.text_stream:
                parts.append(text)
                yield text
        # Only a cleanly finished answer is stored. A visitor who closes the tab
        # mid-stream raises out of the generator before this line, so a truncated
        # answer can never be served to the next person who asks.
        if first_turn:
            guard.ANSWER_CACHE.put(last_user, "".join(parts))

    return StreamingResponse(
        token_stream(),
        media_type="text/plain; charset=utf-8",
        headers={"X-Chat-Source": "model"},
    )


# --------------------------------------------------------------------------- #
# Contact — persist lead to PostgreSQL + send via Resend
# --------------------------------------------------------------------------- #
class ContactRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    message: str = Field(min_length=10, max_length=5000)


async def _persist_lead(data: ContactRequest, ip: str | None) -> bool:
    sm = get_sessionmaker()
    if sm is None:
        return False
    async with sm() as session:
        session.add(Lead(name=data.name, email=str(data.email), message=data.message, source_ip=ip))
        await session.commit()
    return True


def _send_email(data: ContactRequest) -> bool:
    """Deliver the lead over SMTP. Returns False when SMTP isn't configured."""
    if not config.SMTP_ENABLED:
        return False

    msg = EmailMessage()
    msg["From"] = config.SMTP_FROM
    msg["To"] = config.CONTACT_TO_EMAIL
    msg["Reply-To"] = str(data.email)  # hitting reply answers the visitor
    msg["Subject"] = f"Portfolio contact — {data.name}"
    msg.set_content(f"From: {data.name} <{data.email}>\n\n{data.message}")

    with smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=20) as smtp:
        smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
        smtp.send_message(msg)
    return True


@app.post("/api/contact", dependencies=[Depends(ratelimit.limit(ratelimit.contact_limiter))])
async def contact(data: ContactRequest, request: Request):
    ip = ratelimit.client_ip(request)

    persisted = False
    emailed = False
    errors: list[str] = []

    try:
        persisted = await _persist_lead(data, ip)
    except Exception as e:  # configured but failing => surface it
        if config.DB_ENABLED:
            errors.append(f"db: {e.__class__.__name__}")

    try:
        emailed = await run_in_threadpool(_send_email, data)
    except Exception as e:
        if config.SMTP_ENABLED:
            errors.append(f"email: {e.__class__.__name__}")

    # A configured sink that errored is a real failure.
    if errors:
        return JSONResponse({"ok": False, "errors": errors}, status_code=502)

    # In early dev nothing may be configured — accept so the UI works, but say so.
    return {"ok": True, "persisted": persisted, "emailed": emailed}


# --------------------------------------------------------------------------- #
# Journey analytics — first-party, anonymous, batched
# --------------------------------------------------------------------------- #
# What gets stored is described on db.JourneyEvent: a random per-tab session id,
# an event name, a time offset and a small bag of scalars. No IP, no cookie, no
# user agent. The frontend honours Do-Not-Track before a request is ever made;
# this endpoint is the second half of that promise, and stores nothing that
# could re-identify a visitor even if the table leaked.
Scalar = str | int | float | bool


class JourneyEventIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    # Milliseconds since the session's first event, per the client.
    t: float = Field(default=0.0, ge=0, le=86_400_000)
    props: dict[str, Scalar] | None = None

    @field_validator("props")
    @classmethod
    def _bound_props(cls, v: dict[str, Scalar] | None) -> dict[str, Scalar] | None:
        if not v:
            return None
        if len(v) > 12:
            raise ValueError("too many event properties")
        out: dict[str, Scalar] = {}
        for key, value in v.items():
            out[key[:32]] = value[:200] if isinstance(value, str) else value
        return out


class EventBatch(BaseModel):
    sid: str = Field(min_length=1, max_length=64)
    events: list[JourneyEventIn] = Field(min_length=1, max_length=config.EVENTS_MAX_PER_BATCH)


def _scrub(event: JourneyEventIn) -> dict[str, Scalar] | None:
    """Drop free text at the door unless it was explicitly opted into.

    The browser always sends the question it asked the assistant, so turning
    ANALYTICS_QUESTIONS on takes effect immediately with no frontend rebuild.
    Off (the default) it is discarded HERE — never written, never logged."""
    props = event.props
    if not props or config.ANALYTICS_QUESTIONS:
        return props
    return {k: v for k, v in props.items() if k != "q"} or None


@app.post("/api/events", dependencies=[Depends(ratelimit.limit(ratelimit.events_limiter))])
async def events(batch: EventBatch):
    """Accept a batch of journey events. Always 200: a visitor's experience must
    never depend on telemetry landing, and the browser beacons this on pagehide
    where a retry is impossible anyway."""
    if not config.ANALYTICS_ENABLED:
        return {"ok": True, "stored": 0}

    sm = get_sessionmaker()
    if sm is None:
        return {"ok": True, "stored": 0}

    try:
        async with sm() as session:
            session.add_all(
                [
                    JourneyEvent(
                        session_id=batch.sid,
                        name=e.name,
                        offset_s=round(e.t / 1000.0, 2),
                        props=_scrub(e),
                    )
                    for e in batch.events
                ]
            )
            await session.commit()
    except Exception:
        # A telemetry write is never worth a 5xx on a page the visitor is
        # actively leaving.
        return {"ok": True, "stored": 0}

    return {"ok": True, "stored": len(batch.events)}
