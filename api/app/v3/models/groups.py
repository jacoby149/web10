from pydantic import BaseModel


class CreateGroup(BaseModel):
    token: str
    name: str
    join_policy: str = "open"
    roles: list[dict]
    members: list[dict]


class GetGroup(BaseModel):
    token: str
    group_id: str


class UpdateGroup(BaseModel):
    token: str
    group_id: str
    roles: list[dict] | None = None
    join_policy: str | None = None


class ListGroupMembers(BaseModel):
    token: str
    group_id: str


class AddGroupMember(BaseModel):
    token: str
    group_id: str
    member_key: str
    role: str


class RemoveGroupMember(BaseModel):
    token: str
    group_id: str
    member_key: str


class JoinGroup(BaseModel):
    token: str
    group_id: str


class InviteMember(BaseModel):
    token: str
    group_id: str
    member_key: str
    role: str


class AcceptInvite(BaseModel):
    token: str
    group_id: str


class DeclineInvite(BaseModel):
    token: str
    group_id: str


class LeaveGroup(BaseModel):
    token: str
    group_id: str


class ListJoinRequests(BaseModel):
    token: str
    group_id: str


class JoinRequestOp(BaseModel):
    token: str
    group_id: str
    requester_key: str


class DeleteGroup(BaseModel):
    token: str
    group_id: str
