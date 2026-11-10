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
from pathlib import Path
from provenance import tree_hash

if settings.QUERY_EVAL_NO_POLICY or settings.QUERY_EVAL_STUB_EXECUTE:
    raise RuntimeError("observer refuses policy-bypass or synthetic-output flags")
API_SOURCE = tree_hash("/web10/app")
OBSERVER_SOURCE = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()

current = contextvars.ContextVar("costfn_request", default=None)
original_compile = safe_query.build_safe_query

# Arm D treatment (PROTOCOL §4): research-only, off by default, enabled by
# COSTFN_ARM_D=1 on the research stack. Rewrites the personal-feed compiled
# main query to the key-exploiting author-set form after point-scale
# verification (membership + ownership + empty gate tables). Any failure
# refuses the treatment with a recorded 403 — the arm is a treatment, and it
# is never issued unverified.
ARM_D_ENABLED = os.environ.get("COSTFN_ARM_D") == "1"
if ARM_D_ENABLED:
    import arm_d_rewrite
    from app.v3.services import clickhouse as ch

    # Node-ad inventory TTL short-circuit (PROTOCOL, declared 10.11.2026):
    # the inventory read is a shared node-level surface — one computation per
    # refresh interval, served to all (PLAN §1.4 cache principle). The first
    # read per TTL window is the real, verified read; the rest are cache
    # hits that skip the 7.2M-row scan. The live-read count and the
    # creatives seen are recorded per request for the receipts.
    _original_node_ads = ch.get_active_node_ads
    _inventory = {"ads": None, "expires": 0.0, "ttl_s": 60.0, "live_reads": 0, "cache_hits": 0}

    def _cached_node_ads():
        import time as _time
        now = _time.time()
        if _inventory["ads"] is not None and now < _inventory["expires"]:
            _inventory["cache_hits"] += 1
            return list(_inventory["ads"])
        ads = _original_node_ads()
        _inventory.update(ads=ads, expires=now + _inventory["ttl_s"], live_reads=_inventory["live_reads"] + 1)
        return ads

    ch.get_active_node_ads = _cached_node_ads

    def _arm_d_verify(member_key, groups, authors):
        for query, want in arm_d_rewrite.verify_sql(member_key, groups, authors):
            columns, values = ch.execute_query(query, settings={"max_execution_time": 30})
            got = int(values[0][0])
            if got != want:
                raise safe_query.UnsafeQueryError(f"arm-d verification failed: got {got}, want {want}")

    def _main_treat(args, kwargs):
        """The personal-feed main: author-set + key-exploit (PROTOCOL section 4)."""
        if len(args) < 2 or not isinstance(args[1], dict):
            return None
        readable = args[1]
        member_key = kwargs.get("member_key")
        if not member_key or set(readable) != {"posts", "reactions", "comments", "profile"}:
            return None
        if len({frozenset(v) for v in readable.values()}) != 1:
            return None
        groups = sorted(next(iter(readable.values())))
        try:
            authors = [arm_d_rewrite.owner_of_group(g) for g in groups]
        except ValueError:
            return None
        _arm_d_verify(member_key, groups, authors)
        return ("main", member_key, groups, authors)

    def _followup_treat(args, kwargs):
        """The engagement follow-ups: exact-ID doc_groups pushdown (Step 1a)."""
        if len(args) < 2 or not isinstance(args[1], dict):
            return None
        readable = args[1]
        member_key = kwargs.get("member_key")
        if not member_key or len(readable) != 1:
            return None
        service = next(iter(readable))
        if service not in ("reactions", "comments"):
            return None
        return ("followup", member_key, service)


def capture_compile(*args, **kwargs):
    sql = original_compile(*args, **kwargs)
    observation = current.get()
    if ARM_D_ENABLED and observation is not None:
        try:
            treated = _main_treat(args, kwargs) or _followup_treat(args, kwargs)
        except ValueError:
            treated = None
        if treated is not None:
            kind = treated[0]
            if kind == "main":
                _, member_key, groups, authors = treated
                sql = arm_d_rewrite.transform(sql, member_key, groups, authors)
                observation["arm_d_treatment"] = {"form": "author-set", "groups": len(groups),
                                                  "memberships_verified": len(groups),
                                                  "owners_verified": len(groups), "gates_empty": True}
            else:
                _, member_key, service = treated
                followup = arm_d_rewrite.transform_followup(sql, member_key, service)
                if followup is None:
                    # Not the follow-up shape (e.g. a prepare-pass canonical
                    # read): leave the compiled SQL untouched.
                    pass
                else:
                    # I3 verification (point-scale) before the rewrite: the
                    # returned posts readable via the requested groups, the
                    # reader's Discover membership, empty gate tables.
                    fgroups = arm_d_rewrite.followup_groups(sql)
                    fids = arm_d_rewrite.followup_ids(sql)
                    for query, want in arm_d_rewrite.followup_verify_sql(member_key, fids, fgroups):
                        columns, values = ch.execute_query(query, settings={"max_execution_time": 30})
                        got = int(values[0][0])
                        if got != want:
                            raise safe_query.UnsafeQueryError(f"arm-d follow-up verification failed: got {got}, want {want}")
                    sql = followup
                    observation["arm_d_treatment"] = {"form": "exact-id-readability", "service": service,
                                                     "posts_verified_readable": len(fids),
                                                     "residual": "service-partition documents read (declared)"}
        observation["arm_d_inventory"] = {"live_reads": _inventory["live_reads"],
                                          "cache_hits": _inventory["cache_hits"],
                                          "ttl_s": _inventory["ttl_s"]}
    if observation is not None:
        observation["compiled_sha256"] = hashlib.sha256(sql.encode()).hexdigest()
    return sql


safe_query.build_safe_query = capture_compile


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
