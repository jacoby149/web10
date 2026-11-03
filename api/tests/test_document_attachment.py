"""Signed per-target attachment requests, with live effective role checks."""

import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.v3.services import clickhouse as ch
from tests.test_v3_endpoints import _make_token

TEAM = "node/groups/team"


@pytest.fixture
def storage(monkeypatch):
    roles = [{"name": "editor", "permissions": {"notes": ["updateOwn"]}}]
    members = {(TEAM, "operator"): {"role": "editor"}}
    monkeypatch.setattr(ch, "get_group", lambda g: {"roles": roles})
    monkeypatch.setattr(ch, "get_group_member", lambda g, m: members.get((g, m)))
    doc = {"service": "notes", "body": {"text": "original"}, "posted_by": "original-poster"}
    monkeypatch.setattr(ch, "get_document", lambda d, a: doc if a == TEAM else None)
    attachments = {TEAM, "hidden"}
    monkeypatch.setattr(ch, "get_doc_groups", lambda d: list(attachments))
    write = Mock(side_effect=lambda d, g, attached: attachments.add(g) if attached else attachments.discard(g))
    monkeypatch.setattr(ch, "set_doc_attachment", write)
    app_gate = Mock(return_value=True)
    monkeypatch.setattr(ch, "has_permission", app_gate)
    return roles, members, attachments, write, app_gate, doc


def call(group="target", **opts):
    return TestClient(app).post(
        "/v3/attachment",
        headers={"Origin": "https://app.example"},
        json={
            "token": _make_token("operator"),
            "doc_id": "doc",
            "author_as": TEAM,
            "group_id": group,
            **opts,
        },
    )


def test_target_read_and_remove_preserve_hidden_and_content(storage):
    _, _, attachments, write, gate, doc = storage
    assert call(TEAM).json()["attached"] is True
    write.assert_not_called()
    assert call(TEAM, attached=False).status_code == 200
    assert attachments == {"hidden"}
    assert doc == {"service": "notes", "body": {"text": "original"}, "posted_by": "original-poster"}
    gate.assert_called_with("operator", "https://app.example", "notes", "updateOwn")


def test_external_add_never_borrows_human_grant(storage):
    _, members, _, write, _, _ = storage
    members[("target", "operator")] = {"role": "editor"}
    assert call(attached=True).status_code == 403
    write.assert_not_called()


def test_independent_target_changes_survive(storage):
    roles, members, attachments, _, _, _ = storage
    roles.append({"name": "writer", "permissions": {"notes": ["create"]}})
    members[("target", TEAM)] = {"role": "writer"}
    members[("other", TEAM)] = {"role": "writer"}
    assert call(attached=True).status_code == 200
    assert call("other", attached=True).status_code == 200
    assert call("target", attached=False).status_code == 200
    assert attachments == {TEAM, "hidden", "other"}


def test_concurrent_different_targets_survive(storage):
    roles, members, attachments, _, _, _ = storage
    roles.append({"name": "writer", "permissions": {"notes": ["create"]}})
    for target in ["target", "other"]:
        members[(target, TEAM)] = {"role": "writer"}
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda target: call(target, attached=True), ["target", "other"]))
    assert [r.status_code for r in responses] == [200, 200]
    assert attachments == {TEAM, "hidden", "target", "other"}


def test_removing_revoked_external_destination_needs_no_create(storage):
    _, _, attachments, _, _, _ = storage
    attachments.add("target")
    assert call(attached=True).status_code == 403
    assert call(attached=False).status_code == 200
    assert attachments == {TEAM, "hidden"}


@pytest.mark.parametrize("denial", ["role", "service", "app"])
def test_denial_before_storage(storage, denial):
    roles, members, _, write, gate, _ = storage
    if denial == "role":
        members.clear()
    elif denial == "service":
        roles[0]["permissions"] = {"other": ["updateOwn"]}
    else:
        gate.return_value = False
    assert call(TEAM, attached=False).status_code == 403
    write.assert_not_called()


def test_new_self_requires_create_but_removal_does_not(storage):
    roles, _, attachments, write, _, _ = storage
    attachments.remove(TEAM)
    assert call(TEAM, attached=True).status_code == 403
    write.assert_not_called()
    roles[0]["permissions"]["notes"].append("create")
    assert call(TEAM, attached=True).status_code == 200
    roles[0]["permissions"]["notes"].remove("create")
    assert call(TEAM, attached=True).status_code == 200
    assert call(TEAM, attached=False).status_code == 200


@pytest.mark.skipif(not os.environ.get("ATTACHMENT_CLICKHOUSE_TEST"), reason="opt-in isolated Docker ClickHouse")
def test_actual_clickhouse_attachment_history(monkeypatch):
    commands = []
    monkeypatch.setattr(ch, "client", Mock(command=lambda sql, params: commands.append((sql, params))))
    for group, attached in [
        ("self", True),
        ("hidden", True),
        ("target", True),
        ("other", True),
        ("target", False),
        ("target", True),
    ]:
        ch.set_doc_attachment("doc", group, attached)
    statements = [
        "CREATE TABLE doc_groups (doc_id String, group_id String, created_at DateTime64(3), updated_at DateTime64(3), deleted UInt8) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (doc_id, group_id)"
    ]
    for index, (sql, params) in enumerate(commands):
        for key, value in params.items():
            sql = sql.replace("%(" + key + ")s", str(value) if isinstance(value, int) else "'" + value + "'")
        statements.append(sql)
        if index == 4:
            statements.append(
                "SELECT 'removed', groupArray(group_id) FROM (SELECT group_id FROM doc_groups FINAL WHERE deleted = 0 ORDER BY group_id)"
            )
    statements.append("OPTIMIZE TABLE doc_groups FINAL")
    statements.append(
        "SELECT 'retained', groupArray(group_id) FROM (SELECT group_id FROM doc_groups FINAL WHERE deleted = 0 ORDER BY group_id)"
    )
    result = subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "-i",
            "--entrypoint",
            "clickhouse",
            "clickhouse/clickhouse-server:24.8",
            "local",
            "--multiquery",
            "--path",
            "/tmp/attachment-test",
        ],
        input=";\n".join(statements) + ";",
        text=True,
        capture_output=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    assert "removed\t['hidden','other','self']" in result.stdout
    assert "retained\t['hidden','other','self','target']" in result.stdout
