from datetime import datetime

from fastapi import APIRouter, HTTPException

import app.settings as settings
from app.models.auth import Token
from app.models.media import (
    MediaToken,
    MetadataCreate,
    ReadRequest,
    ReadResponse,
    UploadRequest,
    UploadResponse,
)
from app.services import documentdb as db
from app.services.auth import is_permitted
from app.services.media import ensure_bucket, get_s3_client, get_s3_signing_client, make_object_key

router = APIRouter()


@router.post("/{user}/upload")
async def request_upload_url(user: str, request: UploadRequest):
    token = Token(token=request.token)
    if not is_permitted(token, user, "media", "create"):
        raise HTTPException(status_code=401, detail="media access denied")
    if not db.user_collection_exists(user):
        raise HTTPException(status_code=404, detail="user not found")

    ensure_bucket(get_s3_client())
    object_key = make_object_key(user, request.filename)
    content_type = request.mime_type or "application/octet-stream"

    # Sign on the public endpoint so the browser gets a reachable HTTPS URL.
    # Every Fields entry must ALSO appear in Conditions — boto3 does not add
    # them to the signed policy, and S3/minio reject any form field the
    # policy doesn't cover (403 AccessDenied on every upload otherwise).
    presigned = get_s3_signing_client().generate_presigned_post(
        settings.S3_BUCKET,
        object_key,
        Fields={"Content-Type": content_type},
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 0, request.size_bytes or settings.MAX_UPLOAD_SIZE],
        ],
        ExpiresIn=settings.UPLOAD_URL_EXPIRY,
    )
    return UploadResponse(
        upload_url=presigned["url"], fields=presigned.get("fields"), object_key=object_key, content_type=content_type
    )


@router.post("/{user}/upload/confirm")
async def confirm_upload(user: str, request: MetadataCreate):
    token = Token(token=request.token)
    if not is_permitted(token, user, "media", "create"):
        raise HTTPException(status_code=401, detail="media access denied")
    if not db.user_collection_exists(user):
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
    return db.create_media_record(user, record)


@router.post("/{user}/read")
async def request_read_url(user: str, request: ReadRequest):
    token = Token(token=request.token)
    if not is_permitted(token, user, "media", "read"):
        raise HTTPException(status_code=401, detail="media access denied")
    if not db.user_collection_exists(user):
        raise HTTPException(status_code=404, detail="user not found")

    ensure_bucket(get_s3_client())
    # Sign on the public endpoint so the browser gets a reachable HTTPS URL.
    presigned_url = get_s3_signing_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": request.object_key},
        ExpiresIn=settings.READ_URL_EXPIRY,
    )
    return ReadResponse(read_url=presigned_url, expires_in=settings.READ_URL_EXPIRY)


@router.post("/{user}/list")
async def list_media(user: str, token: MediaToken = MediaToken()):
    auth_token = Token(token=token.token)
    if not is_permitted(auth_token, user, "media", "read"):
        raise HTTPException(status_code=401, detail="media access denied")
    if not db.user_collection_exists(user):
        raise HTTPException(status_code=404, detail="user not found")
    return db.read_media_records(user)


@router.delete("/{user}/delete")
async def delete_media(user: str, request: MediaToken):
    auth_token = Token(token=request.token)
    if not is_permitted(auth_token, user, "media", "delete"):
        raise HTTPException(status_code=401, detail="media access denied")
    if not db.user_collection_exists(user):
        raise HTTPException(status_code=404, detail="user not found")
    query = request.model_dump(exclude_none=True)
    deleted = db.delete_media_records(user, query)
    return {"deleted": deleted}
