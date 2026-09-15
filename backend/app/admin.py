"""Admin auth + write endpoints for blog authoring (single admin).

A correct ADMIN_PASSWORD (POST /api/admin/login) mints a signed, time-limited
token (itsdangerous). Every write route requires that token as a Bearer header.
The whole module is inert unless ADMIN_PASSWORD and SESSION_SECRET are set.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import re
import struct
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select

from . import config, ratelimit
from .db import Article, get_sessionmaker

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger("portfolio.admin")


def _totp_code(secret: str, counter: int) -> str | None:
    """Return a six-digit TOTP code for a base32 secret."""
    try:
        padded = secret + "=" * ((8 - len(secret) % 8) % 8)
        key = base64.b32decode(padded, casefold=True)
    except (ValueError, base64.binascii.Error):
        return None
    digest = hmac.new(key, struct.pack("!Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack("!I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return f"{number % 1_000_000:06d}"


def _valid_totp(code: str | None) -> bool:
    if not code or not re.fullmatch(r"\d{6}", code.strip()):
        return False
    counter = int(time.time()) // 30
    supplied = code.strip()
    return any(
        hmac.compare_digest(_totp_code(config.ADMIN_TOTP_SECRET, counter + drift) or "", supplied)
        for drift in (-1, 0, 1)
    )


# --------------------------------------------------------------------------- #
# Token signing / verification
# --------------------------------------------------------------------------- #
def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(config.SESSION_SECRET, salt="portfolio-admin")


async def require_admin(authorization: Optional[str] = Header(default=None)) -> bool:
    """Gate a route behind a valid admin session token."""
    if not config.ADMIN_ENABLED:
        raise HTTPException(status_code=503, detail="admin auth is not configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = _serializer().loads(token, max_age=config.ADMIN_TOKEN_TTL)
        if payload.get("admin") is not True or payload.get("epoch") != config.ADMIN_SESSION_EPOCH:
            raise BadSignature("stale admin session")
    except SignatureExpired:
        raise HTTPException(status_code=401, detail="session expired — log in again")
    except BadSignature:
        raise HTTPException(status_code=401, detail="invalid session token")
    return True


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=500)
    otp: str | None = Field(default=None, max_length=12)


class LoginResponse(BaseModel):
    token: str
    expires_in: int


class ArticleIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=100_000)
    description: str = Field(default="", max_length=600)
    tags: list[str] = Field(default_factory=list, max_length=20)
    slug: Optional[str] = Field(default=None, max_length=200)
    reading_time: Optional[str] = Field(default=None, max_length=40)
    published: bool = False
    @field_validator("body")
    @classmethod
    def _safe_body(cls, value: str) -> str:
        return _validate_mdx(value)


class ArticleUpdate(BaseModel):
    """All optional — only the fields sent are changed (partial update)."""

    title: Optional[str] = Field(default=None, max_length=300)
    body: Optional[str] = Field(default=None, max_length=100_000)
    description: Optional[str] = Field(default=None, max_length=600)
    tags: Optional[list[str]] = Field(default=None, max_length=20)
    reading_time: Optional[str] = Field(default=None, max_length=40)
    published: Optional[bool] = None
    @field_validator("body")
    @classmethod
    def _safe_body(cls, value: str | None) -> str | None:
        return None if value is None else _validate_mdx(value)


class ArticleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    title: str
    description: str
    body: str
    tags: list[str]
    reading_time: str
    published: bool
    published_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _validate_mdx(value: str) -> str:
    """Allow Markdown only; MDX code/imports never reach the evaluator."""
    plain = re.sub(r"```[\s\S]*?```|`[^`]*`", "", value)
    unsafe = (
        re.search(r"(?mi)^\s*(?:import|export)\b", plain)
        or re.search(r"<\s*/?\s*[A-Za-z][^>]*>", plain)
        or re.search(r"[{}]", plain)
        or re.search(r"(?i)\]\(\s*(?:javascript|data|vbscript):", plain)
    )
    if unsafe:
        raise ValueError("article body may contain Markdown only")
    return value

def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "post"


def estimate_reading_time(body: str) -> str:
    words = len(re.findall(r"\w+", body))
    return f"{max(1, round(words / 200))} min read"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _require_db():
    sm = get_sessionmaker()
    if sm is None:
        raise HTTPException(status_code=503, detail="database is not configured")
    return sm


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request):
    if not config.ADMIN_ENABLED:
        raise HTTPException(status_code=503, detail="admin auth is not configured")

    # Throttle guesses. The attempt is booked before the compare, then refunded
    # on success — so the budget only ever burns on FAILED logins and a legit
    # admin who fat-fingers the password isn't locked out afterwards.
    ip = ratelimit.client_ip(request)
    ratelimit.login_limiter.enforce(ip)

    # Constant-time compare so a wrong password cannot be probed by timing.
    if not hmac.compare_digest(body.password, config.ADMIN_PASSWORD):
        logger.warning("admin_login_failed reason=password ip=%s", ip)
        raise HTTPException(status_code=401, detail="invalid password")

    if config.ADMIN_MFA_ENABLED and not _valid_totp(body.otp):
        logger.warning("admin_login_failed reason=otp ip=%s", ip)
        raise HTTPException(status_code=401, detail="invalid one-time code")

    ratelimit.login_limiter.reset(ip)
    logger.info("admin_login_succeeded ip=%s", ip)
    token = _serializer().dumps({"admin": True, "epoch": config.ADMIN_SESSION_EPOCH})
    return LoginResponse(token=token, expires_in=config.ADMIN_TOKEN_TTL)


@router.get("/verify")
async def verify(_: bool = Depends(require_admin)):
    """Cheap check the UI uses to see whether a stored token is still valid."""
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Article CRUD (all admin-only)
# --------------------------------------------------------------------------- #
@router.get("/articles", response_model=list[ArticleOut])
async def admin_list(_: bool = Depends(require_admin)):
    sm = _require_db()
    async with sm() as session:
        rows = (
            await session.execute(select(Article).order_by(Article.updated_at.desc()))
        ).scalars().all()
        return list(rows)


@router.get("/articles/{slug}", response_model=ArticleOut)
async def admin_get(slug: str, _: bool = Depends(require_admin)):
    sm = _require_db()
    async with sm() as session:
        row = (
            await session.execute(select(Article).where(Article.slug == slug))
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="article not found")
        return row


@router.post("/articles", response_model=ArticleOut, status_code=201)
async def admin_create(data: ArticleIn, _: bool = Depends(require_admin)):
    sm = _require_db()
    slug = slugify(data.slug or data.title)
    async with sm() as session:
        exists = (
            await session.execute(select(Article.id).where(Article.slug == slug))
        ).scalar_one_or_none()
        if exists is not None:
            raise HTTPException(status_code=409, detail=f"slug '{slug}' already exists")
        article = Article(
            slug=slug,
            title=data.title,
            description=data.description,
            body=data.body,
            tags=data.tags,
            reading_time=data.reading_time or estimate_reading_time(data.body),
            published=data.published,
            published_at=_now() if data.published else None,
        )
        session.add(article)
        await session.commit()
        await session.refresh(article)
        logger.info("admin_article_created slug=%s", article.slug)
        return article


@router.put("/articles/{slug}", response_model=ArticleOut)
async def admin_update(slug: str, data: ArticleUpdate, _: bool = Depends(require_admin)):
    sm = _require_db()
    fields = data.model_dump(exclude_unset=True)
    async with sm() as session:
        article = (
            await session.execute(select(Article).where(Article.slug == slug))
        ).scalar_one_or_none()
        if article is None:
            raise HTTPException(status_code=404, detail="article not found")

        was_published = article.published
        for key, value in fields.items():
            setattr(article, key, value)

        # Recompute reading time when the body changed and none was supplied.
        if "body" in fields and "reading_time" not in fields:
            article.reading_time = estimate_reading_time(article.body)

        # Stamp published_at on the first transition to published.
        if fields.get("published") and not was_published and article.published_at is None:
            article.published_at = _now()

        await session.commit()
        await session.refresh(article)
        logger.info("admin_article_updated slug=%s fields=%s", slug, ",".join(sorted(fields)))
        return article


@router.delete("/articles/{slug}", status_code=204)
async def admin_delete(slug: str, _: bool = Depends(require_admin)):
    sm = _require_db()
    async with sm() as session:
        article = (
            await session.execute(select(Article).where(Article.slug == slug))
        ).scalar_one_or_none()
        if article is None:
            raise HTTPException(status_code=404, detail="article not found")
        await session.delete(article)
        await session.commit()
        logger.info("admin_article_deleted slug=%s", slug)
    return None
