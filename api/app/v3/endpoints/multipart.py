"""Authenticated generic multipart transport, disabled until explicitly configured."""

import json
import logging
from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import UUID

import jwt
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

import app.settings as settings
from app.models.auth import Token
from app.services import transcode
from app.services.auth import certify, decode_token
from app.services.media import ensure_bucket, get_s3_client, get_s3_signing_client
from app.services.multipart_uploads import PART_SIZE, MultipartUploads
from app.services.upload_sessions import (
    SessionConflict,
    SessionExpired,
    SessionMissing,
    UploadIntent,
    UploadOwner,
    UploadSessionStore,
)
from app.services.upload_storage import ensure_private_state_bucket
from app.v3.service_names import ServiceName
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["media"])
log = logging.getLogger("web10-multipart")


class SessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=1)
    session_id: UUID
    service: ServiceName = "media"


class StartRequest(SessionRequest):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=127)
    size_bytes: int = Field(strict=True, gt=0)
    checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class PartRequest(SessionRequest):
    part_number: int = Field(strict=True, gt=0)
    checksum_sha256: str = Field(min_length=44, max_length=44)


class ConfirmRequest(SessionRequest):
    width: int | None = Field(default=None, ge=0)
    height: int | None = Field(default=None, ge=0)
    duration_seconds: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    alt_text: str | None = Field(default=None, max_length=4096)


def _enabled():
    if not settings.RESUMABLE_UPLOADS_ENABLED:
        raise HTTPException(404, "resumable uploads are disabled")


def _owner(request: Request, data: SessionRequest):
    _enabled()
    try:
        decoded = decode_token(data.token, private_key=True)
        if (
            not isinstance(decoded.username, str)
            or not decoded.username
            or decoded.username == "anon"
            or decoded.provider != settings.PROVIDER
        ):
            raise ValueError()
        try:
            certify(Token(token=data.token))
        except Exception as error:
            if error.args == ("TOKEN",):
                raise ValueError() from None
            raise
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(401, "invalid upload credential") from None
    if not ch.get_user(decoded.username):
        raise HTTPException(401, "account is unavailable")
    if decoded.client_id:
        app = ["client", decoded.client_id, data.service]
        permitted = ch.has_permission(decoded.username, "", data.service, "create", client_id=decoded.client_id)
    else:
        origin = request.headers.get("origin", "")
        parsed = urlsplit(origin)
        if (
            len(origin) > 256
            or parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.username
            or parsed.path
            or parsed.query
            or parsed.fragment
        ):
            raise HTTPException(403, "a valid browser app Origin is required")
        permitted = ch.has_permission(decoded.username, origin, data.service, "create")
        app = ["origin", origin, data.service]
    if not permitted:
        raise HTTPException(403, "current media create authority is required")
    expires = datetime.fromisoformat(decoded.expires)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    return UploadOwner(
        node=settings.PROVIDER,
        issuer=decoded.provider,
        username=decoded.username,
        app_id=json.dumps(app, separators=(",", ":")),
    ), expires.timestamp()


def _transport():
    s3 = get_s3_client()
    try:
        ensure_private_state_bucket(s3, settings.RESUMABLE_STATE_BUCKET, settings.S3_BUCKET)
    except Exception as error:
        log.error("[multipart] state bucket unavailable: %s", type(error).__name__)
        raise HTTPException(503, "upload state bucket is unavailable or not private") from None
    ensure_bucket(s3)
    store = UploadSessionStore(
        s3, settings.RESUMABLE_STATE_BUCKET, media_bucket=settings.S3_BUCKET, max_size=int(settings.MAX_UPLOAD_SIZE)
    )
    return MultipartUploads(store, get_s3_signing_client(), url_ttl=int(settings.UPLOAD_URL_EXPIRY))


def _run(request, data, operation):
    try:
        owner, deadline = _owner(request, data)
        return operation(_transport(), owner, data.session_id.hex, deadline)
    except HTTPException:
        raise
    except SessionMissing:
        raise HTTPException(404, "upload session not found") from None
    except SessionConflict:
        raise HTTPException(409, "upload state changed or verification failed; refresh its status") from None
    except SessionExpired:
        raise HTTPException(410, "upload recovery window has expired") from None
    except (ValueError, TypeError):
        raise HTTPException(400, "invalid upload operation") from None
    except Exception as error:
        log.error("[multipart] operation failed: %s", type(error).__name__)
        raise HTTPException(503, "upload storage is temporarily unavailable") from None


def _view(record, parts=()):
    return {
        "session_id": record.session_id,
        "phase": record.phase,
        "object_key": record.object_key,
        "upload_id": record.upload_id,
        "expires_at": record.expires_at,
        "part_size": PART_SIZE,
        "uploaded_bytes": record.intent.size_bytes
        if record.phase == "completed"
        else sum(part["Size"] for part in parts),
        "parts": [{key: part[key] for key in ("PartNumber", "Size", "ETag")} for part in parts],
        "checksum_sha256": record.intent.checksum_sha256,
        "failure_code": record.failure_code,
    }


@router.get("/capabilities")
def capabilities():
    return {
        "enabled": settings.RESUMABLE_UPLOADS_ENABLED,
        "deferred_creates": settings.RESUMABLE_UPLOADS_ENABLED,
        "part_size": PART_SIZE,
        "max_size": int(settings.MAX_UPLOAD_SIZE),
    }


@router.post("/start")
def start(request: Request, data: StartRequest):
    return _run(
        request,
        data,
        lambda transport, owner, sid, deadline: _view(
            transport.start(
                owner,
                sid,
                UploadIntent(
                    filename=data.filename,
                    mime_type=data.mime_type,
                    size_bytes=data.size_bytes,
                    checksum_sha256=data.checksum_sha256,
                ),
            )
        ),
    )


@router.post("/status")
def status(request: Request, data: SessionRequest):
    def read(transport, owner, sid, deadline):
        record = transport.store.get(owner, sid)
        # A native completion consumes the multipart ID. Its durable claim is
        # still observable after a crash; /complete reconciles the final object.
        return _view(record, transport.parts(record) if record.phase == "uploading" else ())

    return _run(request, data, read)


@router.post("/sign-part")
def sign_part(request: Request, data: PartRequest):
    return _run(
        request,
        data,
        lambda transport, owner, sid, deadline: transport.sign_part(
            owner, sid, data.part_number, data.checksum_sha256, credential_deadline=deadline
        ),
    )


@router.post("/complete")
def complete(request: Request, data: SessionRequest):
    return _run(request, data, lambda transport, owner, sid, deadline: _view(transport.complete(owner, sid)))


@router.post("/abort")
def abort(request: Request, data: SessionRequest):
    return _run(request, data, lambda transport, owner, sid, deadline: _view(transport.abort(owner, sid)))


@router.post("/confirm")
def confirm(request: Request, data: ConfirmRequest):
    def materialize(transport, owner, sid, deadline):
        session = transport.store.get(owner, sid)
        if session.phase != "completed":
            raise HTTPException(409, "verified completion is required")
        doc_id = session.object_key.split("/")[1]
        existing = ch.get_document_version(doc_id, owner.username)
        if existing and (
            existing.get("deleted")
            or existing.get("service") != "media_metadata"
            or (existing.get("body") or {}).get("object_key") != session.object_key
        ):
            raise HTTPException(409, "media identity conflicts with the verified upload")
        if not existing:
            metadata = {
                "object_key": session.object_key,
                "filename": session.intent.filename,
                "mime_type": session.intent.mime_type,
                "size_bytes": session.intent.size_bytes,
                "checksum_sha256": session.intent.checksum_sha256,
                "service": data.service,
                "width": data.width,
                "height": data.height,
                "duration_seconds": data.duration_seconds,
                "alt_text": data.alt_text,
            }
            if session.intent.mime_type.startswith("video/"):
                metadata["video"] = {"type": "minio", "value": session.object_key}
            # Reservation time is immutable private server state. Overlapping
            # confirmations replay that initial version, never a fresh timestamp
            # that can outrank a later worker edit or owner deletion.
            ch.confirm_media_upload(
                owner.username, metadata, doc_id=doc_id, version_time=datetime.fromtimestamp(session.created_at, UTC)
            )
            existing = ch.get_document_version(doc_id, owner.username)
            if not existing or existing.get("deleted"):
                raise HTTPException(409, "media confirmation was superseded; review its current state")
        if session.intent.mime_type.startswith("video/") and not (existing.get("body") or {}).get(
            "transcoding_settings"
        ):
            transcode.submit_transcode_job(doc_id, owner.username)
        return existing

    return _run(request, data, materialize)


@router.post("/retry-transcode")
def retry_transcode(request: Request, data: SessionRequest):
    def retry(transport, owner, sid, deadline):
        session = transport.store.get(owner, sid)
        if session.phase != "completed":
            raise HTTPException(409, "verified upload required")
        doc_id = session.object_key.split("/")[1]
        media = ch.get_document_version(doc_id, owner.username)
        if not media or media.get("deleted") or (media.get("body") or {}).get("object_key") != session.object_key:
            raise HTTPException(404, "verified media document not found")
        body = {**media["body"], "transcoding_settings": {"enabled": False, "status": "processing"}}
        ch.update_document(doc_id=doc_id, author_key=owner.username, service=media["service"], body=body)
        transcode.submit_transcode_job(doc_id, owner.username)
        return {"status": "queued"}

    return _run(request, data, retry)
