import asyncio
import logging
from unittest.mock import patch

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.background import BackgroundTask
from starlette.responses import Response, StreamingResponse

from app.main import app
from app.middleware import _insert_log, log_requests


@pytest.mark.parametrize("status", [200, 400, 500])
async def test_logging_omits_all_untrusted_content(status):
    secret = "credential-canary"
    test_app = FastAPI()
    test_app.middleware("http")(log_requests)

    @test_app.post("/flow/{value}")
    async def flow(request: Request, value: str):
        return Response(await request.body(), status_code=status)

    payload = {
        "nested": [
            {
                key: secret
                for key in (
                    "token",
                    "password",
                    "new_pass",
                    "new_password",
                    "verify_token",
                    "code",
                    "contact",
                    "email",
                    "phone",
                    "signed_url",
                    "detail",
                )
            }
        ]
    }
    with patch("app.middleware.ch.client.insert") as insert:
        with TestClient(test_app) as client:
            response = client.post(
                f"/flow/{secret}?token={secret}",
                json=payload,
                headers={"origin": f"https://{secret}.example", "authorization": secret},
            )
        assert response.json() == payload
        row = insert.call_args.args[1][0]
        assert secret not in repr(row)
        assert row[4] == "/flow/{value}"
        assert row[5] == status
        assert row[6] >= 0
        assert row[7:9] == ["", ""]
        assert row[10:13] == ["", "", ""]


async def test_logging_does_not_read_request_or_consume_stream():
    async def receive():
        pytest.fail("logging must not read the request body")

    request = Request({"type": "http", "method": "POST", "path": "/secret", "headers": []}, receive)
    consumed = []
    completed = []

    async def stream():
        consumed.append(True)
        yield b"first"
        await asyncio.Event().wait()  # An unbounded response must not block logging.

    response = StreamingResponse(stream(), background=BackgroundTask(completed.append, True))
    response.raw_headers.extend([(b"set-cookie", b"one=1"), (b"set-cookie", b"two=2")])

    async def call_next(_):
        return response

    with patch("app.middleware.ch.client.insert") as insert:
        result = await asyncio.wait_for(log_requests(request, call_next), timeout=1)
        await asyncio.sleep(0)
        assert insert.call_args.args[1][0][4] == "<unmatched>"
    assert result is response
    assert not consumed
    assert result.raw_headers[-2:] == [(b"set-cookie", b"one=1"), (b"set-cookie", b"two=2")]
    assert await anext(result.body_iterator) == b"first"
    await result.body_iterator.aclose()
    await result.background()
    assert completed == [True]


async def test_log_storage_failure_does_not_disclose_exception(caplog):
    caplog.set_level(logging.DEBUG)
    row = dict.fromkeys(
        (
            "ts",
            "service",
            "level",
            "method",
            "path",
            "status",
            "latency_ms",
            "user_key",
            "origin",
            "message",
            "request_body",
            "response_body",
            "meta",
        ),
        "",
    )
    with patch("app.middleware.ch.client.insert", side_effect=RuntimeError("storage-secret")):
        await _insert_log(row)
    assert "log insert failed" in caplog.text
    assert "storage-secret" not in caplog.text
    assert all(record.exc_info is None for record in caplog.records)


def test_real_unhandled_error_is_generic_and_correlated(caplog):
    secret = "exception-secret"
    with patch("app.v3.endpoints.auth_helper.decode_token", side_effect=RuntimeError(secret)):
        # Default re-raising proves the ASGI server won't receive this exception.
        response = TestClient(app).post(
            f"/v3/create?token={secret}",
            json={"token": secret, "service": "posts", "body": {}},
            headers={"origin": "https://arbitrary.example"},
        )
    assert response.status_code == 500
    body = response.json()
    assert body["detail"] == "internal server error"
    assert body["error"] == "internal_server_error"
    assert len(body["error_id"]) == 12
    assert body["error_id"] in caplog.text
    assert secret not in response.text + caplog.text
    assert response.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in response.headers


@pytest.mark.parametrize("payload", [[{"password": "validation-secret"}], {"token": {"contact": "validation-secret"}}])
def test_real_validation_error_omits_input(payload, caplog):
    response = TestClient(app).post("/v3/login", json=payload)
    assert response.status_code == 422
    assert response.json()["message"] == "request validation failed"
    assert "validation-secret" not in response.text + caplog.text


def test_cors_configuration_and_arbitrary_app_requests():
    cors = next(m for m in app.user_middleware if m.cls.__name__ == "CORSMiddleware")
    assert cors.kwargs["allow_credentials"] is False
    assert cors.kwargs["allow_origins"] == ["*"]
    client = TestClient(app, raise_server_exceptions=False)
    headers = {"Origin": "https://brand-new-app.example"}
    preflight = client.options(
        "/certify",
        headers={**headers, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"},
    )
    assert preflight.status_code == 200
    with patch("app.endpoints.system.certify"):
        success = client.post("/certify", headers=headers, json={"token": "body-token"})
    failure = client.post("/v3/login", headers=headers, json=[])
    assert success.status_code == 200
    for response in (preflight, success, failure):
        assert response.headers["access-control-allow-origin"] == "*"
        assert "access-control-allow-credentials" not in response.headers


def test_real_recovery_verify_response_credentials_are_not_logged():
    with (
        patch("app.services.twilio.check_verification"),
        patch(
            "app.v3.endpoints.recovery.ch.get_users_by_contact",
            return_value=[{"username": "tester", "email": "contact-secret@example.com"}],
        ),
        patch("app.middleware.ch.client.insert") as insert,
    ):
        response = TestClient(app).post(
            "/v3/recovery/verify",
            json={"contact": "contact-secret@example.com", "code": "123456"},
        )
    assert response.status_code == 200
    assert response.json()["verify_token"]
    rows = repr(insert.call_args_list)
    assert response.json()["verify_token"] not in rows
    assert "contact-secret" not in rows
    assert "123456" not in rows
