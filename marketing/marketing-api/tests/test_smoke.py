"""Smoke tests: the app imports, core endpoints respond, schemas load.

The full mapper test suite (a port of the old exporters/ vitest suite,
57 tests) is still owed since the 1.0.31 migration to Python. These keep
the CI wiring honest until it lands.
"""

import json

from fastapi.testclient import TestClient

from app.main import app, analytics_events, _feedback_store, _feedback_file, _feedback_lock, _format_bug_post
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
    with _feedback_lock:
        _feedback_store.clear()
        _feedback_file.unlink(missing_ok=True)
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
    with _feedback_lock:
        _feedback_store.clear()
        _feedback_file.unlink(missing_ok=True)
    for i in range(5):
        client.post(
            "/feedback",
            json={"message": f"msg-{i}", "app": "web10-social", "route": "/feed"},
        )
    r = client.get("/feedback?limit=3")
    assert r.status_code == 200
    assert len(r.json()["items"]) == 3


def test_feedback_persists_to_disk():
    """Feedback survives a process restart (written to JSON on disk)."""
    with _feedback_lock:
        _feedback_store.clear()
        _feedback_file.unlink(missing_ok=True)
    client.post(
        "/feedback",
        json={"message": "persist-test", "app": "web10-social", "route": "/feed"},
    )
    # Verify the file was written
    assert _feedback_file.exists(), "feedback.json should exist after submit"
    stored = json.loads(_feedback_file.read_text())
    assert len(stored) == 1
    assert stored[0]["message"] == "persist-test"


def test_contact_never_in_public_post_body():
    """PII pin: contact and user_agent must NOT appear in the public post body.

    The reporter's contact info is PII — it stays in the disk store and
    GET /feedback only. The public post is anon-readable and discovery-
    indexed, so leaking contact info would violate the manifesto line
    "nobody is mining you".
    """
    entry = {
        "message": "white screen on feed",
        "contact": "user@example.com",
        "app": "web10-social",
        "route": "/feed",
        "version": "1.0.51",
        "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "console_errors": ["TypeError: x is null"],
        "stack_trace": "Error: x is null\n  at Foo.tsx:42:15\n  at http://localhost:3000/app.js:100\n  token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    }
    post_body = _format_bug_post(entry)

    # Contact must NOT appear in the public post body
    assert "user@example.com" not in post_body, "contact email leaked into public post"
    assert "Contact:" not in post_body, "Contact: label leaked into public post"

    # User-agent must NOT appear in the public post body
    assert "Mozilla" not in post_body, "user_agent leaked into public post"

    # Stack trace must be capped and stripped of URLs / tokens
    assert "localhost:3000" not in post_body, "URL leaked in stack trace"
    assert "eyJhbGci" not in post_body, "token leaked in stack trace"
    assert "<url-redacted>" in post_body, "URLs should be redacted in stack"
    assert "<token-redacted>" in post_body, "long token-like strings should be redacted"

    # Safe fields should still appear
    assert entry["message"] in post_body
    assert entry["route"] in post_body
    assert entry["version"] in post_body


# ─── JS Error beacon ─────────────────────────────────────────────────────────


def test_error_beacon_minimal():
    analytics_events.clear()
    r = client.post(
        "/analytics/error",
        json={"message": "TypeError: x is null", "app": "marketing-ui", "route": "/docs/sdk"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert len([e for e in analytics_events if e["type"] == "error"]) == 1


def test_error_beacon_full():
    analytics_events.clear()
    r = client.post(
        "/analytics/error",
        json={
            "message": "ReferenceError: foo is not defined",
            "source": "app.js",
            "line": 42,
            "column": 5,
            "app": "marketing-ui",
            "route": "/import",
            "user_agent": "Mozilla/5.0",
        },
    )
    assert r.status_code == 200
    errors = [e for e in analytics_events if e["type"] == "error"]
    assert errors[0]["source"] == "app.js"
    assert errors[0]["line"] == 42
    assert errors[0]["column"] == 5


def test_error_beacon_rejects_missing_app():
    r = client.post(
        "/analytics/error",
        json={"message": "broken", "route": "/feed"},
    )
    assert r.status_code == 422


def test_error_beacon_rejects_missing_route():
    r = client.post(
        "/analytics/error",
        json={"message": "broken", "app": "marketing-ui"},
    )
    assert r.status_code == 422


# ─── Funnel events ───────────────────────────────────────────────────────────


def test_funnel_event():
    analytics_events.clear()
    r = client.post(
        "/analytics/funnel",
        json={"event": "landing", "metadata": {}},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    funnel_events = [e for e in analytics_events if e["type"] == "funnel"]
    assert funnel_events[0]["event"] == "landing"


def test_funnel_event_new_types():
    analytics_events.clear()
    for event in ("trending_view", "sign_up_click", "github_click", "enter_click"):
        r = client.post(
            "/analytics/funnel",
            json={"event": event, "metadata": {}},
        )
        assert r.status_code == 200, f"funnel event {event} should accept"


def test_analytics_summary_includes_dropoff():
    analytics_events.clear()
    for event in ("landing", "docs_view", "exporter_view"):
        client.post("/analytics/funnel", json={"event": event, "metadata": {}})
    r = client.get("/analytics/summary")
    assert r.status_code == 200
    data = r.json()
    assert "funnel_dropoff" in data
    assert "total_errors" in data
    assert data["funnel_dropoff"]["docs_view"]["reached"] == 1
    assert data["funnel_dropoff"]["docs_view"]["previous_reached"] == 1
    assert data["funnel_dropoff"]["docs_view"]["drop_off_pct"] == 0.0
