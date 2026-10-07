"""D89: real signed credentials through HTTP, with only storage mocked."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app import settings
from app.main import app
from app.services.auth import decode_token, encode_token
from app.v3.services import clickhouse as ch

ORIGIN = "https://notes.example"
GROUP = "api.localhost/groups/users/alice/notes"


def session(kind="app", **overrides):
    claims = {
        "username": "alice",
        "provider": settings.PROVIDER,
        "credential_kind": kind,
        "site": settings.PROVIDER,
        "expires": (datetime.now(UTC) + timedelta(days=3)).isoformat(),
    }
    if kind == "app":
        claims["app_origin"] = ORIGIN
    claims.update(overrides)
    return encode_token(claims)


@pytest.fixture
def storage():
    with patch("app.v3.services.clickhouse.client"), patch("app.services.config.is_admin", return_value=True) as admin:
        with patch("app.v3.endpoints.groups.ch") as store:
            # The endpoint and helper must share the same contract store.
            with (
                patch.object(ch, "is_origin_allowed", side_effect=lambda *args: store.active),
                patch.object(ch, "get_app_permissions", side_effect=lambda *args: store.permissions),
            ):
                store.active = True
                store.permissions = {}
                store.get_group.return_value = {
                    "group_id": GROUP,
                    "roles": [],
                    "join_policy": "open",
                    "discoverable": False,
                }
                store.has_mgmt_permission.return_value = True
                store.can_moderate_service.return_value = True
                store.can_moderate_group.return_value = True
                store.get_document_any_author.return_value = {"doc_id": "d1", "service": "notes"}
                store.get_pending_requests.return_value = [
                    {"requester_key": "alice", "status": "invited", "role": "reader"}
                ]
                store.get_hidden_docs.return_value = []
                yield TestClient(app), store, admin


MANAGEMENT = [
    ("update", "manageRoles", {}),
    ("members/add", "assignRoles", {"member_key": "bob", "role": "reader"}),
    ("members/remove", "revokeRoles", {"member_key": "bob"}),
    ("invite", "assignRoles", {"member_key": "bob", "role": "reader"}),
    ("requests/join/list", "assignRoles", {}),
    ("requests/join/approve", "assignRoles", {"requester_key": "bob"}),
    ("requests/join/deny", "assignRoles", {"requester_key": "bob"}),
    ("delete", "deleteGroup", {}),
    ("sharing/set", "manageSharing", {"enabled": False}),
    ("block", "blockMembers", {"blocked_key": "bob"}),
    ("unblock", "blockMembers", {"blocked_key": "bob"}),
]


@pytest.mark.parametrize("route,operation,extra", MANAGEMENT)
@pytest.mark.parametrize("case", ["self", "granted", "missing", "revoked", "wildcard", "nonmanager", "spoofed"])
def test_management_matrix(storage, route, operation, extra, case):
    client, store, _ = storage
    store.permissions = {"group": [operation]} if case != "missing" else {}
    if case == "wildcard":
        store.permissions = {"*": [operation]}
    store.active = case != "revoked"
    store.has_mgmt_permission.return_value = case != "nonmanager"
    headers = {"origin": "https://evil.example"} if case == "spoofed" else {}
    response = client.post(
        "/v3/groups/" + route,
        json={
            "token": session("self" if case == "self" else "app"),
            "group_id": GROUP,
            **extra,
        },
        headers=headers,
    )
    assert response.status_code == (200 if case in ("self", "granted") else 401 if case == "nonmanager" else 403)
    if case in ("self", "granted", "nonmanager"):
        store.has_mgmt_permission.assert_called_with(GROUP, "alice", operation)
    else:
        store.has_mgmt_permission.assert_not_called()


@pytest.mark.parametrize(
    "route,operation",
    [("join", "joinGroup"), ("accept-invite", "joinGroup"), ("leave", "leaveGroup"), ("decline-invite", "leaveGroup")],
)
def test_membership_requires_exact_app_grant(storage, route, operation):
    client, store, _ = storage
    token = session()
    payload = {"token": token, "group_id": GROUP}
    assert client.post("/v3/groups/" + route, json=payload).status_code == 403
    store.permissions = {"group": [operation]}
    assert client.post("/v3/groups/" + route, json=payload).status_code == 200
    store.permissions = {}
    assert client.post("/v3/groups/" + route, json=payload).status_code == 403


def test_create_requires_grant_and_existing_group_role(storage):
    client, store, _ = storage
    payload = {"token": session(), "name": "notes", "roles": [], "members": []}
    store.get_group.return_value = None
    assert client.post("/v3/groups/create", json=payload).status_code == 403
    store.permissions = {"group": ["createGroup"]}
    assert client.post("/v3/groups/create", json=payload).status_code == 200
    store.get_group.return_value = {"group_id": GROUP}
    assert client.post("/v3/groups/create", json=payload).status_code == 403
    store.permissions["group"].append("assignRoles")
    store.has_mgmt_permission.return_value = False
    assert client.post("/v3/groups/create", json=payload).status_code == 401


@pytest.mark.parametrize("route", ["hide", "unhide"])
def test_service_moderation_intersection(storage, route):
    client, store, admin = storage
    payload = {"token": session(), "group_id": GROUP, "doc_id": "d1"}
    assert client.post("/v3/groups/" + route, json=payload).status_code == 403
    store.permissions = {"other": ["hideAll"]}
    assert client.post("/v3/groups/" + route, json=payload).status_code == 403
    store.permissions = {"notes": ["hideAll"]}
    assert client.post("/v3/groups/" + route, json=payload).status_code == 200
    store.can_moderate_service.return_value = False
    assert client.post("/v3/groups/" + route, json=payload).status_code == 403
    store.permissions = {"node": ["moderate"]}
    assert client.post("/v3/groups/" + route, json=payload).status_code == 200
    admin.return_value = False
    assert client.post("/v3/groups/" + route, json=payload).status_code == 403


def test_hidden_list_filters_each_service(storage):
    client, store, _ = storage
    store.permissions = {"notes": ["hideAll"]}
    store.get_hidden_docs.return_value = [{"doc_id": "d1"}, {"doc_id": "d2"}]
    store.get_document_any_author.side_effect = [{"service": "notes"}, {"service": "other"}]
    response = client.post("/v3/groups/hidden", json={"token": session(), "group_id": GROUP})
    assert response.status_code == 200
    assert response.json()["hidden"] == [{"doc_id": "d1"}]


@pytest.mark.parametrize(
    "field,capability", [("moderation_enabled", "moderate"), ("node_ad_overwrite", "manageMonetization")]
)
@pytest.mark.parametrize("case", ["self", "granted", "missing", "revoked", "nonadmin", "wildcard", "spoofed"])
def test_node_policy_matrix(storage, field, capability, case):
    client, store, admin = storage
    store.permissions = {"node": [capability]} if case != "missing" else {}
    if case == "wildcard":
        store.permissions = {"*": [capability]}
    store.active = case != "revoked"
    admin.return_value = case != "nonadmin"
    headers = {"origin": "https://evil.example"} if case == "spoofed" else {}
    with patch("app.services.config.get_config", return_value={}), patch("app.services.config.save_config") as save:
        response = client.post(
            "/config/update",
            json={
                "token": {"token": session("self" if case == "self" else "app")},
                "update": {field: True},
            },
            headers=headers,
        )
    assert response.status_code == (200 if case in ("self", "granted") else 403)
    assert save.called == (case in ("self", "granted"))


@pytest.mark.parametrize(
    "field,value",
    [
        ("admins", ["alice"]),
        ("s3_secret_key", "secret"),
        ("private_key", "secret"),
        ("provider", "evil.example"),
        ("unknown", True),
    ],
)
def test_node_grants_never_allow_arbitrary_config(storage, field, value):
    client, store, _ = storage
    store.permissions = {"node": ["moderate", "manageMonetization"]}
    with patch("app.services.config.save_config") as save:
        response = client.post("/config/update", json={"token": {"token": session()}, "update": {field: value}})
    assert response.status_code == 403
    save.assert_not_called()
    with patch(
        "app.services.config.effective_config",
        return_value={"s3_secret_key": "secret", "admins": ["alice"], "node_ad_percentage": 10},
    ):
        response = client.post("/config", json={"token": session()})
    assert response.status_code == 200
    assert response.json() == {"node_ad_percentage": 10}


def test_identity_status_is_not_authority(storage):
    client, store, admin = storage
    assert client.post("/am_admin", json={"token": session()}).json() == {"admin": True}
    admin.return_value = False
    assert client.post("/am_admin", json={"token": session()}).json() == {"admin": False}
    store.active = False
    assert client.post("/am_admin", json={"token": session()}).json() == {"admin": False}


def test_no_app_self_delegation_or_contract_mutation(storage):
    client, _, _ = storage
    token = session()
    assert client.post("/v3/delegate", json={"token": token, "app_origin": ORIGIN}).status_code == 401
    for route in ("add", "revoke", "cleanup"):
        payload = {"token": token, "allowed_origin": ORIGIN, "permissions": {"node": ["moderate"]}}
        assert (
            client.post(
                "/v3/app-contracts/" + route, json=payload, headers={"origin": "https://auth.localhost"}
            ).status_code
            == 401
        )


def test_delegation_lifetime_and_parent_bound(storage, monkeypatch):
    client, _, _ = storage
    monkeypatch.setattr(settings, "TOKEN_EXPIRE_MINUTES", 7 * 24 * 60)
    parent = session("self")
    response = client.post("/v3/delegate", json={"token": parent, "app_origin": ORIGIN})
    assert response.status_code == 200
    delegated = decode_token(response.json()["token"])
    assert delegated.credential_kind == "app"
    assert delegated.app_origin == ORIGIN
    assert delegated.expires == decode_token(parent).expires


def test_legacy_credentials_require_relogin(storage):
    client, _, _ = storage
    token = session(credential_kind=None)
    assert client.post("/v3/groups/leave", json={"token": token, "group_id": GROUP}).status_code == 401


def test_only_own_active_contract_is_visible(storage):
    client, store, _ = storage
    with patch.object(
        ch, "get_app_contracts", return_value=[{"allowed_origin": ORIGIN}, {"allowed_origin": "https://other.example"}]
    ):
        assert client.post("/v3/app-contracts/list", json={"token": session()}).json() == [{"allowed_origin": ORIGIN}]
        store.active = False
        assert client.post("/v3/app-contracts/list", json={"token": session()}).status_code == 403


def test_health_uses_signed_origin_and_detects_revocation_and_upgrade(storage):
    client, store, _ = storage
    payload = {"token": session(), "services": ["group"], "operations": ["manageRoles"]}
    with patch.object(ch, "get_user", return_value={"username": "alice"}):
        assert client.post("/v3/access/verify", json=payload).json()["contract"]["state"] == "missing"
        store.permissions = {"group": ["manageRoles"]}
        assert client.post("/v3/access/verify", json=payload).json()["status"] == "ok"
        store.active = False
        assert client.post("/v3/access/verify", json={"token": payload["token"]}).json()["status"] == "degraded"
        assert (
            client.post("/v3/access/verify", json=payload, headers={"origin": "https://evil.example"}).json()["status"]
            == "invalid"
        )


@pytest.mark.parametrize(
    "route,extra",
    [
        ("flags", {}),
        ("banned", {}),
        ("ban", {"username": "bob", "ban": True}),
        ("auto-hide", {"username": "bob", "hide": True}),
    ],
)
@pytest.mark.parametrize("case", ["self", "granted", "missing", "revoked", "nonadmin", "wildcard", "spoofed"])
def test_node_moderation_matrix(storage, route, extra, case):
    client, store, admin = storage
    store.permissions = {"node": ["moderate"]} if case != "missing" else {}
    if case == "wildcard":
        store.permissions = {"*": ["moderate"]}
    store.active = case != "revoked"
    admin.return_value = case != "nonadmin"
    headers = {"origin": "https://evil.example"} if case == "spoofed" else {}
    with (
        patch("app.v3.services.moderation.get_flags", return_value=[]),
        patch.object(ch, "get_banned_users_list", return_value=[]),
        patch.object(ch, "get_banned_users", return_value=[]),
        patch.object(ch, "ban_user") as ban,
        patch("app.services.config.get_config", return_value={}),
        patch("app.services.config.save_config") as save,
        patch.object(ch, "get_user_discover_posts", return_value=[]),
    ):
        response = client.post(
            "/v3/moderation/" + route,
            json={
                "token": session("self" if case == "self" else "app"),
                **extra,
            },
            headers=headers,
        )
    assert response.status_code == (200 if case in ("self", "granted") else 403)
    if case not in ("self", "granted"):
        ban.assert_not_called()
        save.assert_not_called()


def test_current_admin_with_group_role_can_use_node_grant(storage):
    client, store, _ = storage
    store.permissions = {"node": ["moderate"]}
    assert (
        client.post("/v3/groups/hide", json={"token": session(), "group_id": GROUP, "doc_id": "d1"}).status_code == 200
    )


def test_mixed_config_requires_both_capabilities(storage):
    client, store, _ = storage
    payload = {"token": {"token": session()}, "update": {"moderation_enabled": True, "node_ad_overwrite": True}}
    with patch("app.services.config.get_config", return_value={}), patch("app.services.config.save_config") as save:
        store.permissions = {"node": ["moderate"]}
        assert client.post("/config/update", json=payload).status_code == 403
        save.assert_not_called()
        store.permissions["node"].append("manageMonetization")
        assert client.post("/config/update", json=payload).status_code == 200


def test_login_always_mints_self(storage):
    client, _, _ = storage
    with patch.object(ch, "authenticate_user", return_value=True):
        response = client.post(
            "/v3/login",
            json={"username": "alice", "password": "password", "credential_kind": "app", "app_origin": ORIGIN},
        )
    decoded = decode_token(response.json()["token"])
    assert decoded.credential_kind == "self"
    assert decoded.app_origin is None


def test_node_inventory_requires_current_author_authority():
    import json
    from unittest.mock import MagicMock

    result = MagicMock(
        result_rows=[
            ("operator-ad", "alice", json.dumps({"status": "active"}), ["ad", "node_ad"]),
            ("forged-ad", "bob", json.dumps({"status": "active"}), ["ad", "node_ad"]),
        ]
    )
    with (
        patch.object(ch, "client") as client,
        patch("app.services.config.list_admins", return_value=["alice"]),
    ):
        client.query.return_value = result
        assert [ad["doc_id"] for ad in ch.get_active_node_ads()] == ["operator-ad"]
    with patch.object(ch, "client") as client, patch("app.services.config.list_admins", return_value=[]):
        client.query.return_value = result
        assert ch.get_active_node_ads() == []
