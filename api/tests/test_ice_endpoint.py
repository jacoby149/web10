"""Tests for the POST /ice endpoint (node-provided ICE configuration).

The endpoint lets P2P clients discover the node's ICE servers. STUN is
always returned (5 Google STUN servers).
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app as fastapi_app


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app, raise_server_exceptions=False)


class TestIceEndpoint:
    def test_returns_stun_servers(self, client, valid_token):
        res = client.post("/ice", json={"token": valid_token})

        assert res.status_code == 200
        ice_servers = res.json()["iceServers"]
        assert all(server["urls"].startswith("stun:") for server in ice_servers)
        assert len(ice_servers) == 5

    def test_missing_token_rejected(self, client):
        res = client.post("/ice", json={})
        assert res.status_code == 401

    def test_invalid_token_rejected(self, client):
        res = client.post("/ice", json={"token": "not-a-jwt"})
        assert res.status_code == 401
