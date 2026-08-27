from pydantic import BaseModel


class CreateDocument(BaseModel):
    """Create a document in a service. User from JWT. Server generates doc_id."""

    token: str
    service: str
    body: dict
    groups: list[str] | None = None
    # The ref pattern: a reaction/comment points at its target post via
    # ref_value (the target's doc_id). Discovery engagement (get_ref_counts)
    # and the social app's reaction/comment reads both key off this column.
    ref_value: str | None = None


class ReadDocuments(BaseModel):
    """Read documents. doc_id for single read, groups for discover, 'me' for own docs.

    `token` is optional: a missing token reads as the node's `anon` member,
    which is what makes the discover group (the public board) anon-readable
    through the normal group-read path. Discovery IS a group read in v3 —
    there is no separate discover endpoint.
    """

    token: str | None = None
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
