"""Private, owner-scoped conditional records for one deferred create intent."""

import hashlib
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from app.services.multipart_uploads import error_code
from app.services.upload_sessions import CONFLICT_CODES, SessionConflict, SessionCorrupt, SessionMissing, UploadOwner
from app.v3.models.documents import AdPreference

MAX_JOB_BYTES = 128 * 1024
log = logging.getLogger("web10-deferred")


class CreateIntent(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    service: str = Field(min_length=1, max_length=128)
    body: dict
    groups: list[str] = Field(min_length=1, max_length=32)
    author_as: str | None = None
    ref_value: str = ""
    ad_preference: AdPreference | None = None


class DeferredJob(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    schema_version: Literal[1] = 1
    owner: UploadOwner
    operation_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    doc_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    revision: str = Field(pattern=r"^[0-9a-f]{32}$")
    intent: CreateIntent | None
    dependencies: list[str] = Field(max_length=8)
    request_hash: str | None
    phase: Literal["waiting", "creating", "done", "cancelled", "blocked", "failed"]
    created_at: datetime
    expires_at: datetime
    publish_at: datetime | None = None
    error: str | None = Field(default=None, max_length=128)


def fingerprint(intent, dependencies):
    raw = json.dumps(
        {"intent": intent.model_dump(mode="json"), "dependencies": dependencies},
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode()
    if len(raw) > MAX_JOB_BYTES - 8192:
        raise ValueError("deferred intent is too large")
    return hashlib.sha256(raw).hexdigest()


class DeferredStore:
    def __init__(self, s3, bucket):
        self.s3, self.bucket = s3, bucket

    def key(self, owner, operation_id):
        scope = hashlib.sha256(
            json.dumps(owner.model_dump(), sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        return f"deferred/{scope}/{UUID(operation_id).hex}.json"

    def _load_key(self, key):
        try:
            response = self.s3.get_object(Bucket=self.bucket, Key=key)
        except Exception as error:
            if error_code(error) in {"NoSuchKey", "404"}:
                raise SessionMissing() from None
            raise
        try:
            raw = response["Body"].read(MAX_JOB_BYTES + 1)
        finally:
            response["Body"].close()
        if len(raw) > MAX_JOB_BYTES:
            raise SessionCorrupt()
        job = DeferredJob.model_validate_json(raw)
        if self.key(job.owner, job.operation_id) != key:
            raise SessionCorrupt()
        if job.intent and fingerprint(job.intent, job.dependencies) != job.request_hash:
            raise SessionCorrupt()
        if not job.intent and job.phase != "cancelled":
            raise SessionCorrupt()
        if job.phase in {"creating", "done"} and not job.publish_at:
            raise SessionCorrupt()
        return job, response["ETag"]

    def get(self, owner, operation_id):
        return self._load_key(self.key(owner, operation_id))[0]

    def _write(self, job, **condition):
        raw = job.model_dump_json().encode()
        future = job.model_copy(
            update={"phase": "failed", "error": "\x00" * 128, "publish_at": job.publish_at or job.created_at}
        )
        if len(raw) > MAX_JOB_BYTES or len(future.model_dump_json().encode()) > MAX_JOB_BYTES:
            raise ValueError("deferred record is too large")
        try:
            log.info("[deferred] state write started: operation=%s phase=%s", job.operation_id, job.phase)
            self.s3.put_object(
                Bucket=self.bucket,
                Key=self.key(job.owner, job.operation_id),
                Body=raw,
                ContentType="application/json",
                **condition,
            )
            log.info("[deferred] state write completed: operation=%s phase=%s", job.operation_id, job.phase)
        except Exception as error:
            if error_code(error) in CONFLICT_CODES:
                log.info("[deferred] state write lost CAS: operation=%s phase=%s", job.operation_id, job.phase)
                raise SessionConflict() from None
            raise

    def submit(self, owner, operation_id, intent, dependencies):
        digest = fingerprint(intent, dependencies)
        now = datetime.now(UTC)
        job = DeferredJob(
            owner=owner,
            operation_id=UUID(operation_id).hex,
            doc_id=uuid4().hex,
            revision=uuid4().hex,
            intent=intent,
            dependencies=dependencies,
            request_hash=digest,
            phase="waiting",
            created_at=now,
            expires_at=now + timedelta(days=7),
        )
        try:
            self._write(job, IfNoneMatch="*")
            return job
        except SessionConflict:
            existing = self.get(owner, operation_id)
            if existing.phase == "cancelled":
                return existing
            if existing.request_hash != digest:
                raise SessionConflict("operation intent changed")
            return existing

    def change(self, job, phase, *, error=None):
        current, etag = self._load_key(self.key(job.owner, job.operation_id))
        allowed = {
            "waiting": {"creating", "cancelled", "blocked", "failed"},
            "creating": {"done", "blocked", "failed"},
            "blocked": {"waiting", "cancelled"},
            "failed": {"waiting", "cancelled"},
        }
        if current.revision != job.revision or phase not in allowed.get(current.phase, set()):
            raise SessionConflict()
        # A create claim is irreversible, including across blocked/failed/retry
        # states: another executor may already be past its final authority read.
        if phase == "cancelled" and current.publish_at is not None:
            raise SessionConflict("publication has already been claimed; inspect its outcome")
        patch = {"phase": phase, "revision": uuid4().hex, "error": error}
        if phase == "waiting" and current.publish_at is not None:
            patch["phase"] = "creating"
        if phase == "creating":
            patch["publish_at"] = current.publish_at or datetime.now(UTC)
        changed = DeferredJob.model_validate({**current.model_dump(), **patch})
        self._write(changed, IfMatch=etag)
        return changed

    def cancel(self, owner, operation_id):
        try:
            current = self.get(owner, operation_id)
        except SessionMissing:
            now = datetime.now(UTC)
            tombstone = DeferredJob(
                owner=owner,
                operation_id=UUID(operation_id).hex,
                doc_id=uuid4().hex,
                revision=uuid4().hex,
                intent=None,
                dependencies=[],
                request_hash=None,
                phase="cancelled",
                created_at=now,
                expires_at=now + timedelta(days=7),
            )
            try:
                self._write(tombstone, IfNoneMatch="*")
                return tombstone
            except SessionConflict:
                current = self.get(owner, operation_id)
        if current.phase == "cancelled":
            return current
        return self.change(current, "cancelled")

    def page(self, cursor=None):
        extra = {"ContinuationToken": cursor} if cursor else {}
        page = self.s3.list_objects_v2(Bucket=self.bucket, Prefix="deferred/", MaxKeys=100, **extra)
        jobs = []
        for row in page.get("Contents", []):
            try:
                jobs.append(self._load_key(row["Key"])[0])
            except Exception as error:
                log.error("[deferred] invalid/unavailable record skipped: %s", type(error).__name__)
        return jobs, page.get("NextContinuationToken") if page.get("IsTruncated") else None
