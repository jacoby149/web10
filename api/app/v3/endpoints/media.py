from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

import app.settings as settings
from app.services import transcode
from app.services.hls import (
    can_view_doc,
    rewrite_variant_manifest,
    segment_key,
    synthesize_master_manifest,
    variant_tag,
    verify_sig,
)
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
    TranscodeRequest,
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
    """List media for the user. Optional doc_ids narrows to specific docs."""
    user = _user(data)
    return ch.list_media(user, limit=data.limit, offset=data.offset, doc_ids=data.doc_ids)


@router.post("/delete")
def delete_media(data: DeleteMedia):
    """Delete a media record."""
    user = _user(data)
    ch.delete_media(user, data.doc_id)
    return {"doc_id": data.doc_id, "status": "deleted"}


# ---------------------------------------------------------------------------
# HLS transcoding (D44 — the video spine)
# ---------------------------------------------------------------------------


@router.post("/transcode")
def transcode_media(data: TranscodeRequest):
    """Queue a video document for HLS transcoding.

    The document must carry `video: {type: 'minio', value: object_key}` (the
    uploaded raw file). The in-process worker transcodes it to HLS renditions
    + thumbnails, uploads them to MinIO, and updates the document's
    `transcoding_settings` (status: processing → done | failed). Clients poll
    by reading the document.
    """
    user = _user(data)
    doc = ch.get_document(data.doc_id, user)
    if not doc:
        raise HTTPException(status_code=404, detail="document not found")
    video = (doc["body"] or {}).get("video")
    if not (isinstance(video, dict) and video.get("type") == "minio" and video.get("value")):
        raise HTTPException(status_code=400, detail="document has no video minio ref")
    ts = (doc["body"] or {}).get("transcoding_settings") or {}
    if ts.get("status") == "processing":
        return {"doc_id": data.doc_id, "status": "processing"}
    transcode.submit_transcode_job(data.doc_id, user)
    return {"doc_id": data.doc_id, "status": "queued"}


def _hls_doc(doc_id: str, sig: str) -> dict:
    """Verify the stream token AND re-check access. Returns the document.

    The sig check is the fast path (JWT, no DB); the access re-check is what
    the 10-minute expiry buys — group membership re-verified on every
    manifest (re)fetch.
    """
    try:
        payload = verify_sig(sig, doc_id)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    doc = can_view_doc(doc_id, payload["username"])
    if not doc:
        raise HTTPException(status_code=403, detail="not a member of the requested group")
    return doc


@router.get("/hls/manifest")
def hls_manifest(doc_id: str, sig: str = ""):
    """Master manifest, synthesized from the document's
    `transcoding_settings.variants` (the document is the source of truth)."""
    doc = _hls_doc(doc_id, sig)
    ts = (doc["body"] or {}).get("transcoding_settings") or {}
    if not ts.get("enabled") or not ts.get("variants"):
        raise HTTPException(status_code=404, detail="document has no HLS stream")
    body = synthesize_master_manifest(doc_id, sig, ts["variants"])
    return Response(body, media_type="application/vnd.apple.mpegurl", headers={"Cache-Control": "no-store"})


@router.get("/hls/variant")
def hls_variant(doc_id: str, variant: str, sig: str = ""):
    """A rendition's manifest, with every segment rewritten to a signed URL."""
    doc = _hls_doc(doc_id, sig)
    ts = (doc["body"] or {}).get("transcoding_settings") or {}
    v = next((x for x in ts.get("variants", []) if variant_tag(x) == variant), None)
    if not v:
        raise HTTPException(status_code=404, detail=f"no such variant: {variant}")
    obj = get_s3_client().get_object(Bucket=settings.S3_BUCKET, Key=str(v["url"]["value"]))
    manifest_text = obj["Body"].read().decode("utf-8")
    body = rewrite_variant_manifest(doc_id, variant, sig, manifest_text)
    return Response(body, media_type="application/vnd.apple.mpegurl", headers={"Cache-Control": "no-store"})


@router.get("/hls/segment")
def hls_segment(doc_id: str, variant: str, seg: str, sig: str = ""):
    """One .ts segment, streamed from MinIO.

    Sig-only by design (no DB hit — the prefix rides in the sig, so this
    token can only ever address THIS document's HLS tree).
    """
    try:
        payload = verify_sig(sig, doc_id)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    try:
        key = segment_key(payload["prefix"], variant, seg)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        obj = get_s3_client().get_object(Bucket=settings.S3_BUCKET, Key=key)
    except Exception:
        raise HTTPException(status_code=404, detail="segment not found")
    return Response(obj["Body"].read(), media_type="video/MP2T", headers={"Cache-Control": "no-store"})
