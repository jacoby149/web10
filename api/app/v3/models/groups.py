from pydantic import BaseModel


class CreateGroup(BaseModel):
    token: str
    name: str
    join_policy: str = "open"
    roles: list[dict]
    members: list[dict]
    # D53 (amended): list the group in the public directory. Defaults to False
    # (NOT discoverable by default — listing is an opt-in). None = use the
    # default.
    discoverable: bool | None = None
    # D78: the group's generic label set (the platform stores/matches them; the
    # app decides what they mean, e.g. `web10-social-group`). Defaults to [].
    tags: list[str] | None = None
    # D80: whether who's in the group is publicly enumerable. 'public' (the
    # social graph — followers / community) or 'hidden' (dm / close-friends).
    # Defaults to 'hidden' (the conservative default).
    membership_visibility: str | None = None


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
    # D78: None = leave unchanged; a list = replace the group's tags.
    tags: list[str] | None = None


class ListMyGroups(BaseModel):
    token: str
    # D78: optional server-side tag filter — only groups carrying EVERY given
    # tag are returned (My Groups = `["web10-social-group"]`). None = all.
    tags: list[str] | None = None


class ListGroupMembers(BaseModel):
    # D80: optional — a public-visibility group's member list is anon-readable.
    # A hidden group still requires a member token.
    token: str | None = None
    group_id: str
    # D80: pagination (the followers list can be large).
    limit: int = 100
    offset: int = 0


class ListUserGroups(BaseModel):
    """D80: the public "what groups is user X in?" read (anon)."""

    user: str
    # Optional single-tag filter (the D78 tag column) — e.g. the followers tag
    # for the following-list. None = all public groups.
    tag: str | None = None
    limit: int = 50
    offset: int = 0


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
