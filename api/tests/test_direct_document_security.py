"""Direct-read regressions; opt-in Docker probe never touches application data."""

import json
import os
import subprocess
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.v3.services import clickhouse as ch
from app.v3.services.safe_query import build_safe_query


@pytest.mark.parametrize(
    "method,args",
    [
        (ch.get_document, ("doc", "alice")),
        (ch.get_document_any_author, ("doc",)),
        (ch.get_doc_groups, ("doc",)),
    ],
)
def test_latest_before_deleted_filter(method, args):
    client = MagicMock()
    client.query.return_value.result_rows = []
    with patch.object(ch, "client", client):
        method(*args)
    sql = client.query.call_args.args[0]
    assert "row_number() OVER" in sql
    assert "ORDER BY updated_at DESC, deleted DESC" in sql
    assert "WHERE rn = 1 AND deleted = 0" in sql
    assert "deleted = 0" not in sql.split("WHERE rn = 1")[0]


def test_membership_without_service_readall_is_denied():
    with (
        patch.object(ch, "client") as client,
        patch.object(ch, "get_doc_groups", return_value=["g"]),
        patch.object(ch, "readable_groups", return_value=["g"]),
        patch.object(ch, "effective_role_perms", return_value={"profile": ["readAll"]}),
    ):
        assert ch.read_document_by_id("doc", "bob", "posts", True) is None
        client.query.assert_not_called()


@pytest.mark.skipif(not os.getenv("DIRECT_READ_LIVE_CONTAINER"), reason="opt-in existing Docker ClickHouse")
def test_live_revocation_without_merges():
    container = os.environ["DIRECT_READ_LIVE_CONTAINER"]
    database = "direct_read_test_" + uuid4().hex

    def execute(sql, db="default"):
        result = subprocess.run(
            ["docker", "exec", container, "clickhouse-client", "--database", db, "--query", sql],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        return result.stdout

    class LiveClient:
        def query(self, sql, parameters=None):
            values = {
                k: "'" + str(v).replace("\\", "\\\\").replace("'", "\\'") + "'" for k, v in (parameters or {}).items()
            }
            data = json.loads(execute((sql % values) + " FORMAT JSON", database))
            columns = [c["name"] for c in data["meta"]]
            return SimpleNamespace(result_rows=[tuple(row[c] for c in columns) for row in data["data"]])

    tables = [
        "documents",
        "doc_groups",
        "group_contracts",
        "group_members",
        "user_blacklist",
        "group_blacklist",
        "user_group_sharing",
        "group_hidden_docs",
        "banned_users",
    ]
    version = 0

    def insert(table, values):
        nonlocal version
        version += 1
        values = {**values, "updated_at": f"2026-01-01 00:00:{version:02d}.000"}
        columns = ", ".join(values)
        literals = ", ".join(
            "'" + v.replace("'", "\\'") + "'" if isinstance(v, str) else str(v) for v in values.values()
        )
        execute(f"INSERT INTO {table} ({columns}) VALUES ({literals})", database)

    execute(f"CREATE DATABASE {database}")
    try:
        for table in tables:
            if table == "banned_users":
                execute(
                    "CREATE TABLE banned_users (username String, updated_at DateTime64(3), deleted UInt8) "
                    "ENGINE=ReplacingMergeTree(updated_at) ORDER BY username",
                    database,
                )
            else:
                execute(f"CREATE TABLE {table} AS web10.{table}", database)
            execute(f"SYSTEM STOP MERGES {database}.{table}")
        roles = [
            {"name": "reader", "permissions": {"posts": ["readAll"]}},
            {"name": "face", "permissions": {"profile": ["readAll"]}},
        ]
        insert("group_contracts", {"group_id": "g", "roles": json.dumps(roles), "join_policy": "open"})
        insert(
            "documents",
            {"doc_id": "doc", "author_key": "alice", "collection_name": "posts", "body": '{"text":"secret"}'},
        )
        insert("doc_groups", {"doc_id": "doc", "group_id": "g"})

        with patch.object(ch, "client", LiveClient()):

            def read(reader="bob", authenticated=True):
                return ch.read_document_by_id("doc", reader, "posts", authenticated)

            def grouped(reader, authenticated, expected):
                for service in ("posts", "private_service"):
                    point = ch.readable_groups(reader, service, authenticated, ["g"])
                    assert ch.readable_groups_batched(reader, service, authenticated, ["g"]) == point
                    assert bool(point) == (expected and service == "posts")
                    sql = build_safe_query(
                        f"SELECT count() AS n FROM {service}",
                        {service: point},
                        member_key=reader,
                    )
                    rows = ch.client.query(sql).result_rows
                    assert len(rows) == 1
                    assert int(rows[0][0]) == int(expected and service == "posts")
                assert not ch.can_write_group("g", reader, "posts", authenticated)
                assert not ch.can_write_group("g", reader, "private_service", authenticated)

            for principal, reader, authenticated in [
                ("bob", "bob", True),
                ("anyone", "anon", False),
                ("authenticated", "stranger", True),
            ]:
                member = {"group_id": "g", "member_key": principal, "role": "reader"}
                insert("group_members", member)
                assert read(reader, authenticated)
                grouped(reader, authenticated, True)
                if principal == "authenticated":
                    assert read("anon", False) is None
                insert("group_members", {**member, "role": "face"})
                assert read(reader, authenticated) is None
                grouped(reader, authenticated, False)
                insert("group_members", member)
                assert read(reader, authenticated)
                insert("group_members", {**member, "deleted": 1})
                assert read(reader, authenticated) is None
                grouped(reader, authenticated, False)

            insert("group_members", {"group_id": "g", "member_key": "bob", "role": "reader"})
            assert read()
            for table, values in [
                ("user_blacklist", {"user_key": "alice", "blocked_key": "bob"}),
                ("group_blacklist", {"user_key": "alice", "group_id": "g", "blocked_key": "bob"}),
                ("user_group_sharing", {"user_key": "alice", "group_id": "g", "sharing_enabled": 0}),
                ("group_hidden_docs", {"group_id": "g", "doc_id": "doc", "moderator_key": "mod"}),
                ("banned_users", {"username": "alice"}),
            ]:
                insert(table, values)
                assert read() is None, table
                insert(table, {**values, "deleted": 1})
                assert read(), table

            insert("doc_groups", {"doc_id": "doc", "group_id": "g", "deleted": 1})
            assert ch.get_doc_groups("doc") == []
            assert read() is None
            insert("doc_groups", {"doc_id": "doc", "group_id": "g"})
            assert read()
            assert ch.get_document("doc", "alice")
            assert ch.get_document_any_author("doc")
            insert(
                "documents",
                {"doc_id": "doc", "author_key": "alice", "collection_name": "posts", "body": "{}", "deleted": 1},
            )
            assert ch.get_document("doc", "alice") is None
            assert ch.get_document_any_author("doc") is None
            assert read() is None
            assert execute("SELECT count() FROM documents", database).strip() == "2"
    finally:
        execute(f"DROP DATABASE {database} SYNC")
