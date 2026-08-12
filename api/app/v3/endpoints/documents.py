from fastapi import APIRouter, HTTPException, Request

import app.exceptions as exceptions
from app.v3.endpoints.auth_helper import user as _user
from app.v3.models import CreateDocument, DeleteDocument, ReadDocuments, UpdateDocument
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["documents"])


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
async def create_document(request: Request, data: CreateDocument):
    """Create a document in a service. User from JWT. Server generates doc_id."""
    author = _user(data)
    _check_app_permission(request, author, data.service, "create")
    result = ch.insert_document(
        author_key=author,
        service=data.service,
        body=data.body,
        tags=data.body.get("tags", []),
    )
    doc_id = result["doc_id"]

    if data.groups:
        ch.attach_doc_to_groups(doc_id, data.groups)
        result["groups"] = data.groups

    return result


@router.post("/read")
async def read_documents(request: Request, data: ReadDocuments):
    """Read documents. doc_id for single read, groups for discover, 'me' for own docs."""
    reader = _user(data)
    _check_app_permission(request, reader, data.service, "readAll")

    if data.doc_id:
        doc = ch.read_document_by_id(data.doc_id, reader, data.service)
        if not doc:
            raise exceptions.ENTRY_NOT_FOUND
        return ch.resolve_media_urls_in_docs([doc])[0]

    if not data.groups:
        raise exceptions.CRUD

    if "me" in data.groups:
        user_groups = ch.get_user_groups(reader)
        group_ids = [g["group_id"] for g in user_groups]
    else:
        group_ids = data.groups

    docs = ch.read_documents_in_groups(
        group_ids=group_ids,
        member_key=reader,
        service=data.service,
        limit=data.limit,
        offset=data.offset,
    )
    return ch.resolve_media_urls_in_docs(docs)


@router.post("/update")
async def update_document(request: Request, data: UpdateDocument):
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
async def delete_document(request: Request, data: DeleteDocument):
    """Tombstone a document and its group attachments."""
    author = _user(data)
    existing = ch.get_document(data.doc_id, author)
    if not existing:
        raise exceptions.ENTRY_NOT_FOUND
    _check_app_permission(request, author, existing["service"], "deleteOwn")

    ch.delete_document(data.doc_id, author, existing["service"])
    ch.detach_doc_from_groups(data.doc_id)
    return {"doc_id": data.doc_id, "status": "deleted"}
