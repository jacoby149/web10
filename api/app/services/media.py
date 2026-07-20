import logging
import uuid

import boto3
from botocore.config import Config

import app.settings as settings

logger = logging.getLogger("web10-media")


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name=settings.S3_REGION,
        config=Config(
            signature_version="s3v4",
            use_ssl=settings.S3_USE_SSL,
        ),
    )


def ensure_bucket(s3):
    try:
        s3.head_bucket(Bucket=settings.S3_BUCKET)
    except Exception:
        s3.create_bucket(Bucket=settings.S3_BUCKET)


def make_object_key(username: str, filename: str) -> str:
    unique_id = uuid.uuid4().hex
    return f"{username}/{unique_id}/{filename}"
