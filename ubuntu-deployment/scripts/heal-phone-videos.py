#!/usr/bin/env python3
"""One-time repair of the fixed phone-probe failure. Dry-run unless --apply.

Run on stdin inside the API container; --apply uses a reviewed private plan.
No service deployment, environment switch, periodic worker or endpoint is installed.
"""

import argparse
import hashlib
import inspect
import json
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID

PROBE_ERROR = "too many values to unpack (expected 3)"
MAX_ITEMS = 100


class Obsolete(Exception):
    pass


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def log(phase, **fields):
    print(json.dumps({"phase": phase, **fields}), flush=True)


def eligible_source(doc, owner, *, processing=False):
    if (
        not owner
        or owner == "anon"
        or "/" in owner
        or "\\" in owner
        or not doc
        or doc.get("deleted")
        or doc.get("author_key") != owner
        or doc.get("service") not in {"media_metadata", "public_media"}
        or doc.get("posted_by") not in {None, "", owner}
    ):
        return None
    body = doc.get("body") or {}
    ts, video = body.get("transcoding_settings") or {}, body.get("video") or {}
    failed = ts.get("status") == "failed" and ts.get("error") == PROBE_ERROR
    key = video.get("value")
    if (
        not (failed or processing and ts.get("status") == "processing")
        or video.get("type") != "minio"
        or not isinstance(key, str)
        or not key.startswith(owner + "/")
        or any(part in {"", ".", ".."} for part in key.split("/"))
        or body.get("object_key") != key
        or not str(body.get("mime_type", "")).startswith("video/")
    ):
        return None
    return key


def binding(settings):
    return digest([settings.PROVIDER, settings.S3_ENDPOINT, settings.S3_BUCKET, settings.RESUMABLE_STATE_BUCKET])


def discover(runtime, limit):
    rows = runtime.ch.client.query(
        "SELECT author_key, toString(doc_id) FROM ("
        "SELECT author_key, doc_id, collection_name, body, deleted, "
        "row_number() OVER (PARTITION BY author_key, doc_id ORDER BY updated_at DESC, deleted DESC) AS rn "
        "FROM documents) WHERE rn = 1 AND deleted = 0 AND collection_name IN ('media_metadata', 'public_media') "
        "AND JSONExtractString(body, 'transcoding_settings', 'status') = 'failed' "
        "AND JSONExtractString(body, 'transcoding_settings', 'error') = %(error)s "
        "ORDER BY author_key, doc_id LIMIT %(limit)s "
        "SETTINGS max_execution_time=5, max_threads=1, max_memory_usage=268435456",
        {"error": PROBE_ERROR, "limit": limit + 1},
    ).result_rows
    if len(rows) > limit:
        raise ValueError("candidate limit exceeded; inspect before increasing it")
    items = []
    for owner, doc_id in rows:
        doc_id = str(UUID(str(doc_id)))
        source = eligible_source(runtime.ch.get_document_version(doc_id, owner), owner)
        if source and runtime.ch.get_user(owner):
            items.append({"owner": owner, "doc_id": doc_id, "source_sha256": digest(source)})
    return dict(schema=1, provider=runtime.settings.PROVIDER, node_binding=binding(runtime.settings), items=items)


def validate_plan(plan, runtime):
    if (
        plan.get("schema") != 1
        or plan.get("provider") != runtime.settings.PROVIDER
        or plan.get("node_binding") != binding(runtime.settings)
        or not isinstance(plan.get("items"), list)
        or len(plan["items"]) > MAX_ITEMS
    ):
        raise ValueError("plan does not match this node or supported bounds")
    identities = set()
    for item in plan["items"]:
        owner, doc_id, sha = item["owner"], item["doc_id"], item["source_sha256"]
        if (
            not isinstance(owner, str)
            or not owner
            or any(c in owner for c in "/\\\r\n")
            or str(UUID(doc_id)) != doc_id
            or len(sha) != 64
            or any(c not in "0123456789abcdef" for c in sha)
            or (owner, doc_id) in identities
        ):
            raise ValueError("invalid or duplicate planned media")
        identities.add((owner, doc_id))


def convert(runtime, item, source):
    """Scoped adapters affect only this one-off process, never the serving workers."""
    ch, worker = runtime.ch, runtime.worker
    owner, doc_id = item["owner"], item["doc_id"]
    phase = "failed"

    def current(request_id=doc_id, request_owner=owner):
        doc = ch.get_document_version(request_id, request_owner)
        if (
            (request_id, request_owner) != (doc_id, owner)
            or not ch.get_user(owner)
            or eligible_source(doc, owner, processing=phase == "processing") != source
            or doc["body"]["transcoding_settings"]["status"] != phase
        ):
            raise Obsolete()
        return doc

    def save(request_id, request_owner, _old_body, ts, _service):
        nonlocal phase
        live = current(request_id, request_owner)
        body = {**live["body"], "transcoding_settings": ts}
        if ts.get("status") == "done" and not body.get("thumbnail_object_key") and ts.get("thumbnails"):
            body["thumbnail_object_key"] = ts["thumbnails"][0]["url"]["value"]
        metadata = {k: live.get(k) for k in ("ref_value", "tags", "ad_mode", "ad_target", "posted_by")}
        ch.update_document(doc_id=doc_id, author_key=owner, service=live["service"], body=body, **metadata)
        phase = ts["status"]
        log("conversion-status", status=phase)

    with patch.object(ch, "get_document", current), patch.object(worker, "_set_transcoding_settings", save):
        try:
            worker._process_job(doc_id, owner)
        except Obsolete:
            return "obsolete"
        except Exception as error:
            try:
                failure = {"enabled": False, "status": "failed"}
                failure["error"] = "one-time repair failed (" + type(error).__name__ + ")"
                save(doc_id, owner, {}, failure, "")
            except Obsolete:
                pass
            log("conversion-failed", error_type=type(error).__name__)
            return "failed"
    live = ch.get_document_version(doc_id, owner)
    ts = (live or {}).get("body", {}).get("transcoding_settings", {})
    return "done" if phase == "done" and ts.get("enabled") and ts.get("variants") else "failed"


def apply_one(runtime, item):
    from app.services.upload_sessions import CONFLICT_CODES, _code
    from app.services.upload_storage import ensure_private_state_bucket

    owner, doc_id = item["owner"], item["doc_id"]
    source = eligible_source(runtime.ch.get_document_version(doc_id, owner), owner)
    if source is None or digest(source) != item["source_sha256"] or not runtime.ch.get_user(owner):
        return "obsolete"
    s3 = runtime.s3()
    ensure_private_state_bucket(s3, runtime.settings.RESUMABLE_STATE_BUCKET, runtime.settings.S3_BUCKET)
    s3.head_object(Bucket=runtime.settings.S3_BUCKET, Key=source)
    claim = "transcode-recovery/phone-probe-v1/" + digest([runtime.settings.PROVIDER, owner, doc_id, source])
    try:
        s3.put_object(
            Bucket=runtime.settings.RESUMABLE_STATE_BUCKET,
            Key=claim,
            Body=b"attempt-consumed",
            ContentType="application/octet-stream",
            IfNoneMatch="*",
        )
    except Exception as error:
        if _code(error) in CONFLICT_CODES:
            return "already-claimed"
        raise  # uncertain claim outcome must not start conversion
    return convert(runtime, item, source)


def execute(runtime, path, provider, *, apply=False, limit=10):
    if provider != runtime.settings.PROVIDER or not 1 <= limit <= MAX_ITEMS:
        raise ValueError("wrong provider or invalid candidate limit")
    if "stream_side_data=rotation" not in inspect.getsource(runtime.worker._probe_dimensions):
        raise ValueError("install the fixed JSON/rotation probe before repairing old failures")
    if not apply:
        plan = discover(runtime, limit)
        with open(path, "x", opener=lambda p, flags: os.open(p, flags, 0o600)) as output:
            json.dump(plan, output)
        log("dry-run", candidate_count=len(plan["items"]), writes="private-local-plan-only")
        return 0
    with open(path, "rb") as source:
        raw = source.read(65537)
    if len(raw) > 65536:
        raise ValueError("plan exceeds size bound")
    plan = json.loads(raw)
    validate_plan(plan, runtime)
    failed = False
    for index, item in enumerate(plan["items"], 1):
        outcome = apply_one(runtime, item)
        log("item-result", index=index, total=len(plan["items"]), outcome=outcome)
        if outcome in {"failed", "already-claimed"}:
            failed = True
            break
    log("finished", failed=failed)
    return int(failed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", required=True, help="expected node identity")
    parser.add_argument("--plan", required=True, type=Path, help="private plan path inside the API container")
    parser.add_argument("--apply", action="store_true", help="apply only the reviewed plan, sequentially")
    parser.add_argument("--limit", type=int, default=10, help="dry-run candidate ceiling (maximum 100)")
    args = parser.parse_args()
    from app import settings
    from app.services import transcode
    from app.services.media import get_s3_client
    from app.v3.services import clickhouse

    runtime = SimpleNamespace(settings=settings, ch=clickhouse, worker=transcode, s3=get_s3_client)
    try:
        return execute(runtime, args.plan, args.provider, apply=args.apply, limit=args.limit)
    except Exception as error:
        log("aborted", error_type=type(error).__name__)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
