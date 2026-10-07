import json

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from pydantic import BaseModel
from starlette.responses import Response

from app import middleware


@pytest.fixture
def capture(monkeypatch):
    rows = []

    async def insert(row):
        rows.append(row)

    monkeypatch.setattr(middleware, "_insert_log", insert)
    app = FastAPI()
    app.middleware("http")(middleware.log_requests)
    return app, rows


@pytest.mark.parametrize(
    "field",
    sorted(middleware.SECRET_FIELDS)
    + [
        "password_hash",
        "new_pass",
        "new_password",
        "verify_token",
        "private_key",
        "api_key",
        "access_key",
        "secret_key",
        "AccessToken",
        "Authorization",
    ],
)
def test_nested_credentials_and_echoes(capture, field):
    app, rows = capture
    credential = "request-credential-123"
    issued = "response-credential-456"
    payload = {"nested": [{field: {"values": [credential]}}], "echo": f"using {issued}", "safe": "useful"}
    raw_response = json.dumps(
        {"nested": [{field: issued}], "detail": [f"rejected {credential}", {"echo": issued}], "safe": 42}
    ).encode()

    @app.post("/rtc/authorize")
    async def authorize(request: Request):
        assert await request.json() == payload
        return Response(raw_response, status_code=422, headers={"x-test": "unchanged"}, media_type="application/json")

    with TestClient(app) as client:
        response = client.post("/rtc/authorize", json=payload)
    assert response.content == raw_response
    assert response.status_code == 422
    assert response.headers["x-test"] == "unchanged"
    assert len(rows) == 1
    logs = str(rows)
    assert credential not in logs
    assert issued not in logs
    assert "[REDACTED]" in logs
    assert json.loads(rows[0]["request_body"])["safe"] == "useful"
    assert json.loads(rows[0]["response_body"])["safe"] == 42
    assert "rejected" in rows[0]["message"]


class AuthBody(BaseModel):
    token: int


def test_real_validation_input_echo(capture):
    app, rows = capture

    @app.post("/validate")
    async def validate(body: AuthBody):
        return body

    with TestClient(app) as client:
        response = client.post("/validate", json={"token": "invalid-secret-token"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["input"] == "invalid-secret-token"
    assert "invalid-secret-token" not in str(rows)
    assert "int_parsing" in rows[0]["meta"]


@pytest.mark.parametrize("raw", [b"password=raw-secret", b'{"token":"raw-secret"', b"\xffraw-secret"])
def test_non_json_bodies_are_omitted(capture, raw):
    app, rows = capture

    @app.post("/raw")
    async def echo(request: Request):
        assert await request.body() == raw
        return Response(raw, status_code=400)

    with TestClient(app) as client:
        response = client.post("/raw", content=raw)
    assert response.content == raw
    assert "raw-secret" not in str(rows)
    assert rows[0]["request_body"] == "[non-JSON body omitted]"
    assert rows[0]["response_body"] == "[non-JSON body omitted]"


def test_redaction_precedes_truncation_and_covers_paths(capture):
    app, rows = capture
    secret = "long-credential-" + "x" * middleware.MAX_BODY

    @app.post("/{path:path}")
    async def echo(request: Request):
        return Response(json.dumps({"detail": f"bad {secret}"}), status_code=400)

    with TestClient(app) as client:
        response = client.post(
            "/long-credential-", json={"echo": secret, "token": secret, "password": "long-credential-"}
        )
    assert secret in response.json()["detail"]
    assert "long-credential-" not in str(rows)
    assert json.loads(rows[0]["request_body"])["echo"] == "[REDACTED]"


def test_malformed_json_validation_does_not_log_input(capture):
    app, rows = capture

    @app.post("/validate")
    async def validate(body: AuthBody):
        return body

    with TestClient(app) as client:
        response = client.post(
            "/validate", content='{"token":"malformed-secret"', headers={"content-type": "application/json"}
        )
    assert response.status_code == 422
    assert "malformed-secret" not in str(rows)


def test_deep_body_does_not_break_response_or_expose_credentials(capture):
    app, rows = capture
    raw = b'{"nested":' * 6000 + b'{"token":"deep-secret"}' + b"}" * 6000

    @app.post("/deep")
    async def deep(request: Request):
        return Response(await request.body(), media_type="application/json")

    with TestClient(app) as client:
        response = client.post("/deep", content=raw)
    assert response.content == raw
    assert "deep-secret" not in str(rows)
