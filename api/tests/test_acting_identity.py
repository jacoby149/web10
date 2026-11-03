"""Delegated document mutations keep human credentials and live group authority."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.v3.endpoints import documents, groups
from app.v3.models.documents import CreateDocument, DeleteDocument, ReadDocuments, UpdateDocument
from app.v3.models.groups import ListMyGroups
from tests.test_v3_endpoints import _make_token


@pytest.mark.parametrize("operation,permission", [("delete", "deleteOwn"), ("update", "updateOwn")])
@pytest.mark.parametrize("allowed", [False, True])
def test_delegated_mutation_uses_current_service_authority(operation, permission, allowed):
    doc = {"service": "notes", "body": {"text": "old"}, "posted_by": "original"}
    ch = MagicMock()
    ch.get_document.return_value = doc
    ch.get_group.return_value = {"group_id": "team"}
    ch._effective_allows.return_value = allowed
    ch.update_document.return_value = {}
    request = Request({"type": "http", "headers": []})
    token = _make_token("operator")
    model = (
        DeleteDocument(token=token, doc_id="doc", author_as="team")
        if operation == "delete"
        else UpdateDocument(token=token, doc_id="doc", author_as="team", body={"text": "new"})
    )
    with (
        patch.object(documents, "ch", ch),
        patch.object(documents, "_user", return_value="operator"),
        patch.object(documents, "_check_app_permission") as app_gate,
    ):
        if not allowed:
            with pytest.raises(HTTPException) as error:
                getattr(documents, f"{operation}_document")(request, model)
            assert error.value.status_code == 403
            ch.delete_document.assert_not_called()
            ch.update_document.assert_not_called()
        else:
            getattr(documents, f"{operation}_document")(request, model)
            assert app_gate.call_args.args[1:4] == ("operator", "notes", permission)
            if operation == "delete":
                ch.delete_document.assert_called_once_with("doc", "team", "notes")
            else:
                assert ch.update_document.call_args.kwargs["author_key"] == "team"
                assert "posted_by" not in ch.update_document.call_args.kwargs
    ch.effective_role_perms.assert_called_once_with("team", "operator", authenticated=True)
    assert ch._effective_allows.call_args.args[1:] == ("notes", permission)


def test_group_memberships_do_not_use_human_memberships():
    ch = MagicMock()
    ch._effective_allows.return_value = True
    with patch.object(groups, "ch", ch), patch.object(groups, "_user", return_value="operator"):
        groups.get_my_groups(ListMyGroups(token=_make_token("operator"), author_as="team", service="notes"))
    ch.get_user_groups.assert_called_once_with("team", None)
    ch.heal_followers_group_owner.assert_not_called()


@pytest.mark.parametrize("exists,status", [(False, 404), (True, 403)])
def test_group_memberships_deny_missing_or_revoked_identity(exists, status):
    ch = MagicMock()
    ch.get_group.return_value = {"group_id": "team"} if exists else None
    ch._effective_allows.return_value = False
    with patch.object(groups, "ch", ch):
        with pytest.raises(HTTPException) as error:
            groups.get_my_groups(ListMyGroups(token=_make_token("operator"), author_as="team", service="notes"))
    assert error.value.status_code == status
    ch.get_user_groups.assert_not_called()


def test_denied_target_cannot_leave_an_inserted_document():
    ch = MagicMock()
    ch.can_write_group.return_value = False
    with (
        patch.object(documents, "ch", ch),
        patch.object(documents, "_user", return_value="operator"),
        patch.object(documents, "_check_app_permission"),
    ):
        with pytest.raises(HTTPException) as error:
            documents.create_document(
                Request({"type": "http", "headers": []}),
                CreateDocument(
                    token=_make_token("operator"), service="notes", body={}, author_as="team", groups=["human-only"]
                ),
            )
    assert error.value.status_code == 403
    ch.can_write_group.assert_called_once_with("human-only", "team", "notes")
    ch.insert_document.assert_not_called()


@pytest.mark.parametrize("anonymous", [False, True])
def test_single_read_exposes_only_readable_carriers(anonymous):
    ch = MagicMock()
    doc = {"doc_id": "doc", "author_key": "team", "posted_by": "operator", "body": {}}
    ch.read_document_by_id.return_value = doc
    ch.get_doc_groups.return_value = ["private", "public"]
    ch.readable_groups.return_value = ["public"]
    ch.attach_pinned_ads.return_value = [doc]
    ch.attach_node_ads.return_value = [doc]
    ch.resolve_media_urls_in_docs.side_effect = lambda docs: docs
    with patch.object(documents, "ch", ch), patch.object(documents, "_check_app_permission"):
        result = documents.read_documents(
            Request({"type": "http", "headers": []}),
            ReadDocuments(token=None if anonymous else _make_token("operator"), service="notes", doc_id="doc"),
        )
    assert result["groups"] == ["public"]
    import app.settings as settings

    ch.readable_groups.assert_called_once_with(
        "anon" if anonymous else f"{settings.PROVIDER}/users/operator",
        "notes",
        not anonymous,
        ["private", "public"],
    )
