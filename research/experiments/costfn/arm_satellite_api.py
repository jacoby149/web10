"""Opt-in Config P API adapter, own admitted host only. No production imports it."""
import contextvars
import hashlib
import importlib
import inspect
import json
import os
from pathlib import Path

from fastapi import HTTPException
import sqlglot
from sqlglot import exp

import arm_t
from arm_satellite_runtime import admitted
from arm_satellite_pull import pull_page
import arm_satellite_serve as serve

if os.environ.get("SATELLITE_CONFIG_P") != "1" or any(os.environ.get(name) == "1" for name in
        ("COSTFN_ARM_D", "COSTFN_SATELLITE", "COSTFN_VIEWS_TREAT")):
    raise RuntimeError("explicit isolated Config P opt-in with old treatments off required")

STATE = Path(os.environ["SATELLITE_SERVE_STATE"])
operation = json.loads((STATE / "operation.json").read_bytes())
host = arm_t.digitalocean_id()
admitted(operation, host)
counts = json.loads((STATE / "counts.json").read_bytes())
metadata = json.loads((STATE / "metadata.json").read_bytes())
parity = json.loads((STATE / "parity.json").read_bytes())
profile = json.loads((STATE / "profile.json").read_bytes())
presence = json.loads((STATE / "presence.json").read_bytes())
if (counts.get("T1") != "PASS" or parity.get("outcome") != "PASS" or presence.get("T1") != "PASS"
        or any(item.get("droplet_id") != host for item in (counts, metadata, parity, profile, presence))
        or metadata["count_receipt_sha256"] != hashlib.sha256((STATE / "counts.json").read_bytes()).hexdigest()
        or parity["metadata_sha256"] != hashlib.sha256((STATE / "metadata.json").read_bytes()).hexdigest()
        or any(item.get("canonical_generation") != counts["canonical_generation"] for item in (metadata, parity, presence))):
    raise RuntimeError("same-host count/presence/metadata parity and exact generation required")

observer = importlib.import_module("research_api")
ch = importlib.import_module("app.v3.services.clickhouse")

_compile = observer.original_compile
_execute = ch.execute_query
_query = ch.client.query
_signature = inspect.signature(_query)
_pending = contextvars.ContextVar("satellite_canonical_result", default=None)
_inventory = contextvars.ContextVar("satellite_inventory_read", default=False)
_views = contextvars.ContextVar("satellite_views_read", default=False)
MARKER = "/* satellite-p live canonical result */ SELECT 1"


def stop(reason):
    current = observer.current.get()
    if current is not None:
        current["arm_p_stop"] = reason
    raise HTTPException(400, "Config P stopped; inspect retained metadata")


def query(sql=None, *args, **kwargs):
    if sql is None and "query" in kwargs:
        sql = kwargs.pop("query")
    admitted(operation, host)
    current = observer.current.get()
    if current is not None and current.get("arm_p_stop"):
        stop(current["arm_p_stop"])
    bound = _signature.bind_partial(sql, *args, **kwargs)
    params = bound.arguments.get("parameters") or {}
    if _inventory.get():
        # Bound the original inventory's history windows, ORDER/LIMIT and body
        # checks to current indexed pointers; never cache creative bodies.
        tree = sqlglot.parse_one(serve.bound_sql(sql, params), read="clickhouse")
        limit = int(tree.args["limit"].expression.this)
        token = _inventory.set(False)
        try:
            pointers = run("SELECT author_key,doc_id FROM strings WHERE owner_key=" + serve.typed.literal(params["discover"])
                + " AND field_name='tag:node_ad' ORDER BY version DESC LIMIT " + str(limit))
        finally:
            _inventory.reset(token)
        tree = serve.bounded(tree, [(row["author_key"], row["doc_id"]) for row in pointers])
        sql = tree.sql(dialect="clickhouse")
        bound.arguments["parameters"] = None
    if _views.get():
        # The closed Phase 1.6 point-seek repair, not view-counter snapshots.
        ids = [value for key, value in params.items() if key.startswith("d") and key[1:].isdigit()]
        tree = sqlglot.parse_one(serve.bound_sql(sql, params), read="clickhouse")
        for table in tree.find_all(exp.Table):
            if table.name == "doc_groups":
                table.find_ancestor(exp.Select).where(serve.condition("doc_id IN (" + serve.literals(ids) + ")"), copy=False)
        sql = tree.sql(dialect="clickhouse")
        bound.arguments["parameters"] = None
    bound.arguments["query"] = sql
    settings = dict(bound.arguments.get("settings") or {})
    settings["max_memory_usage"] = 22 * 1024**3
    if current is not None and current.get("request_id") != "unlabelled":
        settings["max_execution_time"] = 10
    bound.arguments["settings"] = settings
    print("[satellite-serve] read start", flush=True)
    try:
        result = _query(*bound.args, **bound.kwargs)
    except Exception as error:
        if current is not None:
            current["arm_p_native_failure"] = type(error).__name__
        print("[satellite-serve] read failed", type(error).__name__, flush=True)
        raise
    summary = result.summary or {}
    print("[satellite-serve] read end", result.query_id, summary.get("read_rows"), flush=True)
    if current is not None:
        current.setdefault("arm_p_native", []).append({"query_id": result.query_id,
            "read_rows": int(summary.get("read_rows", 0)), "read_bytes": int(summary.get("read_bytes", 0))})
    if current is not None and current.get("request_id") != "unlabelled" and int(summary.get("read_rows", 0)) > 10_000_000:
        stop("single_read_over_10M")
    return result


ch.client.query = query


def run(sql):
    columns, rows = _execute(sql, settings={"max_execution_time": 10})
    return [dict(zip(columns, row)) for row in rows]


def generation():
    rows = run("SELECT table,name,rows,data_version FROM system.parts WHERE database='web10' AND active AND table IN "
        "('documents','doc_groups','group_members','group_contracts','app_contracts','user_blacklist','group_blacklist',"
        "'user_group_sharing','group_hidden_docs','banned_users') ORDER BY table,name")
    for row in rows:
        row["rows"], row["data_version"] = str(row["rows"]), str(row["data_version"])
    if hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest() != counts["canonical_generation"]:
        stop("stale_canonical_generation")


def scope_for(label, reader, readable):
    if reader != profile["reader"]:
        stop("unbuilt_reader_scope")
    scope = next(row for row in counts["scopes"] if row["label"] == label)
    wanted = scope["groups_by_service"]
    if any(sorted(readable.get(service, [])) != sorted(groups) for service, groups in wanted.items()):
        stop("changed_service_scope")
    return scope["scope_key"]


def literal_ids(tree, *, document_only=True):
    where = tree.args.get("where")
    if where is None or not isinstance(where.this, exp.In):
        return []
    predicate = where.this
    if document_only and not (isinstance(predicate.this, exp.Column) and predicate.this.name == "doc_id"):
        return []
    if not predicate.expressions or any(not isinstance(value, exp.Literal) or not value.is_string for value in predicate.expressions):
        return []
    return sorted({value.this for value in predicate.expressions})


def compile_query(*args, **kwargs):
    compiled = _compile(*args, **kwargs)  # Existing authentication/read gate/compiler first.
    current = observer.current.get()
    if current is None:
        return compiled
    if not current.get("arm_p_generation_checked"):
        generation()
        current["arm_p_generation_checked"] = True
    readable = args[1] if len(args) > 1 else kwargs["readable_groups_by_service"]
    reader = kwargs.get("member_key", args[2] if len(args) > 2 else "anon")
    tree = sqlglot.parse_one(compiled, read="clickhouse")
    source = tree.args.get("from_")
    service = source.this.name if source is not None and isinstance(source.this, exp.Table) else None
    if service and tree.args.get("joins") and "profile_body" in {item.alias_or_name for item in tree.expressions}:
        scope = scope_for("main", reader, readable)
        size = int(tree.args["limit"].expression.this)
        columns = []

        def fetch(group, after, limit):
            return run(serve.candidate_sql(compiled, group, after, limit))

        def resolve(pointers):
            nonlocal columns
            authors = [row["author_key"] for row in pointers]
            profiles = run("SELECT author_key,doc_id FROM strings WHERE owner_key IN (" + serve.literals(authors) + ") AND field_name='service:profile'")
            sql = serve.main_sql(compiled, pointers, [(row["author_key"], row["doc_id"]) for row in profiles], scope)
            columns, values = _execute(sql, settings={"max_execution_time": 10})
            rows = [dict(zip(columns, row)) for row in values]
            for row in rows:
                row["created_ms"] = serve.created_ms(row["created_at"])
            return rows

        rows, stats = pull_page(readable[service], size, fetch, resolve, serve.order_key)
        generation()
        if not columns:
            stop("empty_unestablished_main")
        _pending.set((current["request_id"], columns, [tuple(row[column] for column in columns) for row in rows]))
        current["arm_p"] = {"mode": "pull-canonical-materialized-in-request", "stats": stats,
                            "canonical_body_reads": True, "whole_response_cost_required": True}
        return MARKER
    if service in ("reactions", "comments") and any(list(item.find_all(exp.AggFunc)) for item in tree.expressions):
        ids = literal_ids(tree, document_only=False)
        if not ids or any(not value for value in ids):
            stop("explicit_nonempty_counter_targets_required")
        scope = scope_for(service, reader, readable)
        result = serve.counter_query(tree, scope, ids, presence["serving_scope_key"] if service == "reactions" else None)
        current["arm_p_followup"] = service
        return result
    ids = literal_ids(tree)
    if ids and readable:
        pairs = {name: [(row["author_key"], row["doc_id"]) for row in run(serve.lookup_pairs_sql(name, ids))] for name in readable}
        return serve.scoped_lookup(compiled, pairs)
    return compiled


def execute_query(sql, settings=None):
    if sql != MARKER:
        return _execute(sql, settings=settings)
    pending = _pending.get()
    current = observer.current.get()
    _pending.set(None)
    if pending is None or current is None or pending[0] != current["request_id"]:
        stop("missing_live_canonical_result")
    return pending[1], pending[2]


def guarded_compile(*args, **kwargs):
    try:
        return compile_query(*args, **kwargs)
    except HTTPException:
        raise
    except Exception as error:
        unsafe = getattr(getattr(observer, "safe_query", None), "UnsafeQueryError", ())
        if unsafe and isinstance(error, unsafe):
            raise  # Existing compiler refusal remains the original HTTP403.
        stop("compile_or_resolution_" + type(error).__name__)


observer.original_compile = guarded_compile
ch.execute_query = execute_query
_original_inventory = ch.get_active_node_ads
_original_views = ch.content_event_views_for_docs


def inventory():
    token = _inventory.set(True)
    try:
        return _original_inventory()
    finally:
        _inventory.reset(token)


def views(*args, **kwargs):
    token = _views.set(True)
    try:
        return _original_views(*args, **kwargs)
    finally:
        _views.reset(token)


ch.get_active_node_ads = inventory
ch.content_event_views_for_docs = views


async def application(scope, receive, send):
    admitted(operation, host)
    token = _pending.set(None)

    async def marked_send(message):
        current = observer.current.get()
        if message["type"] == "http.response.start" and current and (current.get("arm_p_stop") or current.get("arm_p_native_failure")):
            message = {**message, "headers": [*message.get("headers", []), (b"x-arm-p-stop", b"1")]}
        await send(message)

    try:
        return await observer.application(scope, receive, marked_send)
    finally:
        _pending.reset(token)
