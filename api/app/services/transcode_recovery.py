"""Opt-in, idle-worker repair of the fixed phone-probe failure; never a read hook."""

import hashlib
import json
import logging
import threading

from app import settings
from app.services import media as media_svc
from app.services.upload_sessions import CONFLICT_CODES, _code
from app.services.upload_storage import ensure_private_state_bucket
from app.v3.services import clickhouse as ch

log = logging.getLogger("web10-transcode-recovery")
PROBE_ERROR = "too many values to unpack (expected 3)"
_cursor = ("", "")
_scan_lock = threading.Lock()


def eligible_source(doc, owner, *, allow_processing=False):
    if (
        not isinstance(owner, str)
        or not owner
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
    body = doc.get("body")
    if not isinstance(body, dict):
        return None
    ts, video = body.get("transcoding_settings"), body.get("video")
    if not isinstance(ts, dict) or not isinstance(video, dict):
        return None
    failed = ts.get("status") == "failed" and ts.get("error") == PROBE_ERROR
    key = video.get("value")
    if (
        not (failed or allow_processing and ts.get("status") == "processing")
        or video.get("type") != "minio"
        or not isinstance(key, str)
        or not key.startswith(owner + "/")
        or len(key) <= len(owner) + 1
        or any(part in {"", ".", ".."} for part in key.split("/"))
        or body.get("object_key") != key
        or not str(body.get("mime_type", "")).startswith("video/")
        or not ch.get_user(owner)
    ):
        return None
    return key


def _next_candidate():
    global _cursor
    with _scan_lock:
        result = ch.client.query(
            "SELECT author_key, toString(doc_id) AS media_id FROM ("
            "SELECT author_key, doc_id, collection_name, body, deleted, "
            "row_number() OVER (PARTITION BY author_key, doc_id ORDER BY updated_at DESC, deleted DESC) AS rn "
            "FROM documents WHERE (author_key, toString(doc_id)) > (%(cursor_author)s, %(cursor_doc)s)"
            ") WHERE rn = 1 AND deleted = 0 AND collection_name IN ('media_metadata', 'public_media') "
            "AND JSONExtractString(body, 'transcoding_settings', 'status') = 'failed' "
            "AND JSONExtractString(body, 'transcoding_settings', 'error') = %(error)s "
            "ORDER BY author_key, media_id LIMIT 1 "
            "SETTINGS max_execution_time=5, max_threads=1, max_memory_usage=268435456",
            {"cursor_author": _cursor[0], "cursor_doc": _cursor[1], "error": PROBE_ERROR},
        )
        if not result.result_rows:
            _cursor = ("", "")
            return None
        _cursor = tuple(result.result_rows[0])
        return _cursor


def recover_one():
    """Called only inside an idle conversion worker: one candidate, one durable attempt."""
    if not settings.HLS_RECOVERY_ENABLED:
        return
    from app.services import transcode

    log.info("[transcode-recovery] candidate scan started")
    candidate = _next_candidate()
    if candidate is None:
        log.info("[transcode-recovery] scan exhausted")
        return
    owner, doc_id = candidate
    source = eligible_source(ch.get_document_version(doc_id, owner), owner)
    if source is None:
        log.info("[transcode-recovery] canonical candidate ineligible")
        return
    job = (doc_id, owner)
    with transcode._pending_lock:
        if job in transcode._pending:
            return
        transcode._pending.add(job)
    try:
        s3 = media_svc.get_s3_client()
        ensure_private_state_bucket(s3, settings.RESUMABLE_STATE_BUCKET, settings.S3_BUCKET)
        identity = json.dumps([settings.PROVIDER, owner, doc_id, source], separators=(",", ":")).encode()
        key = "transcode-recovery/phone-probe-v1/" + hashlib.sha256(identity).hexdigest()
        log.info("[transcode-recovery] conditional claim started")
        try:
            s3.put_object(
                Bucket=settings.RESUMABLE_STATE_BUCKET,
                Key=key,
                Body=b"attempt-consumed",
                ContentType="application/octet-stream",
                IfNoneMatch="*",
            )
        except Exception as error:
            if _code(error) in CONFLICT_CODES:
                log.info("[transcode-recovery] automatic attempt already consumed")
                return
            raise  # uncertain write outcome is never permission to encode
        log.info("[transcode-recovery] claimed; conversion started")
        try:
            transcode._process_job(doc_id, owner, recovery_source=source)
            log.info("[transcode-recovery] conversion completed")
        except transcode.RecoveryObsolete:
            log.info("[transcode-recovery] canonical media changed; stopped")
        except Exception as error:
            log.error("[transcode-recovery] conversion failed: %s", type(error).__name__)
            transcode._mark_failed(
                doc_id, owner, "automatic recovery failed (" + type(error).__name__ + ")", recovery_source=source
            )
    finally:
        with transcode._pending_lock:
            transcode._pending.discard(job)
