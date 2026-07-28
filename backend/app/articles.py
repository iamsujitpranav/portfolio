"""Public read API for blog articles.

Write endpoints (create/update/delete) live behind admin auth — see admin.py.
When DATABASE_URL is unset the whole layer is inert: list returns [] and detail
404s, so the site degrades gracefully instead of erroring.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select

from .db import Article, get_sessionmaker

router = APIRouter(prefix="/api/articles", tags=["articles"])


class ArticleMeta(BaseModel):
    """List-view shape — everything except the (potentially large) body."""

    model_config = ConfigDict(from_attributes=True)

    slug: str
    title: str
    description: str
    tags: list[str]
    reading_time: str
    published_at: Optional[datetime]


class ArticleDetail(ArticleMeta):
    body: str


@router.get("", response_model=list[ArticleMeta])
async def list_articles():
    sm = get_sessionmaker()
    if sm is None:
        return []
    async with sm() as session:
        rows = (
            await session.execute(
                select(Article)
                .where(Article.published.is_(True))
                # Newest first; fall back to created_at when published_at is null.
                .order_by(func.coalesce(Article.published_at, Article.created_at).desc())
            )
        ).scalars().all()
        return list(rows)


@router.get("/{slug}", response_model=ArticleDetail)
async def get_article(slug: str):
    sm = get_sessionmaker()
    if sm is None:
        raise HTTPException(status_code=404, detail="article not found")
    async with sm() as session:
        row = (
            await session.execute(
                select(Article).where(Article.slug == slug, Article.published.is_(True))
            )
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="article not found")
        return row
