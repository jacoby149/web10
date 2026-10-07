"""Attack regressions at the group-structure and document-attachment boundaries."""

from unittest.mock import call, patch

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import app.exceptions as exceptions
from app.v3.endpoints import documents, groups
from app.v3.models import AcceptInvite, InviteMember, JoinRequestOp, UpdateDocument, UpdateGroup


@pytest.fixture(autouse=True)
def isolate_role_checks():
    # These unit tests isolate role and attachment rules; signed HTTP coverage
    # for the independent app boundary lives in test_delegation.py.
    with (
        patch.object(groups, "require_app_permission"),
        patch.object(documents, "app_contract_origin", return_value=None),
    ):
        yield


@pytest.mark.parametrize(
    "changes",
    [
        {"roles": [{"name": "member", "permissions": {"group": ["manageRoles", "assignRoles"]}}]},
        {"join_policy": "open"},
        {"discoverable": True},
        {"membership_visibility": "public"},
        {"tags": ["changed"]},
    ],
)
def test_member_cannot_change_contract(changes):
    with (
        patch.object(groups, "_user", return_value="attacker"),
        patch.object(groups.ch, "get_group", return_value={"group_id": "private"}),
        patch.object(groups.ch, "has_mgmt_permission", return_value=False) as permission,
        patch.object(groups.ch, "update_group") as update,
    ):
        with pytest.raises(HTTPException) as error:
            groups.update_group(UpdateGroup(token="token", group_id="private", **changes))
        assert error.value is exceptions.CRUD
        permission.assert_called_once_with("private", "attacker", "manageRoles")
        update.assert_not_called()


@pytest.mark.parametrize(
    "requests",
    [
        [],
        [{"requester_key": "attacker", "status": "pending", "role": "owner"}],
        [{"requester_key": "someone-else", "status": "invited", "role": "owner"}],
    ],
)
def test_requester_cannot_self_approve(requests):
    with (
        patch.object(groups, "_user", return_value="attacker"),
        patch.object(groups.ch, "get_pending_requests", return_value=requests),
        patch.object(groups.ch, "resolve_join_request") as resolve,
        patch.object(groups.ch, "add_group_member") as add,
    ):
        with pytest.raises(HTTPException) as error:
            groups.accept_invite(AcceptInvite(token="token", group_id="private"))
        assert error.value is exceptions.CRUD
        resolve.assert_not_called()
        add.assert_not_called()


def test_only_manager_can_issue_invited_status():
    with (
        patch.object(groups, "_user", return_value="attacker"),
        patch.object(groups.ch, "get_group", return_value={"group_id": "private"}),
        patch.object(groups.ch, "has_mgmt_permission", return_value=False) as permission,
        patch.object(groups.ch, "create_join_request") as create,
    ):
        with pytest.raises(HTTPException):
            groups.invite_member(InviteMember(token="token", group_id="private", member_key="attacker", role="owner"))
        permission.assert_called_once_with("private", "attacker", "assignRoles")
        create.assert_not_called()


def test_invitee_accepts_only_the_authoritative_offered_role():
    with (
        patch.object(groups, "_user", return_value="invitee"),
        patch.object(
            groups.ch,
            "get_pending_requests",
            return_value=[
                {"requester_key": "someone-else", "status": "invited", "role": "owner"},
                {"requester_key": "invitee", "status": "invited", "role": "editor"},
            ],
        ),
        patch.object(groups.ch, "resolve_join_request") as resolve,
        patch.object(groups.ch, "add_group_member") as add,
    ):
        result = groups.accept_invite(AcceptInvite(token="token", group_id="private"))
        assert result["role"] == "editor"
        resolve.assert_called_once_with("private", "invitee", "approved")
        add.assert_called_once_with("private", "invitee", "editor")


def test_requester_cannot_use_manager_approval_endpoint():
    with (
        patch.object(groups, "_user", return_value="attacker"),
        patch.object(groups.ch, "get_group", return_value={"group_id": "private"}),
        patch.object(groups.ch, "has_mgmt_permission", return_value=False),
        patch.object(groups.ch, "resolve_join_request") as resolve,
        patch.object(groups.ch, "add_group_member") as add,
    ):
        with pytest.raises(HTTPException):
            groups.approve_join_request(JoinRequestOp(token="token", group_id="private", requester_key="attacker"))
        resolve.assert_not_called()
        add.assert_not_called()


def test_manager_approves_pending_join():
    with (
        patch.object(groups, "_user", return_value="manager"),
        patch.object(groups.ch, "get_group", return_value={"group_id": "private"}),
        patch.object(groups.ch, "has_mgmt_permission", return_value=True) as permission,
        patch.object(groups.ch, "has_pending_or_invited_request", return_value=True),
        patch.object(
            groups.ch,
            "get_pending_requests",
            return_value=[
                {"requester_key": "attacker", "status": "pending", "role": ""},
            ],
        ),
        patch.object(groups.ch, "resolve_join_request") as resolve,
        patch.object(groups.ch, "add_group_member") as add,
    ):
        groups.approve_join_request(JoinRequestOp(token="token", group_id="private", requester_key="attacker"))
        permission.assert_called_once_with("private", "manager", "assignRoles")
        resolve.assert_called_once_with("private", "attacker", "approved")
        add.assert_called_once_with("private", "attacker", "member")


@pytest.mark.parametrize(
    "attachments,allowed",
    [
        (["private"], [False]),
        (["writable", "private", "other"], [True, False, True]),
        (["private", "writable"], [False, True]),
    ],
)
def test_unauthorized_attachment_rejects_before_any_mutation(attachments, allowed):
    with (
        patch.object(documents, "_user", return_value="attacker"),
        patch.object(documents.ch, "get_document", return_value={"service": "notes", "body": {"text": "old"}}),
        patch.object(documents.ch, "can_write_group", side_effect=allowed) as gate,
        patch.object(documents.ch, "update_document") as update,
        patch.object(documents.ch, "replace_doc_groups") as replace,
    ):
        with pytest.raises(HTTPException) as error:
            documents.update_document(
                Request({"type": "http", "headers": []}),
                UpdateDocument(
                    token="token",
                    doc_id="owned-doc",
                    body={"text": "changed"},
                    groups=attachments,
                ),
            )
        assert error.value.status_code == 403
        assert gate.call_args_list == [call(g, "attacker", "notes") for g in attachments]
        update.assert_not_called()
        replace.assert_not_called()


@pytest.mark.parametrize("attachments", [None, [], ["writable"]])
def test_authorized_update_and_detachment(attachments):
    with (
        patch.object(documents, "_user", return_value="author"),
        patch.object(documents.ch, "get_document", return_value={"service": "notes", "body": {"text": "old"}}),
        patch.object(documents.ch, "can_write_group", return_value=True) as gate,
        patch.object(documents.ch, "update_document", return_value={"doc_id": "owned-doc"}) as update,
        patch.object(documents.ch, "replace_doc_groups") as replace,
        patch.object(documents.ch, "get_doc_groups", return_value=["existing"]),
    ):
        result = documents.update_document(
            Request({"type": "http", "headers": []}),
            UpdateDocument(
                token="token",
                doc_id="owned-doc",
                body={"text": "changed"},
                groups=attachments,
            ),
        )
        update.assert_called_once()
        if attachments is None:
            replace.assert_not_called()
            assert result["groups"] == ["existing"]
        else:
            replace.assert_called_once_with("owned-doc", attachments)
            assert result["groups"] == attachments
        assert gate.call_count == len(attachments or [])
