import logging
import uuid

import boto3
from botocore.config import Config

import app.settings as settings

logger = logging.getLogger("web10-media")


def _s3_client(endpoint_url: str, use_ssl: bool):
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name=settings.S3_REGION,
        # use_ssl is a boto3.client() kwarg, NOT a botocore Config kwarg —
        # Config(use_ssl=...) raises TypeError and 500s every upload.
        use_ssl=use_ssl,
        config=Config(
            signature_version="s3v4",
        ),
    )


def get_s3_client():
    """Client on the INTERNAL endpoint — for server-side ops (bucket checks).

    The API container reaches MinIO over the internal Docker network here.
    """
    return _s3_client(settings.S3_ENDPOINT, settings.S3_USE_SSL)


def get_s3_signing_client():
    """Client on the PUBLIC endpoint — for signing browser-facing URLs only.

    Presigned URL/POST generation is offline (no network call), so this
    client never connects; it exists solely so the signed URL embeds the
    public host (e.g. https://minio.web10.app) the browser can reach over
    HTTPS. Defaults to the internal endpoint when S3_PUBLIC_ENDPOINT is
    unset (local/e2e run one host for both). See settings.py.
    """
    return _s3_client(settings.S3_PUBLIC_ENDPOINT, settings.S3_PUBLIC_USE_SSL)


def ensure_bucket(s3):
    try:
        s3.head_bucket(Bucket=settings.S3_BUCKET)
    except Exception:
        s3.create_bucket(Bucket=settings.S3_BUCKET)


def make_object_key(username: str, filename: str) -> str:
    unique_id = uuid.uuid4().hex
    return f"{username}/{unique_id}/{filename}"
