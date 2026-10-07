"""Tests for the import endpoints (POST /v3/imports, /start, /status).

The v3 idiom: all POST, token in the body. The ClickHouse + S3 surface is
mocked; the tests pin the endpoint's contract (validation, ownership, the
presigned-upload shape, the start gating).
"""

import queue
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
        "credential_kind": "self",
        "expires": (datetime.utcnow() + __import__("datetime").timedelta(minutes=60)).isoformat(),
        **extra,
    }
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


@pytest.fixture
def client():
    with (
        patch("app.v3.services.clickhouse.client"),
        patch.object(iw.ch, "get_group", return_value=None),
        patch.object(iw.ch, "can_write_group", return_value=True),
        patch.object(iw.ch, "has_mgmt_permission", return_value=True),
        patch.object(iw, "update_import_job", return_value={}),
    ):
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
        "target_group_id": "",
        "total_records": 0,
        "written_records": 0,
        "skipped_records": 0,
        "progress": 0,
        "errors": [],
        "message": "m",
        "created_at": "2026-01-01T00:00:00",
        "updated_at": "2026-01-01T00:00:00",
        "authorization": {"credential_kind": "self", "expires": "2099-01-01T00:00:00Z"},
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
        resp = client.post(
            "/v3/imports",
            json={
                "token": token,
                "platform": "myspace",
                "parts": [{"filename": "a.tar"}],
            },
        )
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
                "url": "https://minio/upload",
                "fields": {"key": "k"},
            }
            create.return_value = _job()
            resp = client.post(
                "/v3/imports",
                json={
                    "token": token,
                    "platform": "youtube",
                    "parts": [{"filename": "takeout-001.tar"}, {"filename": "takeout-002.tar"}],
                },
            )
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
        for call in signer.return_value.generate_presigned_post.call_args_list:
            assert ["content-length-range", 1, iw.MAX_PART_BYTES] in call.kwargs["Conditions"]

    def test_invalid_token(self, client):
        # A present-but-invalid token is a 401 (a missing token is a 422
        # validation error — the model requires the field).
        resp = client.post(
            "/v3/imports",
            json={
                "token": "garbage.token.here",
                "platform": "youtube",
                "parts": [{"filename": "a.tar"}],
            },
        )
        assert resp.status_code == 401

    def test_target_group_not_found(self, client, token):
        # An explicit target group that doesn't exist is a 404.
        with patch("app.v3.services.import_worker.ch.get_group", return_value=None):
            resp = client.post(
                "/v3/imports",
                json={
                    "token": token,
                    "platform": "youtube",
                    "parts": [{"filename": "a.tar"}],
                    "target_group_id": "web10.app/groups/ghost",
                },
            )
        assert resp.status_code == 404

    def test_target_group_not_owned(self, client, token):
        # A group the user does NOT own is a 403 (I3: the import writes the
        # group's face + posts + comments — owner-level only).
        with (
            patch("app.v3.services.import_worker.ch.get_group", return_value={"group_id": "g"}),
            patch("app.v3.services.import_worker.user_owns_group", return_value=False),
        ):
            resp = client.post(
                "/v3/imports",
                json={
                    "token": token,
                    "platform": "youtube",
                    "parts": [{"filename": "a.tar"}],
                    "target_group_id": "web10.app/groups/other",
                },
            )
        assert resp.status_code == 403

    def test_target_group_owned_passes(self, client, token):
        # A group the user owns is accepted and stored on the job.
        with (
            patch("app.v3.services.import_worker.ch.get_group", return_value={"group_id": "g"}),
            patch("app.v3.services.import_worker.user_owns_group", return_value=True),
            patch("app.v3.endpoints.imports.ensure_bucket"),
            patch("app.v3.endpoints.imports.get_s3_client", return_value=MagicMock()),
            patch("app.v3.endpoints.imports.get_s3_signing_client") as signer,
            patch("app.v3.services.import_worker.create_import_job") as create,
            patch("app.v3.services.import_worker.get_import_job", return_value=_job()),
        ):
            signer.return_value.generate_presigned_post.return_value = {
                "url": "https://minio/upload",
                "fields": {"key": "k"},
            }
            resp = client.post(
                "/v3/imports",
                json={
                    "token": token,
                    "platform": "youtube",
                    "parts": [{"filename": "a.tar"}],
                    "target_group_id": "web10.app/groups/mine",
                },
            )
        assert resp.status_code == 200
        # target_group_id is the 5th positional arg to create_import_job.
        args, _ = create.call_args
        assert args[4] == "web10.app/groups/mine"


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
            return {"ContentLength": 1}

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
        s3.head_object.return_value = {"ContentLength": iw.MAX_PART_BYTES}
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

    @pytest.mark.parametrize("size", [0, iw.MAX_PART_BYTES + 1])
    def test_oversized_storage_part(self, client, token, size):
        with (
            patch.object(iw, "get_import_job", return_value=_job(keys=["k"])),
            patch("app.v3.endpoints.imports.get_s3_client") as s3,
            patch.object(iw, "submit_import_job") as submit,
        ):
            s3.return_value.head_object.return_value = {"ContentLength": size}
            resp = client.post("/v3/imports/start", json={"token": token, "job_id": "job-1"})
        assert resp.status_code == 413
        submit.assert_not_called()

    def test_queue_full(self, client, token):
        with (
            patch.object(iw, "get_import_job", return_value=_job(keys=["k"])),
            patch("app.v3.endpoints.imports.get_s3_client") as s3,
            patch.object(iw, "submit_import_job", side_effect=queue.Full),
            patch.object(iw, "update_import_job") as update,
        ):
            s3.return_value.head_object.return_value = {"ContentLength": 1}
            resp = client.post("/v3/imports/start", json={"token": token, "job_id": "job-1"})
        assert resp.status_code == 503
        assert resp.headers["Retry-After"] == "30"
        assert all("phase" not in call.kwargs for call in update.call_args_list)


@pytest.mark.parametrize("size", [0, iw.MAX_PART_BYTES + 1])
def test_create_rejects_invalid_part_size(client, token, size):
    with patch.object(iw, "create_import_job") as create:
        resp = client.post(
            "/v3/imports",
            json={"token": token, "platform": "youtube", "parts": [{"filename": "a.zip", "size_bytes": size}]},
        )
    assert resp.status_code == 413
    create.assert_not_called()


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
        # The progress percentage is part of the status surface (the client's
        # progress bar reads it).
        assert "progress" in resp.json()["job"]

    def test_progress_round_trips(self, client, token):
        # A mid-import job reports its percentage (the "x% imported" surface).
        job = _job(phase=iw.PROCESSING)
        job["progress"] = 57
        job["total_records"] = 100
        job["written_records"] = 57
        with patch("app.v3.services.import_worker.get_import_job", return_value=job):
            resp = client.post("/v3/imports/status", json={"token": token, "job_id": "job-1"})
        assert resp.json()["job"]["progress"] == 57
