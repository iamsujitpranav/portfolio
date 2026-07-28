"""One-off migration: import content/articles/*.mdx into the `articles` table.

Idempotent — upserts by slug, so it's safe to re-run. After this, the database
is the single source of truth for blog posts and the .mdx files are just a seed.

    PYTHONPATH=backend backend/venv/bin/python backend/migrate_mdx.py
"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app import config
from app.db import Article, get_sessionmaker, init_db

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", re.DOTALL)


def parse_frontmatter(raw: str) -> tuple[dict[str, Any], str]:
    m = FRONTMATTER_RE.match(raw)
    if not m:
        return {}, raw.strip()
    fm_text, body = m.group(1), m.group(2)
    try:
        import yaml  # PyYAML if available — most robust

        data = yaml.safe_load(fm_text) or {}
    except Exception:
        data = _manual_frontmatter(fm_text)
    return data, body.strip()


def _manual_frontmatter(fm_text: str) -> dict[str, Any]:
    """Tiny fallback parser for the simple key: value / key: [json array] shape."""
    data: dict[str, Any] = {}
    for line in fm_text.splitlines():
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key, val = key.strip(), val.strip()
        if not key:
            continue
        if val.startswith("["):
            try:
                val = json.loads(val)
            except Exception:
                val = []
        else:
            val = val.strip().strip('"').strip("'")
        data[key] = val
    return data


def estimate_reading_time(body: str) -> str:
    words = len(re.findall(r"\w+", body))
    return f"{max(1, round(words / 200))} min read"


def to_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


async def main() -> None:
    await init_db()  # ensure the articles table exists
    sm = get_sessionmaker()
    if sm is None:
        raise SystemExit("DATABASE_URL is not set — nothing to migrate into.")

    files = sorted(config.ARTICLES_DIR.glob("*.mdx"))
    if not files:
        print(f"No .mdx files found in {config.ARTICLES_DIR}")
        return

    async with sm() as session:
        for f in files:
            slug = f.stem
            fm, body = parse_frontmatter(f.read_text(encoding="utf-8"))
            fields = dict(
                title=str(fm.get("title", slug)),
                description=str(fm.get("description", "")),
                body=body,
                tags=[str(t) for t in (fm.get("tags") or [])],
                reading_time=str(fm.get("readingTime") or estimate_reading_time(body)),
                published=True,
                published_at=to_datetime(fm.get("date")),
            )
            existing = (
                await session.execute(select(Article).where(Article.slug == slug))
            ).scalar_one_or_none()
            if existing:
                for k, v in fields.items():
                    setattr(existing, k, v)
                print(f"updated  {slug}")
            else:
                session.add(Article(slug=slug, **fields))
                print(f"inserted {slug}")
        await session.commit()

    print(f"done — {len(files)} article(s) synced")


if __name__ == "__main__":
    asyncio.run(main())
