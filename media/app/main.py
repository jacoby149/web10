import logging
import uuid
from datetime import datetime, timedelta

import boto3
from botocore.config import Config
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

import app.auth as auth
import app.models as models
import app.mongo as mongo
import app.settings as settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("web10-media")

app = FastAPI(
    title="web10-media",
    description="web10 media service - presigned S3 URLs and metadata records",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    logger.error(f"validation error: {exc}")
    return JSONResponse(
        status_code=422,
        content={"status_code": 10422, "message": str(exc), "data": None},
    )


def get_s3_client():
    """Create an S3 client configured for the configured endpoint."""
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
    """Ensure the media bucket exists."""
    try:
        s3.head_bucket(Bucket=settings.S3_BUCKET)
    except Exception:
        s3.create_bucket(Bucket=settings.S3_BUCKET)


def make_object_key(username: str, filename: str) -> str:
    """Generate an S3 object key for a user's upload."""
    unique_id = uuid.uuid4().hex
    return f"{username}/{unique_id}/{filename}"


@app.post("/{user}/upload")
async def request_upload_url(user: str, request: models.UploadRequest):
    """
    Issue a presigned POST upload URL for a user.
    Gated by is_permitted(token, user, "media", "create").
    """
    if not auth.is_permitted(request.token, user, "media", "create"):
        raise HTTPException(status_code=401, detail="media access denied")

    if not mongo.user_collection_exists(user):
        raise HTTPException(status_code=404, detail="user not found")

    s3 = get_s3_client()
    ensure_bucket(s3)

    object_key = make_object_key(user, request.filename)
    content_type = request.mime_type or "application/octet-stream"

    presigned = s3.generate_presigned_post(
        settings.S3_BUCKET,
        object_key,
        Fields={"Content-Type": content_type},
        Conditions=[
            ["content-length-range", 0, settings.MAX_UPLOAD_SIZE]
        ] if request.size_bytes is None else [
            ["content-length-range", 0, request.size_bytes or settings.MAX_UPLOAD_SIZE]
        ],
        ExpiresIn=settings.UPLOAD_URL_EXPIRY,
    )

    logger.info(f"upload url issued for user={user} key={object_key}")
    return models.UploadResponse(
        upload_url=presigned["url"],
        object_key=object_key,
        content_type=content_type,
    )


@app.post("/{user}/upload/confirm")
async def confirm_upload(user: str, request: models.MetadataCreate):
    """
    After a successful S3 upload, write a media metadata record to the user's collection.
    Gated by is_permitted(token, user, "media", "create").
    """
    if not auth.is_permitted(request.token, user, "media", "create"):
        raise HTTPException(status_code=401, detail="media access denied")

    if not mongo.user_collection_exists(user):
        raise HTTPException(status_code=404, detail="user not found")

    record = {
        "url": request.url,
        "filename": request.filename,
        "created_at": datetime.utcnow().isoformat(),
        "mime_type": request.mime_type,
        "size_bytes": request.size_bytes,
        "width": request.width,
        "height": request.height,
        "duration_seconds": request.duration_seconds,
        "thumbnail_url": request.thumbnail_url,
        "caption": request.caption,
        "alt_text": request.alt_text,
        "origin": request.origin or "web10",
        "origin_id": request.origin_id,
        "encrypted": request.encrypted,
    }

    result = mongo.create_media_record(user, record)
    logger.info(f"media record created for user={user} _id={result.get('_id')}")
    return result


@app.post("/{user}/read")
async def request_read_url(user: str, request: models.ReadRequest):
    """
    Issue a short-lived presigned GET URL for a user's media object.
    Gated by is_permitted(token, user, "media", "read").
    Fresh URL per read, logged on issuance (D14).
    """
    if not auth.is_permitted(request.token, user, "media", "read"):
        raise HTTPException(status_code=401, detail="media access denied")

    if not mongo.user_collection_exists(user):
        raise HTTPException(status_code=404, detail="user not found")

    s3 = get_s3_client()
    ensure_bucket(s3)

    presigned_url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": request.object_key},
        ExpiresIn=settings.READ_URL_EXPIRY,
    )

    logger.info(f"read url issued for user={user} key={request.object_key}")
    return models.ReadResponse(
        read_url=presigned_url,
        expires_in=settings.READ_URL_EXPIRY,
    )


@app.post("/{user}/list")
async def list_media(user: str, token: models.MediaToken = models.MediaToken()):
    """
    List media metadata records for a user.
    Gated by is_permitted(token, user, "media", "read").
    """
    if not auth.is_permitted(token.token, user, "media", "read"):
        raise HTTPException(status_code=401, detail="media access denied")

    if not mongo.user_collection_exists(user):
        raise HTTPException(status_code=404, detail="user not found")

    records = mongo.read_media_records(user)
    return records


@app.delete("/{user}/delete")
async def delete_media(user: str, request: models.MediaToken):
    """
    Delete media metadata records for a user.
    Gated by is_permitted(token, user, "media", "delete").
    """
    if not auth.is_permitted(request.token, user, "media", "delete"):
        raise HTTPException(status_code=401, detail="media access denied")

    if not mongo.user_collection_exists(user):
        raise HTTPException(status_code=404, detail="user not found")

    query = request.model_dump(exclude_none=True)
    deleted = mongo.delete_media_records(user, query)
    return {"deleted": deleted}
