"""Smoke tests: the app imports, core endpoints respond, schemas load.

The full mapper test suite (a port of the old exporters/ vitest suite,
57 tests) is still owed since the 1.0.31 migration to Python. These keep
the CI wiring honest until it lands.
"""

from fastapi.testclient import TestClient

from app.main import app, feedback_store
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


# ─── Feedback endpoint ───────────────────────────────────────────────────────


def test_submit_feedback_minimal():
    r = client.post(
        "/feedback",
        json={"message": "something broke", "app": "web10-social", "route": "/feed"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "id" in data


def test_submit_feedback_full():
    r = client.post(
        "/feedback",
        json={
            "message": "white screen on feed",
            "contact": "user@example.com",
            "app": "marketing-ui",
            "route": "/import",
            "version": "1.0.51",
            "user_agent": "Mozilla/5.0",
            "console_errors": ["TypeError: x is null"],
            "stack_trace": "Error: x is null\n  at Foo.tsx:42",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"


def test_submit_feedback_rejects_missing_app():
    r = client.post(
        "/feedback",
        json={"message": "broken", "route": "/feed"},
    )
    assert r.status_code == 422


def test_submit_feedback_rejects_empty_message():
    r = client.post(
        "/feedback",
        json={"message": "", "app": "web10-social", "route": "/feed"},
    )
    assert r.status_code == 422


def test_list_feedback():
    feedback_store.clear()
    client.post(
        "/feedback",
        json={"message": "test1", "app": "web10-social", "route": "/feed"},
    )
    client.post(
        "/feedback",
        json={"message": "test2", "app": "marketing-ui", "route": "/import"},
    )
    r = client.get("/feedback")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    assert data["items"][0]["message"] == "test2"


def test_list_feedback_limit():
    feedback_store.clear()
    for i in range(5):
        client.post(
            "/feedback",
            json={"message": f"msg-{i}", "app": "web10-social", "route": "/feed"},
        )
    r = client.get("/feedback?limit=3")
    assert r.status_code == 200
    assert len(r.json()["items"]) == 3
