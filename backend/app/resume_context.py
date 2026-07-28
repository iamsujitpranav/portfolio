"""Load the shared résumé JSON and build grounding text.

This reads the SAME content/resume.json the React frontend uses, so résumé
content lives in exactly one place.
"""
from __future__ import annotations

import json
from functools import lru_cache

from . import config


@lru_cache(maxsize=1)
def _load(_mtime: float) -> dict:
    with open(config.CONTENT_DIR / "resume.json", "r", encoding="utf-8") as f:
        return json.load(f)


def _data() -> dict:
    # Keyed on mtime so editing resume.json takes effect without a restart —
    # still one parse per version, not per request.
    return _load((config.CONTENT_DIR / "resume.json").stat().st_mtime)


def profile() -> dict:
    return _data()["profile"]


def full_context() -> str:
    d = _data()
    p = d["profile"]
    jobs = "\n".join(
        f"- {j['role']}, {j['company']} ({j['period']}): {j['summary']} Stack: {', '.join(j['stack'])}."
        for j in d["experience"]
    )
    skills = "\n".join(
        f"- {g['title']}: {', '.join(list(g.get('star', [])) + list(g['skills']))}"
        for g in d["skillGroups"]
    )
    return "\n".join(
        [
            f"NAME: {p['name']}",
            f"TITLE: {p['title']} — {p['yearsExperience']}+ years experience, {p['yearsAI']}+ years in AI/ML.",
            f"LOCATION: {p['location']}. CONTACT: {p['email']}, {p['phone']}.",
            f"AVAILABILITY: {p['openTo']}",
            f"EDUCATION: {p['education']}",
            f"LANGUAGES: {', '.join(p['languages'])}.",
            "",
            f"SUMMARY: {p['summary']}",
            "",
            f"EXPERIENCE:\n{jobs}",
            "",
            f"SKILLS:\n{skills}",
        ]
    )


def resume_chunks() -> list[tuple[str, str]]:
    """(source, text) chunks for ingestion into pgvector."""
    d = _data()
    p = d["profile"]
    chunks: list[tuple[str, str]] = []
    chunks.append(("resume:summary", f"{p['name']} — {p['title']}. {p['summary']} Availability: {p['openTo']}"))
    for j in d["experience"]:
        chunks.append(
            (
                f"resume:{j['company']}",
                f"{j['role']} at {j['company']} ({j['period']}). {j['summary']} Stack: {', '.join(j['stack'])}.",
            )
        )
    for g in d["skillGroups"]:
        chunks.append(
            (f"resume:skills:{g['title']}", f"{g['title']}: {', '.join(list(g.get('star', [])) + list(g['skills']))}.")
        )
    return chunks
