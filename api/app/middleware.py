import json
import logging
import re
import time
from datetime import datetime

import jwt
from fastapi import Request
from starlette.responses import Response

from app.v3.services import clickhouse as ch

log = logging.getLogger(__name__)

MAX_BODY = 4096
SECRET_FIELDS = {
    "token",
    "password",
    "passwordhash",
    "newpass",
    "newpassword",
    "verifytoken",
    "ticket",
    "credential",
    "credentials",
    "secret",
    "privatekey",
    "apikey",
    "accesskey",
    "secretkey",
    "auth",
    "authorization",
    "authentication",
    "accesstoken",
    "refreshtoken",
    "idtoken",
    "clientsecret",
}


def _collect_credentials(value, credentials: set[str], sensitive: bool = False):
    if isinstance(value, dict):
        for key, item in value.items():
            _collect_credentials(item, credentials, sensitive or re.sub(r"[^a-z0-9]", "", key.lower()) in SECRET_FIELDS)
    elif isinstance(value, list):
        for item in value:
            _collect_credentials(item, credentials, sensitive)
    elif sensitive and isinstance(value, str) and value:
        credentials.add(value)


def _redact(value, pattern):
    if isinstance(value, dict):
        return {
            _redact(key, pattern): (
                "[REDACTED]"
                if re.sub(r"[^a-z0-9]", "", key.lower()) in SECRET_FIELDS or key == "input"
                else _redact(item, pattern)
            )
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact(item, pattern) for item in value]
    if isinstance(value, str) and pattern:
        return pattern.sub(lambda _: "[REDACTED]", value)
    return value


async def _insert_log(row: dict):
    try:
        ch.client.insert(
            "logs",
            [
                [
                    row["ts"],
                    row["service"],
                    row["level"],
                    row["method"],
                    row["path"],
                    row["status"],
                    row["latency_ms"],
                    row["user_key"],
                    row["origin"],
                    row["message"],
                    row["request_body"],
                    row["response_body"],
                    row["meta"],
                ]
            ],
            column_names=[
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
            ],
        )
    except Exception:
        log.debug("log insert failed (CH unavailable?)", exc_info=True)


def _extract_user_key(body: bytes) -> str:
    try:
        data = json.loads(body) if body else {}
        token = data.get("token", "")
        if token:
            payload = jwt.decode(token, options={"verify_signature": False})
            return payload.get("username", "")
    except Exception:
        pass
    return ""


def _truncate(s: str, n: int = MAX_BODY) -> str:
    return s[:n] if len(s) > n else s


async def log_requests(request: Request, call_next):
    start = time.perf_counter()

    body = await request.body()
    user_key = _extract_user_key(body)
    origin = request.headers.get("origin", "")

    response = await call_next(request)

    # Buffer response body for logging
    resp_chunks = []
    async for chunk in response.body_iterator:
        resp_chunks.append(chunk if isinstance(chunk, bytes) else chunk.encode())
    resp_body = b"".join(resp_chunks)
    # Parse complete bodies and collect both sides before redacting any echoes.
    credentials = set()
    parsed = []
    for raw in (body, resp_body):
        try:
            value = json.loads(raw) if raw else ""
        except (ValueError, UnicodeDecodeError, RecursionError):
            value = "[non-JSON body omitted]"
        try:
            _collect_credentials(value, credentials)
        except RecursionError:
            # A deeply nested payload must not break its response or leave
            # uncollected credentials visible in the other body's echoes.
            parsed = ["[non-JSON body omitted]", "[non-JSON body omitted]"]
            credentials.clear()
            break
        parsed.append(value)
    pattern = (
        re.compile("|".join(re.escape(value) for value in sorted(credentials, key=len, reverse=True)))
        if credentials
        else None
    )
    try:
        safe_request, safe_response = [_redact(value, pattern) for value in parsed]
    except RecursionError:
        safe_request = safe_response = "[non-JSON body omitted]"
    body_str, resp_str = [
        _truncate(json.dumps(value) if raw and value != "[non-JSON body omitted]" else value)
        for value, raw in zip((safe_request, safe_response), (body, resp_body), strict=True)
    ]

    latency_ms = int((time.perf_counter() - start) * 1000)
    status_code = response.status_code

    level = "info"
    if status_code >= 500:
        level = "error"
    elif status_code >= 400:
        level = "warn"

    message = f"{request.method} {request.url.path} -> {status_code}"

    # For errors, include the detail in the message
    meta_str = ""
    if status_code >= 400 and resp_body:
        try:
            detail = safe_response.get("detail", "") if isinstance(safe_response, dict) else ""
            if detail:
                message += f" — {detail}"
            meta_str = json.dumps(safe_response) if safe_response else ""
        except Exception:
            pass

    new_response = Response(
        content=resp_body,
        status_code=status_code,
        headers=dict(response.headers),
        media_type=response.media_type,
    )

    import asyncio

    asyncio.create_task(
        _insert_log(
            {
                "ts": datetime.utcnow(),
                "service": "api",
                "level": level,
                "method": request.method,
                "path": _redact(str(request.url.path), pattern),
                "status": status_code,
                "latency_ms": latency_ms,
                "user_key": _redact(user_key, pattern),
                "origin": _redact(origin, pattern),
                "message": _redact(message, pattern),
                "request_body": body_str,
                "response_body": resp_str,
                "meta": meta_str,
            }
        )
    )

    return new_response
