from pydantic import BaseModel


class BlockUser(BaseModel):
    token: str
    blocked_key: str


class BlockUserInGroup(BaseModel):
    token: str
    group_id: str
    blocked_key: str


class SetSharing(BaseModel):
    token: str
    group_id: str
    enabled: bool
