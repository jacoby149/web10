"""Actual create route/auth and role gates over synthetic group storage."""

import sqlite3
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.v3.services import clickhouse as ch
from tests.test_v3_endpoints import _make_token

TEAM = "node/groups/users/operator/team"
FOREIGN = "node/groups/users/other/team"
HUMAN_ONLY = "node/groups/users/operator/private"
DISCOVER = ch.DISCOVER_GROUP_ID


@pytest.fixture
def storage(monkeypatch):
    # Only storage boundaries are doubled: effective_role_perms,
    # _effective_allows, can_write_group and signed auth execute normally.
    roles = [
        {"name": "owner", "permissions": {"notes": ["create"]}},
        {"name": "writer", "permissions": {"notes": ["create"]}},
        {"name": "reader", "permissions": {"notes": ["readAll"]}},
    ]
    groups = {g: {"group_id": g, "roles": roles} for g in [TEAM, FOREIGN, HUMAN_ONLY, DISCOVER]}
    members = {
        (TEAM, "operator"): {"role": "owner"},
        (HUMAN_ONLY, "operator"): {"role": "writer"},
    }
    monkeypatch.setattr(ch, "get_group", lambda group: groups.get(group))
    monkeypatch.setattr(ch, "get_group_member", lambda group, member: members.get((group, member)))
    insert = Mock(return_value={"doc_id": "synthetic-doc"})
    attach = Mock()
    app_gate = Mock(return_value=True)
    monkeypatch.setattr(ch, "insert_document", insert)
    monkeypatch.setattr(ch, "attach_doc_to_groups", attach)
    monkeypatch.setattr(ch, "has_permission", app_gate)
    return groups, members, insert, attach, app_gate


def create(*, targets, actor="operator", author=TEAM, service="notes"):
    return TestClient(app).post(
        "/v3/create",
        headers={"Origin": "https://synthetic-app.example"},
        json={
            "token": _make_token(actor),
            "author_as": author,
            "posted_by": "forged-top-level",
            "service": service,
            "body": {"text": "synthetic", "posted_by": "forged-body"},
            "groups": targets,
        },
    )


def test_self_target_without_self_membership(storage):
    _, members, insert, attach, app_gate = storage
    assert (TEAM, TEAM) not in members
    response = create(targets=[TEAM])
    assert response.status_code == 200, response.text
    assert response.json()["groups"] == [TEAM]
    assert insert.call_args.kwargs["author_key"] == TEAM
    assert insert.call_args.kwargs["posted_by"] == "operator"
    attach.assert_called_once_with("synthetic-doc", [TEAM])
    app_gate.assert_called_once_with("operator", "https://synthetic-app.example", "notes", "create")


@pytest.mark.parametrize("grant", ["member", "anyone", "authenticated", None])
def test_self_plus_discover_uses_independent_external_gate(storage, grant):
    _, members, insert, attach, _ = storage
    if grant:
        members[(DISCOVER, TEAM if grant == "member" else grant)] = {"role": "writer"}
    response = create(targets=[TEAM, DISCOVER, HUMAN_ONLY])
    assert response.status_code == 200, response.text
    expected = [TEAM, DISCOVER] if grant else [TEAM]
    assert response.json()["groups"] == expected
    attach.assert_called_once_with("synthetic-doc", expected)
    assert insert.call_args.kwargs["posted_by"] == "operator"


@pytest.mark.parametrize("target", [HUMAN_ONLY, FOREIGN, DISCOVER])
def test_external_target_cannot_borrow_human_membership(storage, target):
    _, _, insert, attach, _ = storage
    response = create(targets=[target])
    assert response.status_code == 403
    assert response.json()["detail"] == "no write access to the requested group"
    insert.assert_not_called()
    attach.assert_not_called()


@pytest.mark.parametrize("case", ["no-grant", "owner-without-create", "service-mismatch", "bystander", "foreign", "missing"])
def test_self_target_requires_live_service_authority(storage, case):
    groups, members, insert, attach, _ = storage
    options = {}
    if case == "no-grant":
        members[(TEAM, "operator")] = {"role": "reader"}
    elif case == "owner-without-create":
        groups[TEAM]["roles"] = [{"name": "owner", "permissions": {"notes": ["readAll"]}}]
    elif case == "service-mismatch":
        options["service"] = "other-service"
    elif case == "bystander":
        options["actor"] = "bystander"
    elif case == "foreign":
        options["author"] = FOREIGN
    else:
        del groups[TEAM]
    response = create(targets=[options.get("author", TEAM)], **options)
    assert response.status_code == (404 if case == "missing" else 403)
    insert.assert_not_called()
    attach.assert_not_called()


def test_revocation_is_checked_again_on_next_create(storage):
    _, members, insert, attach, _ = storage
    assert create(targets=[TEAM]).status_code == 200
    insert.reset_mock()
    attach.reset_mock()
    del members[(TEAM, "operator")]
    assert create(targets=[TEAM]).status_code == 403
    insert.assert_not_called()
    attach.assert_not_called()


def test_self_target_does_not_skip_human_app_contract(storage):
    _, _, insert, attach, app_gate = storage
    app_gate.return_value = False
    assert create(targets=[TEAM]).status_code == 403
    insert.assert_not_called()
    attach.assert_not_called()


def test_no_implicit_self_or_discover_destination(storage):
    _, _, insert, attach, _ = storage
    response = create(targets=[])
    assert response.status_code == 200
    assert "groups" not in response.json()
    insert.assert_called_once()
    attach.assert_not_called()


@pytest.mark.parametrize("grant", ["anyone", "authenticated", "writer", "wildcard", "removed-member"])
def test_create_uses_effective_union_not_owner_or_membership_requirement(storage, grant):
    groups, members, _, _, _ = storage
    if grant == "writer":
        members[(TEAM, "operator")] = {"role": "writer"}
    elif grant == "wildcard":
        groups[TEAM]["roles"] = [{"name": "owner", "permissions": {"*": ["create"]}}]
    else:
        members[(TEAM, "authenticated" if grant == "removed-member" else grant)] = {"role": "writer"}
        if grant == "removed-member":
            assert create(targets=[TEAM]).status_code == 200
        del members[(TEAM, "operator")]
    assert create(targets=[TEAM]).status_code == 200


@pytest.mark.parametrize("target", [TEAM + "-other", TEAM + "/child", FOREIGN])
def test_self_target_equality_uses_full_id(storage, target):
    groups, _, insert, attach, _ = storage
    groups[target] = {"group_id": target, "roles": []}
    assert create(targets=[target]).status_code == 403
    insert.assert_not_called()
    attach.assert_not_called()


@pytest.fixture
def lifecycle(storage, monkeypatch):
    groups, members, insert, attach, app_gate = storage
    groups[TEAM]["roles"] = [
        {"name": "owner", "permissions": {"notes": ["create", "updateOwn"]}},
        {"name": "editor", "permissions": {"notes": ["updateOwn"]}},
    ]
    docs = {}
    targets = []

    def save(**kwargs):
        docs["synthetic-doc"] = {**kwargs, "doc_id": "synthetic-doc"}
        return {"doc_id": "synthetic-doc"}

    def replace(doc_id, requested):
        targets[:] = requested

    insert.side_effect = save
    attach.side_effect = replace
    monkeypatch.setattr(ch, "get_document", lambda doc_id, author: docs.get(doc_id) if author == TEAM else None)
    monkeypatch.setattr(ch, "get_doc_groups", lambda doc_id: list(targets))
    update = Mock(return_value={"doc_id": "synthetic-doc"})
    replace_groups = Mock(side_effect=replace)
    monkeypatch.setattr(ch, "update_document", update)
    monkeypatch.setattr(ch, "replace_doc_groups", replace_groups)
    return groups, members, docs, targets, update, replace_groups, app_gate


def edit(targets=None):
    payload = {
        "token": _make_token("operator"),
        "author_as": TEAM,
        "doc_id": "synthetic-doc",
        "body": {"text": "edited"},
    }
    if targets is not None:
        payload["groups"] = targets
    return TestClient(app).post(
        "/v3/update", headers={"Origin": "https://synthetic-app.example"}, json=payload
    )


@pytest.mark.parametrize("explicit", [False, True])
def test_create_then_edit_existing_self_with_update_only(lifecycle, explicit):
    _, members, docs, _, update, _, app_gate = lifecycle
    assert create(targets=[TEAM]).status_code == 200
    members[(TEAM, "operator")] = {"role": "editor"}
    response = edit([TEAM] if explicit else None)
    assert response.status_code == 200, response.text
    assert response.json()["groups"] == [TEAM]
    assert update.call_args.kwargs["author_key"] == TEAM
    assert "posted_by" not in update.call_args.kwargs
    assert docs["synthetic-doc"]["posted_by"] == "operator"
    assert app_gate.call_args.args == ("operator", "https://synthetic-app.example", "notes", "updateOwn")


@pytest.mark.parametrize("create_grant", [False, True])
def test_new_self_attachment_needs_create_as_well_as_update(lifecycle, create_grant):
    _, members, _, _, update, replace_groups, _ = lifecycle
    assert create(targets=[]).status_code == 200
    if not create_grant:
        members[(TEAM, "operator")] = {"role": "editor"}
        # A self-member row cannot replace the human's service create grant.
        members[(TEAM, TEAM)] = {"role": "editor"}
    response = edit([TEAM])
    assert response.status_code == (200 if create_grant else 403)
    if not create_grant:
        update.assert_not_called()
        replace_groups.assert_not_called()


@pytest.mark.parametrize("case", ["revoked", "wrong-service", "app-denied", "human-only", "near-match", "external-revoked"])
def test_update_self_exception_preserves_other_gates(lifecycle, case):
    groups, members, _, targets, update, replace_groups, app_gate = lifecycle
    assert create(targets=[TEAM]).status_code == 200
    requested = [TEAM]
    if case == "revoked":
        del members[(TEAM, "operator")]
    elif case == "wrong-service":
        groups[TEAM]["roles"] = [{"name": "owner", "permissions": {"other": ["updateOwn", "create"]}}]
    elif case == "app-denied":
        app_gate.return_value = False
    else:
        requested.append(HUMAN_ONLY if case == "human-only" else TEAM + "-other")
        if case == "external-revoked":
            # Even stored external attachments must still pass their own gate.
            requested = [TEAM, DISCOVER]
            targets.append(DISCOVER)
    response = edit(requested)
    assert response.status_code == 403
    update.assert_not_called()
    replace_groups.assert_not_called()


@pytest.mark.parametrize("history", ["detached", "tie-delete-first", "tie-live-first", "reattached", "active", "other-doc"])
def test_update_self_retention_uses_current_attachment_sql(storage, monkeypatch, history):
    groups, members, _, attach, _ = storage
    groups[TEAM]["roles"] = [{"name": "owner", "permissions": {"notes": ["create", "updateOwn"]}}]
    with sqlite3.connect(":memory:", check_same_thread=False) as db:
        db.execute("CREATE TABLE doc_groups (doc_id TEXT, group_id TEXT, created_at INT, updated_at INT, deleted INT)")
        clock = [1]
        db.create_function("now", 0, lambda: clock[0])

        def execute(sql, params):
            # Execute the helper's actual SQL, translating only driver binding.
            return db.execute(sql.replace("%(doc_id)s", ":doc_id"), params)

        client = Mock()
        client.query.side_effect = lambda sql, params: SimpleNamespace(result_rows=execute(sql, params).fetchall())
        client.command.side_effect = execute
        monkeypatch.setattr(ch, "client", client)
        attach.side_effect = lambda doc, targets: db.executemany(
            "INSERT INTO doc_groups VALUES (?, ?, ?, ?, 0)",
            [(doc, target, clock[0], clock[0]) for target in targets],
        )
        assert create(targets=[TEAM]).status_code == 200
        if history != "active":
            clock[0] = 2
            ch.detach_doc_from_groups("synthetic-doc")
        if history in ("tie-delete-first", "tie-live-first", "reattached"):
            clock[0] = 3 if history == "reattached" else 2
            ch.attach_doc_to_groups("synthetic-doc", [TEAM])
            if history == "tie-live-first":
                ch.detach_doc_from_groups("synthetic-doc")
        if history == "other-doc":
            ch.attach_doc_to_groups("unrelated-doc", [TEAM])
        members[(TEAM, "operator")] = {"role": "editor"}
        groups[TEAM]["roles"].append({"name": "editor", "permissions": {"notes": ["updateOwn"]}})
        monkeypatch.setattr(ch, "get_document", lambda *_: {"service": "notes", "body": {}, "posted_by": "original"})
        update = Mock(return_value={"doc_id": "synthetic-doc"})
        replace_groups = Mock()
        monkeypatch.setattr(ch, "update_document", update)
        monkeypatch.setattr(ch, "replace_doc_groups", replace_groups)
        current = history in ("active", "reattached")
        response = edit([TEAM])
        assert response.status_code == (200 if current else 403), response.text
        assert ch.get_doc_groups("synthetic-doc") == ([TEAM] if current else [])
        if current:
            update.assert_called_once()
            replace_groups.assert_called_once_with("synthetic-doc", [TEAM])
        else:
            update.assert_not_called()
            replace_groups.assert_not_called()
