import json
import logging
import time
from datetime import datetime

import jwt
from fastapi import Request
from starlette.responses import Response

from app.v3.services import clickhouse as ch

log = logging.getLogger(__name__)

MAX_BODY = 4096


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
                "ts", "service", "level", "method", "path", "status",
                "latency_ms", "user_key", "origin", "message",
                "request_body", "response_body", "meta",
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
    body_str = _truncate(body.decode("utf-8", errors="replace")) if body else ""
    user_key = _extract_user_key(body)
    origin = request.headers.get("origin", "")

    response = await call_next(request)

    # Buffer response body for logging
    resp_chunks = []
    async for chunk in response.body_iterator:
        resp_chunks.append(chunk if isinstance(chunk, bytes) else chunk.encode())
    resp_body = b"".join(resp_chunks)
    resp_str = _truncate(resp_body.decode("utf-8", errors="replace")) if resp_body else ""

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
            resp_json = json.loads(resp_body)
            detail = resp_json.get("detail", "")
            if detail:
                message += f" — {detail}"
            meta_str = json.dumps(resp_json) if resp_json else ""
        except Exception:
            pass

    new_response = Response(
        content=resp_body,
        status_code=status_code,
        headers=dict(response.headers),
        media_type=response.media_type,
    )

    import asyncio
    asyncio.create_task(_insert_log({
        "ts": datetime.utcnow(),
        "service": "api",
        "level": level,
        "method": request.method,
        "path": str(request.url.path),
        "status": status_code,
        "latency_ms": latency_ms,
        "user_key": user_key,
        "origin": origin,
        "message": message,
        "request_body": body_str,
        "response_body": resp_str,
        "meta": meta_str,
    }))

    return new_response
