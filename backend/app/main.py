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

from . import config, rag, ratelimit, resume_context
from .admin import router as admin_router
from .articles import router as articles_router
from .db import Lead, get_sessionmaker, init_db


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
        "rate_limit": config.RATE_LIMIT_ENABLED,
        "model": config.ANTHROPIC_MODEL,
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


@app.post("/api/chat", dependencies=[Depends(ratelimit.limit(ratelimit.chat_limiter))])
async def chat(req: ChatRequest):
    if not config.ANTHROPIC_API_KEY:
        return JSONResponse(
            {"error": "chat_unconfigured", "detail": "ANTHROPIC_API_KEY is not set."},
            status_code=503,
        )

    # Retrieve grounding context from the latest user message.
    last_user = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
    context = await rag.retrieve_context(last_user)
    system = _system_prompt(context)
    anthropic_messages = [{"role": m.role, "content": m.content} for m in req.messages]

    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)

    async def token_stream():
        async with client.messages.stream(
            model=config.ANTHROPIC_MODEL,
            max_tokens=1024,
            system=system,
            messages=anthropic_messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    return StreamingResponse(token_stream(), media_type="text/plain; charset=utf-8")


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
