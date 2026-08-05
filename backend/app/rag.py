"""Retrieval for the résumé chat.

If Postgres + an embedding provider are configured, retrieve the top-k most
relevant chunks from pgvector. Otherwise (or on any error) fall back to
injecting the full résumé — it's small enough to pass whole.
"""
from __future__ import annotations

from sqlalchemy import select

from . import config, embeddings, resume_context
from .db import Document, get_sessionmaker


def _asks_about_career_order(query: str) -> bool:
    """Identify questions whose answer depends on chronological ordering."""
    q = query.lower()
    order = ("first", "earliest", "initial", "oldest", "began", "started")
    work = ("company", "employer", "job", "role", "work", "career", "experience", "worked")
    return any(term in q for term in order) and any(term in q for term in work)


async def retrieve_context(query: str, k: int = 5) -> str:
    if not config.RAG_ENABLED:
        return resume_context.full_context()

    sm = get_sessionmaker()
    if sm is None:
        return resume_context.full_context()

    try:
        qvec = embeddings.embed_one(query, input_type="query")
        async with sm() as session:
            stmt = (
                select(Document.source, Document.content)
                .order_by(Document.embedding.cosine_distance(qvec))
                .limit(k)
            )
            rows = (await session.execute(stmt)).all()
        if not rows:
            return resume_context.full_context()
        context = "\n".join(f"[{src}] {content}" for src, content in rows)
        # Ordinal questions are especially vulnerable to retrieval order: an
        # employer chunk can be relevant without being the earliest employer.
        # Always include the canonical chronology for these questions.
        if _asks_about_career_order(query):
            context = f"[resume:career-chronology] {resume_context.career_chronology()}\n{context}"
        return context
    except Exception:
        # Never let retrieval break the chat — degrade to full context.
        return resume_context.full_context()
