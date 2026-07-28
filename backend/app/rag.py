"""Retrieval for the résumé chat.

If Postgres + an embedding provider are configured, retrieve the top-k most
relevant chunks from pgvector. Otherwise (or on any error) fall back to
injecting the full résumé — it's small enough to pass whole.
"""
from __future__ import annotations

from sqlalchemy import select

from . import config, embeddings, resume_context
from .db import Document, get_sessionmaker


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
        return "\n".join(f"[{src}] {content}" for src, content in rows)
    except Exception:
        # Never let retrieval break the chat — degrade to full context.
        return resume_context.full_context()
