from fastapi import APIRouter

import app.exceptions as exceptions
from app.models.auth import Token
from app.services import documentdb as db
from app.services.auth import decode_token

router = APIRouter()


@router.post("/schemas/register", tags=["schemas"])
async def register_schema(token: Token):
    """Register a new JSON Schema. Any authenticated user."""
    if not token.token:
        raise exceptions.TOKEN
    decoded = decode_token(token.token)
    if not token.query:
        raise exceptions.SCHEMA_INVALID
    name = token.query.get("name")
    schema_def = token.query.get("schema")
    if not name or not schema_def:
        raise exceptions.SCHEMA_INVALID
    return db.register_schema(decoded.username, name, schema_def)


@router.patch("/schemas/{schema_id}", tags=["schemas"])
async def get_schema(schema_id: str, token: Token):
    """Fetch a schema by ID. Anon OK."""
    doc = db.get_schema(schema_id)
    if doc is None:
        raise exceptions.SCHEMA_NOT_FOUND
    return doc


@router.put("/schemas/{schema_id}", tags=["schemas"])
async def update_schema(schema_id: str, token: Token):
    """Update a schema. Author only."""
    if not token.token:
        raise exceptions.TOKEN
    decoded = decode_token(token.token)
    if not token.update:
        raise exceptions.SCHEMA_INVALID
    result = db.update_schema(schema_id, decoded.username, token.update)
    if result is None:
        raise exceptions.NOT_AUTHOR
    return result


@router.delete("/schemas/{schema_id}", tags=["schemas"])
async def delete_schema(schema_id: str, token: Token):
    """Delete a schema. Author only."""
    if not token.token:
        raise exceptions.TOKEN
    decoded = decode_token(token.token)
    if not db.delete_schema(schema_id, decoded.username):
        raise exceptions.NOT_AUTHOR
    return {"status": "deleted"}
