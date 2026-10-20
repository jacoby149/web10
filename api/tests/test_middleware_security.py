"""B-4 repro gate: private HTTP data must not enter automatic request logs."""

import asyncio
import json
import logging
from types import SimpleNamespace

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.background import BackgroundTask
from starlette.requests import Request
from starlette.responses import StreamingResponse

from app import middleware


async def _empty_receive():
    return {"type": "http.request", "body": b"", "more_body": False}


@pytest.fixture
def rows(monkeypatch):
    captured = []

    def insert(table, values, column_names):
        assert table == "logs"
        captured.extend(dict(zip(column_names, value, strict=True)) for value in values)

    monkeypatch.setattr(middleware.ch, "client", SimpleNamespace(insert=insert))
    return captured


@pytest.mark.parametrize("status,level", [(200, "info"), (400, "warn"), (422, "warn"), (500, "error")])
async def test_logging_omits_all_untrusted_content(rows, status, level):
    private = {
        name: f"SYNTHETIC-PRIVATE-{name}"
        for name in ("username", "request", "response", "detail", "path", "query", "origin", "header")
    }
    token = jwt.encode({"username": private["username"]}, "synthetic-only-signing-key-32-bytes-long", algorithm="HS256")
    payload = json.dumps({"token": token, "unknown_field": private["request"]}).encode()
    response_payload = json.dumps({"token": private["response"], "detail": private["detail"]}).encode()

    async def receive():
        return {"type": "http.request", "body": payload, "more_body": False}

    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": f"/records/{private['path']}",
            "query_string": f"token={private['query']}".encode(),
            "headers": [(b"origin", private["origin"].encode()), (b"authorization", private["header"].encode())],
            "route": SimpleNamespace(path="/records/{record_id}"),
        },
        receive=receive,
    )
    response = StreamingResponse(iter([response_payload]), status_code=status)

    async def endpoint(req):
        assert await req.body() == payload
        return response

    returned = await middleware.log_requests(request, endpoint)
    await asyncio.sleep(0)
    assert len(rows) == 1
    stored = json.dumps(rows, default=str)
    assert all(value not in stored for value in [*private.values(), token])
    assert rows[0]["message"] == f"POST /records/{{record_id}} -> {status}"
    assert rows[0]["level"] == level and rows[0]["status"] == status
    assert rows[0]["latency_ms"] >= 0
    assert all(rows[0][key] == "" for key in ("request_body", "response_body", "meta", "user_key", "origin"))
    assert returned is response
    assert b"".join([chunk async for chunk in returned.body_iterator]) == response_payload


def test_real_router_records_template_and_preserves_payload(rows):
    app = FastAPI()
    app.middleware("http")(middleware.log_requests)

    @app.post("/echo/{item_id}")
    async def echo(item_id: str, request: Request):
        return {"item_id": item_id, "body": await request.json()}

    @app.get("/validate")
    def validate(count: int):
        return {"count": count}

    secret = "SYNTHETIC-PRIVATE-ROUTE-AND-BODY"
    with TestClient(app) as client:
        response = client.post(f"/echo/{secret}?token={secret}", json={"password": secret})
        invalid = client.get("/validate", params={"count": secret})
    assert response.json() == {"item_id": secret, "body": {"password": secret}}
    assert rows[0]["path"] == "/echo/{item_id}" and rows[0]["status"] == 200
    assert invalid.status_code == 422 and secret in invalid.text
    assert rows[1]["status"] == 422 and rows[1]["meta"] == ""
    assert secret not in json.dumps(rows, default=str)


def test_real_stream_preserves_cookies_and_runs_background(rows):
    app = FastAPI()
    app.middleware("http")(middleware.log_requests)
    completed = []

    @app.get("/stream")
    def stream():
        response = StreamingResponse(iter([b"first", b"second"]), background=BackgroundTask(completed.append, "done"))
        response.set_cookie("first", "one")
        response.set_cookie("second", "two")
        return response

    with TestClient(app) as client:
        response = client.get("/stream")
    assert response.content == b"firstsecond" and len(response.headers.get_list("set-cookie")) == 2
    assert completed == ["done"] and rows[0]["path"] == "/stream"


async def test_logging_does_not_read_request_or_consume_stream(rows):
    async def receive():
        raise AssertionError("logger read the request body")

    consumed = []

    async def stream():
        consumed.append(True)
        yield b"private stream"

    response = StreamingResponse(stream(), background=BackgroundTask(lambda: None))
    response.set_cookie("first", "one")
    response.set_cookie("second", "two")
    headers, background, iterator = list(response.raw_headers), response.background, response.body_iterator
    request = Request({"type": "http", "method": "GET", "path": "/stream", "headers": []}, receive=receive)

    async def endpoint(_):
        return response

    returned = await middleware.log_requests(request, endpoint)
    await asyncio.sleep(0)
    assert returned is response and returned.body_iterator is iterator
    assert returned.raw_headers == headers and returned.background is background
    assert not consumed


async def test_unmatched_paths_and_hostile_methods_are_not_logged(rows):
    secret = "SYNTHETIC-UNTRUSTED-METADATA"
    request = Request({"type": "http", "method": secret, "path": f"/{secret}", "headers": []}, receive=_empty_receive)

    async def endpoint(_):
        return StreamingResponse(iter([]), status_code=404)

    await middleware.log_requests(request, endpoint)
    await asyncio.sleep(0)
    assert rows[0]["method"] == "OTHER" and rows[0]["path"] == "<unmatched>"
    assert secret not in json.dumps(rows, default=str)


async def test_log_storage_failure_does_not_disclose_exception(rows, monkeypatch, caplog):
    def fail(*args, **kwargs):
        raise RuntimeError("SYNTHETIC-PRIVATE-DB-DETAIL")

    monkeypatch.setattr(middleware.ch.client, "insert", fail)
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": []}, receive=_empty_receive)

    async def endpoint(_):
        return StreamingResponse(iter([]))

    with caplog.at_level(logging.DEBUG, logger=middleware.__name__):
        await middleware.log_requests(request, endpoint)
        await asyncio.sleep(0)
    assert "SYNTHETIC-PRIVATE-DB-DETAIL" not in caplog.text
    assert all(record.exc_info is None for record in caplog.records)
    assert "log insert failed" in caplog.text
