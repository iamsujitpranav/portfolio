"""Regression coverage for résumé facts included in the RAG index."""
from __future__ import annotations

from app import resume_context


def test_resume_chunks_include_education():
    education = resume_context.profile()["education"]

    chunk = next((text for source, text in resume_context.resume_chunks() if source == "resume:education"), None)

    assert chunk is not None
