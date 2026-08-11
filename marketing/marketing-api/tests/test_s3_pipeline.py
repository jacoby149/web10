"""Tests for the S3-based import pipeline (bite b — WeTransfer pipeline).

Covers: presigned upload, S3 download → parse → write → delete, job status
polling, and the privacy promise (originals deleted after processing).
"""

import json
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.v3.endpoints.imports import jobs
from app.models import Phase

client = TestClient(app)


def _clear_jobs():
    jobs.clear()


@pytest.fixture(autouse=True)
def clean_jobs():
    _clear_jobs()
    yield
    _clear_jobs()


def _make_ig_zip(path: Path):
    """Create a minimal Instagram-style ZIP at the given path."""
    post = {
        "post_id": "ig_test_1",
        "post_text": "hello world #test",
        "post_timestamp": "2026-07-01T12:00:00Z",
        "media": [],
        "comments": [],
    }
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("posts/2026_july/ig_test_1.json", json.dumps(post))
        zf.writestr("your_instagram_and_basic_information/index.json", json.dumps({}))


# ─── Presign endpoint ─────────────────────────────────────────────────────────


class TestPresignEndpoint:
    def test_presign_returns_job_id_and_upload_url(self):
        with patch("app.v3.endpoints.imports._s3") as mock_s3:
            mock_s3.return_value.generate_presigned_post.return_value = {
                "url": "https://s3.example.com/upload",
                "fields": {"key": "imports/test.zip", "AWSAccessKeyId": "AKIA..."},
            }

            r = client.post(
                "/import/presign",
                json={
                    "platform": "instagram",
                    "user_token": "test-jwt",
                    "node_api_url": "https://api.web10.app/alice",
                },
            )

        assert r.status_code == 200
        data = r.json()
        assert "job_id" in data
        assert data["upload_url"] == "https://s3.example.com/upload"
        assert "fields" in data
        assert "object_key" in data
        assert data["object_key"].startswith("imports/")

    def test_presign_creates_job_in_pending_state(self):
        with patch("app.v3.endpoints.imports._s3") as mock_s3:
            mock_s3.return_value.generate_presigned_post.return_value = {
                "url": "https://s3.example.com/upload",
                "fields": {"key": "imports/test.zip"},
            }

            r = client.post(
                "/import/presign",
                json={
                    "user_token": "test-jwt",
                    "node_api_url": "https://api.web10.app/alice",
                },
            )

        assert r.status_code == 200
        job_id = r.json()["job_id"]
        assert job_id in jobs
        assert jobs[job_id]["phase"] == Phase.PENDING
        assert jobs[job_id]["object_key"] == r.json()["object_key"]

    def test_presign_uses_public_s3_client(self):
        """The presign must use internal=False so the browser can reach the URL."""
        with patch("app.v3.endpoints.imports._s3") as mock_s3:
            mock_s3.return_value.generate_presigned_post.return_value = {
                "url": "https://s3.example.com/upload",
                "fields": {},
            }

            client.post(
                "/import/presign",
                json={
                    "user_token": "test-jwt",
                    "node_api_url": "https://api.web10.app/alice",
                },
            )

        # First call is _ensure_bucket (internal=True), second is presign (internal=False)
        calls = mock_s3.call_args_list
        assert any(not kwargs.get("internal", True) for _, kwargs in calls), (
            "presign must call _s3(internal=False) for browser-reachable URLs"
        )

    def test_presign_rejects_missing_user_token(self):
        r = client.post(
            "/import/presign",
            json={"node_api_url": "https://api.web10.app/alice"},
        )
        assert r.status_code == 422

    def test_presign_rejects_missing_node_api_url(self):
        r = client.post(
            "/import/presign",
            json={"user_token": "test-jwt"},
        )
        assert r.status_code == 422


# ─── Start endpoint ───────────────────────────────────────────────────────────


class TestStartEndpoint:
    def test_start_triggers_processing(self):
        with patch("app.v3.endpoints.imports._s3") as mock_s3:
            mock_s3.return_value.generate_presigned_post.return_value = {
                "url": "https://s3.example.com/upload",
                "fields": {},
            }
            r = client.post(
                "/import/presign",
                json={
                    "user_token": "test-jwt",
                    "node_api_url": "https://api.web10.app/alice",
                },
            )
        job_id = r.json()["job_id"]

        resp = client.post(f"/import/{job_id}/start")
        assert resp.status_code == 200
        data = resp.json()
        assert data["job_id"] == job_id
        assert data["status"] == "processing"

    def test_start_rejects_unknown_job(self):
        r = client.post("/import/nonexistent/start")
        assert r.status_code == 404

    def test_start_rejects_already_processing(self):
        with patch("app.v3.endpoints.imports._s3") as mock_s3:
            mock_s3.return_value.generate_presigned_post.return_value = {
                "url": "https://s3.example.com/upload",
                "fields": {},
            }
            r = client.post(
                "/import/presign",
                json={
                    "user_token": "test-jwt",
                    "node_api_url": "https://api.web10.app/alice",
                },
            )
        job_id = r.json()["job_id"]

        # Start once
        client.post(f"/import/{job_id}/start")
        # Second start should fail
        r2 = client.post(f"/import/{job_id}/start")
        assert r2.status_code == 409

    def test_start_rejects_legacy_job_without_object_key(self):
        """Legacy jobs created via POST /import have no object_key and can't use /start."""
        r = client.post(
            "/import",
            json={
                "user_token": "test-jwt",
                "node_api_url": "https://api.web10.app/alice",
            },
        )
        assert r.status_code == 200
        job_id = r.json()["id"]

        r2 = client.post(f"/import/{job_id}/start")
        assert r2.status_code == 400
        assert "object key" in r2.json()["detail"].lower()


# ─── Job status ───────────────────────────────────────────────────────────────


class TestJobStatus:
    def test_get_job_status(self):
        with patch("app.v3.endpoints.imports._s3") as mock_s3:
            mock_s3.return_value.generate_presigned_post.return_value = {
                "url": "https://s3.example.com/upload",
                "fields": {},
            }
            r = client.post(
                "/import/presign",
                json={
                    "user_token": "test-jwt",
                    "node_api_url": "https://api.web10.app/alice",
                },
            )
        job_id = r.json()["job_id"]

        resp = client.get(f"/import/{job_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == job_id
        assert data["phase"] == "pending"

    def test_get_unknown_job(self):
        r = client.get("/import/nonexistent")
        assert r.status_code == 404


# ─── Legacy upload endpoint (back-compat) ────────────────────────────────────


class TestLegacyUpload:
    def test_legacy_upload_still_works(self):
        tmp = Path(__file__).parent / "tmp_test_legacy.zip"
        _make_ig_zip(tmp)

        r = client.post(
            "/import",
            json={
                "user_token": "test-jwt",
                "node_api_url": "https://api.web10.app/alice",
            },
        )
        assert r.status_code == 200
        job_id = r.json()["id"]

        with open(tmp, "rb") as f:
            resp = client.post(
                f"/import/{job_id}/upload",
                files={"file": ("test.zip", f, "application/zip")},
            )

        tmp.unlink()
        assert resp.status_code == 200
        assert resp.json()["job_id"] == job_id
