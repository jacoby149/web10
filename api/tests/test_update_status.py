"""Tests for POST /admin/update_status — the node's update check.

Drives the REAL transport boundary (patched DNS + the urllib3 HTTPS pool,
the house mock_certify_post pattern) so URL pinning, the public-DNS guard,
the first-line parse, cache/force and the failure classes are exercised.
"""

import datetime
import json
import socket
from unittest.mock import MagicMock, patch

import jwt
import pytest
import urllib3
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.services import update_check


@pytest.fixture(autouse=True)
def _known_version_file(tmp_path, monkeypatch):
    """A known node version (5.15.1), a clean WEB10_VERSION env, a cold cache."""
    monkeypatch.setattr(settings, "WEB10_VERSION", "")
    version_file = tmp_path / "VERSION"
    version_file.write_text("5.15.1\n")
    monkeypatch.setattr(update_check, "VERSION_FILE", version_file)
    monkeypatch.setattr(update_check, "_CACHE", {"at": 0.0, "ok": False, "version": None, "reason": None})
    yield
    update_check._CACHE.update(at=0.0, ok=False, version=None, reason=None)


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app, raise_server_exceptions=False)


@pytest.fixture
def admin_token():
    payload = {
        "username": "testuser",
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": (datetime.datetime.utcnow() + datetime.timedelta(minutes=60)).isoformat(),
    }
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


def _config_result(body: dict | None):
    rows = [(json.dumps(body),)] if body is not None else []
    return MagicMock(result_rows=rows)


class _FakeResp:
    def __init__(self, status=200, first_line=b"5.16.0 || 10.11.2026\nrest of the changelog\n"):
        self.status = status
        self._body = first_line

    def read(self, amt, decode_content=True):
        out, self._body = self._body[:amt], self._body[amt:]
        return out

    def close(self):
        pass


def _post(client, token, force=False):
    params = {"force": force} if force else None
    return client.post("/admin/update_status", json={"token": token}, params=params)


class TestNodeVersion:
    def test_baked_version_file_wins_over_unknown(self):
        assert update_check.node_version() == "5.15.1"

    def test_env_override_wins_over_file(self, monkeypatch):
        monkeypatch.setattr(settings, "WEB10_VERSION", "9.9.9")
        assert update_check.node_version() == "9.9.9"

    def test_blank_env_falls_through_to_file(self, monkeypatch):
        monkeypatch.setattr(settings, "WEB10_VERSION", "   ")
        assert update_check.node_version() == "5.15.1"

    def test_missing_file_reports_unknown(self, monkeypatch, tmp_path):
        monkeypatch.setattr(update_check, "VERSION_FILE", tmp_path / "nope")
        assert update_check.node_version() == "unknown"

    def test_parse_changelog_version(self):
        assert update_check.parse_changelog_version("5.16.0 || 10.11.2026") == "5.16.0"
        assert update_check.parse_changelog_version("5.16.0") == "5.16.0"
        assert update_check.parse_changelog_version("hello") is None
        assert update_check.parse_changelog_version(None) is None
        assert update_check.parse_changelog_version("") is None


class TestUpdateStatusEndpoint:
    @pytest.mark.parametrize(
        ("node_version", "upstream_line", "status", "available"),
        [
            ("5.15.1", b"5.16.0 || 10.11.2026", "update-available", True),
            ("5.15.1", b"5.15.1 || 09.11.2026", "up-to-date", False),
            # a node ahead of the upstream ref is NOT "update available"
            ("5.16.0", b"5.15.1 || 09.11.2026", "up-to-date", False),
        ],
    )
    def test_comparison_outcomes(
        self, client, admin_token, tmp_path, monkeypatch, node_version, upstream_line, status, available
    ):
        version_file = tmp_path / f"node-{node_version}"
        version_file.write_text(node_version + "\n")
        monkeypatch.setattr(update_check, "VERSION_FILE", version_file)
        with (
            patch("app.v3.services.clickhouse.client") as mock_ch,
            _transport(first_line=upstream_line + b"\nrest\n") as _,
        ):
            mock_ch.query.return_value = _config_result({"admins": ["testuser"]})
            resp = _post(client, admin_token)
        assert resp.status_code == 200
        data = resp.json()
        assert data["node_version"] == node_version
        assert data["status"] == status
        assert data["update_available"] is available
        assert data["reason"] is None
        assert data["cached"] is False
        assert data["checked_at"]
        assert data["upstream"]["url"] == "https://github.com/jacoby149/web10"

    def test_unknown_version_surfaces_upstream(self, client, admin_token, tmp_path, monkeypatch):
        monkeypatch.setattr(update_check, "VERSION_FILE", tmp_path / "nope")
        with (
            patch("app.v3.services.clickhouse.client") as mock_ch,
            _transport() as _,
        ):
            mock_ch.query.return_value = _config_result({"admins": ["testuser"]})
            resp = _post(client, admin_token)
        assert resp.status_code == 200
        data = resp.json()
        assert data["node_version"] == "unknown"
        assert data["status"] == "version-unknown"
        assert data["update_available"] is None
        assert data["latest_version"] == "5.16.0"  # still surfaced

    def test_cache_serves_second_call_and_force_refetches(self, client, admin_token):
        with (
            patch("app.v3.services.clickhouse.client") as mock_ch,
            _transport() as (pool, _),
        ):
            mock_ch.query.return_value = _config_result({"admins": ["testuser"]})
            first = _post(client, admin_token)
            second = _post(client, admin_token)
            forced = _post(client, admin_token, force=True)
        assert pool.urlopen.call_count == 2
        cached = (first.json()["cached"], second.json()["cached"], forced.json()["cached"])
        assert cached == (False, True, False)
        assert first.json()["status"] == second.json()["status"] == forced.json()["status"]

    @pytest.mark.parametrize(
        ("kwargs", "reason"),
        [
            ({"status": 404}, "upstream-http-404"),
            ({"exc": urllib3.exceptions.NewConnectionError(None, "boom")}, "upstream-unreachable:NewConnectionError"),
            ({"first_line": b"this is not a changelog\n"}, "bad-upstream-changelog"),
        ],
    )
    def test_failure_classes_degrade_to_unavailable(self, client, admin_token, kwargs, reason):
        with (
            patch("app.v3.services.clickhouse.client") as mock_ch,
            _transport(**kwargs) as _,
        ):
            mock_ch.query.return_value = _config_result({"admins": ["testuser"]})
            resp = _post(client, admin_token)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "unavailable"
        assert data["reason"] == reason
        assert data["latest_version"] is None
        assert data["node_version"] == "5.15.1"  # the local half is still told

    def test_failure_caches_shorter(self, client, admin_token):
        with (
            patch("app.v3.services.clickhouse.client") as mock_ch,
            _transport(exc=urllib3.exceptions.NewConnectionError(None, "boom")) as (pool, _),
        ):
            mock_ch.query.return_value = _config_result({"admins": ["testuser"]})
            first = _post(client, admin_token)
            second = _post(client, admin_token)
        assert pool.urlopen.call_count == 1
        assert first.json()["status"] == "unavailable"
        assert second.json()["cached"] is True
        assert second.json()["status"] == "unavailable"

    def test_private_dns_answer_is_denied(self, client, admin_token):
        with (
            patch("app.v3.services.clickhouse.client") as mock_ch,
            patch(
                "app.services.update_check.socket.getaddrinfo",
                return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))],
            ),
            patch("app.services.update_check.urllib3.HTTPSConnectionPool") as pool_patcher,
        ):
            mock_ch.query.return_value = _config_result({"admins": ["testuser"]})
            resp = _post(client, admin_token)
        assert resp.status_code == 200
        assert resp.json()["reason"] == "dns-unavailable"
        pool_patcher.assert_not_called()

    def test_url_is_pinned_to_upstream_settings(self, client, admin_token, monkeypatch):
        # update_check binds the settings names at import time — patch where
        # they are looked up, not at the source.
        monkeypatch.setattr(update_check, "UPSTREAM_REPO", "myorg/web10-fork")
        monkeypatch.setattr(update_check, "UPSTREAM_REF", "release")
        with (
            patch("app.v3.services.clickhouse.client") as mock_ch,
            _transport() as (pool, _),
        ):
            mock_ch.query.return_value = _config_result({"admins": ["testuser"]})
            resp = _post(client, admin_token)
        args, kwargs = pool.urlopen.call_args
        assert args[0] == "GET"
        assert args[1] == "/myorg/web10-fork/release/knowledge-base/changelogs/CHANGELOG.md"
        assert kwargs["redirect"] is False
        assert resp.json()["upstream"]["repo"] == "myorg/web10-fork"
        assert resp.json()["upstream"]["ref"] == "release"

    def test_non_admin_denied(self, client, admin_token):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result({"admins": ["someoneelse"]})
            resp = _post(client, admin_token)
        assert resp.status_code == 403

    def test_missing_token_denied(self, client):
        # check_admin's falsy-token branch (NOT_ADMIN, not TOKEN) on this route.
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result({"admins": ["testuser"]})
            resp = _post(client, None)
        assert resp.status_code == 403


def _transport(first_line=b"5.16.0 || 10.11.2026\nrest of the changelog\n", status=200, exc=None):
    """Context-managed: public DNS + the pinned HTTPS pool (+ the fake resp)."""
    # A fresh response per urlopen — each real HTTP request gets its own body.
    pool = MagicMock()
    if exc is not None:
        pool.urlopen.side_effect = exc
    else:
        pool.urlopen.side_effect = lambda *a, **k: _FakeResp(status=status, first_line=first_line)
    dns = patch(
        "app.services.update_check.socket.getaddrinfo",
        return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("140.82.112.6", 443))],
    )
    pooler = patch("app.services.update_check.urllib3.HTTPSConnectionPool", return_value=pool)

    class _Ctx:
        def __enter__(self):
            dns.start()
            pooler.start()
            self._cleanup = [dns.stop, pooler.stop]
            return pool, None

        def __exit__(self, *exc_info):
            for stop in reversed(self._cleanup):
                stop()

    return _Ctx()
