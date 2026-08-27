from pydantic import BaseModel


class CreateGroup(BaseModel):
    token: str
    name: str
    join_policy: str = "open"
    roles: list[dict]
    members: list[dict]
    # D53: list the group in the public directory. Defaults to True (discoverable
    # by default) except invite_only groups, which default to False. None = use
    # the default.
    discoverable: bool | None = None


class GetGroup(BaseModel):
    token: str
    group_id: str


class UpdateGroup(BaseModel):
    token: str
    group_id: str
    roles: list[dict] | None = None
    join_policy: str | None = None
    # D53: None = leave unchanged; True/False = set.
    discoverable: bool | None = None


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


# ── Moderation (hide content from a group's discover) ───────────────────────
# The KB (groups/overview.md "Moderation"): a role with `hideAll` can hide
# content from the group's discover. The node admin can also moderate any
# group (the public board has no moderator role). Hiding is board-level
# takedown — the author's own copy is untouched and the doc is restorable.


class HideDoc(BaseModel):
    token: str
    group_id: str
    doc_id: str
    reason: str | None = None


class UnhideDoc(BaseModel):
    token: str
    group_id: str
    doc_id: str


class ListHiddenDocs(BaseModel):
    token: str
    group_id: str
