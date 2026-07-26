from fastapi import APIRouter, Query

import app.exceptions as exceptions
from app.models.auth import Token
from app.services import documentdb as db
from app.services.auth import decode_token

router = APIRouter()


@router.post("/public/entries", tags=["public"])
async def create_public_entry(token: Token):
    """Create a public ledger entry. Any authenticated user.

    Validates payload against the registered schema if one exists.
    """
    if not token.token:
        raise exceptions.TOKEN
    decoded = decode_token(token.token)
    if not token.query:
        raise exceptions.SCHEMA_INVALID
    schema_id = token.query.get("schema_id")
    target = token.query.get("target", "")
    payload = token.query.get("payload", {})
    if not schema_id:
        raise exceptions.SCHEMA_INVALID
    # Validate payload against schema if it exists
    schema_doc = db.get_schema(schema_id)
    if schema_doc is None:
        raise exceptions.SCHEMA_NOT_FOUND
    # Basic schema validation: check required fields
    schema_def = schema_doc.get("schema", {})
    required = schema_def.get("required", [])
    for field in required:
        if field not in payload:
            raise exceptions.SCHEMA_INVALID
    return db.create_public_entry(decoded.username, schema_id, target, payload)


@router.patch("/public/entries", tags=["public"])
async def query_public_entries(
    schema_id: str | None = Query(None),
    target: str | None = Query(None),
    author: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    """Query the public ledger. Anon OK.

    Filter by schema_id, target, author via query params.
    """
    return db.query_public_entries(
        schema_id=schema_id,
        target=target,
        author=author,
        limit=limit,
        skip=skip,
    )


@router.put("/public/entries/{entry_id}", tags=["public"])
async def update_public_entry(entry_id: str, token: Token):
    """Update a public ledger entry. Author only."""
    if not token.token:
        raise exceptions.TOKEN
    decoded = decode_token(token.token)
    if not token.update:
        raise exceptions.SCHEMA_INVALID
    updates = token.update.get("payload", token.update)
    result = db.update_public_entry(entry_id, decoded.username, updates)
    if result is None:
        raise exceptions.NOT_AUTHOR
    return result


@router.delete("/public/entries/{entry_id}", tags=["public"])
async def delete_public_entry(entry_id: str, token: Token):
    """Delete a public ledger entry. Author only."""
    if not token.token:
        raise exceptions.TOKEN
    decoded = decode_token(token.token)
    if not db.delete_public_entry(entry_id, decoded.username):
        raise exceptions.NOT_AUTHOR
    return {"status": "deleted"}
