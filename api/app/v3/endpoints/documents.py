import logging

from fastapi import APIRouter, HTTPException, Request

import app.exceptions as exceptions
from app.services.hls import hls_prefix, mint_sig
from app.v3.endpoints.auth_helper import user as _user
from app.v3.endpoints.auth_helper import user_or_anon
from app.v3.models import CreateDocument, DeleteDocument, ReadDocuments, UpdateDocument
from app.v3.services import clickhouse as ch
from app.v3.services import moderation

router = APIRouter(tags=["documents"])
log = logging.getLogger(__name__)


def _moderate_post(author: str, doc_id: str, service: str, body: dict, groups: list[str]) -> None:
    """Content moderation (D59) — the post-create hook.

    Only posts attached to the discover board are moderated. A post by a user
    on ``auto_hide_users`` is always auto-hidden; a post whose text trips the
    blocklist is auto-hidden when ``auto_moderate`` is on (otherwise flagged
    only). Every hit records a flag for the operator's review queue. The hide
    uses the existing ``group_hidden_docs`` mechanism — the author's own copy
    is untouched (I3). Best-effort: a moderation failure never fails the post.
    """
    if service != "posts" or ch.DISCOVER_GROUP_ID not in (groups or []):
        return
    try:
        cfg = moderation.moderation_config()
        if not cfg["moderation_enabled"]:
            return
        text = body.get("text", "") if isinstance(body, dict) else ""
        reasons = moderation.should_auto_hide(author, text, cfg)
        if not reasons:
            return
        moderation.record_flag(author, doc_id, reasons)
        is_listed = "auto_hide_users" in reasons
        if is_listed or cfg["auto_moderate"]:
            ch.hide_doc_from_group(ch.DISCOVER_GROUP_ID, doc_id, moderation.NODE_MODERATOR)
            log.info("[moderation] auto-hidden doc=%s author=%s reasons=%s", doc_id, author, reasons)
    except Exception as e:
        log.warning("[moderation] auto-hide failed (non-fatal): %s: %s", type(e).__name__, e)


def _mint_hls_manifest_urls(docs: list[dict], reader_key: str) -> list[dict]:
    """Inject `transcoding_settings.manifest_url` into transcoded docs.

    The sig is bound to (reader, doc, hls prefix) with a 10-minute TTL — the
    expiry is the group-membership re-check cadence (minio-auth-bifurcated).
    A path-only URL: the client prepends its API origin.
    """
    out = []
    for doc in docs:
        body = doc.get("body") or {}
        ts = body.get("transcoding_settings") or {}
        video = body.get("video")
        if ts.get("enabled") and isinstance(video, dict) and video.get("value"):
            sig = mint_sig(reader_key, doc["doc_id"], hls_prefix(str(video["value"])))
            body = dict(body)
            body["transcoding_settings"] = {
                **ts,
                "manifest_url": f"/v3/media/hls/manifest?doc_id={doc['doc_id']}&sig={sig}",
            }
            doc = dict(doc)
            doc["body"] = body
        out.append(doc)
    return out


def _check_app_permission(request: Request, user_key: str, service: str, operation: str) -> None:
    """Enforce app contract permissions. Raises 403 if no valid contract."""
    origin = request.headers.get("origin", "")
    if not origin:
        return  # same-origin or direct API call — skip contract check
    if not ch.has_permission(user_key, origin, service, operation):
        raise HTTPException(
            status_code=403,
            detail=f"No app contract for {origin} to {operation} on {service}",
        )


@router.post("/create")
def create_document(request: Request, data: CreateDocument):
    """Create a document in a service. User from JWT. Server generates doc_id."""
    author = _user(data)
    _check_app_permission(request, author, data.service, "create")
    result = ch.insert_document(
        author_key=author,
        service=data.service,
        body=data.body,
        ref_value=data.ref_value or "",
        tags=data.body.get("tags", []),
        ad_mode=data.ad_preference.mode if data.ad_preference else "none",
        ad_target=(data.ad_preference.target or "") if data.ad_preference else "",
    )
    doc_id = result["doc_id"]

    if data.groups:
        # D58 write gate (closes the attach hole): the author may only attach
        # the doc to groups their effective role grants `create` on this
        # service. A bystander with no write grant to any requested group gets
        # a 403; non-writable groups are dropped from the attachment.
        writable = [g for g in data.groups if ch.can_write_group(g, author, data.service)]
        if not writable:
            raise HTTPException(
                status_code=403,
                detail="no write access to the requested group",
            )
        ch.attach_doc_to_groups(doc_id, writable)
        result["groups"] = writable
        _moderate_post(author, doc_id, data.service, data.body, writable)

    return result


@router.post("/read")
def read_documents(request: Request, data: ReadDocuments):
    """Read documents. doc_id for single read, groups for discover, 'me' for own docs.

    Anon-capable: a missing token reads as the node's `anon` member. This is
    what makes the discover group (the public board) readable without a token
    — discovery IS a group read in v3, so the board is just the discover group
    in the `groups` list. Anon's access stays bounded by group membership (I3).
    The app-contract gate applies to real users only; the public board is
    anon-readable by design (D41: the node is readable by design).
    """
    reader = user_or_anon(data)
    # D58: reads are role-gated. `authenticated` = the reader holds a valid
    # token (a real user, not anon) — it selects the `authenticated` principal
    # class in the effective-role union.
    authenticated = reader != "anon"
    if authenticated:
        _check_app_permission(request, reader, data.service, "readAll")

    if data.doc_id:
        doc = ch.read_document_by_id(data.doc_id, reader, data.service)
        if not doc:
            raise exceptions.ENTRY_NOT_FOUND
        # v3 ad preference: the single-doc read serves the pinned ad inline
        # too (the post detail deep link is a read, I3-checked).
        doc = ch.attach_pinned_ads([doc], reader)[0]
        # D57: node ad attachment (the third join — doc.ad + doc.node_ad).
        doc = ch.attach_node_ads([doc], reader)[0]
        return _mint_hls_manifest_urls(ch.resolve_media_urls_in_docs([doc]), reader)[0]

    if not data.groups:
        raise exceptions.CRUD

    if "me" in data.groups:
        # "my groups" = the groups my effective role can read this service in.
        candidates = [g["group_id"] for g in ch.get_user_groups(reader)]
        group_ids = ch.readable_groups(reader, data.service, authenticated, candidates)
    else:
        # D58 read gate: filter to the groups the reader's effective role
        # grants readAll on this service (members via their role, bystanders
        # via the anyone/authenticated grant).
        group_ids = ch.readable_groups(reader, data.service, authenticated, data.groups)
        # D42: distinguish "no access to any requested group" from "no notes
        # yet" (which returns an empty list). Anon is exempt: it reads the
        # public board, and an empty board is a valid (empty) result.
        if authenticated and not group_ids:
            raise HTTPException(
                status_code=403,
                detail="no access to the requested group",
            )

    docs = ch.read_documents_in_groups(
        group_ids=group_ids,
        member_key=reader,
        service=data.service,
        limit=data.limit,
        offset=data.offset,
        sort=data.sort.model_dump() if data.sort else None,
        # D58: group_ids is already filtered to the readable set — drop the
        # membership JOIN (a public group's reader is not a member).
        require_membership=False,
    )
    # v3 ad preference: serve each pinned doc with its ad inline (I3-checked).
    docs = ch.attach_pinned_ads(docs, reader)
    # D57: node ad attachment (the third join — doc.ad + doc.node_ad).
    docs = ch.attach_node_ads(docs, reader)
    return _mint_hls_manifest_urls(ch.resolve_media_urls_in_docs(docs), reader)


@router.post("/update")
def update_document(request: Request, data: UpdateDocument):
    """Update a document (new version + optional group changes)."""
    author = _user(data)
    existing = ch.get_document(data.doc_id, author)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND
    _check_app_permission(request, author, existing["service"], "updateOwn")

    merged_body = {**existing["body"], **data.body}
    # Preserve the existing ad preference unless the update sets one.
    ad_mode = data.ad_preference.mode if data.ad_preference else existing.get("ad_mode", "none")
    ad_target = (data.ad_preference.target or "") if data.ad_preference else existing.get("ad_target", "")
    result = ch.update_document(
        doc_id=data.doc_id,
        author_key=author,
        service=existing["service"],
        body=merged_body,
        ref_value=existing.get("ref_value", ""),
        tags=merged_body.get("tags", []),
        ad_mode=ad_mode,
        ad_target=ad_target,
    )

    if data.groups is not None:
        ch.replace_doc_groups(data.doc_id, data.groups)
        result["groups"] = data.groups
    else:
        result["groups"] = ch.get_doc_groups(data.doc_id)

    return result


@router.post("/delete")
def delete_document(request: Request, data: DeleteDocument):
    """Tombstone a document and its group attachments."""
    author = _user(data)
    existing = ch.get_document(data.doc_id, author)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND
    _check_app_permission(request, author, existing["service"], "deleteOwn")

    ch.delete_document(data.doc_id, author, existing["service"])
    ch.detach_doc_from_groups(data.doc_id)
    return {"doc_id": data.doc_id, "status": "deleted"}
