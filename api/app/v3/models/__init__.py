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
    permissions: dict | None = None
    blocked_key: str | None = None
    enabled: bool = True
    username: str | None = None
    password: str | None = None
    new_pass: str | None = None
    phone: str | None = None
    email: str | None = None
    code: str | None = None
    site: str | None = None
    target_app_id: str | None = None
    rating: int | None = None
