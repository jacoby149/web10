"""Tests for the import endpoints (POST /v3/imports, /start, /status).

The v3 idiom: all POST, token in the body. The ClickHouse + S3 surface is
mocked; the tests pin the endpoint's contract (validation, ownership, the
presigned-upload shape, the start gating).
"""

from datetime import datetime
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.v3.services import import_worker as iw


def _make_token(username="testuser", **extra):
    payload = {
        "username": username,
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": (datetime.utcnow() + __import__("datetime").timedelta(minutes=60)).isoformat(),
        **extra,
    }
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app)


@pytest.fixture
def token():
    return _make_token()


def _job(user="testuser", phase=iw.PENDING, keys=None):
    return {
        "job_id": "job-1",
        "user_key": user,
        "platform": "youtube",
        "phase": phase,
        "object_keys": keys or [],
        "total_records": 0,
        "written_records": 0,
        "skipped_records": 0,
        "errors": [],
        "message": "m",
        "created_at": "2026-01-01T00:00:00",
        "updated_at": "2026-01-01T00:00:00",
    }


# ---------------------------------------------------------------------------
# Route registration
# ---------------------------------------------------------------------------


class TestRoutes:
    def test_import_routes_registered(self, client):
        paths = set(fastapi_app.openapi()["paths"].keys())
        assert "/v3/imports" in paths
        assert "/v3/imports/start" in paths
        assert "/v3/imports/status" in paths


# ---------------------------------------------------------------------------
# POST /v3/imports (create)
# ---------------------------------------------------------------------------


class TestCreate:
    def test_unsupported_platform(self, client, token):
        resp = client.post("/v3/imports", json={
            "token": token, "platform": "myspace",
            "parts": [{"filename": "a.tar"}],
        })
        assert resp.status_code == 400

    def test_no_parts(self, client, token):
        resp = client.post("/v3/imports", json={"token": token, "platform": "youtube", "parts": []})
        assert resp.status_code == 400

    def test_too_many_parts(self, client, token):
        parts = [{"filename": f"a{i}.tar"} for i in range(settings.IMPORT_MAX_PARTS + 1)]
        resp = client.post("/v3/imports", json={"token": token, "platform": "youtube", "parts": parts})
        assert resp.status_code == 400

    def test_happy_path(self, client, token):
        with (
            patch("app.v3.endpoints.imports.ensure_bucket"),
            patch("app.v3.endpoints.imports.get_s3_client", return_value=MagicMock()),
            patch("app.v3.endpoints.imports.get_s3_signing_client") as signer,
            patch("app.v3.services.import_worker.create_import_job") as create,
            patch("app.v3.services.import_worker.get_import_job", return_value=_job()),
        ):
            signer.return_value.generate_presigned_post.return_value = {
                "url": "https://minio/upload", "fields": {"key": "k"},
            }
            create.return_value = _job()
            resp = client.post("/v3/imports", json={
                "token": token, "platform": "youtube",
                "parts": [{"filename": "takeout-001.tar"}, {"filename": "takeout-002.tar"}],
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["platform"] == "youtube"
        assert len(data["uploads"]) == 2
        # each upload has a presigned url + a namespaced object key
        assert all(u["upload_url"] for u in data["uploads"])
        assert all("testuser" in u["object_key"] and data["job_id"] in u["object_key"] for u in data["uploads"])
        # the job was created with the object keys
        args, _ = create.call_args
        assert len(args[3]) == 2  # object_keys

    def test_invalid_token(self, client):
        # A present-but-invalid token is a 401 (a missing token is a 422
        # validation error — the model requires the field).
        resp = client.post("/v3/imports", json={
            "token": "garbage.token.here", "platform": "youtube",
            "parts": [{"filename": "a.tar"}],
        })
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /v3/imports/start
# ---------------------------------------------------------------------------


class TestStart:
    def test_unknown_job(self, client, token):
        with patch("app.v3.services.import_worker.get_import_job", return_value=None):
            resp = client.post("/v3/imports/start", json={"token": token, "job_id": "nope"})
        assert resp.status_code == 404

    def test_not_your_job(self, client, token):
        with patch("app.v3.services.import_worker.get_import_job", return_value=_job(user="someoneelse")):
            resp = client.post("/v3/imports/start", json={"token": token, "job_id": "job-1"})
        assert resp.status_code == 403

    def test_missing_parts(self, client, token):
        keys = ["k1", "k2"]
        s3 = MagicMock()
        # k1 exists, k2 raises (missing)
        def head(Bucket, Key):
            if Key == "k2":
                raise Exception("404")
        s3.head_object.side_effect = head
        with (
            patch("app.v3.services.import_worker.get_import_job", return_value=_job(keys=keys)),
            patch("app.v3.endpoints.imports.get_s3_client", return_value=s3),
        ):
            resp = client.post("/v3/imports/start", json={"token": token, "job_id": "job-1"})
        assert resp.status_code == 400
        assert "missing" in resp.json()["detail"]

    def test_happy_path(self, client, token):
        keys = ["k1"]
        s3 = MagicMock()
        with (
            patch("app.v3.services.import_worker.get_import_job", return_value=_job(keys=keys)),
            patch("app.v3.endpoints.imports.get_s3_client", return_value=s3),
            patch("app.v3.services.import_worker.update_import_job"),
            patch("app.v3.services.import_worker.submit_import_job") as submit,
        ):
            resp = client.post("/v3/imports/start", json={"token": token, "job_id": "job-1"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "queued"
        submit.assert_called_once_with("job-1")

    def test_already_complete(self, client, token):
        with patch("app.v3.services.import_worker.get_import_job", return_value=_job(phase=iw.COMPLETE)):
            resp = client.post("/v3/imports/start", json={"token": token, "job_id": "job-1"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "complete"


# ---------------------------------------------------------------------------
# POST /v3/imports/status
# ---------------------------------------------------------------------------


class TestStatus:
    def test_unknown_job(self, client, token):
        with patch("app.v3.services.import_worker.get_import_job", return_value=None):
            resp = client.post("/v3/imports/status", json={"token": token, "job_id": "nope"})
        assert resp.status_code == 404

    def test_not_your_job(self, client, token):
        with patch("app.v3.services.import_worker.get_import_job", return_value=_job(user="someoneelse")):
            resp = client.post("/v3/imports/status", json={"token": token, "job_id": "job-1"})
        assert resp.status_code == 403

    def test_happy_path(self, client, token):
        with patch("app.v3.services.import_worker.get_import_job", return_value=_job()):
            resp = client.post("/v3/imports/status", json={"token": token, "job_id": "job-1"})
        assert resp.status_code == 200
        assert resp.json()["job"]["job_id"] == "job-1"
        assert resp.json()["job"]["phase"] == iw.PENDING
