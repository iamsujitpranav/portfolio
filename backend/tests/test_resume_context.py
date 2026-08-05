"""Regression coverage for résumé facts included in the RAG index."""
from __future__ import annotations

from app import resume_context


def test_resume_chunks_include_education():
    education = resume_context.profile()["education"]

    chunk = next((text for source, text in resume_context.resume_chunks() if source == "resume:education"), None)

    assert chunk is not None


def test_career_chronology_identifies_the_earliest_company():
    chronology = resume_context.career_chronology()

    assert "EARLIEST / FIRST COMPANY: Kreatio Software Pvt. Ltd (Mar 2014 - Jun 2015)." in chronology
    assert chronology.index("Kreatio Software Pvt. Ltd") < chronology.index("Emami Frankross")


def test_resume_chunks_include_canonical_career_chronology():
    chunk = next(
        (text for source, text in resume_context.resume_chunks() if source == "resume:career-chronology"),
        None,
    )

    assert chunk is not None
    assert "EARLIEST / FIRST COMPANY: Kreatio Software Pvt. Ltd" in chunk
