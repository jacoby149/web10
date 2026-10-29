"""L1-VAL-01: real validation failures must not duplicate private input."""

import logging
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.mark.parametrize(
    "path,payload",
    [
        ("/v3/query", {"token": "TOKEN_CANARY", "password": "PASSWORD_CANARY", "body": "CONTENT_CANARY"}),
        ("/v3/query", {"token": {"secret": "TOKEN_CANARY"}, "sql": ["CONTENT_CANARY"]}),
        ("/v3/query", ["TOKEN_CANARY", "PASSWORD_CANARY", "CONTENT_CANARY"]),
    ],
)
def test_invalid_request_does_not_echo_input(path, payload, caplog):
    with patch("app.middleware.ch.client.insert"), caplog.at_level(logging.ERROR):
        response = TestClient(app, raise_server_exceptions=False).post(path, json=payload)
    assert response.status_code == 422
    assert response.headers["access-control-allow-origin"] == "*"
    for canary in ("TOKEN_CANARY", "PASSWORD_CANARY", "CONTENT_CANARY"):
        assert canary not in response.text
        assert canary not in repr([vars(record) for record in caplog.records])
    body = response.json()
    assert body["status_code"] == 10422
    assert body["message"] == "request validation failed"
    assert body["data"] is None
    assert len(body["error_id"]) == 12
    assert any(body["error_id"] in record.getMessage() for record in caplog.records)
    assert any("errors=" in record.getMessage() for record in caplog.records)


def test_invalid_json_does_not_echo_parser_context(caplog):
    with patch("app.middleware.ch.client.insert"), caplog.at_level(logging.ERROR):
        response = TestClient(app).post(
            "/v3/query?secret=QUERY_CANARY",
            content='{"token":"TOKEN_CANARY", "sql": CONTENT_CANARY}',
            headers={"content-type": "application/json", "origin": "https://ORIGIN_CANARY.example"},
        )
    assert response.status_code == 422
    captured = response.text + repr([vars(record) for record in caplog.records])
    for canary in ("TOKEN_CANARY", "CONTENT_CANARY", "QUERY_CANARY", "ORIGIN_CANARY"):
        assert canary not in captured


def test_valid_schema_still_reaches_authentication():
    with patch("app.middleware.ch.client.insert"):
        response = TestClient(app, raise_server_exceptions=False).post(
            "/v3/query", json={"token": "not-a-jwt", "sql": "SELECT 1"}
        )
    assert response.status_code == 401


def test_valid_query_result_unchanged():
    with (
        patch("app.middleware.ch.client.insert"),
        patch("app.v3.endpoints.query.user_or_anon", return_value="anon"),
        patch("app.v3.endpoints.query.ch.get_user_groups", return_value=[]),
        patch("app.v3.endpoints.query.ch.execute_query", return_value=(["value"], [(42,)])),
    ):
        response = TestClient(app).post("/v3/query", json={"sql": "SELECT * FROM posts"})
    assert response.status_code == 200
    assert response.json() == {"rows": [{"value": 42}], "count": 1}
