"""Tests for the D58 effective-role access model.

The gate logic (effective_role_perms + can_read/can_write/has_mgmt/readable)
is unit-tested here in isolation — the endpoint tests patch these functions to
isolate the endpoint logic. The mock provides valid group + member data (the
endpoint tests mock the clickhouse client too coarsely for this).
"""

from contextlib import ExitStack
from unittest.mock import patch

import app.v3.services.clickhouse as ch

# ---------------------------------------------------------------------------
# Mock helper
# ---------------------------------------------------------------------------


def _mock(group_roles, members):
    """Context manager that patches get_group + get_group_member to return the
    given data for 'g1'. `group_roles` is the group's roles list (new or legacy
    shape). `members` is a {member_key: role_name} map (the group_members rows
    for 'g1')."""
    group = {
        "group_id": "g1",
        "roles": group_roles,
        "join_policy": "open",
        "discoverable": False,
    }

    def fake_get_group(group_id):
        return group if group_id == "g1" else None

    def fake_get_member(group_id, member_key):
        if group_id != "g1":
            return None
        role = members.get(member_key)
        return {"member_key": member_key, "role": role} if role else None

    stack = ExitStack()
    stack.enter_context(patch.object(ch, "get_group", side_effect=fake_get_group))
    stack.enter_context(patch.object(ch, "get_group_member", side_effect=fake_get_member))
    return stack


# Role sets (new per-service-map shape unless noted).
PUBLIC_READER = [{"name": "public-reader", "permissions": {"posts": ["readAll"]}}]
AUTH_READER = [{"name": "auth-reader", "permissions": {"posts": ["readAll"]}}]
MEMBER = [{"name": "member", "permissions": {"posts": ["readAll", "create"]}}]
OWNER = [
    {
        "name": "owner",
        "permissions": {
            "*": ["readAll", "create", "updateOwn", "deleteOwn"],
            "group": ["manageRoles", "assignRoles", "revokeRoles", "deleteGroup"],
        },
    }
]
# Legacy flat shape: the owner's ops (incl. management) sit in the flat list,
# which normalizes under the '*' wildcard.
OWNER_LEGACY = [
    {
        "name": "owner",
        "services": ["*"],
        "permissions": ["readAll", "create", "updateOwn", "deleteOwn", "assignRoles", "manageRoles"],
    }
]


# ---------------------------------------------------------------------------
# _normalize_role_perms
# ---------------------------------------------------------------------------


class TestNormalizeRolePerms:
    def test_new_shape_passthrough(self):
        assert ch._normalize_role_perms({"permissions": {"posts": ["readAll"]}}) == {"posts": ["readAll"]}

    def test_new_shape_multiple_services(self):
        assert ch._normalize_role_perms({"permissions": {"posts": ["readAll"], "comments": ["readAll", "create"]}}) == {
            "posts": ["readAll"],
            "comments": ["readAll", "create"],
        }

    def test_legacy_shape_fans_out(self):
        # The flat list is applied to each listed service.
        assert ch._normalize_role_perms({"services": ["posts", "comments"], "permissions": ["readAll", "create"]}) == {
            "posts": ["readAll", "create"],
            "comments": ["readAll", "create"],
        }

    def test_legacy_shape_no_services_defaults_to_wildcard(self):
        assert ch._normalize_role_perms({"permissions": ["readAll"]}) == {"*": ["readAll"]}

    def test_empty(self):
        assert ch._normalize_role_perms({}) == {}
        assert ch._normalize_role_perms(None) == {}


# ---------------------------------------------------------------------------
# effective_role_perms (the union over principal classes)
# ---------------------------------------------------------------------------


class TestEffectiveRolePerms:
    def test_member_sees_union_of_all_classes(self):
        # bob is a member; the group grants 'anyone' a public-reader role and
        # 'bob' the member role. bob's effective role = union of both.
        with _mock(PUBLIC_READER + MEMBER, {"anyone": "public-reader", "bob": "member"}):
            perms = ch.effective_role_perms("g1", "bob", authenticated=True)
        # member role grants create; public-reader grants readAll — both present.
        assert "readAll" in perms["posts"]
        assert "create" in perms["posts"]

    def test_anon_sees_only_anyone_class(self):
        # anon (no token) belongs only to the 'anyone' class.
        with _mock(PUBLIC_READER + MEMBER, {"anyone": "public-reader", "bob": "member"}):
            perms = ch.effective_role_perms("g1", "anon", authenticated=False)
        # public-reader grants readAll on posts; no create (not a member).
        assert "readAll" in perms.get("posts", [])
        assert "create" not in perms.get("posts", [])

    def test_authenticated_class_included_when_authenticated(self):
        # A signed-in non-member gets the 'authenticated' class grant.
        with _mock(AUTH_READER, {"authenticated": "auth-reader"}):
            signed_in = ch.effective_role_perms("g1", "carol", authenticated=True)
            signed_out = ch.effective_role_perms("g1", "carol", authenticated=False)
        assert "readAll" in signed_in.get("posts", [])
        # signed-out carol has no 'authenticated' grant and isn't a member.
        assert signed_out.get("posts", []) == []

    def test_legacy_anon_key_works_during_transition(self):
        # The discover board has an 'anon' member row (not 'anyone') until the
        # backfill renames it. The public class must match both keys.
        with _mock(PUBLIC_READER, {"anon": "public-reader"}):
            perms = ch.effective_role_perms("g1", "anon", authenticated=False)
        assert "readAll" in perms.get("posts", [])

    def test_unknown_group_is_empty(self):
        with _mock(PUBLIC_READER, {"anyone": "public-reader"}):
            assert ch.effective_role_perms("nope", "bob", authenticated=True) == {}


# ---------------------------------------------------------------------------
# can_read_group / can_write_group
# ---------------------------------------------------------------------------


class TestReadWriteGates:
    def test_anon_reads_public_group(self):
        with _mock(PUBLIC_READER, {"anyone": "public-reader"}):
            assert ch.can_read_group("g1", "anon", "posts", authenticated=False) is True

    def test_anon_cannot_read_private_group(self):
        # No 'anyone' grant; only a member role. anon is not a member.
        with _mock(MEMBER, {"bob": "member"}):
            assert ch.can_read_group("g1", "anon", "posts", authenticated=False) is False

    def test_signed_in_stranger_reads_authenticated_group(self):
        with _mock(AUTH_READER, {"authenticated": "auth-reader"}):
            assert ch.can_read_group("g1", "carol", "posts", authenticated=True) is True
            assert ch.can_read_group("g1", "anon", "posts", authenticated=False) is False

    def test_member_reads_and_writes(self):
        with _mock(MEMBER, {"bob": "member"}):
            assert ch.can_read_group("g1", "bob", "posts", authenticated=True) is True
            assert ch.can_write_group("g1", "bob", "posts") is True

    def test_member_writes_service_their_role_does_not_list(self):
        # A member's role lists only posts, but membership grants write to the
        # group's content — so a persona can react/comment on the board even
        # though the board's member role lists only `posts`.
        member_posts_only = [{"name": "member", "permissions": {"posts": ["readAll", "create"]}}]
        with _mock(member_posts_only, {"bob": "member"}):
            assert ch.can_write_group("g1", "bob", "posts") is True
            assert ch.can_write_group("g1", "bob", "reactions") is True
            assert ch.can_write_group("g1", "bob", "comments") is True

    def test_bystander_cannot_write_private_group(self):
        # The attach hole: a non-member of a private group (no anyone grant)
        # cannot write to it.
        with _mock(MEMBER, {"bob": "member"}):
            assert ch.can_write_group("g1", "eve", "posts") is False

    def test_wildcard_covers_service(self):
        # owner role grants '*' → covers any service.
        with _mock(OWNER, {"alice": "owner"}):
            assert ch.can_read_group("g1", "alice", "posts", authenticated=True) is True
            assert ch.can_write_group("g1", "alice", "comments") is True

    def test_member_reads_service_their_role_does_not_grant(self):
        # A member's role only grants readAll on posts, but membership grants
        # read-all — so they can read the profile service too (the social app's
        # profile read relies on this: a follower reads a creator's profile,
        # which is in the 'profile' service, not 'posts').
        member_posts_only = [{"name": "member", "permissions": {"posts": ["readAll"]}}]
        with _mock(member_posts_only, {"bob": "member"}):
            assert ch.can_read_group("g1", "bob", "posts", authenticated=True) is True
            assert ch.can_read_group("g1", "bob", "profile", authenticated=True) is True


# ---------------------------------------------------------------------------
# has_mgmt_permission (the 'group' key + legacy '*' wildcard)
# ---------------------------------------------------------------------------


class TestHasMgmtPermission:
    def test_new_shape_group_key(self):
        with _mock(OWNER, {"alice": "owner"}):
            assert ch.has_mgmt_permission("g1", "alice", "assignRoles") is True
            assert ch.has_mgmt_permission("g1", "alice", "deleteGroup") is True
            # an op the role doesn't grant at all.
            assert ch.has_mgmt_permission("g1", "alice", "someUnknownOp") is False

    def test_legacy_shape_wildcard(self):
        # Legacy flat shape: management ops normalize under '*' — still found.
        with _mock(OWNER_LEGACY, {"alice": "owner"}):
            assert ch.has_mgmt_permission("g1", "alice", "assignRoles") is True
            assert ch.has_mgmt_permission("g1", "alice", "manageRoles") is True

    def test_member_without_mgmt_ops(self):
        with _mock(MEMBER, {"bob": "member"}):
            assert ch.has_mgmt_permission("g1", "bob", "assignRoles") is False


# ---------------------------------------------------------------------------
# readable_groups (the read-gate filter)
# ---------------------------------------------------------------------------


class TestReadableGroups:
    def test_filters_to_readable(self):
        # g1 is public (anyone can read). g2 is unknown (no group → not
        # readable). Order-preserving.
        with _mock(PUBLIC_READER, {"anyone": "public-reader"}):
            result = ch.readable_groups("anon", "posts", False, ["g1", "g2"])
        assert result == ["g1"]

    def test_preserves_order_and_drops_non_readable(self):
        with _mock(MEMBER, {"bob": "member"}):
            # bob (a member) can read g1; anon cannot.
            assert ch.readable_groups("bob", "posts", True, ["g1"]) == ["g1"]
            assert ch.readable_groups("anon", "posts", False, ["g1"]) == []
