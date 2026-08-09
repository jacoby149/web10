from pydantic import BaseModel, ConfigDict


class Token(BaseModel):
    model_config = ConfigDict(extra="allow")
    token: str | None = None


class CreateDoc(BaseModel):
    body: dict
    groups: list[str] | None = None


class UpdateDoc(BaseModel):
    body: dict
    groups: list[str] | None = None


class CreateGroup(BaseModel):
    name: str
    join_policy: str = "open"
    roles: list[dict]
    members: list[dict]


class UpdateGroup(BaseModel):
    join_policy: str | None = None
    roles: list[dict] | None = None


class AddMember(BaseModel):
    member_key: str
    role: str


class InviteMember(BaseModel):
    member_key: str
    role: str


class ServiceContract(BaseModel):
    service_name: str
    allowed_origin: str


class ReadQuery(BaseModel):
    model_config = ConfigDict(extra="allow")
    groups: list[str]
    limit: int = 50
    offset: int = 0
    sort: dict | None = None
    match: dict | None = None
