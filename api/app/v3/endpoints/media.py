from fastapi import APIRouter, HTTPException

import app.settings as settings
from app.services.media import (
    ensure_bucket,
    get_s3_client,
    get_s3_signing_client,
    make_object_key,
)
from app.v3.endpoints.auth_helper import user as _user
from app.v3.models import (
    ConfirmMedia,
    DeleteMedia,
    ListMedia,
    ReadUrlRequest,
    UploadUrlRequest,
)
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["media"])


@router.post("/upload-url")
def upload_url(data: UploadUrlRequest):
    """Request a presigned POST form for uploading a file to S3."""
    user = _user(data)
    filename = data.body.get("filename")
    mime_type = data.body.get("mime_type") or "application/octet-stream"
    if not filename:
        raise HTTPException(status_code=400, detail="filename is required")

    ensure_bucket(get_s3_client())
    object_key = make_object_key(user, filename)

    presigned = get_s3_signing_client().generate_presigned_post(
        settings.S3_BUCKET,
        object_key,
        Fields={"Content-Type": mime_type},
        Conditions=[
            {"Content-Type": mime_type},
        ],
        ExpiresIn=settings.UPLOAD_URL_EXPIRY,
    )
    return {
        "upload_url": presigned["url"],
        "fields": presigned.get("fields"),
        "object_key": object_key,
        "content_type": mime_type,
    }


@router.post("/read-url")
def read_url(data: ReadUrlRequest):
    """Request a presigned GET URL for reading a file from S3."""
    _user(data)  # validate token
    object_key = data.body.get("object_key")
    if not object_key:
        raise HTTPException(status_code=400, detail="object_key is required")

    ensure_bucket(get_s3_client())
    presigned_url = get_s3_signing_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": object_key},
        ExpiresIn=settings.READ_URL_EXPIRY,
    )
    return {
        "read_url": presigned_url,
        "expires_in": settings.READ_URL_EXPIRY,
    }


@router.post("/confirm")
def confirm_media(data: ConfirmMedia):
    """Confirm a media upload by storing metadata."""
    user = _user(data)
    return ch.confirm_media_upload(user, data.body)


@router.post("/list")
def list_media(data: ListMedia):
    """List media for the user."""
    user = _user(data)
    return ch.list_media(user, limit=data.limit, offset=data.offset)


@router.post("/delete")
def delete_media(data: DeleteMedia):
    """Delete a media record."""
    user = _user(data)
    ch.delete_media(user, data.doc_id)
    return {"doc_id": data.doc_id, "status": "deleted"}
