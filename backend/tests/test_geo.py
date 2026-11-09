"""Tests for IP Geolocation service."""
from __future__ import annotations

import asyncio

from app import geo
from conftest import make_request


def test_is_private_ip():
    assert geo.is_private_ip("127.0.0.1") is True
    assert geo.is_private_ip("::1") is True
    assert geo.is_private_ip("10.0.0.5") is True
    assert geo.is_private_ip("192.168.1.100") is True
    assert geo.is_private_ip("172.16.0.1") is True
    assert geo.is_private_ip("unknown") is True
    assert geo.is_private_ip("testclient") is True
    assert geo.is_private_ip("invalid-ip") is True
    # Public IPs
    assert geo.is_private_ip("8.8.8.8") is False
    assert geo.is_private_ip("1.1.1.1") is False
    assert geo.is_private_ip("142.250.190.46") is False


def test_get_client_ip():
    # Cloudflare header takes priority when valid public IP
    req_cf = make_request(headers={"cf-connecting-ip": "8.8.8.8", "x-real-ip": "1.1.1.1"})
    assert geo.get_client_ip(req_cf) == "8.8.8.8"

    # X-Real-IP takes priority when CF header is missing or private
    req_real = make_request(headers={"x-real-ip": "142.250.190.46"})
    assert geo.get_client_ip(req_real) == "142.250.190.46"

    # X-Forwarded-For rightmost
    req_fwd = make_request(headers={"x-forwarded-for": "1.2.3.4, 5.6.7.8"})
    assert geo.get_client_ip(req_fwd) == "5.6.7.8"


def test_resolve_private_ip():
    geo.clear_geo_cache()
    info = asyncio.run(geo.resolve_ip("127.0.0.1"))
    assert info.ip == "127.0.0.1"
    assert info.city == "Localhost / Dev"
    assert info.country_code == "DEV"


def test_resolve_with_cloudflare_headers():
    geo.clear_geo_cache()
    # If network call fails or is mocked, CF headers are preserved
    headers = {
        "cf-ipcountry": "US",
        "cf-ipcity": "San Francisco",
        "cf-region": "California",
    }
    info = asyncio.run(geo.resolve_ip("8.8.8.8", headers=headers))
    assert info.ip == "8.8.8.8"
    assert info.country in {"United States", "US"}
