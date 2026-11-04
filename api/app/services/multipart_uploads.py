"""Native S3 transfer operations. The router supplies freshly verified owner context."""

import base64
import hashlib
import json
import logging
import math
import time

from app.services.upload_sessions import SessionConflict, SessionExpired, UploadIntent, UploadOwner, UploadSessionStore

log = logging.getLogger("web10-multipart")
PART_SIZE = 8 * 1024 * 1024


class VerificationFailed(SessionConflict):
    pass


def error_code(error):
    return getattr(error, "response", {}).get("Error", {}).get("Code", "")


class MultipartUploads:
    def __init__(self, store: UploadSessionStore, signer, *, url_ttl=300, clock=time.time):
        self.store, self.s3, self.signer = store, store.s3, signer
        self.bucket, self.url_ttl, self.clock = store.media_bucket, int(url_ttl), clock

    def _params(self, record):
        return {"Bucket": self.bucket, "Key": record.object_key, "UploadId": record.upload_id}

    def _binding(self, record):
        scope = json.dumps(record.owner.model_dump(), sort_keys=True, separators=(",", ":")).encode()
        return {"upload-session": record.session_id, "upload-scope": hashlib.sha256(scope).hexdigest()}

    def _live(self, record, credential_deadline=None):
        deadline = min(record.expires_at, credential_deadline or record.expires_at)
        remaining = math.floor(deadline - self.clock())
        if remaining <= 0:
            raise SessionExpired()
        return min(self.url_ttl, remaining)

    def start(self, owner: UploadOwner, session_id: str, intent: UploadIntent):
        if not intent.checksum_sha256:
            raise ValueError("full-file SHA-256 required")
        record = self.store.reserve(owner, session_id, intent)
        if record.phase != "reserved":
            return record
        self._live(record)
        log.info("[multipart] create started")
        created = self.s3.create_multipart_upload(
            Bucket=self.bucket,
            Key=record.object_key,
            ContentType=intent.mime_type,
            Metadata=self._binding(record),
            ChecksumAlgorithm="SHA256",
        )
        upload_id = created["UploadId"]
        try:
            record = self.store.advance(owner, session_id, record.revision, "uploading", upload_id=upload_id)
        except Exception as error:
            # A lost CAS response may have committed the binding. Never abort a
            # multipart ID until a durable read proves it is not the winner.
            current = self.store.get(owner, session_id)
            if current.upload_id == upload_id:
                return current
            self.s3.abort_multipart_upload(Bucket=self.bucket, Key=record.object_key, UploadId=upload_id)
            if not isinstance(error, SessionConflict) or current.phase == "reserved":
                raise
            record = current
        log.info("[multipart] create completed")
        return record

    def parts(self, record):
        if record.phase not in {"uploading", "completing"}:
            return []
        parts, marker = [], 0
        while True:
            page = self.s3.list_parts(**self._params(record), PartNumberMarker=marker, MaxParts=1000)
            parts.extend(page.get("Parts", []))
            if len(parts) > math.ceil(record.intent.size_bytes / PART_SIZE):
                raise SessionConflict("unexpected upload parts")
            if not page.get("IsTruncated"):
                return parts
            following = page.get("NextPartNumberMarker", 0)
            if following <= marker:
                raise SessionConflict("invalid part cursor")
            marker = following

    def sign_part(self, owner, session_id, number, checksum, *, credential_deadline):
        record = self.store.get(owner, session_id)
        if record.phase != "uploading":
            raise SessionConflict("upload is not accepting parts")
        expires = self._live(record, credential_deadline)
        count = math.ceil(record.intent.size_bytes / PART_SIZE)
        if type(number) is not int or not 1 <= number <= count:
            raise ValueError("invalid part number")
        try:
            if len(base64.b64decode(checksum, validate=True)) != 32:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError("invalid part checksum") from None
        size = min(PART_SIZE, record.intent.size_bytes - (number - 1) * PART_SIZE)
        url = self.signer.generate_presigned_url(
            "upload_part",
            Params={**self._params(record), "PartNumber": number, "ContentLength": size, "ChecksumSHA256": checksum},
            ExpiresIn=expires,
        )
        log.info("[multipart] part authorization issued")
        return {"url": url, "method": "PUT", "headers": {"x-amz-checksum-sha256": checksum}, "expires": expires}

    def _verified_object(self, record):
        try:
            head = self.s3.head_object(Bucket=self.bucket, Key=record.object_key)
        except Exception as error:
            if error_code(error) in {"NoSuchKey", "404", "NotFound"}:
                return None
            raise
        if (
            head.get("Metadata") != self._binding(record)
            or head.get("ContentLength") != record.intent.size_bytes
            or head.get("ContentType") != record.intent.mime_type
        ):
            raise VerificationFailed("completed object does not match reservation")
        response = self.s3.get_object(Bucket=self.bucket, Key=record.object_key)
        digest, size = hashlib.sha256(), 0
        try:
            while chunk := response["Body"].read(PART_SIZE):
                size += len(chunk)
                if size > record.intent.size_bytes:
                    raise VerificationFailed("completed object exceeds reservation")
                digest.update(chunk)
        finally:
            response["Body"].close()
        if (
            size != record.intent.size_bytes
            or digest.hexdigest() != record.intent.checksum_sha256
            or response.get("ETag") != head.get("ETag")
        ):
            raise VerificationFailed("completed object checksum mismatch")
        return head["ETag"]

    def complete(self, owner, session_id):
        record = self.store.get(owner, session_id)
        try:
            return self._complete(owner, session_id, record)
        except VerificationFailed:
            current = self.store.get(owner, session_id)
            if current.phase == "completing":
                self.store.reconcile_failed(owner, session_id, current.revision)
            raise

    def _complete(self, owner, session_id, record):
        if record.phase == "completed":
            return record
        if record.phase not in {"uploading", "completing"}:
            raise SessionConflict("upload cannot be completed")
        existing = self._verified_object(record) if record.phase == "completing" else None
        if existing:
            try:
                return self.store.reconcile_completed(owner, session_id, record.revision, object_etag=existing)
            except SessionConflict:
                current = self.store.get(owner, session_id)
                if current.phase == "completed":
                    return current
                raise
        self._live(record)
        parts = self.parts(record)
        expected = math.ceil(record.intent.size_bytes / PART_SIZE)
        if len(parts) != expected or any(
            part.get("PartNumber") != index + 1
            or part.get("Size") != min(PART_SIZE, record.intent.size_bytes - index * PART_SIZE)
            for index, part in enumerate(parts)
        ):
            raise SessionConflict("upload parts are incomplete or incorrectly sized")
        if record.phase == "uploading":
            record = self.store.advance(owner, session_id, record.revision, "completing")
        payload = [
            {key: part[key] for key in ("PartNumber", "ETag", "ChecksumSHA256") if key in part} for part in parts
        ]
        log.info("[multipart] completion started")
        try:
            self.s3.complete_multipart_upload(**self._params(record), MultipartUpload={"Parts": payload})
        except Exception:
            if not self._verified_object(record):
                raise
        verified = self._verified_object(record)
        if not verified:
            raise SessionConflict("completion outcome is not yet available")
        try:
            result = self.store.reconcile_completed(owner, session_id, record.revision, object_etag=verified)
        except SessionConflict:
            result = self.store.get(owner, session_id)
            if result.phase != "completed":
                raise
        log.info("[multipart] completion verified")
        return result

    def abort(self, owner, session_id):
        record = self.store.get(owner, session_id)
        if record.phase == "reserved":
            record = self.store.advance(owner, session_id, record.revision, "aborted")
        if record.phase in {"aborted", "failed"}:
            # Includes native creations whose response was lost before binding.
            for page in self.s3.get_paginator("list_multipart_uploads").paginate(
                Bucket=self.bucket, Prefix=record.object_key
            ):
                for upload in page.get("Uploads", []):
                    if upload["Key"] == record.object_key:
                        try:
                            self.s3.abort_multipart_upload(
                                Bucket=self.bucket, Key=record.object_key, UploadId=upload["UploadId"]
                            )
                        except Exception as error:
                            if error_code(error) != "NoSuchUpload":
                                raise
            return record
        if record.phase not in {"uploading", "aborting"}:
            raise SessionConflict("completion already claimed; check its outcome")
        if record.phase == "uploading":
            record = self.store.advance(owner, session_id, record.revision, "aborting")
        try:
            self.s3.abort_multipart_upload(**self._params(record))
        except Exception as error:
            if error_code(error) != "NoSuchUpload":
                raise
        return self.store.advance(owner, session_id, record.revision, "aborted")
