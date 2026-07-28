"""Pluggable embedding provider for pgvector RAG.

Voyage AI (Anthropic-recommended) is preferred; OpenAI is the fallback.
If neither key is set, embeddings are disabled and RAG falls back to
full-context injection.
"""
from __future__ import annotations

from typing import Optional

from . import config

_voyage_client = None
_openai_client = None


def provider() -> Optional[str]:
    if config.VOYAGE_API_KEY:
        return "voyage"
    if config.OPENAI_API_KEY:
        return "openai"
    return None


def _voyage():
    global _voyage_client
    if _voyage_client is None:
        import voyageai

        _voyage_client = voyageai.Client(api_key=config.VOYAGE_API_KEY)
    return _voyage_client


def _openai():
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI

        _openai_client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _openai_client


def embed(texts: list[str], *, input_type: str = "document") -> list[list[float]]:
    """Return one embedding vector per input text."""
    p = provider()
    if p == "voyage":
        res = _voyage().embed(texts, model=config.VOYAGE_MODEL, input_type=input_type)
        return res.embeddings
    if p == "openai":
        res = _openai().embeddings.create(model=config.OPENAI_EMBED_MODEL, input=texts)
        return [d.embedding for d in res.data]
    raise RuntimeError("No embedding provider configured (set VOYAGE_API_KEY or OPENAI_API_KEY).")


def embed_one(text: str, *, input_type: str = "query") -> list[float]:
    return embed([text], input_type=input_type)[0]
