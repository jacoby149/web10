"""Tests for the POST /certify endpoint (the WebRTC signaling server's gate).

The RTC signaling server (``api/rtc``) calls ``POST /certify`` on every
connection and keeps the socket only on a 200. The Python rewrite dropped this
endpoint (it existed in the v2 JS node), so over real HTTPS the signaling
server 404'd and closed every socket — P2P (real-time messages + notifications)
was dead on any non-local node. Locally it masked itself: the HTTPS call to the
HTTP-only local API fails at the network layer, the RTC server's missing
``.catch`` never closes the socket, and P2P "works" — a corrupted measure.

This pins the parity restore: a valid node-minted token certifies (200);
forged / expired / cross-node / malformed tokens are rejected (401). The
endpoint is a thin wrapper over ``services/auth.certify`` (signature verify +
provider match + expiry), so these assert the gate the signaling server relies
on.
"""

import datetime
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app


@pytest.fixture
def client():
    # raise_server_exceptions=False: the rejection path raises a bare
    # Exception("TOKEN") (services/auth.py), which the app's handler maps to a
    # 401. The TestClient would otherwise re-raise it server-side instead of
    # returning the mapped response (same idiom as test_cors_trust_boundary).
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app, raise_server_exceptions=False)


def _token(provider: str, key: str, minutes_from_now: int = 60) -> str:
    payload = {
        "username": "testuser",
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": provider,
        "expires": (datetime.datetime.utcnow() + datetime.timedelta(minutes=minutes_from_now)).isoformat(),
    }
    return jwt.encode(payload, key, algorithm=settings.ALGORITHM)


class TestCertifyEndpoint:
    def test_valid_token_certifies(self, client, valid_token):
        res = client.post("/certify", json={"token": valid_token})
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}

    def test_expired_token_rejected(self, client, expired_token):
        res = client.post("/certify", json={"token": expired_token})
        assert res.status_code == 401

    def test_malformed_token_rejected(self, client):
        res = client.post("/certify", json={"token": "not-a-jwt"})
        assert res.status_code == 401

    def test_cross_provider_token_rejected(self, client):
        """A token minted by ANOTHER node (provider mismatch) is rejected —
        the RTC gate must not accept a foreign node's token."""
        token = _token(provider="remote.provider", key=settings.PRIVATE_KEY)
        res = client.post("/certify", json={"token": token})
        assert res.status_code == 401

    def test_forged_token_rejected(self, client):
        """A token with the right provider but a forged signature is rejected
        (I2 — no unsigned decode)."""
        token = _token(provider=settings.PROVIDER, key="wrong-key")
        res = client.post("/certify", json={"token": token})
        assert res.status_code == 401

    def test_missing_token_certifies_as_anon(self, client):
        """A missing token certifies as anonymous (the certify service's
        documented behavior) — the RTC server never calls this without a token,
        but the endpoint is a faithful wrapper over the service."""
        res = client.post("/certify", json={})
        assert res.status_code == 200
