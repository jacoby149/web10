"""Tests for the update-check foundation: the node's own version identity.

``node_version`` resolves WEB10_VERSION env → the image-baked
``/web10/VERSION`` → "unknown". The baked file is what ``api/Dockerfile``
writes from the changelog's top line at build time (repo-root context —
Portainer GitOps rebuilds ship no env vars, and the version must still come
out right). Dev/e2e volume mounts shadow the baked file, so those nodes
report "unknown" — honestly.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.services import update_check


@pytest.fixture(autouse=True)
def _known_version_file(tmp_path, monkeypatch):
    """A known node version (5.15.1) and a clean WEB10_VERSION env."""
    monkeypatch.setattr(settings, "WEB10_VERSION", "")
    version_file = tmp_path / "VERSION"
    version_file.write_text("5.15.1\n")
    monkeypatch.setattr(update_check, "VERSION_FILE", version_file)


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app, raise_server_exceptions=False)


class TestNodeVersion:
    def test_baked_version_file(self, client):
        assert update_check.node_version() == "5.15.1"

    def test_env_override_wins_over_file(self, client, monkeypatch):
        monkeypatch.setattr(settings, "WEB10_VERSION", "9.9.9")
        assert update_check.node_version() == "9.9.9"

    def test_blank_env_falls_through_to_file(self, client, monkeypatch):
        monkeypatch.setattr(settings, "WEB10_VERSION", "   ")
        assert update_check.node_version() == "5.15.1"

    def test_missing_file_reports_unknown(self, client, monkeypatch, tmp_path):
        monkeypatch.setattr(update_check, "VERSION_FILE", tmp_path / "nope")
        assert update_check.node_version() == "unknown"

    def test_parse_changelog_version(self):
        assert update_check.parse_changelog_version("5.16.0 || 10.11.2026") == "5.16.0"
        assert update_check.parse_changelog_version("5.16.0") == "5.16.0"
        assert update_check.parse_changelog_version("hello") is None
        assert update_check.parse_changelog_version(None) is None
        assert update_check.parse_changelog_version("") is None
