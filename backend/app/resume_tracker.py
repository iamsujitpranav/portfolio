"""Resume tracking API & Recruiter Activity analytics.

Handles:
  - GET /api/resume/download: Serves the resume PDF while recording IP,
    geolocation, recruiter company/ISP, and referrer.
  - POST /api/resume/track: Captures client-side web resume views and interactions.
  - GET /api/admin/resume/activity: Admin-gated analytics dashboard endpoint
    returning real-time recruiter visits, IP addresses, locations, and download stats.
"""
from __future__ import annotations

import logging
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from starlette.concurrency import run_in_threadpool

from . import config, geo, ratelimit, resume_versions
from .admin import require_admin
from .db import ResumeActivity, get_sessionmaker

logger = logging.getLogger("portfolio.resume_tracker")

router = APIRouter(tags=["resume"])


class ResumeTrackIn(BaseModel):
    action: str = Field(min_length=1, max_length=32)  # download_pdf, view_online, view_section, ask_chat
    section: Optional[str] = Field(default=None, max_length=64)
    session_id: Optional[str] = Field(default=None, max_length=64)
    referer: Optional[str] = Field(default=None, max_length=500)


def get_default_pdf_path() -> Path:
    """Find the default resume PDF on disk, building it dynamically if missing."""
    if config.RESUME_PDF_PATH:
        p = Path(config.RESUME_PDF_PATH)
        if p.is_file():
            return p

    candidates = [
        config.REPO_ROOT / "public" / "resume.pdf",
        config.REPO_ROOT / "output" / "pdf" / "recruiter-resume.pdf",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate

    # If missing, dynamically build it using build_recruiter_resume
    try:
        if str(config.REPO_ROOT) not in sys.path:
            sys.path.append(str(config.REPO_ROOT))
        from scripts import build_recruiter_resume
        built_path = build_recruiter_resume.build()
        if built_path and Path(built_path).is_file():
            return Path(built_path)
    except Exception as exc:
        logger.warning("failed_to_dynamically_build_default_resume err=%s", exc)

    return config.REPO_ROOT / "public" / "resume.pdf"


async def record_activity(
    action: str,
    ip: str,
    geo_info: geo.GeoInfo,
    section: Optional[str] = None,
    session_id: Optional[str] = None,
    user_agent: Optional[str] = None,
    referer: Optional[str] = None,
) -> bool:
    """Persist a resume interaction to PostgreSQL."""
    if not config.RESUME_TRACKING_ENABLED:
        return False

    sm = get_sessionmaker()
    if sm is None:
        return False

    try:
        async with sm() as session:
            record = ResumeActivity(
                session_id=session_id[:64] if session_id else None,
                action=action[:32],
                section=section[:64] if section else None,
                ip_address=ip[:64],
                city=geo_info.city[:100] if geo_info.city else None,
                region=geo_info.region[:100] if geo_info.region else None,
                country=geo_info.country[:100] if geo_info.country else None,
                country_code=geo_info.country_code[:10] if geo_info.country_code else None,
                org=geo_info.org[:200] if geo_info.org else None,
                latitude=geo_info.latitude,
                longitude=geo_info.longitude,
                user_agent=user_agent[:300] if user_agent else None,
                referer=referer[:500] if referer else None,
            )
            session.add(record)
            await session.commit()
            return True
    except Exception as exc:
        logger.warning("failed_to_record_resume_activity err=%s", exc)
        return False


# --------------------------------------------------------------------------- #
# Public Endpoints
# --------------------------------------------------------------------------- #

@router.get("/api/resume/download", dependencies=[Depends(ratelimit.limit(ratelimit.resume_limiter))])
async def download_resume(
    request: Request,
    ref: Optional[str] = Query(default=None, max_length=200),
    version: Optional[str] = Query(default=None, max_length=32),
    inline: bool = Query(default=False),
):
    """Download the resume PDF with automatic IP, geolocation, and referrer tracking."""
    ip = geo.get_client_ip(request)
    user_agent = request.headers.get("user-agent")
    referer = ref or request.headers.get("referer")

    # Resolve location
    geo_info = await geo.resolve_ip(ip, request.headers)

    # Record download event asynchronously in database
    await record_activity(
        action="download_pdf",
        ip=ip,
        geo_info=geo_info,
        section=version or "full_pdf",
        user_agent=user_agent,
        referer=referer,
    )

    # Determine file to serve
    if isinstance(version, str) and version:
        v = resume_versions.get_version(version)
        if v:
            try:
                pdf_path = await run_in_threadpool(resume_versions.build_version_pdf, version)
                safe_label = re.sub(r"[^a-zA-Z0-9_.-]", "_", v.get("label", version))
                filename = f"Sujit-Pranav-Reddy-Resume-{safe_label}.pdf"
                return FileResponse(
                    path=pdf_path,
                    media_type="application/pdf",
                    filename=filename,
                    headers={
                        "Content-Disposition": f"{'inline' if inline else 'attachment'}; filename=\"{filename}\"",
                        "Cache-Control": "no-store, no-cache, must-revalidate",
                    },
                )
            except Exception as e:
                logger.warning("version_pdf_generation_failed version=%s err=%s", version, e)

    pdf_file = await run_in_threadpool(get_default_pdf_path)
    if not pdf_file.exists():
        raise HTTPException(status_code=404, detail="resume PDF not found on server")

    filename = "Sujit-Pranav-Reddy-Resume.pdf"
    return FileResponse(
        path=pdf_file,
        media_type="application/pdf",
        filename=filename,
        headers={
            "Content-Disposition": f"{'inline' if inline else 'attachment'}; filename=\"{filename}\"",
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    )


@router.post("/api/resume/track", dependencies=[Depends(ratelimit.limit(ratelimit.resume_limiter))])
async def track_resume_view(req: ResumeTrackIn, request: Request):
    """Track web resume views, section interactions, and download button clicks."""
    ip = geo.get_client_ip(request)
    user_agent = request.headers.get("user-agent")
    referer = req.referer or request.headers.get("referer")

    geo_info = await geo.resolve_ip(ip, request.headers)

    stored = await record_activity(
        action=req.action,
        ip=ip,
        geo_info=geo_info,
        section=req.section,
        session_id=req.session_id,
        user_agent=user_agent,
        referer=referer,
    )

    return {"ok": True, "stored": stored}


# --------------------------------------------------------------------------- #
# Admin Analytics Endpoint
# --------------------------------------------------------------------------- #

@router.get("/api/admin/resume/activity")
async def get_resume_activity(
    days: int = Query(default=30, ge=1, le=365),
    _: bool = Depends(require_admin),
):
    """Return aggregated recruiter activity, IP log, and geographic breakdown."""
    sm = get_sessionmaker()
    if sm is None:
        return {
            "summary": {"total_downloads": 0, "total_views": 0, "unique_ips": 0, "days": days},
            "recent": [],
            "top_countries": [],
            "top_cities": [],
            "top_orgs": [],
            "by_day": [],
        }

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    async with sm() as session:
        result = await session.execute(
            select(ResumeActivity)
            .where(ResumeActivity.created_at >= cutoff)
            .order_by(desc(ResumeActivity.created_at))
            .limit(10_000)
        )
        rows = result.scalars().all()

    total_downloads = 0
    total_views = 0
    unique_ips: set[str] = set()

    country_counts: Counter[str] = Counter()
    country_codes: dict[str, str] = {}
    city_counts: Counter[str] = Counter()
    city_country_map: dict[str, str] = {}
    org_counts: Counter[str] = Counter()
    org_ips: dict[str, set[str]] = defaultdict(set)

    by_day_downloads: Counter[str] = Counter()
    by_day_views: Counter[str] = Counter()

    recent_items: list[dict[str, Any]] = []

    for r in rows:
        unique_ips.add(r.ip_address)
        is_download = r.action in {"download_pdf", "download_click"}
        if is_download:
            total_downloads += 1
        else:
            total_views += 1

        day = r.created_at.date().isoformat()
        if is_download:
            by_day_downloads[day] += 1
        else:
            by_day_views[day] += 1

        if r.country:
            country_counts[r.country] += 1
            if r.country_code:
                country_codes[r.country] = r.country_code

        if r.city:
            city_counts[r.city] += 1
            if r.country:
                city_country_map[r.city] = r.country

        if r.org and r.org.strip():
            org_counts[r.org] += 1
            org_ips[r.org].add(r.ip_address)

        if len(recent_items) < 100:
            recent_items.append(
                {
                    "id": r.id,
                    "action": r.action,
                    "section": r.section,
                    "ip_address": r.ip_address,
                    "city": r.city,
                    "region": r.region,
                    "country": r.country,
                    "country_code": r.country_code,
                    "org": r.org,
                    "latitude": r.latitude,
                    "longitude": r.longitude,
                    "user_agent": r.user_agent,
                    "referer": r.referer,
                    "created_at": r.created_at.isoformat(),
                }
            )

    top_countries = [
        {"country": c, "country_code": country_codes.get(c, ""), "count": count}
        for c, count in country_counts.most_common(15)
    ]

    top_cities = [
        {"city": city, "country": city_country_map.get(city, ""), "count": count}
        for city, count in city_counts.most_common(15)
    ]

    top_orgs = [
        {"org": org, "count": count, "unique_ips": len(org_ips[org])}
        for org, count in org_counts.most_common(15)
    ]

    # Combine all days in range for by_day chart
    all_days = sorted(set(by_day_downloads.keys()) | set(by_day_views.keys()))
    by_day = [
        {
            "day": d,
            "downloads": by_day_downloads[d],
            "views": by_day_views[d],
            "total": by_day_downloads[d] + by_day_views[d],
        }
        for d in all_days
    ]

    return {
        "summary": {
            "total_downloads": total_downloads,
            "total_views": total_views,
            "unique_ips": len(unique_ips),
            "days": days,
        },
        "recent": recent_items,
        "top_countries": top_countries,
        "top_cities": top_cities,
        "top_orgs": top_orgs,
        "by_day": by_day,
    }
