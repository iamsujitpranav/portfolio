"""Tests for Resume Tracker and Recruiter Activity Analytics."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from app import config, geo
from conftest import ip


def login(client, password: str, addr: str = "7.0.0.1"):
    return client.post("/api/admin/login", json={"password": password}, headers=ip(addr))


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_resume_download_serves_pdf_and_handles_headers(client, tmp_path, monkeypatch):
    dummy_pdf = tmp_path / "resume.pdf"
    dummy_pdf.write_bytes(b"%PDF-1.4 test resume content")
    monkeypatch.setattr("app.resume_tracker.get_default_pdf_path", lambda: dummy_pdf)

    res = client.get("/api/resume/download?ref=linkedin", headers=ip("8.8.8.8"))
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert "Sujit-Pranav-Reddy-Resume.pdf" in res.headers["content-disposition"]
    assert res.content == b"%PDF-1.4 test resume content"


def test_resume_download_direct_route_serves_pdf(client, tmp_path, monkeypatch):
    dummy_pdf = tmp_path / "resume.pdf"
    dummy_pdf.write_bytes(b"%PDF-1.4 direct resume")
    monkeypatch.setattr("app.resume_tracker.get_default_pdf_path", lambda: dummy_pdf)

    res = client.get("/resume.pdf", headers=ip("8.8.8.8"))
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.content == b"%PDF-1.4 direct resume"


def test_track_resume_web_interaction(client):
    payload = {
        "action": "view_section",
        "section": "experience",
        "session_id": "sess_123",
        "referer": "https://linkedin.com/in/sujitpranav",
    }
    res = client.post("/api/resume/track", json=payload, headers=ip("1.1.1.1"))
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_admin_resume_activity_requires_auth(client):
    res = client.get("/api/admin/resume/activity")
    assert res.status_code in {401, 503}


def test_admin_resume_activity_returns_structure_when_db_off(client, admin_enabled):
    token = login(client, admin_enabled).json()["token"]
    res = client.get("/api/admin/resume/activity?days=30", headers=bearer(token))
    assert res.status_code == 200
    data = res.json()
    assert "summary" in data
    assert data["summary"]["total_downloads"] == 0
    assert data["summary"]["total_views"] == 0
    assert "recent" in data
    assert "top_countries" in data
    assert "top_cities" in data
    assert "top_orgs" in data
    assert "by_day" in data


def test_resume_download_versioned_serves_pdf(client, tmp_path, monkeypatch):
    dummy_pdf = tmp_path / "v1.pdf"
    dummy_pdf.write_bytes(b"%PDF-1.4 version 1 content")

    monkeypatch.setattr(
        "app.resume_versions.get_version",
        lambda vid: {"id": "v1", "label": "V1_#+917989393646_contact@sujitpranavreddy.dev", "data": {}} if vid == "v1" else None,
    )
    monkeypatch.setattr("app.resume_versions.build_version_pdf", lambda vid: dummy_pdf)

    res = client.get("/api/resume/download?version=v1", headers=ip("8.8.8.8"))
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert "Sujit-Pranav-Reddy-Resume-V1" in res.headers["content-disposition"]
    assert res.content == b"%PDF-1.4 version 1 content"

