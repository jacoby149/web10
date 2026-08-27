from fastapi import APIRouter, HTTPException, Request

import app.exceptions as exceptions
from app.services.hls import hls_prefix, mint_sig
from app.v3.endpoints.auth_helper import user as _user
from app.v3.endpoints.auth_helper import user_or_anon
from app.v3.models import CreateDocument, DeleteDocument, ReadDocuments, UpdateDocument
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["documents"])


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
    )
    doc_id = result["doc_id"]

    if data.groups:
        ch.attach_doc_to_groups(doc_id, data.groups)
        result["groups"] = data.groups

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
    if reader != "anon":
        _check_app_permission(request, reader, data.service, "readAll")

    if data.doc_id:
        doc = ch.read_document_by_id(data.doc_id, reader, data.service)
        if not doc:
            raise exceptions.ENTRY_NOT_FOUND
        return _mint_hls_manifest_urls(ch.resolve_media_urls_in_docs([doc]), reader)[0]

    if not data.groups:
        raise exceptions.CRUD

    if "me" in data.groups:
        user_groups = ch.get_user_groups(reader)
        group_ids = [g["group_id"] for g in user_groups]
    else:
        group_ids = data.groups
        # D42: distinguish "group missing / not a member" from "no notes yet"
        # (which returns an empty list). If the reader is a member of NONE of
        # the explicitly requested groups, this is an access failure the app
        # can act on (prompt for the group contract) — not an empty result.
        # Anon is exempt: it reads the public board, and an empty board is a
        # valid (empty) result, not an access failure.
        if reader != "anon" and not any(ch.is_group_member(g, reader) for g in group_ids):
            raise HTTPException(
                status_code=403,
                detail="not a member of the requested group",
            )

    docs = ch.read_documents_in_groups(
        group_ids=group_ids,
        member_key=reader,
        service=data.service,
        limit=data.limit,
        offset=data.offset,
    )
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
    result = ch.update_document(
        doc_id=data.doc_id,
        author_key=author,
        service=existing["service"],
        body=merged_body,
        tags=merged_body.get("tags", []),
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
