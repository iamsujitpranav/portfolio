"""Resume version management for the admin portal.

Stores versions under content/resume_versions/ without modifying the base
content/resume.json. Dropdown labels follow V{n}_#{phone_number}_{email}.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import config

logger = logging.getLogger("portfolio.resume_versions")

VERSIONS_DIR = config.CONTENT_DIR / "resume_versions"
PDF_DIR = config.REPO_ROOT / "output" / "pdf" / "versions"
BASE_RESUME_FILE = config.CONTENT_DIR / "resume.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_versions_dir() -> Path:
    VERSIONS_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    _maybe_seed_v1()
    return VERSIONS_DIR


def _read_base_resume() -> dict[str, Any]:
    if not BASE_RESUME_FILE.exists():
        return {
            "profile": {
                "name": "Sujit Pranav Reddy",
                "title": "Engineering Head",
                "yearsExperience": 12,
                "yearsAI": 5,
                "location": "Hyderabad, India",
                "email": "contact@sujitpranavreddy.dev",
                "website": "https://www.sujitpranavreddy.dev",
                "linkedin": "https://www.linkedin.com/in/sujitpranav",
                "github": "https://github.com/iamsujitpranav",
                "phone": "+91 7989393646",
                "summary": "",
                "openTo": "",
                "education": "",
                "languages": [],
                "dateOfBirth": "",
                "hobbies": [],
                "maritalStatus": "",
            },
            "metrics": [],
            "highlights": [],
            "experience": [],
            "sideProjects": [],
            "skillGroups": [],
        }
    with open(BASE_RESUME_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _format_label(version_num: int, data: dict[str, Any]) -> str:
    profile = data.get("profile", {})
    phone = str(profile.get("phone", "")).strip() or "no_phone"
    email = str(profile.get("email", "")).strip() or "no_email"
    return f"V{version_num}_#{phone}_{email}"


def _maybe_seed_v1() -> None:
    """If no versions exist, seed v1 from content/resume.json."""
    if not VERSIONS_DIR.exists():
        VERSIONS_DIR.mkdir(parents=True, exist_ok=True)

    json_files = list(VERSIONS_DIR.glob("*.json"))
    if not json_files:
        data = _read_base_resume()
        now = _now_iso()
        v1_record = {
            "id": "v1",
            "versionNumber": 1,
            "createdAt": now,
            "updatedAt": now,
            "data": data,
        }
        v1_path = VERSIONS_DIR / "v1.json"
        with open(v1_path, "w", encoding="utf-8") as f:
            json.dump(v1_record, f, indent=2, ensure_ascii=False)
        logger.info("seeded resume version v1 from content/resume.json")


def list_versions() -> list[dict[str, Any]]:
    ensure_versions_dir()
    versions: list[dict[str, Any]] = []
    for file_path in VERSIONS_DIR.glob("*.json"):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                item = json.load(f)
            v_num = int(item.get("versionNumber", 1))
            v_id = str(item.get("id", file_path.stem))
            data = item.get("data", {})
            label = _format_label(v_num, data)
            versions.append({
                "id": v_id,
                "versionNumber": v_num,
                "label": label,
                "createdAt": item.get("createdAt", ""),
                "updatedAt": item.get("updatedAt", ""),
            })
        except Exception as e:
            logger.warning("could not read version file %s: %s", file_path, e)

    versions.sort(key=lambda x: x["versionNumber"])
    return versions


def get_version(version_id: str) -> dict[str, Any] | None:
    ensure_versions_dir()
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", version_id)
    file_path = VERSIONS_DIR / f"{safe_id}.json"
    if not file_path.exists():
        return None
    with open(file_path, "r", encoding="utf-8") as f:
        item = json.load(f)
    v_num = int(item.get("versionNumber", 1))
    data = item.get("data", {})
    item["label"] = _format_label(v_num, data)
    return item


def create_version(source_id: str | None = None) -> dict[str, Any]:
    ensure_versions_dir()
    existing = list_versions()
    max_num = max((v["versionNumber"] for v in existing), default=0)
    next_num = max_num + 1
    next_id = f"v{next_num}"

    source_data: dict[str, Any]
    if source_id:
        src = get_version(source_id)
        source_data = src["data"] if src else _read_base_resume()
    elif existing:
        latest = get_version(existing[-1]["id"])
        source_data = latest["data"] if latest else _read_base_resume()
    else:
        source_data = _read_base_resume()

    now = _now_iso()
    new_record = {
        "id": next_id,
        "versionNumber": next_num,
        "createdAt": now,
        "updatedAt": now,
        "data": source_data,
    }
    file_path = VERSIONS_DIR / f"{next_id}.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(new_record, f, indent=2, ensure_ascii=False)

    new_record["label"] = _format_label(next_num, source_data)
    logger.info("created new resume version %s (V%d)", next_id, next_num)
    return new_record


def update_version(version_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    ensure_versions_dir()
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", version_id)
    file_path = VERSIONS_DIR / f"{safe_id}.json"
    if not file_path.exists():
        return None

    with open(file_path, "r", encoding="utf-8") as f:
        current = json.load(f)

    v_num = int(current.get("versionNumber", 1))
    current["updatedAt"] = _now_iso()
    current["data"] = data

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2, ensure_ascii=False)

    current["label"] = _format_label(v_num, data)
    logger.info("updated resume version %s", safe_id)
    return current


def delete_version(version_id: str) -> bool:
    ensure_versions_dir()
    existing = list_versions()
    if len(existing) <= 1:
        raise ValueError("cannot delete the only remaining resume version")

    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", version_id)
    file_path = VERSIONS_DIR / f"{safe_id}.json"
    if not file_path.exists():
        return False

    file_path.unlink()
    # also remove cached pdf if exists
    pdf_path = PDF_DIR / f"{safe_id}.pdf"
    if pdf_path.exists():
        pdf_path.unlink()

    logger.info("deleted resume version %s", safe_id)
    return True


def build_version_pdf(version_id: str) -> Path:
    import sys
    sys.path.append(str(config.REPO_ROOT))
    from scripts import build_recruiter_resume

    version = get_version(version_id)
    if not version:
        raise FileNotFoundError(f"version '{version_id}' not found")

    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", version_id)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    out_path = PDF_DIR / f"{safe_id}.pdf"

    build_recruiter_resume.build(data=version["data"], output_path=out_path)
    return out_path
