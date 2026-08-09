from pydantic import BaseModel, ConfigDict


class Token(BaseModel):
    """Single request body — token + all payload data."""
    model_config = ConfigDict(extra="allow")
    token: str | None = None
    user: str | None = None
    collection: str | None = None
    doc_id: str | None = None
    body: dict | None = None
    groups: list[str] | None = None
    limit: int = 50
    offset: int = 0
    sort: dict | None = None
    match: dict | None = None
    name: str | None = None
    join_policy: str | None = None
    roles: list[dict] | None = None
    members: list[dict] | None = None
    member_key: str | None = None
    role: str | None = None
    group_id: str | None = None
    service_name: str | None = None
    allowed_origin: str | None = None
    blocked_key: str | None = None
    enabled: bool = True
