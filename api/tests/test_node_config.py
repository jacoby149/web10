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


class TestEffectiveConfig:
    """effective_config() = settings.py (env-overridden) overlaid with the
    saved node_config. The Node Config UI reads this — a fresh node must
    show its live values, not a blank form."""

    def test_fresh_node_returns_settings_defaults(self, client):
        from app.services import config as config_svc

        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result(None)
            cfg = config_svc.effective_config()
        assert cfg["provider"] == settings.PROVIDER
        assert cfg["s3_endpoint"] == settings.S3_ENDPOINT
        assert cfg["s3_bucket"] == settings.S3_BUCKET
        assert cfg["s3_access_key"] == settings.S3_ACCESS_KEY
        assert cfg["s3_secret_key"] == settings.S3_SECRET_KEY
        assert cfg["s3_region"] == settings.S3_REGION
        assert cfg["db_name"] == settings.CLICKHOUSE_DATABASE
        assert cfg["cors_service_managers"] == ", ".join(settings.CORS_SERVICE_MANAGERS)
        assert cfg["token_expire_minutes"] == int(settings.TOKEN_EXPIRE_MINUTES)

    def test_db_url_composed_from_clickhouse_settings(self, client):
        """The ClickHouse URL defaults to the docker-network connection
        string (host:port/db from the CLICKHOUSE_* settings)."""
        from app.services import config as config_svc

        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result(None)
            cfg = config_svc.effective_config()
        assert cfg["db_url"] == (
            f"clickhouse://{settings.CLICKHOUSE_USER}:{settings.CLICKHOUSE_PASSWORD}"
            f"@{settings.CLICKHOUSE_HOST}:{settings.CLICKHOUSE_PORT}/{settings.CLICKHOUSE_DATABASE}"
        )

    def test_saved_overlays_settings(self, client):
        """Saved values win field by field; untouched fields stay on
        settings."""
        from app.services import config as config_svc

        saved = {"provider": "api.dev.web10.app", "s3_bucket": "custom-bucket"}
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result(saved)
            cfg = config_svc.effective_config()
        assert cfg["provider"] == "api.dev.web10.app"
        assert cfg["s3_bucket"] == "custom-bucket"
        assert cfg["s3_endpoint"] == settings.S3_ENDPOINT

    def test_env_string_values_coerced(self, client):
        """The settings env-override loop replaces values with raw strings —
        effective_config must hand the UI typed values."""
        from app.services import config as config_svc

        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result(None)
            with (
                patch.object(settings, "TOKEN_EXPIRE_MINUTES", "120"),
                patch.object(settings, "FREE_CREDITS", "0.25"),
                patch.object(settings, "BETA_REQUIRED", "true"),
                patch.object(settings, "S3_USE_SSL", "true"),
            ):
                cfg = config_svc.effective_config()
        assert cfg["token_expire_minutes"] == 120
        assert cfg["free_credits"] == 0.25
        assert cfg["beta_required"] is True
        assert cfg["s3_use_ssl"] is True


class TestGetConfigEndpoint:
    """POST /config — the Node Config UI's read. Must return the EFFECTIVE
    config (settings + saved overlay) so the form is never blank, and must
    keep the signing secret off the wire."""

    def test_admin_sees_effective_config(self, client, token):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result({"admins": ["testuser"]})
            resp = client.post("/config", json={"token": token})
        assert resp.status_code == 200
        data = resp.json()
        assert data["provider"] == settings.PROVIDER
        assert data["s3_endpoint"] == settings.S3_ENDPOINT
        assert data["s3_bucket"] == settings.S3_BUCKET
        assert data["s3_access_key"] == settings.S3_ACCESS_KEY
        assert data["s3_secret_key"] == settings.S3_SECRET_KEY
        assert data["db_url"].startswith("clickhouse://")
        assert data["db_name"] == settings.CLICKHOUSE_DATABASE
        assert "private_key" not in data
        assert "testuser" in data["admins"]
        assert all(a in data["admins"] for a in settings.DEFAULT_ADMINS)

    def test_saved_values_surface_to_admin(self, client, token):
        with patch("app.v3.services.clickhouse.client") as mock_ch:
            mock_ch.query.return_value = _config_result({"admins": ["testuser"], "s3_bucket": "operator-bucket"})
            resp = client.post("/config", json={"token": token})
        assert resp.status_code == 200
        assert resp.json()["s3_bucket"] == "operator-bucket"

    def test_non_admin_cannot_read_config(self, token):
        # raise_server_exceptions=False so the bare Exception("NOT_ADMIN")
        # runs through the production handler (→ 403) instead of re-raising.
        with TestClient(fastapi_app, raise_server_exceptions=False) as tc:
            with patch("app.v3.services.clickhouse.client") as mock_ch:
                mock_ch.query.return_value = _config_result({"admins": ["someoneelse"]})
                resp = tc.post("/config", json={"token": token})
        assert resp.status_code == 403
        assert "s3_secret_key" not in (resp.json() or {})
