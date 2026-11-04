"""R1 private S3 session records. Internal only; callers must authenticate in R2."""

import hashlib
import json
import logging
import time
from collections.abc import Callable
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

log = logging.getLogger("web10-upload-session")
MAX_RECORD_BYTES = 16 * 1024
CONFLICT_CODES = {"PreconditionFailed", "ConditionalRequestConflict", "412", "409"}
Phase = Literal["reserved", "uploading", "completing", "completed", "aborting", "aborted", "failed"]
TRANSITIONS = {
    "reserved": {"uploading", "aborted"},
    "uploading": {"completing", "aborting"},
    "completing": {"completed", "failed"},
    "aborting": {"aborted"},
}


class SessionMissing(Exception):
    pass


class SessionConflict(Exception):
    pass


class SessionExpired(Exception):
    pass


class SessionCorrupt(Exception):
    pass


class UploadOwner(BaseModel):
    """Trusted adapter input, never proof of authorization by itself."""

    model_config = ConfigDict(frozen=True, extra="forbid")
    node: str = Field(min_length=1, max_length=512)
    issuer: str = Field(min_length=1, max_length=512)
    username: str = Field(min_length=1, max_length=256, pattern=r"^[^/\\\x00-\x20]+$")
    app_id: str = Field(min_length=1, max_length=512)


class UploadIntent(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=127)
    size_bytes: int = Field(strict=True, gt=0)
    checksum_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


class UploadSession(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    schema_version: Literal[1] = 1
    session_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    owner: UploadOwner
    intent: UploadIntent
    object_key: str
    revision: str = Field(pattern=r"^[0-9a-f]{32}$")
    created_at: int
    expires_at: int
    phase: Phase = "reserved"
    upload_id: str | None = Field(default=None, min_length=1, max_length=2048)
    object_etag: str | None = Field(default=None, min_length=1, max_length=256)
    failure_code: Literal["verification_failed"] | None = None

    @model_validator(mode="after")
    def coherent(self):
        prefix = self.owner.username + "/"
        if len(self.object_key.encode()) > 1024:
            raise ValueError("object key exceeds S3 byte limit")
        if (
            not self.object_key.startswith(prefix)
            or self.object_key != prefix + UUID(self.object_key[len(prefix) :].split("/")[0]).hex + "/source"
        ):
            raise ValueError("invalid object namespace")
        if self.expires_at <= self.created_at or self.created_at < 0:
            raise ValueError("invalid deadline")
        if self.phase in {"uploading", "completing", "completed", "aborting", "failed"} and not self.upload_id:
            raise ValueError("multipart id required")
        if self.phase == "reserved" and self.upload_id is not None:
            raise ValueError("unbound reservation required")
        if (self.phase == "completed") != (self.object_etag is not None):
            raise ValueError("completion result required only for completed state")
        if (self.phase == "failed") != (self.failure_code is not None):
            raise ValueError("failure disposition required only for failed state")
        return self


def _code(error: Exception) -> str:
    return getattr(error, "response", {}).get("Error", {}).get("Code", "")


class UploadSessionStore:
    def __init__(
        self,
        s3,
        bucket: str,
        *,
        media_bucket: str,
        lifetime_seconds=604800,
        max_size=524288000,
        clock: Callable[[], float] = time.time,
    ):
        if not bucket or bucket == media_bucket:
            raise ValueError("session bucket must be separate from media")
        if (
            type(lifetime_seconds) is not int
            or not 0 < lifetime_seconds <= 604800
            or type(max_size) is not int
            or max_size <= 0
        ):
            raise ValueError("invalid server limits")
        self.s3, self.bucket, self.media_bucket = s3, bucket, media_bucket
        self.lifetime, self.max_size, self.clock = lifetime_seconds, max_size, clock

    def _key(self, owner: UploadOwner, session_id: str) -> tuple[str, str]:
        session_id = UUID(session_id).hex
        scope = json.dumps(owner.model_dump(), sort_keys=True, separators=(",", ":")).encode()
        return f"sessions/{hashlib.sha256(scope).hexdigest()}/{session_id}.json", session_id

    def _load(self, owner: UploadOwner, session_id: str) -> tuple[UploadSession, str]:
        key, session_id = self._key(owner, session_id)
        log.info("[upload-session] load started")
        try:
            response = self.s3.get_object(Bucket=self.bucket, Key=key)
        except Exception as error:
            if _code(error) in {"NoSuchKey", "404"}:
                raise SessionMissing() from None
            raise
        body = response["Body"]
        try:
            raw = body.read(MAX_RECORD_BYTES + 1)
        finally:
            body.close()
        try:
            if len(raw) > MAX_RECORD_BYTES:
                raise ValueError()
            record = UploadSession.model_validate_json(raw)
            etag = response["ETag"]
            if record.owner != owner or record.session_id != session_id or not isinstance(etag, str) or not etag:
                raise ValueError()
        except (ValidationError, ValueError, KeyError):
            raise SessionCorrupt("invalid session record") from None
        log.info("[upload-session] load completed")
        return record, etag

    def get(self, owner: UploadOwner, session_id: str) -> UploadSession:
        # Status/outcomes remain readable after expiry; no new work is authorized.
        return self._load(owner, session_id)[0]

    def _write(self, key: str, record: UploadSession, **condition):
        raw = record.model_dump_json().encode()
        # Bound the entire lifecycle, not just today's record: immutable metadata
        # must leave enough space to record every schema-valid completion result.
        future = record.model_copy(update={"phase": "completed", "object_etag": "\x00" * 256})
        if len(raw) > MAX_RECORD_BYTES or (
            record.phase not in {"completed", "aborted", "failed"}
            and len(future.model_dump_json().encode()) > MAX_RECORD_BYTES
        ):
            raise ValueError("session record exceeds encoded limit")
        log.info("[upload-session] conditional write started")
        try:
            self.s3.put_object(Bucket=self.bucket, Key=key, Body=raw, ContentType="application/json", **condition)
        except Exception as error:
            if _code(error) in CONFLICT_CODES:
                log.info("[upload-session] conditional write conflicted")
                raise SessionConflict() from None
            raise
        log.info("[upload-session] conditional write completed")

    def reserve(self, owner: UploadOwner, request_id: str, intent: UploadIntent) -> UploadSession:
        if intent.size_bytes > self.max_size:
            try:
                return self._replay(self.get(owner, request_id), intent)
            except SessionMissing:
                raise ValueError("upload exceeds server size limit") from None
        key, session_id = self._key(owner, request_id)
        now = int(self.clock())
        record = UploadSession(
            session_id=session_id,
            owner=owner,
            intent=intent,
            object_key=f"{owner.username}/{uuid4().hex}/source",
            revision=uuid4().hex,
            created_at=now,
            expires_at=now + self.lifetime,
        )
        try:
            self._write(key, record, IfNoneMatch="*")
            return record
        except SessionConflict:
            return self._replay(self.get(owner, session_id), intent)

    def _replay(self, existing: UploadSession, intent: UploadIntent) -> UploadSession:
        if existing.intent != intent:
            raise SessionConflict("request id reused with different intent")
        if existing.phase not in {"completed", "aborted", "failed"} and self.clock() >= existing.expires_at:
            raise SessionExpired()
        return existing

    def advance(
        self,
        owner: UploadOwner,
        session_id: str,
        revision: str,
        target: Phase,
        *,
        upload_id: str | None = None,
        object_etag: str | None = None,
    ) -> UploadSession:
        return self._advance(owner, session_id, revision, target, upload_id=upload_id, object_etag=object_etag)

    def reconcile_completed(
        self, owner: UploadOwner, session_id: str, revision: str, *, object_etag: str
    ) -> UploadSession:
        """Record a verified existing object after expiry; never initiate multipart completion."""
        return self._advance(owner, session_id, revision, "completed", object_etag=object_etag, observed=True)

    def reconcile_failed(self, owner: UploadOwner, session_id: str, revision: str) -> UploadSession:
        """Record a known final-object verification failure, not an ambiguous outcome."""
        return self._advance(owner, session_id, revision, "failed", failure_code="verification_failed", observed=True)

    def _advance(
        self,
        owner,
        session_id,
        revision,
        target,
        *,
        upload_id=None,
        object_etag=None,
        failure_code=None,
        observed=False,
    ):
        record, etag = self._load(owner, session_id)
        if record.revision != revision or target not in TRANSITIONS.get(record.phase, set()):
            raise SessionConflict("stale revision or invalid transition")
        if (
            self.clock() >= record.expires_at
            and target not in {"aborting", "aborted"}
            and not (observed and target in {"completed", "failed"})
        ):
            raise SessionExpired()
        if upload_id is not None and not (record.phase == "reserved" and target == "uploading"):
            raise SessionConflict("cannot replace bound multipart id")
        updated = record.model_dump()
        updated.update(phase=target, revision=uuid4().hex, object_etag=object_etag, failure_code=failure_code)
        if upload_id is not None:
            updated["upload_id"] = upload_id
        next_record = UploadSession.model_validate(updated)
        self._write(self._key(owner, session_id)[0], next_record, IfMatch=etag)
        return next_record
