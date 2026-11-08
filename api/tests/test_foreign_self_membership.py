"""Certified foreign membership never borrows the receiving node's namesake."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

from app import settings
from app.main import app
from app.services import auth
from app.v3.services import clickhouse as ch

HOME = "home.example"
FOREIGN = f"{HOME}/users/alice"
HOME_KEY = "independent-home-key-not-the-receiving-node-key-32-bytes"
GROUP = f"{settings.PROVIDER}/groups/users/alice/followers"


def credential(local=False, expired=False):
    return jwt.encode(
        {
            "username": "alice",
            "provider": settings.PROVIDER if local else HOME,
            "target": settings.PROVIDER if local else HOME,
            "expires": (datetime.now(UTC) + timedelta(hours=-1 if expired else 1)).isoformat(),
        },
        settings.PRIVATE_KEY if local else HOME_KEY,
        algorithm=settings.ALGORITHM,
    )


@pytest.fixture
def store():
    auth.clear_remote_certify_cache()
    members, requests = {"alice": "owner"}, {}
    state = {"policy": "open", "certified": True, "members": members, "requests": requests}

    def resolve(_group, key, status):
        requests.pop(key, None)

    with (
        patch.object(ch, "client"),
        patch.object(ch, "ensure_discover_group"),
        patch.object(auth, "certify_with_remote_provider", side_effect=lambda _: state["certified"]) as certify,
        patch.object(ch, "get_group", side_effect=lambda _: {"join_policy": state["policy"]}),
        patch.object(ch, "add_group_member", side_effect=lambda _, key, role: members.update({key: role})),
        patch.object(ch, "remove_group_member", side_effect=lambda _, key: members.pop(key, None)),
        patch.object(ch, "create_join_request", side_effect=lambda _, key, status: requests.update({key: status})),
        patch.object(ch, "has_pending_or_invited_request", side_effect=lambda _, key: key in requests),
        patch.object(
            ch,
            "get_pending_requests",
            side_effect=lambda _: [
                {"requester_key": key, "role": "member", "status": status} for key, status in requests.items()
            ],
        ),
        patch.object(ch, "resolve_join_request", side_effect=resolve),
        patch.object(
            ch,
            "get_user_groups",
            side_effect=lambda key, tags: [{"group_id": GROUP, "my_role": members[key]}] if key in members else [],
        ) as listing,
        patch.object(ch, "heal_followers_group_owner") as heal,
        TestClient(app, raise_server_exceptions=False) as client,
    ):
        yield state, client, certify, listing, heal
    auth.clear_remote_certify_cache()


def post(client, action, token, **body):
    return client.post(f"/v3/groups/{action}", json={"token": token, "group_id": GROUP, **body})


@pytest.mark.parametrize("local", [False, True])
def test_open_join_list_leave_rejoin_preserves_exact_identity(store, local):
    state, client, certify, listing, heal = store
    token, key = credential(local), "alice" if local else FOREIGN
    response = post(client, "join", token)
    assert response.status_code == 200
    assert response.json()["member_key"] == key
    assert state["members"][key] == "member"
    assert post(client, "get", token).status_code == 200
    response = post(client, "list", token)
    assert response.status_code == 200 and len(response.json()) == 1
    assert listing.call_args.args[0] == key
    if local:
        heal.assert_called_once_with(GROUP, "alice")
        certify.assert_not_called()
    else:
        heal.assert_not_called()
        assert state["members"]["alice"] == "owner"
        certify.assert_called_once()
    assert post(client, "leave", token).status_code == 200
    assert key not in state["members"]
    assert post(client, "list", token).json() == []
    assert post(client, "join", token).status_code == 200
    assert key in state["members"]


def test_foreign_list_does_not_enumerate_or_heal_local_namesake(store):
    state, client, _, listing, heal = store
    response = post(client, "list", credential())
    assert response.status_code == 200 and response.json() == []
    listing.assert_called_once_with(FOREIGN, None)
    heal.assert_not_called()
    assert state["members"] == {"alice": "owner"}


@pytest.mark.parametrize("policy", ["request", "closed"])
def test_request_and_closed_join_do_not_become_memberships(store, policy):
    state, client, _, _, _ = store
    state["policy"] = policy
    response = post(client, "join", credential())
    assert response.status_code == (200 if policy == "request" else 401)
    assert state["requests"] == ({FOREIGN: "pending"} if policy == "request" else {})
    assert state["members"] == {"alice": "owner"}


@pytest.mark.parametrize("action", ["accept-invite", "decline-invite"])
def test_foreign_cannot_consume_namesake_invite_then_can_consume_own(store, action):
    state, client, _, _, _ = store
    state["requests"]["alice"] = "invited"
    token = credential()
    assert post(client, action, token).status_code == 401
    assert state["requests"] == {"alice": "invited"}
    state["requests"][FOREIGN] = "invited"
    assert post(client, action, token).status_code == 200
    assert state["requests"] == {"alice": "invited"}
    assert (FOREIGN in state["members"]) == (action == "accept-invite")
    assert state["members"]["alice"] == "owner"


@pytest.mark.parametrize("local", [False, True])
def test_requester_cannot_self_approve_pending_join(store, local):
    state, client, _, _, _ = store
    state["policy"] = "request"
    token, key = credential(local), "alice" if local else FOREIGN
    state["members"].pop(key, None)
    assert post(client, "join", token).status_code == 200
    assert state["requests"][key] == "pending"
    assert post(client, "accept-invite", token).status_code == 401
    assert key not in state["members"] and state["requests"][key] == "pending"


@pytest.mark.parametrize("action", ["join", "list", "leave", "get", "accept-invite", "decline-invite"])
@pytest.mark.parametrize("failure", ["denied", "local-key-denied", "expired", "malformed"])
def test_failed_certification_cannot_read_or_change_memberships(store, action, failure):
    state, client, _, listing, heal = store
    state["certified"] = failure not in ("denied", "local-key-denied")
    token = "not-a-token" if failure == "malformed" else credential(expired=failure == "expired")
    if failure == "local-key-denied":
        token = jwt.encode(
            jwt.decode(token, options={"verify_signature": False}), settings.PRIVATE_KEY, algorithm=settings.ALGORITHM
        )
    response = post(client, action, token)
    assert response.status_code == 401
    assert state["members"] == {"alice": "owner"} and not state["requests"]
    listing.assert_not_called()
    heal.assert_not_called()
