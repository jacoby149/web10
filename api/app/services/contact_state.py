"""Private encrypted contact-delivery records, using the node's existing S3."""

import hashlib
import hmac
import json

from cryptography.fernet import Fernet
from fastapi import HTTPException

from app import settings
from app.services.media import get_s3_client


def unavailable():
    return HTTPException(503, "Contact delivery unavailable. Ask the node operator to check setup.")


def configured():
    # Partial/broken setup is not permission to silently return to legacy auth.
    return bool(settings.CONTACT_DELIVERY_STATE_BUCKET or settings.CONTACT_DELIVERY_KEY)


def ready():
    try:
        cipher()
        return bool(settings.CONTACT_DELIVERY_STATE_BUCKET and settings.CONTACT_AUTH_URL)
    except Exception:
        return False


def cipher():
    try:
        if not settings.CONTACT_DELIVERY_KEY or settings.CONTACT_DELIVERY_KEY == settings.PRIVATE_KEY:
            raise ValueError()
        return Fernet(settings.CONTACT_DELIVERY_KEY.encode())
    except Exception:
        raise unavailable() from None


def digest(value):
    cipher()  # Validate the separate key even before deriving record names.
    return hmac.new(settings.CONTACT_DELIVERY_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()


def load(key):
    if not ready() or settings.CONTACT_DELIVERY_STATE_BUCKET == settings.S3_BUCKET:
        raise unavailable()
    try:
        response = get_s3_client().get_object(Bucket=settings.CONTACT_DELIVERY_STATE_BUCKET, Key="contact/" + key)
        stream = response["Body"]
        try:
            raw = stream.read(65537)
        finally:
            stream.close()
        if len(raw) > 65536:
            raise ValueError()
        value = json.loads(cipher().decrypt(raw))
        return value, response["ETag"]
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
            return {}, None
        raise unavailable() from None


def save(key, value, etag):
    """False is a lost race, never permission to overwrite unconditionally."""
    if not ready() or settings.CONTACT_DELIVERY_STATE_BUCKET == settings.S3_BUCKET:
        raise unavailable()
    try:
        raw = cipher().encrypt(json.dumps(value).encode())
        if len(raw) > 65536:
            raise ValueError()
        get_s3_client().put_object(
            Bucket=settings.CONTACT_DELIVERY_STATE_BUCKET,
            Key="contact/" + key,
            Body=raw,
            ContentType="application/octet-stream",
            **({"IfMatch": etag} if etag else {"IfNoneMatch": "*"}),
        )
        return True
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") in {
            "PreconditionFailed",
            "ConditionalRequestConflict",
            "412",
            "409",
        }:
            return False
        raise unavailable() from None


def replace(key, change):
    for _ in range(5):
        value, etag = load(key)
        result = change(value)
        if save(key, result, etag):
            return result
    raise HTTPException(409, "Delivery settings changed. Please retry.")
