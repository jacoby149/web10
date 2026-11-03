"""D95: retired bulk-ingest URLs must not remain callable."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.mark.parametrize("suffix", ["", "/start", "/status", "/trace"])
def test_retired_bulk_ingest_returns_not_found(suffix):
    # No startup/lifespan: exercise the real routing boundary without storage.
    # Empty input cannot create or start a job even before removal.
    response = TestClient(app).post(f"/v3/imports{suffix}", json={})
    assert response.status_code == 404


def test_universal_document_and_media_routes_remain():
    paths = set(app.openapi()["paths"])
    assert {"/v3/create", "/v3/read", "/v3/media/upload-url", "/v3/media/confirm"} <= paths
