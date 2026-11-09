"""Observation-only ASGI wrapper. Mounted only by research.compose.yml.

No new endpoint, credentials, authorization substitution, SQL or body logging.
"""
import contextvars
import hashlib
import json
import logging
import os
import re
import time

if os.environ.get("COSTFN_DISPOSABLE") != "1":
    raise RuntimeError("research entry point requires COSTFN_DISPOSABLE=1")

from app.main import app
from app import settings
from app.v3.services import safe_query
from app.v3.services import clickhouse as ch
from pathlib import Path
from provenance import tree_hash
from query_observation import instrument_client

if settings.QUERY_EVAL_NO_POLICY or settings.QUERY_EVAL_STUB_EXECUTE:
    raise RuntimeError("observer refuses policy-bypass or synthetic-output flags")
API_SOURCE = tree_hash("/web10/app")
OBSERVER_SOURCE = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()

current = contextvars.ContextVar("costfn_request", default=None)
original_compile = safe_query.build_safe_query


def capture_compile(*args, **kwargs):
    sql = original_compile(*args, **kwargs)
    observation = current.get()
    if observation is not None:
        observation["compiled_sha256"] = hashlib.sha256(sql.encode()).hexdigest()
        observation.setdefault("compiled_query_sha256s", []).append(observation["compiled_sha256"])
        # Witness the emitted candidate plan, not merely its enable flag. OR
        # retains main-query evidence across later canonical preparation calls.
        observation["date_plan_applied"] = observation.get("date_plan_applied", False) or (
            "IN (SELECT author_key, doc_id FROM documents WHERE" in sql
        )
    return sql


safe_query.build_safe_query = capture_compile

if os.environ.get("COSTFN_QUERY_IDS") == "1":
    original_get_client = ch._get_client

    def observed_client():
        return instrument_client(original_get_client(), current.get)

    ch._get_client = observed_client


class TimingCapture(logging.Handler):
    def emit(self, record):
        observation = current.get()
        if observation is None or not isinstance(record.msg, str):
            return
        # Inspect only fixed format strings. Never format arbitrary HTTP/SQL logs.
        if record.msg.startswith("[query] id=%s timing_ms "):
            names = re.findall(r"(\w+)=%\.2f", record.msg)
            phases = dict(zip(names, record.args[1:]))
            observation["phases_ms"] = phases
            observation["query_id"] = record.args[0]
            observation["unattributed_handler_ms"] = phases["total"] - sum(v for k, v in phases.items() if k != "total")
        elif record.msg.startswith("[content_events] delivery log failed"):
            observation["delivery_failures"] = observation.get("delivery_failures", 0) + 1


logging.getLogger().addHandler(TimingCapture())


async def application(scope, receive, send):
    if scope["type"] != "http":
        return await app(scope, receive, send)
    headers = dict(scope.get("headers", []))
    request_id = headers.get(b"x-research-id", b"").decode("ascii", errors="ignore")
    if not re.fullmatch(r"[a-f0-9]{32}", request_id):
        request_id = "unlabelled"
    observation = {"request_id": request_id, "status": 500, "api_python_sha256": API_SOURCE,
                    "observer_sha256": OBSERVER_SOURCE, "resolver_mode": settings.QUERY_EVAL_READABLE_MODE or settings.READABLE_RESOLUTION_MODE,
                    "date_pruning_enabled": settings.QUERY_EVAL_DATE_PRUNING,
                   "worker_pid": os.getpid()}
    token = current.set(observation)
    start = time.perf_counter()

    async def observed_send(message):
        if message["type"] == "http.response.start":
            observation["status"] = message["status"]
            message = {**message, "headers": [*message.get("headers", []), (b"x-research-id", request_id.encode())]}
        await send(message)

    try:
        await app(scope, receive, observed_send)
    finally:
        import anyio.to_thread
        observation["asgi_ms"] = (time.perf_counter() - start) * 1000
        observation["threadpool_tokens"] = anyio.to_thread.current_default_thread_limiter().total_tokens
        observation["path_kind"] = scope.get("route").path if scope.get("route") else "unmatched"
        # This includes queueing AND middleware/encoding/transport work. Not an exact queue timer.
        if "phases_ms" in observation:
            observation["outside_handler_ms"] = observation["asgi_ms"] - observation["phases_ms"]["total"]
        print("COSTFN_REQUEST=" + json.dumps(observation), flush=True)
        current.reset(token)
