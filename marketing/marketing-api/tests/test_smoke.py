"""Smoke tests: the app imports, core endpoints respond, schemas load.

The full mapper test suite (a port of the old exporters/ vitest suite,
57 tests) is still owed since the 1.0.31 migration to Python. These keep
the CI wiring honest until it lands.
"""

from fastapi.testclient import TestClient

from app.main import app
from app.validation import VALIDATORS, validate_record

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200


def test_pageview_tracking():
    r = client.post(
        "/analytics/pageview",
        json={"path": "/", "referrer": None, "user_agent": "pytest"},
    )
    assert r.status_code == 200


def test_schemas_loaded():
    # validation.py falls back to inline schemas if the marketing-ui copies
    # are missing — either way every conventions service must be present.
    for service in ("posts", "media", "comments", "contacts", "profile"):
        assert service in VALIDATORS, f"missing schema for {service}"


def test_validate_record():
    valid, err = validate_record(
        {
            "service": "posts",
            "origin_id": "1",
            "body": {"text": "hello", "created_at": "2026-01-01T00:00:00Z", "origin": "instagram"},
        }
    )
    assert valid, err
    # unknown services are not validated (no contract, no validation)
    valid, err = validate_record({"service": "unknown", "body": {}})
    assert valid and err is None
