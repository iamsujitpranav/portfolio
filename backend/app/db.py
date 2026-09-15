"""PostgreSQL layer (SQLAlchemy 2.0 async + pgvector).

Every database in this project is PostgreSQL. The tables:
  - leads:           persisted contact-form submissions
  - documents:       résumé/article chunks with a pgvector embedding for RAG
  - articles:        blog posts
  - journey_events:  first-party 3D-journey telemetry (no IP, no cookie)

If DATABASE_URL is unset, the whole layer is inert and callers fall back
(contact => email only, chat => full-context injection).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import String, Text, Integer, Float, DateTime, Boolean, ARRAY, delete, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from . import config


class Base(DeclarativeBase):
    pass


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320), index=True)
    message: Mapped[str] = mapped_column(Text)
    source_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(200), index=True)  # e.g. "resume:experience" or "article:slug"
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(config.EMBED_DIM))


class Article(Base):
    """A blog post. Body is Markdown/MDX source, rendered by the frontend."""

    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(String(600), default="")
    body: Mapped[str] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    reading_time: Mapped[str] = mapped_column(String(40), default="")
    # Drafts (published=False) are hidden from the public API; only the admin sees them.
    published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class JourneyEvent(Base):
    """One thing a visitor did in the 3D journey.

    Deliberately anonymous: `session_id` is a random value the browser minted
    for one tab and forgot on close, and NOTHING here identifies a person — no
    IP (unlike `leads`, which needs one for abuse triage), no user agent, no
    cookie. The point is "which stops get opened and where do people stop
    walking", which needs none of that.
    """

    __tablename__ = "journey_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(64), index=True)
    # Seconds since the session's first event — the shape of a visit without a
    # clock that could be correlated against anything else.
    offset_s: Mapped[float] = mapped_column(Float, default=0.0)
    props: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Indexed because the admin dashboard only ever reads a trailing window.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


# Lazily-created engine/session so the module imports cleanly without a DB.
_engine = None
_Session: Optional[async_sessionmaker[AsyncSession]] = None


def get_sessionmaker() -> Optional[async_sessionmaker[AsyncSession]]:
    global _engine, _Session
    if not config.DB_ENABLED:
        return None
    if _Session is None:
        _engine = create_async_engine(config.DATABASE_URL, pool_pre_ping=True)
        _Session = async_sessionmaker(_engine, expire_on_commit=False)
    return _Session


async def init_db() -> None:
    """Create the pgvector extension and tables. Safe to call on startup."""
    sm = get_sessionmaker()
    if sm is None or _engine is None:
        return
    from sqlalchemy import text

    async with _engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        # create_all skips tables that already exist, indexes included — so an
        # index added to a model after its table shipped needs saying twice.
        # The name matches SQLAlchemy's own convention, so the two can't
        # duplicate each other on a fresh database.
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_journey_events_created_at "
                "ON journey_events (created_at)"
            )
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_leads_created_at ON leads (created_at)")
        )
        now = datetime.now(timezone.utc)
        if config.LEAD_RETENTION_DAYS:
            await conn.execute(
                delete(Lead).where(
                    Lead.created_at < now - timedelta(days=config.LEAD_RETENTION_DAYS)
                )
            )
        if config.ANALYTICS_RETENTION_DAYS:
            await conn.execute(
                delete(JourneyEvent).where(
                    JourneyEvent.created_at
                    < now - timedelta(days=config.ANALYTICS_RETENTION_DAYS)
                )
            )
