"""Tests for the v3 node config (node_config table) — v3 stacks run no
Mongo, so the config (admins list, setup state) lives in ClickHouse (D48).

The regression this pins: config.py used to read/write the Mongo
web10.config collection. On the v3 ecosystem stack (no Mongo) every config
read blocked ~30s on a dead server-selection timeout, then raised — so
check_admin 500'd, the auth UI's checkAdmin set isAdmin=false, and the
admin panel never rendered for the node's admin.
"""

import json
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app)


@pytest.fixture
def token():
    payload = {
        "username": "testuser",
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": (datetime.utcnow() + timedelta(minutes=60)).isoformat(),
    }
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


def _config_result(body: dict | None):
    """A CH query result for the node_config dedup query."""
    rows = [(json.dumps(body),)] if body is not None else []
    return MagicMock(result_rows=rows)


class TestGetConfig:
    def test_unset_returns_empty(self, client):
        from app.services import config as config_svc

        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result(None)
            assert config_svc.get_config() == {}

    def test_returns_saved_body(self, client):
        from app.services import config as config_svc

        saved = {"admins": ["jacoby149"], "provider": "api.dev.web10.app"}
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result(saved)
            assert config_svc.get_config() == saved


class TestSaveConfig:
    def test_inserts_node_row_with_named_columns(self, client):
        from app.services import config as config_svc

        with patch("app.v3.services.clickhouse.client") as mock_ch:
            config_svc.save_config({"admins": ["jacoby149"]})
        mock_ch.insert.assert_called_once()
        args, kwargs = mock_ch.insert.call_args
        assert args[0] == "node_config"
        assert kwargs["column_names"] == ["config_id", "body", "updated_at", "deleted"]
        row = args[1][0]
        assert row[0] == "node"
        assert json.loads(row[1]) == {"admins": ["jacoby149"]}


class TestListAdmins:
    def test_baseline_until_config_saved(self, client):
        """DEFAULT_ADMINS is the baseline — the node isn't locked out before
        setup saves an admins list."""
        from app.services import config as config_svc

        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result(None)
            admins = config_svc.list_admins()
        assert list(settings.DEFAULT_ADMINS) == admins

    def test_config_admins_union_with_baseline(self, client):
        from app.services import config as config_svc

        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result({"admins": ["otheradmin"]})
            admins = config_svc.list_admins()
        assert "otheradmin" in admins
        assert all(a in admins for a in settings.DEFAULT_ADMINS)

    def test_is_admin(self, client):
        from app.services import config as config_svc

        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result(None)
            assert config_svc.is_admin(settings.DEFAULT_ADMINS[0]) is True
            assert config_svc.is_admin("randomuser") is False
            assert config_svc.is_admin("") is False


class TestAdminExists:
    def test_false_without_config(self, client):
        from app.services import config as config_svc

        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result(None)
            assert config_svc.admin_exists() is False

    def test_true_with_admins(self, client):
        from app.services import config as config_svc

        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result({"admins": ["jacoby149"]})
            assert config_svc.admin_exists() is True


class TestAmAdmin:
    """POST /am_admin — the UI's admin-panel gate. Must never 500: a config
    read failure would hide the panel from the real admin (the reported bug)."""

    def test_admin_gets_true(self, client, token):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result({"admins": ["testuser"]})
            resp = client.post("/am_admin", json={"token": token})
        assert resp.status_code == 200
        assert resp.json() == {"admin": True}

    def test_non_admin_gets_false(self, client, token):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result({"admins": ["someoneelse"]})
            resp = client.post("/am_admin", json={"token": token})
        assert resp.status_code == 200
        assert resp.json() == {"admin": False}

    def test_no_token_gets_false_not_error(self, client):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result(None)
            resp = client.post("/am_admin", json={})
        assert resp.status_code == 200
        assert resp.json() == {"admin": False}


class TestSetupStatus:
    def test_shape_and_admin_flag(self, client):
        """POST /setup returns {configured, has_admin} — both ClickHouse-
        backed now (configured = users exist; has_admin = config admins)."""
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            # node_has_users → count query; get_node_config → dedup query
            mock_ch.query.side_effect = [
                MagicMock(result_rows=[(3,)]),
                _config_result({"admins": ["jacoby149"]}),
            ]
            resp = client.post("/setup", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["configured"] is True
        assert data["has_admin"] is True
