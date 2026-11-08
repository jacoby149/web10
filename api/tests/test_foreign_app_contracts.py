"""Serving-node app grants belong to a certified principal, not its namesake."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app import settings
from app.services import auth
from app.v3.services import clickhouse as ch
from tests.test_foreign_self_membership import FOREIGN, credential

APP = "https://social.example"
AUTH = "https://auth.home.example"
PERMISSIONS = {"posts": ["readAll"]}


@pytest.fixture
def contracts():
    from app.main import app

    auth.clear_remote_certify_cache()
    rows = {("alice", APP): PERMISSIONS.copy()}
    state = {"certified": True, "groups": True, "rows": rows}

    def add(user, origin, permissions):
        rows[user, origin] = permissions
        return {"allowed_origin": origin, "permissions": permissions}

    def revoke(user, origin, **kwargs):
        rows.pop((user, origin), None)

    with (
        patch.object(settings, "CORS_SERVICE_MANAGERS", ["auth.home.example"]),
        patch.object(ch, "client"),
        patch.object(ch, "add_app_contract", side_effect=add),
        patch.object(
            ch,
            "get_app_contracts",
            side_effect=lambda user: [
                {"allowed_origin": origin, "permissions": permissions}
                for (owner, origin), permissions in rows.items()
                if owner == user
            ],
        ),
        patch.object(ch, "revoke_app_contract", side_effect=revoke),
        patch.object(ch, "get_app_permissions", side_effect=lambda user, origin, **_: rows.get((user, origin), {})),
        patch.object(ch, "readable_groups", side_effect=lambda *args: ["g"] if state["groups"] else []),
        patch.object(ch, "execute_query", return_value=(["doc_id"], [("d",)])) as execute,
        patch.object(auth, "certify_with_remote_provider", side_effect=lambda _: state["certified"]),
    ):
        with TestClient(app, raise_server_exceptions=False) as client:
            yield state, client, execute
    auth.clear_remote_certify_cache()


def manage(client, action, token, origin=AUTH):
    return client.post(
        f"/v3/app-contracts/{action}",
        headers={"Origin": origin},
        json={
            "token": token,
            "allowed_origin": APP,
            "permissions": PERMISSIONS,
        },
    )


def query(client, token):
    return client.post(
        "/v3/query",
        headers={"Origin": APP},
        json={
            "token": token,
            "sql": "SELECT doc_id FROM posts",
            "groups": ["g"],
        },
    )


def test_foreign_grant_and_revocation_never_borrow_local_namesake(contracts):
    state, client, execute = contracts
    token = credential()
    assert query(client, token).status_code == 403
    execute.assert_not_called()
    assert manage(client, "list", token).json() == []
    assert manage(client, "add", token).status_code == 200
    assert (FOREIGN, APP) in state["rows"]
    assert manage(client, "list", token).json() == [{"allowed_origin": APP, "permissions": PERMISSIONS}]
    assert query(client, token).status_code == 200
    state["groups"] = False
    assert query(client, token).status_code == 403
    state["groups"] = True
    assert manage(client, "revoke", token).status_code == 200
    assert query(client, token).status_code == 403
    assert state["rows"] == {("alice", APP): PERMISSIONS}


@pytest.mark.parametrize("origin", [APP, "https://auth.untrusted.example"])
@pytest.mark.parametrize("action", ["add", "revoke"])
def test_untrusted_browser_cannot_manage_foreign_grants(contracts, action, origin):
    state, client, _ = contracts
    assert manage(client, action, credential(), origin).status_code == 403
    assert state["rows"] == {("alice", APP): PERMISSIONS}


@pytest.mark.parametrize("action", ["add", "list", "revoke"])
@pytest.mark.parametrize("failure", ["denied", "local-key-denied", "expired", "malformed"])
def test_bad_home_certification_cannot_read_or_change_grants(contracts, action, failure):
    state, client, _ = contracts
    state["certified"] = failure not in ("denied", "local-key-denied")
    token = "invalid" if failure == "malformed" else credential(expired=failure == "expired")
    if failure == "local-key-denied":
        import jwt

        token = jwt.encode(
            jwt.decode(token, options={"verify_signature": False}), settings.PRIVATE_KEY, algorithm=settings.ALGORITHM
        )
    assert manage(client, action, token).status_code == 401
    assert state["rows"] == {("alice", APP): PERMISSIONS}


def test_foreign_delegated_token_cannot_expand_its_own_grants(contracts):
    import jwt

    from tests.test_foreign_self_membership import HOME_KEY

    state, client, _ = contracts
    payload = jwt.decode(credential(), options={"verify_signature": False})
    token = jwt.encode({**payload, "client_id": "delegated-app"}, HOME_KEY, algorithm=settings.ALGORITHM)
    for action in ("add", "revoke", "cleanup"):
        assert manage(client, action, token).status_code == 403
    assert state["rows"] == {("alice", APP): PERMISSIONS}


def test_local_grants_keep_bare_identity(contracts):
    state, client, _ = contracts
    assert manage(client, "add", credential(local=True)).status_code == 200
    assert state["rows"] == {("alice", APP): PERMISSIONS}
