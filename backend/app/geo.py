"""IP Geolocation service for resume and visitor activity tracking.

Resolves client IP addresses to geographic locations (City, Region, Country)
and network organizations / ISPs (identifying recruiter companies).
Caches lookups in-memory to prevent duplicate queries and respects private/local IPs.
"""
from __future__ import annotations

import ipaddress
import logging
import time
from dataclasses import asdict, dataclass
from typing import Any, Mapping, Optional

import httpx
from fastapi import Request

from . import config, ratelimit

logger = logging.getLogger("portfolio.geo")

# In-memory bounded cache: ip -> (timestamp, GeoInfo)
_CACHE: dict[str, tuple[float, GeoInfo]] = {}
_CACHE_TTL = 86400.0  # 24 hours
_CACHE_MAX_ENTRIES = 5000


@dataclass
class GeoInfo:
    ip: str
    city: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    org: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def is_private_ip(ip: str) -> bool:
    """Check if an IP string is a loopback, private, or reserved address."""
    if not ip or ip in {"unknown", "localhost", "testclient"}:
        return True
    try:
        obj = ipaddress.ip_address(ip)
        return obj.is_private or obj.is_loopback or obj.is_reserved or obj.is_link_local
    except ValueError:
        return True


def get_client_ip(request: Request) -> str:
    """Extract best-effort client IP from headers or connection socket."""
    # Cloudflare edge header
    cf_ip = (request.headers.get("cf-connecting-ip") or "").strip()
    if cf_ip and not is_private_ip(cf_ip):
        return cf_ip

    # Use ratelimit client_ip logic for X-Real-IP / X-Forwarded-For
    ip = ratelimit.client_ip(request)
    if ip and ip != "unknown":
        return ip

    return request.client.host if request.client else "unknown"


def _clean_cache(now: float) -> None:
    """Evict expired items and cap cache size."""
    if len(_CACHE) > _CACHE_MAX_ENTRIES:
        # Purge oldest 25%
        expired = [ip for ip, (ts, _) in _CACHE.items() if now - ts > _CACHE_TTL]
        for ip in expired:
            _CACHE.pop(ip, None)
        if len(_CACHE) > _CACHE_MAX_ENTRIES:
            sorted_keys = sorted(_CACHE.keys(), key=lambda k: _CACHE[k][0])
            for k in sorted_keys[: len(_CACHE) // 4]:
                _CACHE.pop(k, None)


def clear_geo_cache() -> None:
    """Clear in-memory cache. Used in tests."""
    _CACHE.clear()


async def resolve_ip(
    ip: str, headers: Optional[Mapping[str, str]] = None
) -> GeoInfo:
    """Resolve an IP address to geographic location and ISP/organization."""
    clean_ip = (ip or "").strip()

    # 1. Check local/private IP addresses
    if is_private_ip(clean_ip):
        return GeoInfo(
            ip=clean_ip or "127.0.0.1",
            city="Localhost / Dev",
            region="Local",
            country="Local Network",
            country_code="DEV",
            org="Development Environment",
        )

    # 2. Check in-memory cache
    now = time.time()
    if clean_ip in _CACHE:
        ts, cached = _CACHE[clean_ip]
        if now - ts < _CACHE_TTL:
            return cached

    # 3. Check Cloudflare geolocation headers if available
    cf_country = None
    cf_city = None
    cf_region = None
    if headers:
        cf_country = headers.get("cf-ipcountry")
        cf_city = headers.get("cf-ipcity")
        cf_region = headers.get("cf-region")

    # 4. External IP Geolocation lookup via ip-api.com
    geo = GeoInfo(ip=clean_ip, country=cf_country, city=cf_city, region=cf_region)
    try:
        url = f"http://ip-api.com/json/{clean_ip}?fields=status,message,country,countryCode,regionName,city,lat,lon,org,as,query"
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "success":
                    geo = GeoInfo(
                        ip=clean_ip,
                        city=data.get("city") or cf_city,
                        region=data.get("regionName") or cf_region,
                        country=data.get("country") or cf_country,
                        country_code=data.get("countryCode") or cf_country,
                        org=data.get("org") or data.get("as"),
                        latitude=data.get("lat"),
                        longitude=data.get("lon"),
                    )
    except Exception as exc:
        logger.debug("geo_lookup_failed ip=%s err=%s", clean_ip, exc)

    # Cache result
    _clean_cache(now)
    _CACHE[clean_ip] = (now, geo)
    return geo
