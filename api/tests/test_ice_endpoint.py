"""Tests for the POST /ice endpoint (node-provided ICE/TURN configuration).

The endpoint lets P2P clients discover the node's ICE servers. STUN is always
returned; TURN is returned only when the node operator has configured both
TURN_URL and TURN_SECRET. TURN credentials are minted per request using
RFC 8484 long-term credentials so the static secret never leaves the node.
"""

import base64
import hashlib
import hmac
import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app, raise_server_exceptions=False)


class TestIceEndpoint:
    def test_returns_stun_servers_when_turn_not_configured(self, client, valid_token, monkeypatch):
        monkeypatch.setattr(settings, "TURN_URL", "")
        monkeypatch.setattr(settings, "TURN_SECRET", "")

        res = client.post("/ice", json={"token": valid_token})

        assert res.status_code == 200
        ice_servers = res.json()["iceServers"]
        assert all(server["urls"].startswith("stun:") for server in ice_servers)
        assert len(ice_servers) == 5

    def test_returns_turn_credential_when_turn_configured(self, client, valid_token, monkeypatch):
        turn_url = "turn:turn.example.com:3478"
        turn_secret = "test-turn-secret"
        monkeypatch.setattr(settings, "TURN_URL", turn_url)
        monkeypatch.setattr(settings, "TURN_SECRET", turn_secret)
        monkeypatch.setattr(settings, "TURN_CRED_TTL", 3600)

        before = int(time.time())
        res = client.post("/ice", json={"token": valid_token})
        after = int(time.time())

        assert res.status_code == 200
        ice_servers = res.json()["iceServers"]
        turn_server = ice_servers[-1]
        assert turn_server["urls"] == turn_url
        username = int(turn_server["username"])
        assert before + 3600 <= username <= after + 3600
        expected_credential = base64.b64encode(
            hmac.new(turn_secret.encode("utf-8"), str(username).encode("utf-8"), hashlib.sha1).digest()
        ).decode("ascii")
        assert turn_server["credential"] == expected_credential

    def test_string_ttl_from_env_override(self, client, valid_token, monkeypatch):
        """The settings env-override loop (settings.py) turns TURN_CRED_TTL into
        a string when set via the environment. The endpoint must still mint a
        valid credential (it casts at the point of use)."""
        monkeypatch.setattr(settings, "TURN_URL", "turn:turn.example.com:3478")
        monkeypatch.setattr(settings, "TURN_SECRET", "test-turn-secret")
        monkeypatch.setattr(settings, "TURN_CRED_TTL", "1800")  # a string, as the env loop would set it

        before = int(time.time())
        res = client.post("/ice", json={"token": valid_token})
        after = int(time.time())

        assert res.status_code == 200
        turn_server = res.json()["iceServers"][-1]
        username = int(turn_server["username"])
        assert before + 1800 <= username <= after + 1800

    def test_missing_token_rejected(self, client):
        res = client.post("/ice", json={})
        assert res.status_code == 401

    def test_invalid_token_rejected(self, client):
        res = client.post("/ice", json={"token": "not-a-jwt"})
        assert res.status_code == 401
