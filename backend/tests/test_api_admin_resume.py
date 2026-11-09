"""Tests for Admin Resume Versions API and PDF Download."""
from __future__ import annotations

import json
from pathlib import Path

from app import config
from conftest import ip


def login(client, password: str, addr: str = "7.0.0.1"):
    return client.post("/api/admin/login", json={"password": password}, headers=ip(addr))


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_resume_versions_503s_when_admin_not_configured(client):
    r = client.get("/api/admin/resume/versions")
    assert r.status_code == 503


def test_resume_versions_requires_auth(client, admin_enabled):
    r = client.get("/api/admin/resume/versions")
    assert r.status_code == 401
    assert "missing bearer token" in r.json()["detail"]


def test_list_resume_versions_seeds_v1(client, admin_enabled, tmp_path, monkeypatch):
    test_versions_dir = tmp_path / "resume_versions"
    test_pdf_dir = tmp_path / "pdf"
    monkeypatch.setattr("app.resume_versions.VERSIONS_DIR", test_versions_dir)
    monkeypatch.setattr("app.resume_versions.PDF_DIR", test_pdf_dir)

    token = login(client, admin_enabled).json()["token"]
    r = client.get("/api/admin/resume/versions", headers=bearer(token))

    assert r.status_code == 200
    versions = r.json()
    assert len(versions) == 1
    v1 = versions[0]
    assert v1["id"] == "v1"
    assert v1["versionNumber"] == 1
    assert v1["label"].startswith("V1_#")
    assert "@" in v1["label"]


def test_create_update_and_download_version(client, admin_enabled, tmp_path, monkeypatch):
    test_versions_dir = tmp_path / "resume_versions"
    test_pdf_dir = tmp_path / "pdf"
    monkeypatch.setattr("app.resume_versions.VERSIONS_DIR", test_versions_dir)
    monkeypatch.setattr("app.resume_versions.PDF_DIR", test_pdf_dir)

    token = login(client, admin_enabled).json()["token"]

    # 1. Create a second version
    r = client.post("/api/admin/resume/versions", json={}, headers=bearer(token))
    assert r.status_code == 201
    v2 = r.json()
    assert v2["id"] == "v2"
    assert v2["versionNumber"] == 2
    assert v2["label"].startswith("V2_#")

    # 2. Get detail
    r = client.get("/api/admin/resume/versions/v2", headers=bearer(token))
    assert r.status_code == 200
    data = r.json()["data"]

    # 3. Update version v2 data
    original_base_mtime = (config.CONTENT_DIR / "resume.json").stat().st_mtime
    data["profile"]["name"] = "Sujit Test Name"
    data["profile"]["phone"] = "+1 555-0199"
    data["profile"]["email"] = "test@example.com"

    r = client.put("/api/admin/resume/versions/v2", json=data, headers=bearer(token))
    assert r.status_code == 200
    updated = r.json()
    assert updated["data"]["profile"]["name"] == "Sujit Test Name"
    assert updated["label"] == "V2_#+1 555-0199_test@example.com"

    # Verify base content/resume.json was NOT touched
    current_base_mtime = (config.CONTENT_DIR / "resume.json").stat().st_mtime
    assert current_base_mtime == original_base_mtime

    # 4. Download PDF
    r = client.get("/api/admin/resume/download/v2", headers=bearer(token))
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert "Sujit-Pranav-Reddy-Resume-V2" in r.headers["content-disposition"]
    assert len(r.content) > 1000

    # 5. Delete v2
    r = client.delete("/api/admin/resume/versions/v2", headers=bearer(token))
    assert r.status_code == 204

    # 6. Deleting v1 should fail because it's the only one left
    r = client.delete("/api/admin/resume/versions/v1", headers=bearer(token))
    assert r.status_code == 400
    assert "cannot delete" in r.json()["detail"]
