import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

import app.settings as settings
from app.services import transcode
from app.services.hls import (
    can_view_doc,
    hls_prefix,
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
from app.services.media_delivery import get_url, public_jwks
from app.v3.endpoints.auth_helper import principal, user_or_anon
from app.v3.endpoints.auth_helper import user as _user
from app.v3.models import (
    ConfirmMedia,
    DeleteMedia,
    ListMedia,
    ReadUrlRequest,
    ThumbnailRequest,
    TranscodeRequest,
    UploadUrlRequest,
)
from app.v3.services import clickhouse as ch
from app.v3.services import thumbnail

router = APIRouter(tags=["media"])
log = logging.getLogger(__name__)


@router.get("/jwks")
def media_jwks():
    """Public media verification key for operator provisioning, not auth keys."""
    return public_jwks()


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
    """Request a presigned GET URL for a caller-owned S3 key."""
    import logging

    logger = logging.getLogger("web10-media")
    user = _user(data)
    object_key = data.body.get("object_key")
    if not isinstance(object_key, str) or not object_key or object_key == user + "/":
        logger.info("[media] read-url denied: invalid key")
        raise HTTPException(status_code=400, detail="object_key is required")
    if not object_key.startswith(user + "/"):
        logger.info("[media] read-url denied: foreign namespace")
        raise HTTPException(status_code=403, detail="object_key must be caller-owned")
    logger.info("[media] read-url accepted: owner namespace")

    ensure_bucket(get_s3_client())
    logger.info("[media] read-url signing: started")
    presigned_url = get_url(object_key, None if settings.MEDIA_DELIVERY_ENABLED else get_s3_signing_client())
    logger.info("[media] read-url signing: completed")
    return {
        "read_url": presigned_url,
        "expires_in": settings.MEDIA_DELIVERY_TTL if settings.MEDIA_DELIVERY_ENABLED else settings.READ_URL_EXPIRY,
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


@router.post("/thumbnail")
def get_thumbnail(data: ThumbnailRequest):
    """Generic thumbnail (KB: media/thumbnailing.md) — "what's the picture for
    this doc?" Universal: any doc, any app. No knowledge of posts, profiles, or
    permalinks.

    Access-checked (I3): a doc the reader cannot read does not thumbnail for
    them (a missing token reads as `anon`; a private doc → 404, not 403, so the
    endpoint is not an enumeration surface). The thumbnail is the doc's OWN
    picture — `null` when there is none. The fallback (author avatar, a brand
    mark) is the *app's* decision, not the platform's.

    Two shapes, both generic:
    - A doc **with media** (a post, an ad): the thumbnail is picked from its
      resolved `media_refs` (the pure ``pick_thumbnail`` selection).
    - A **media doc** itself (`media_metadata` / `public_media`): select its
      own image or video poster through the same pure function, never a raw
      video/audio file. This is what lets an app ask
      "what's the picture for this avatar?" through the same endpoint.

    A thin wrapper over the existing generic primitives: read the doc by id,
    check the reader's access to its groups, resolve its media (fresh presigned
    URLs, the document-typing rule), and run the pure ``pick_thumbnail``.
    """
    reader = user_or_anon(data)
    authenticated = reader != "anon"
    # D84: canonical principal for the membership gate (foreign tokens
    # certify at their home node first).
    reader_principal = principal(data) if authenticated else "anon"
    doc = ch.get_document_any_author(data.doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="not found")
    service = doc["service"]
    # I3: the reader must be able to read the doc's service in one of its
    # groups (the same gate the read path + the social preview server use).
    if not any(
        ch.can_read_group(gid, reader_principal, service, authenticated) for gid in ch.get_doc_groups(data.doc_id)
    ):
        log.info("[media] thumbnail: denied document read")
        raise HTTPException(status_code=404, detail="not found")
    body = doc.get("body", {}) or {}
    # Match normal document reads: group-authored media stays in the human
    # uploader's namespace. Only the canonical server audit column supplies it.
    media_owner = doc.get("posted_by") or doc["author_key"]
    log.info("[media] thumbnail: resolving authorized media")
    # A media doc IS the picture — resolve its own object_key to a fresh
    # presigned read_url (treat the doc as a single-element media_refs list so
    # the existing resolution path mints the URL the same way a post's media
    # is resolved).
    if service in ("media_metadata", "public_media"):
        resolved = ch.resolve_media_urls({"media_refs": [data.doc_id]}, media_owner)
    else:
        # A doc with media — pick the thumbnail from its resolved media_refs.
        resolved = ch.resolve_media_urls(body, media_owner)
    thumb = thumbnail.pick_thumbnail(resolved.get("media_refs") or [])
    log.info("[media] thumbnail: resolved image=%s", thumb is not None)
    return {"thumbnail": thumb}


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


def _hls_doc(doc_id: str, sig: str) -> tuple[dict, dict]:
    """Verify the stream token AND re-check access. Returns document and claims.

    The sig check is the fast path (JWT, no DB); the access re-check is what
    the 10-minute expiry buys — group membership re-verified on every
    manifest (re)fetch. `authenticated` rides in the sig (minted at read
    time) so the re-check evaluates the same D58 principal classes the
    original read did — an anon read re-checks as anon.
    """
    try:
        payload = verify_sig(sig, doc_id)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    doc = can_view_doc(doc_id, payload["username"], payload.get("authenticated", False))
    if not doc:
        raise HTTPException(status_code=403, detail="not a member of the requested group")
    return doc, payload


@router.get("/hls/manifest")
def hls_manifest(doc_id: str, sig: str = ""):
    """Master manifest, synthesized from the document's
    `transcoding_settings.variants` (the document is the source of truth)."""
    doc, _ = _hls_doc(doc_id, sig)
    ts = (doc["body"] or {}).get("transcoding_settings") or {}
    if not ts.get("enabled") or not ts.get("variants"):
        raise HTTPException(status_code=404, detail="document has no HLS stream")
    body = synthesize_master_manifest(doc_id, sig, ts["variants"])
    return Response(body, media_type="application/vnd.apple.mpegurl", headers={"Cache-Control": "no-store"})


@router.get("/hls/variant")
def hls_variant(doc_id: str, variant: str, sig: str = ""):
    """A rendition's manifest, with every segment rewritten to a signed URL."""
    doc, payload = _hls_doc(doc_id, sig)
    ts = (doc["body"] or {}).get("transcoding_settings") or {}
    v = next((x for x in ts.get("variants", []) if variant_tag(x) == variant), None)
    if not v:
        raise HTTPException(status_code=404, detail=f"no such variant: {variant}")
    video = (doc["body"] or {}).get("video")
    video = video if isinstance(video, dict) else {}
    owner = doc.get("posted_by") or doc.get("author_key")
    key = video.get("value")
    url = v.get("url")
    url = url if isinstance(url, dict) else {}
    # Read access to metadata does not authorize the object it happens to name.
    if (
        video.get("type") != "minio"
        or not isinstance(owner, str)
        or not owner
        or not isinstance(key, str)
        or not key.startswith(owner + "/")
        or len(key) <= len(owner) + 1
    ):
        raise HTTPException(status_code=403, detail="invalid HLS object provenance")
    prefix = hls_prefix(key)
    if (
        payload["prefix"] != prefix
        or url.get("type") != "minio"
        or url.get("value") != f"{prefix}/{variant}/index.m3u8"
    ):
        raise HTTPException(status_code=403, detail="invalid HLS object provenance")
    obj = get_s3_client().get_object(Bucket=settings.S3_BUCKET, Key=url["value"])
    manifest_text = obj["Body"].read().decode("utf-8")
    try:
        body = rewrite_variant_manifest(doc_id, variant, sig, manifest_text)
    except ValueError:
        raise HTTPException(status_code=403, detail="invalid HLS segment capability") from None
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
