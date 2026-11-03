"""Portable exact-object media capabilities. Authorization remains at callers."""

import base64
import json
import re
import time
from functools import lru_cache
from urllib.parse import urlsplit

import jwt
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from cryptography.hazmat.primitives.serialization import load_pem_private_key

import app.settings as settings


@lru_cache(maxsize=1)
def _private_key(pem):
    try:
        key = load_pem_private_key(pem.encode("ascii"), password=None)
    except (ValueError, TypeError, UnicodeError):
        raise ValueError("invalid media delivery RSA private key") from None
    if not isinstance(key, RSAPrivateKey) or key.key_size < 2048:
        raise ValueError("media delivery requires an RSA key of at least 2048 bits")
    return key


def validate_configuration():
    if not settings.MEDIA_DELIVERY_ENABLED:
        return
    base = settings.MEDIA_DELIVERY_BASE
    # Reject URL-parser normalization, credentials, ports and all path suffixes.
    if not isinstance(base, str) or not re.fullmatch(r"https://[A-Za-z0-9.-]+", base):
        raise ValueError("media delivery base must be an HTTPS host-only URL")
    host = urlsplit(base).hostname
    if (
        not host
        or len(host) > 253
        or any(not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label) for label in host.split("."))
    ):
        raise ValueError("invalid media delivery host")
    for value in (
        settings.MEDIA_DELIVERY_ISSUER,
        settings.MEDIA_DELIVERY_AUDIENCE,
        settings.MEDIA_DELIVERY_KID,
        settings.S3_BUCKET,
    ):
        if not isinstance(value, str) or not value.strip():
            raise ValueError("media delivery requires issuer, audience, kid and bucket")
    if type(settings.MEDIA_DELIVERY_TTL) is not int or not 1 <= settings.MEDIA_DELIVERY_TTL <= 600:
        raise ValueError("media delivery TTL must be an integer in 1..600")
    if settings.MEDIA_DELIVERY_PRIVATE_KEY == settings.PRIVATE_KEY:
        raise ValueError("media delivery key must be separate from authentication")
    _private_key(settings.MEDIA_DELIVERY_PRIVATE_KEY)


def public_jwks():
    if not settings.MEDIA_DELIVERY_ENABLED:
        return {"keys": []}
    validate_configuration()
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(_private_key(settings.MEDIA_DELIVERY_PRIVATE_KEY).public_key()))
    return {"keys": [{**jwk, "kid": settings.MEDIA_DELIVERY_KID, "alg": "RS256", "use": "sig"}]}


def get_url(key, signing_client=None, *, parent_exp=None):
    """Sign only after caller authorization; disabled mode keeps legacy SigV4."""
    if not settings.MEDIA_DELIVERY_ENABLED:
        if signing_client is None:
            from app.services.media import get_s3_signing_client

            signing_client = get_s3_signing_client()
        return signing_client.generate_presigned_url(
            "get_object", Params={"Bucket": settings.S3_BUCKET, "Key": key}, ExpiresIn=settings.READ_URL_EXPIRY
        )
    validate_configuration()
    if not isinstance(key, str) or not key:
        raise ValueError("media object key must be a nonempty UTF-8 string")
    now = int(time.time())
    exp = now + settings.MEDIA_DELIVERY_TTL
    if parent_exp is not None:
        if type(parent_exp) is not int or parent_exp <= now:
            raise ValueError("invalid or expired media parent")
        # VOD playlists are not renewed at the direct-object refresh cadence.
        exp = min(now + 600, parent_exp)
    cap = jwt.encode(
        {
            "iss": settings.MEDIA_DELIVERY_ISSUER,
            "aud": settings.MEDIA_DELIVERY_AUDIENCE,
            "iat": now,
            "exp": exp,
            "v": 1,
            "bucket": settings.S3_BUCKET,
            "key": key,
            "method": "GET",
        },
        _private_key(settings.MEDIA_DELIVERY_PRIVATE_KEY),
        algorithm="RS256",
        headers={"typ": "JWT", "kid": settings.MEDIA_DELIVERY_KID},
    )
    encoded = base64.urlsafe_b64encode(key.encode("utf-8")).rstrip(b"=").decode("ascii")
    return f"{settings.MEDIA_DELIVERY_BASE}/media/{encoded}?cap={cap}"
