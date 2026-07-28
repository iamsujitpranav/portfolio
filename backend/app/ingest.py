"""Ingest résumé chunks + articles into pgvector.

Usage (from backend/, with venv active and DATABASE_URL + an embedding key set):

    python -m app.ingest

Re-runnable: it clears the documents table and rebuilds it.
"""
from __future__ import annotations

import asyncio
import re

from sqlalchemy import delete

from . import config, embeddings, resume_context
from .db import Document, get_sessionmaker, init_db


def _article_chunks() -> list[tuple[str, str]]:
    chunks: list[tuple[str, str]] = []
    if not config.ARTICLES_DIR.exists():
        return chunks
    for path in sorted(config.ARTICLES_DIR.glob("*.mdx")):
        raw = path.read_text(encoding="utf-8")
        title = path.stem
        body = raw
        # Strip YAML frontmatter and pull the title if present.
        m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.DOTALL)
        if m:
            front, body = m.group(1), m.group(2)
            tm = re.search(r'^title:\s*"?(.+?)"?\s*$', front, re.MULTILINE)
            if tm:
                title = tm.group(1)
        # Split the body into paragraphs, then group into ~800-char windows.
        paras = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
        window, size, idx = [], 0, 0
        for p in paras:
            window.append(p)
            size += len(p)
            if size > 800:
                chunks.append((f"article:{path.stem}#{idx}", f"{title}\n{' '.join(window)}"))
                window, size, idx = [], 0, idx + 1
        if window:
            chunks.append((f"article:{path.stem}#{idx}", f"{title}\n{' '.join(window)}"))
    return chunks


async def main() -> None:
    if not config.DB_ENABLED:
        raise SystemExit("DATABASE_URL is not set — nothing to ingest into.")
    if not config.EMBEDDINGS_ENABLED:
        raise SystemExit("No embedding provider — set VOYAGE_API_KEY or OPENAI_API_KEY.")

    await init_db()

    chunks = resume_context.resume_chunks() + _article_chunks()
    print(f"Embedding {len(chunks)} chunks via {embeddings.provider()} …")

    texts = [c[1] for c in chunks]
    vectors: list[list[float]] = []
    for i in range(0, len(texts), 96):  # provider batch limit safety
        vectors.extend(embeddings.embed(texts[i : i + 96], input_type="document"))

    if vectors and len(vectors[0]) != config.EMBED_DIM:
        raise SystemExit(
            f"EMBED_DIM={config.EMBED_DIM} but provider returned {len(vectors[0])}-dim vectors. "
            f"Set EMBED_DIM to match, drop the documents table, and re-run."
        )

    sm = get_sessionmaker()
    assert sm is not None
    async with sm() as session:
        await session.execute(delete(Document))
        for (source, content), vec in zip(chunks, vectors):
            source, _, idx = source.partition("#")
            session.add(
                Document(
                    source=source,
                    chunk_index=int(idx) if idx.isdigit() else 0,
                    content=content,
                    embedding=vec,
                )
            )
        await session.commit()

    print(f"Ingested {len(chunks)} chunks into pgvector.")


if __name__ == "__main__":
    asyncio.run(main())
