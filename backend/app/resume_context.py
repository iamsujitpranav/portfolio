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


def _job_lines(j: dict) -> str:
    """One job as context. A role holding several distinct products lists them
    by name so the model can answer about one without blurring it into another."""
    head = f"- {j['role']}, {j['company']} ({j['period']}): {j['summary']} Stack: {', '.join(j['stack'])}."
    projects = "".join(f"\n  * {pr['name']}: {pr['summary']}" for pr in j.get("projects", []))
    return head + projects


def career_chronology() -> str:
    """Return an unambiguous oldest-to-newest view of the work history.

    The résumé is displayed and stored newest-first, which is useful for the
    page but dangerous for ordinal questions such as "first company" when RAG
    returns only a few individual job chunks. Keep this as a dedicated fact so
    the model never has to infer chronology from retrieval order.
    """
    jobs = list(reversed(_data()["experience"]))
    lines = [
        "CAREER CHRONOLOGY (oldest to newest; use this for first/earliest employer questions):",
        f"EARLIEST / FIRST COMPANY: {jobs[0]['company']} ({jobs[0]['period']}).",
    ]
    lines.extend(f"{i}. {j['company']} — {j['role']} ({j['period']})" for i, j in enumerate(jobs, 1))
    return "\n".join(lines)


def full_context() -> str:
    d = _data()
    p = d["profile"]
    jobs = "\n".join(_job_lines(j) for j in d["experience"])
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
            career_chronology(),
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
    chunks.append(("resume:education", f"{p['name']} education: {p['education']}"))
    chunks.append(("resume:career-chronology", career_chronology()))
    for j in d["experience"]:
        chunks.append(
            (
                f"resume:{j['company']}",
                f"{j['role']} at {j['company']} ({j['period']}). {j['summary']} Stack: {', '.join(j['stack'])}.",
            )
        )
        # Each product gets its own chunk: a question about one of them should
        # retrieve that product, not a paragraph averaging all three together.
        for pr in j.get("projects", []):
            chunks.append(
                (
                    f"resume:{j['company']}:{pr['name']}"[:200],
                    f"{pr['name']} - built by {p['name']} as {j['role']} at {j['company']} "
                    f"({j['period']}). {pr['summary']} Stack: {', '.join(j['stack'])}.",
                )
            )
    for g in d["skillGroups"]:
        chunks.append(
            (f"resume:skills:{g['title']}", f"{g['title']}: {', '.join(list(g.get('star', [])) + list(g['skills']))}.")
        )
    return chunks
