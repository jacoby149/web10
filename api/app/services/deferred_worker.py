"""Durable generic document-create coordinator. Never stores/replays a user JWT."""

import json
import logging
import threading
import time
from datetime import UTC, datetime

from fastapi import HTTPException
from starlette.requests import Request

import app.settings as settings
from app.services import transcode
from app.services.deferred_store import DeferredStore
from app.services.upload_sessions import SessionConflict
from app.v3.models.documents import CreateDocument
from app.v3.services import clickhouse as ch

log = logging.getLogger("web10-deferred")
_started, _lock = False, threading.Lock()


def actor_context(owner, intent):
    if owner.node != settings.PROVIDER or owner.issuer != settings.PROVIDER or not ch.get_user(owner.username):
        raise HTTPException(403, "original account is no longer available")
    scope = json.loads(owner.app_id)
    if not isinstance(scope, list) or len(scope) != 3 or scope[2] != intent.service:
        raise HTTPException(403, "invalid deferred app context")
    kind, app_id, _ = scope
    if kind == "client":
        if ch.get_oauth_client(app_id) is None:
            raise HTTPException(403, "original client is no longer active")
        origin, client_id = "", app_id
    elif kind == "origin":
        origin, client_id = app_id, None
    else:
        raise HTTPException(403, "invalid deferred app context")
    if not ch.has_permission(owner.username, origin, intent.service, "create", client_id=client_id):
        raise HTTPException(403, "original app create authority was revoked")
    author = intent.author_as or owner.username
    if intent.author_as:
        if not ch.get_group(author) or not ch._effective_allows(
            ch.effective_role_perms(author, owner.username, authenticated=True), intent.service, "create"
        ):
            raise HTTPException(403, "original acting-author authority was revoked")
    if any(
        group != intent.author_as and not ch.can_write_group(group, author, intent.service) for group in intent.groups
    ):
        raise HTTPException(403, "an intended destination is no longer writable")
    request = Request({"type": "http", "headers": [(b"origin", origin.encode())] if origin else []})
    return request, client_id, author


def process_job(store: DeferredStore, job):
    if job.owner.node != settings.PROVIDER or job.phase not in {"waiting", "creating"}:
        return job
    try:
        request, client_id, author = actor_context(job.owner, job.intent)
        existing = ch.get_document_version(job.doc_id, author) if job.publish_at else None
        if existing:
            if (
                existing.get("deleted")
                or existing.get("service") != job.intent.service
                or existing.get("posted_by") != job.owner.username
                or not set(job.intent.groups).issubset(ch.get_doc_groups(job.doc_id))
            ):
                return store.change(job, "blocked", error="existing_result_requires_review")
            return store.change(job, "done")
        if datetime.now(UTC) >= job.expires_at:
            return store.change(job, "failed", error="operation_expired")
        for doc_id in job.dependencies:
            media = ch.get_document_version(doc_id, job.owner.username)
            if not media or media.get("deleted") or media.get("service") != "media_metadata":
                return store.change(job, "failed", error="media_dependency_unavailable")
            state = (media.get("body") or {}).get("transcoding_settings") or {}
            if state.get("status") == "failed":
                return store.change(job, "failed", error="media_preparation_failed")
            if state.get("status") != "done" or not state.get("enabled") or not state.get("variants"):
                video = (media.get("body") or {}).get("video") or {}
                key = video.get("value")
                if (
                    video.get("type") != "minio"
                    or not isinstance(key, str)
                    or not key.startswith(job.owner.username + "/")
                ):
                    return store.change(job, "failed", error="media_dependency_unavailable")
                # Queue state is process-local; durable admitted dependencies
                # recover lost work after restart. The queue deduplicates live work.
                transcode.submit_transcode_job(doc_id, job.owner.username)
                return job
        if job.phase == "waiting":
            job = store.change(job, "creating")
        # Revalidate immediately before writing; a saved identity is not a grant.
        request, client_id, author = actor_context(job.owner, job.intent)
        existing = ch.get_document_version(job.doc_id, author)
        if existing:
            if (
                existing.get("deleted")
                or existing.get("service") != job.intent.service
                or existing.get("posted_by") != job.owner.username
                or not set(job.intent.groups).issubset(ch.get_doc_groups(job.doc_id))
            ):
                return store.change(job, "blocked", error="existing_result_requires_review")
            return store.change(job, "done")
        from app.v3.endpoints.documents import create_as

        data = CreateDocument(token="", **job.intent.model_dump(mode="json"))
        stamp = job.publish_at.astimezone(UTC)
        create_as(
            request, data, job.owner.username, client_id, doc_id=job.doc_id, version_time=stamp, exact_targets=True
        )
        return store.change(job, "done")
    except HTTPException:
        return store.change(job, "blocked", error="publication_authority_changed")


def start_workers():
    global _started
    if not settings.RESUMABLE_UPLOADS_ENABLED:
        return
    with _lock:
        if _started:
            return
        _started = True
        threading.Thread(target=_loop, daemon=True, name="deferred-create-worker").start()


def _loop():
    cursor = None
    while True:
        try:
            # Same private-policy preflight as authenticated upload operations.
            from app.v3.endpoints.multipart import _transport

            transport = _transport()
            store = DeferredStore(transport.s3, transport.store.bucket)
            jobs, cursor = store.page(cursor)
            for job in jobs:
                try:
                    process_job(store, job)
                except SessionConflict:
                    pass  # another worker/cancellation won
                except Exception as error:
                    log.error("[deferred] job retry pending: %s", type(error).__name__)
        except Exception as error:
            cursor = None
            log.error("[deferred] storage scan unavailable: %s", type(error).__name__)
        time.sleep(3)
