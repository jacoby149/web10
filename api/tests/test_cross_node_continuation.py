"""Regressions recovered from PR #1351's interrupted continuation."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app
from app.models.auth import Token
from app.services import auth
from app.v3.endpoints import auth_helper, groups
from app.v3.endpoints.users import list_people_directory
from app.v3.models import ListPeopleDirectory
from app.v3.services import clickhouse as ch

HOME = "https://home.example"
HOME_KEY = "independent-home-node-key-at-least-32-bytes"


def token(provider=HOME, key=HOME_KEY, expires=None):
    return jwt.encode(
        {
            "username": "alice",
            "provider": provider,
            "target": provider,
            "expires": expires or (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
        },
        key,
        algorithm=settings.ALGORITHM,
    )


@pytest.fixture(autouse=True)
def clear_cache():
    auth.clear_remote_certify_cache()
    yield
    auth.clear_remote_certify_cache()


def test_certify_accepts_independently_signed_home_token():
    credential = token()
    with patch.object(auth, "certify_with_remote_provider", return_value=True) as remote:
        assert auth.certify(Token(token=credential)) is True
        assert auth.certify(Token(token=credential)) is True
    remote.assert_called_once_with(Token(token=credential))


@pytest.mark.parametrize("helper", [auth_helper.principal, auth_helper.user_or_anon, auth_helper.client_id_of])
def test_foreign_provider_cannot_bypass_home_denial_using_local_key(helper):
    credential = token(key=settings.PRIVATE_KEY)
    with patch.object(auth, "certify_with_remote_provider", return_value=False) as remote:
        with pytest.raises(Exception):
            helper(SimpleNamespace(token=credential))
    remote.assert_called_once()


def test_local_reader_keeps_existing_membership_key_until_migration():
    data = SimpleNamespace(token=token(provider=settings.PROVIDER, key=settings.PRIVATE_KEY))
    assert auth_helper.principal(data) == "alice"


def test_open_join_keeps_local_key_used_by_list_leave_and_revocation():
    data = SimpleNamespace(token=token(provider=settings.PROVIDER, key=settings.PRIVATE_KEY), group_id="private-group")
    with (
        patch.object(groups.ch, "get_group", return_value={"join_policy": "open"}),
        patch.object(groups.ch, "add_group_member") as add,
    ):
        result = groups.join_group(data)
    add.assert_called_once_with("private-group", "alice", "member")
    assert result["member_key"] == "alice"


def test_certify_endpoint_never_recursively_forwards_foreign_tokens():
    with (
        patch("app.v3.services.clickhouse.client"),
        patch.object(auth, "certify_with_remote_provider", return_value=True) as remote,
    ):
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post("/certify", json={"token": token(key=settings.PRIVATE_KEY)})
    assert response.status_code == 401
    remote.assert_not_called()


@pytest.mark.parametrize("route", ["/v3/query", "/v3/read"])
def test_foreign_reader_never_borrows_local_namesake_app_contract(route):
    # A's alice is not B's alice, even if B's alice has granted this app.
    with (
        patch("app.v3.services.clickhouse.client"),
        patch.object(auth, "certify_with_remote_provider", return_value=True),
        patch("app.v3.services.clickhouse.get_app_permissions", return_value={}) as permissions,
        patch("app.v3.services.clickhouse.has_permission", return_value=False) as has_permission,
    ):
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                route,
                json={"token": token(), "sql": "SELECT doc_id FROM posts", "service": "posts", "groups": ["g1"]},
                headers={"Origin": "https://app.example"},
            )
    assert response.status_code == 403
    called = permissions if route == "/v3/query" else has_permission
    assert called.call_args.args[0] == f"{HOME}/users/alice"


@pytest.mark.parametrize("allowed_reader", ["alice", f"{HOME}/users/alice"])
def test_directory_foreign_namesake_isolation(allowed_reader):
    group = f"{settings.PROVIDER}/groups/users/bob/followers"
    readers = []

    def readable(reader, service, authenticated, candidates):
        readers.append(reader)
        assert service == "profile" and authenticated
        return candidates if reader == allowed_reader else []

    with (
        patch.object(auth, "certify_with_remote_provider", return_value=True),
        patch.object(ch, "list_users", return_value=[{"username": "bob"}]),
        patch.object(ch, "readable_groups_batched", side_effect=readable),
        patch.object(ch, "read_documents_in_groups", return_value=[]) as read,
        patch.object(ch, "_get_group_member_counts", return_value={group: 1}),
    ):
        result = list_people_directory(ListPeopleDirectory(token=token()))
    assert readers == [f"{HOME}/users/alice"]
    if allowed_reader == "alice":
        assert result["users"] == []
        read.assert_not_called()
    else:
        assert len(result["users"]) == 1
        assert read.call_args.kwargs["member_key"] == allowed_reader


def test_query_prepare_receives_foreign_reader_not_local_namesake():
    with (
        patch("app.v3.services.clickhouse.client"),
        patch.object(auth, "certify_with_remote_provider", return_value=True),
        patch.object(ch, "readable_groups", return_value=["g1"]),
        patch.object(ch, "execute_query", return_value=(["doc_id"], [("d1",)])),
        patch("app.v3.endpoints.query._prepare_rows", side_effect=lambda rows, *args: rows) as prepare,
    ):
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/v3/query",
                json={
                    "token": token(),
                    "sql": "SELECT doc_id FROM posts",
                    "groups": ["g1"],
                    "prepare": {"media": True},
                },
            )
    assert response.status_code == 200
    assert prepare.call_args.args[1] == f"{HOME}/users/alice"


def test_read_ad_and_hls_seams_receive_foreign_reader():
    with (
        patch("app.v3.services.clickhouse.client"),
        patch.object(auth, "certify_with_remote_provider", return_value=True),
        patch.object(ch, "readable_groups", return_value=["g1"]),
        patch.object(ch, "read_documents_in_groups", return_value=[{"doc_id": "d1", "body": {}}]),
        patch.object(ch, "attach_pinned_ads", side_effect=lambda docs, reader: docs) as pinned,
        patch.object(ch, "attach_node_ads", side_effect=lambda docs, reader: docs) as node,
        patch.object(ch, "resolve_media_urls_in_docs", side_effect=lambda docs: docs),
        patch("app.v3.endpoints.documents._mint_hls_manifest_urls", side_effect=lambda docs, *args: docs) as hls,
    ):
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post("/v3/read", json={"token": token(), "service": "posts", "groups": ["g1"]})
    assert response.status_code == 200
    for seam in [pinned, node, hls]:
        assert seam.call_args.args[1] == f"{HOME}/users/alice"
