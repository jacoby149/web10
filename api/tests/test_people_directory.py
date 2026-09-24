"""Tests for the D0 public people directory (node composition + endpoint).

The I3 floor this pins:
  * anon sees only the public subset (followers groups with an ``anyone``
    grant on ``profile``); a signed-in reader sees more (their follows + the
    public subset) — same card shape, different permissions;
  * the I3 read-gate is the access boundary — a user whose followers group the
    reader cannot read is ABSENT (carol's private group, eve's private group
    for anon);
  * a user with no profile face is STILL listed (username-only face) — a
    username + follower count is public identity, so a fresh account is
    discoverable from birth (the directory doesn't read empty until every user
    opens their profile);
  * the follower count is the membership aggregate ``count(group_members)``
    on the followers group, not a stored field (unspoofable);
  * ``mutuals`` is how many of a user's followers the reader also follows
    (the "N mutuals" signal) — 0 for anon (no following).
"""

import json
from datetime import datetime, timedelta
from unittest.mock import patch

import jwt
from fastapi.testclient import TestClient

import app.settings as settings
import app.v3.services.clickhouse as ch
from app.main import app as fastapi_app

PROVIDER = settings.PROVIDER


def fgid(username: str) -> str:
    return f"{PROVIDER}/groups/users/{username}/followers"


def _rows(rows):
    mock = type("R", (), {})()
    mock.result_rows = rows
    return mock


def _make_token(username="carol") -> str:
    payload = {
        "username": username,
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": (datetime.utcnow() + timedelta(minutes=60)).isoformat(),
    }
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


# Role definitions (per-service map shape, D58).
OWNER = {
    "name": "owner",
    "permissions": {
        "*": ["readAll", "create", "updateOwn", "updateAll", "deleteOwn", "deleteAll", "hideAll"],
        "group": ["manageRoles", "assignRoles", "revokeRoles", "deleteGroup"],
    },
}
MEMBER = {"name": "member", "permissions": {"posts": ["readAll"]}}
PUBLIC_READER = {"name": "public-reader", "permissions": {"profile": ["readAll"]}}

# Scenario:
#   alice — public (anyone→public-reader), has profile, 5 followers
#   bob   — public (anyone→public-reader), has profile, 10 followers
#   carol — private (no anyone grant), has profile, 3 followers
#   dave  — public (anyone→public-reader), NO profile doc, 2 followers
#   eve   — private (no anyone grant), has profile, 7 followers
# carol (the signed-in reader) follows alice and eve (is a member of their
# followers groups) and owns her own.
PUBLIC_ROLES = [OWNER, MEMBER, PUBLIC_READER]
PRIVATE_ROLES = [OWNER, MEMBER]

FACES = {
    "alice": {"display_name": "Alice", "bio": "hi"},
    "bob": {"display_name": "Bob", "bio": "yo"},
    "carol": {"display_name": "Carol", "bio": "me"},
    "eve": {"display_name": "Eve", "bio": "quiet"},
}  # dave has no profile face
COUNTS = {"alice": 5, "bob": 10, "carol": 3, "dave": 2, "eve": 7}


def _dispatch(reader: str, authenticated: bool):
    """Build a client.query side_effect for the D0 composition scenario."""
    member_groups = {
        "anon": set(),
        "carol": {fgid("carol"), fgid("alice"), fgid("eve")},
    }[reader]
    # anyone-grant groups (public profiles): alice, bob, dave.
    class_roles = [
        (fgid("alice"), "anyone", "public-reader"),
        (fgid("bob"), "anyone", "public-reader"),
        (fgid("dave"), "anyone", "public-reader"),
    ]
    role_defs = {
        fgid("alice"): PUBLIC_ROLES,
        fgid("bob"): PUBLIC_ROLES,
        fgid("carol"): PRIVATE_ROLES,
        fgid("dave"): PUBLIC_ROLES,
        fgid("eve"): PRIVATE_ROLES,
    }
    # Who follows each user (the members of their followers group) — the input
    # to the mutuals computation (mutuals(X) = |followers(X) ∩ reader-following|).
    followers_of = {
        "alice": ["carol", "eve", "bob"],
        "bob": ["carol", "alice"],
        "carol": ["bob"],
        "dave": ["bob"],
        "eve": ["carol", "alice", "dave"],
    }
    # The reader's following set (the followers groups they're a member of).
    reader_following = {
        "anon": set(),
        "carol": {fgid("alice"), fgid("eve")},
    }[reader]

    def dispatch(sql, params=None):
        if "count() AS cnt" in sql:
            return _rows([(fgid(u), COUNTS[u]) for u in COUNTS])
        if "AS mutuals" in sql:
            fk = set(params["fk"])
            return _rows([(fgid(u), sum(1 for f in followers_of[u] if f in fk)) for u in followers_of])
        if "group_id LIKE '%/followers'" in sql:
            return _rows([(g,) for g in reader_following])
        if "p.doc_id AS doc_id" in sql:
            return _rows(
                [(f"doc-{u}", u, json.dumps(FACES[u]), [], "2026-01-01T00:00:00", "", "none", "") for u in FACES]
            )
        if "FROM group_members WHERE member_key = %(member_key)s" in sql:
            return _rows([(g,) for g in member_groups])
        if "FROM group_members WHERE member_key IN" in sql:
            return _rows(class_roles)
        if "FROM group_contracts WHERE group_id IN" in sql:
            return _rows([(g, json.dumps(roles)) for g, roles in role_defs.items()])
        if "FROM users) WHERE rn = 1" in sql:
            return _rows([("alice",), ("bob",), ("carol",), ("dave",), ("eve",)])
        raise AssertionError(f"unexpected query: {sql}")

    return dispatch


class TestListPublicUsersComposition:
    """The node-side composition: list_users -> I3 gate -> faces -> counts ->
    rank -> page. Mocked at the ClickHouse client boundary so the real I3 gate
    and ranking logic run."""

    def test_anon_sees_only_public_subset(self):
        with patch.object(ch, "client") as mock_client:
            mock_client.query.side_effect = _dispatch("anon", False)
            result = ch.list_public_users("anon", False, limit=20, offset=0)
        # anon: alice (5) + bob (10) + dave (2, public, no face -> username-only
        # face) are public; carol/eve private (absent). Ranked by follower count
        # desc. Anon has no following -> mutuals 0.
        assert [r["username"] for r in result] == ["bob", "alice", "dave"]
        assert [r["follower_count"] for r in result] == [10, 5, 2]
        assert [r["mutuals"] for r in result] == [0, 0, 0]

    def test_anon_excludes_private(self):
        with patch.object(ch, "client") as mock_client:
            mock_client.query.side_effect = _dispatch("anon", False)
            result = ch.list_public_users("anon", False, limit=20, offset=0)
        usernames = {r["username"] for r in result}
        # I3: carol + eve (private followers groups) are absent.
        assert "carol" not in usernames
        assert "eve" not in usernames

    def test_faceless_user_listed_with_username_face(self):
        """A public user with no profile face is still listed (username-only
        face) — the directory doesn't read empty until every user has a face."""
        with patch.object(ch, "client") as mock_client:
            mock_client.query.side_effect = _dispatch("anon", False)
            result = ch.list_public_users("anon", False, limit=20, offset=0)
        by_user = {r["username"]: r for r in result}
        assert "dave" in by_user
        assert by_user["dave"]["profile"]["display_name"] == "dave"

    def test_signed_in_sees_more_than_anon(self):
        with patch.object(ch, "client") as mock_client:
            mock_client.query.side_effect = _dispatch("carol", True)
            result = ch.list_public_users("carol", True, limit=20, offset=0)
        usernames = [r["username"] for r in result]
        # carol follows eve (private) -> sees her; anon could not. carol also
        # sees herself (owner of her own followers group).
        assert "eve" in usernames
        assert "carol" in usernames
        # still ranked by follower count desc.
        assert usernames == ["bob", "eve", "alice", "carol", "dave"]
        assert [r["follower_count"] for r in result] == [10, 7, 5, 3, 2]

    def test_mutuals_is_reader_following_intersection(self):
        """mutuals(X) = |followers(X) ∩ reader-following|. carol follows alice
        + eve: alice's followers {carol,eve,bob} ∩ {alice,eve} = {eve} = 1;
        eve's followers {carol,alice,dave} ∩ {alice,eve} = {alice} = 1; bob's
        followers {carol,alice} ∩ {alice,eve} = {alice} = 1; carol/dave 0."""
        with patch.object(ch, "client") as mock_client:
            mock_client.query.side_effect = _dispatch("carol", True)
            result = ch.list_public_users("carol", True, limit=20, offset=0)
        by_user = {r["username"]: r["mutuals"] for r in result}
        assert by_user["alice"] == 1
        assert by_user["eve"] == 1
        assert by_user["bob"] == 1
        assert by_user["carol"] == 0
        assert by_user["dave"] == 0

    def test_follower_count_is_membership_aggregate(self):
        """The count comes from count(group_members), not a stored field."""
        with patch.object(ch, "client") as mock_client:
            mock_client.query.side_effect = _dispatch("anon", False)
            result = ch.list_public_users("anon", False, limit=20, offset=0)
        by_user = {r["username"]: r["follower_count"] for r in result}
        # Matches the group_members aggregate exactly (bob 10, alice 5, dave 2).
        assert by_user == {"bob": 10, "alice": 5, "dave": 2}

    def test_profile_face_is_returned(self):
        with patch.object(ch, "client") as mock_client:
            mock_client.query.side_effect = _dispatch("anon", False)
            result = ch.list_public_users("anon", False, limit=20, offset=0)
        by_user = {r["username"]: r for r in result}
        assert by_user["alice"]["profile"]["display_name"] == "Alice"
        assert by_user["bob"]["profile"]["bio"] == "yo"

    def test_limit_and_offset_page(self):
        with patch.object(ch, "client") as mock_client:
            mock_client.query.side_effect = _dispatch("carol", True)
            page = ch.list_public_users("carol", True, limit=2, offset=1)
        # full order: bob(10), eve(7), alice(5), carol(3); page 2 of size 2
        assert [r["username"] for r in page] == ["eve", "alice"]


class TestPeopleDirectoryEndpoint:
    """Endpoint floor: principal resolution + response shape."""

    def test_anon_no_token_reads_as_anon(self):
        with patch.object(
            ch, "list_public_users", return_value=[{"username": "bob", "follower_count": 10, "profile": {}}]
        ) as m:
            with TestClient(fastapi_app) as c:
                resp = c.post("/v3/users/directory", json={"limit": 20, "offset": 0})
        assert resp.status_code == 200
        data = resp.json()
        assert data["limit"] == 20
        assert data["offset"] == 0
        assert data["users"][0]["username"] == "bob"
        # anon principal, not authenticated
        m.assert_called_once_with("anon", False, 20, 0)

    def test_signed_in_token_reads_as_user(self):
        token = _make_token("carol")
        with patch.object(ch, "list_public_users", return_value=[]) as m:
            with TestClient(fastapi_app) as c:
                resp = c.post("/v3/users/directory", json={"token": token, "limit": 5, "offset": 0})
        assert resp.status_code == 200
        assert resp.json()["users"] == []
        m.assert_called_once_with("carol", True, 5, 0)

    def test_invalid_token_rejected(self):
        with patch.object(ch, "list_public_users", return_value=[]):
            with TestClient(fastapi_app) as c:
                resp = c.post("/v3/users/directory", json={"token": "not-a-real-jwt"})
        # a present-but-invalid token is not silently downgraded to anon
        assert resp.status_code == 401
