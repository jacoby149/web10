from pydantic import BaseModel


class CreateDocument(BaseModel):
    """Create a document in a service. User from JWT. Server generates doc_id."""

    token: str
    service: str
    body: dict
    groups: list[str] | None = None


class ReadDocuments(BaseModel):
    """Read documents. doc_id for single read, groups for discover, 'me' for own docs."""

    token: str
    service: str
    doc_id: str | None = None
    groups: list[str] | None = None
    limit: int = 50
    offset: int = 0
    match: dict | None = None


class UpdateDocument(BaseModel):
    """Update a document. Body is merged. Groups replaced if provided."""

    token: str
    doc_id: str
    body: dict
    groups: list[str] | None = None


class DeleteDocument(BaseModel):
    """Delete (tombstone) a document."""

    token: str
    doc_id: str
