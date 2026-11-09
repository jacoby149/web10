"""Canonical exact-ID hints prune history partitions, never authorize rows."""

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlglot import exp, parse_one

from app.v3.endpoints.query import _canonical_prepare_docs
from app.v3.services import clickhouse as ch
from app.v3.services.safe_query import build_safe_query
from tests.test_query_partition_pruning import history_db as history_db


def compile_ids(ids, *, hint=True, groups=None):
    sql = (
        exp.select("doc_id", "author_key", "group_id", "body")
        .from_("posts")
        .where(exp.In(this=exp.column("doc_id"), expressions=[exp.Literal.string(i) for i in ids]))
        .order_by("doc_id", "author_key", "group_id")
    )
    options = {"document_ids_by_service": {"posts": ids}} if hint else {}
    return build_safe_query(sql.sql(dialect="clickhouse"), {"posts": groups or ["allowed", "second"]}, **options)


def history_selects(sql):
    return {
        s.args["from_"].this.name: s
        for s in parse_one(sql, read="clickhouse").find_all(exp.Select)
        if s.args.get("from_")
        and isinstance(s.args["from_"].this, exp.Table)
        and s.args["from_"].this.name in {"documents", "doc_groups"}
    }


def test_exact_ids_prune_both_windows_without_pushing_deletion_or_visibility():
    for table, select in history_selects(compile_ids(["active", "removed"])).items():
        where = select.args["where"]
        assert "doc_id" in {c.name for c in where.find_all(exp.Column)}, table
        assert not {"deleted", "body", "author_key"} & {c.name for c in where.find_all(exp.Column)}
        assert select.find_ancestor(exp.Select).args["where"].sql() == "WHERE rn = 1 AND deleted = 0"


@pytest.mark.parametrize("ids", [["active"], ["removed", "deleted", "foreign"], ["multiple", "multiple"], ["missing"]])
def test_hint_matches_unrestricted_boundary_and_expected_rows(history_db, ids):
    actual = history_db.execute(compile_ids(ids)).fetchall()
    assert actual == history_db.execute(compile_ids(ids, hint=False)).fetchall()
    expected = {
        "active": [("active", "alice", "allowed", "current")],
        "multiple": [("multiple", "alice", "allowed", "old"), ("multiple", "alice", "second", "old")],
    }
    assert actual == sorted(row for key in set(ids) for row in expected.get(key, []))


@pytest.mark.parametrize(
    "mutation",
    [
        "INSERT INTO user_blacklist VALUES ('alice','anon',4,0)",
        "INSERT INTO group_blacklist VALUES ('alice','allowed','anon',4,0)",
        "INSERT INTO group_hidden_docs VALUES ('allowed','active',4,0)",
        "INSERT INTO banned_users VALUES ('alice',4,0)",
        "INSERT INTO user_group_sharing VALUES ('alice','allowed',0,4,0)",
    ],
)
def test_exact_id_is_not_a_visibility_grant(history_db, mutation):
    history_db.execute(mutation)
    assert history_db.execute(compile_ids(["active"])).fetchall() == []


def test_no_hint_keeps_ordinary_compiler_and_hint_is_service_scoped():
    sql = build_safe_query("SELECT * FROM posts", {"posts": ["allowed"]})
    unrelated = build_safe_query(
        "SELECT * FROM posts", {"posts": ["allowed"]}, document_ids_by_service={"profile": ["active"]}
    )
    assert sql == unrelated
    assert "doc_id" not in {c.name for c in history_selects(sql)["documents"].args["where"].find_all(exp.Column)}


def test_empty_hint_denies_instead_of_disabling_restriction(history_db):
    sql = build_safe_query("SELECT * FROM posts", {"posts": ["allowed"]}, document_ids_by_service={"posts": []})
    assert history_db.execute(sql).fetchall() == []


@pytest.mark.parametrize("count", [1, 10, 100, 3000])
def test_canonical_command_budget_and_large_uuid_query_envelope(count):
    ids = [f"{i:08x}-0000-4000-8000-000000000000" for i in range(count)]
    queries = []

    def execute(sql, settings):
        queries.append(sql)
        assert len(sql.encode()) < 262144
        return ["doc_id", "author_key"], [(i, "alice") for i in ids]

    with patch.object(ch, "execute_query", side_effect=execute):
        assert len(_canonical_prepare_docs([{"doc_id": i} for i in ids], "reader", {"posts": ["allowed"]})) == count
    assert len(queries) == 1
    assert (
        "doc_id" in {c.name for c in history_selects(queries[0])["documents"].args["where"].find_all(exp.Column)}
    ) is (count < 3000)


def test_canonical_budget_counts_utf8_bytes_not_characters():
    ids = [str(i) + "雪" * 1000 for i in range(21)]
    assert len(compile_ids(ids)) < 128 * 1024 < len(compile_ids(ids).encode())
    with patch.object(
        ch, "execute_query", return_value=(["doc_id", "author_key"], [(i, "alice") for i in ids])
    ) as execute:
        assert len(_canonical_prepare_docs([{"doc_id": i} for i in ids], "reader", {"posts": ["allowed"]})) == 21
    assert "doc_id" not in {
        c.name for c in history_selects(execute.call_args.args[0])["documents"].args["where"].find_all(exp.Column)
    }


@pytest.mark.parametrize("ids,expected", [([], []), (["active"], [("active",)])])
def test_large_compiler_query_never_drops_its_id_restriction(history_db, ids, expected):
    sql = build_safe_query(
        "SELECT doc_id, '" + "x" * 132000 + "' AS padding FROM posts",
        {"posts": ["allowed"]},
        document_ids_by_service={"posts": ids},
    )
    assert [(row[0],) for row in history_db.execute(sql)] == expected


@pytest.mark.parametrize("doc_id", ["quote'key", "back\\slash", "雪", "x'); SELECT * FROM documents; --"])
def test_opaque_ids_remain_exact_sql_literals(doc_id):
    tree = parse_one(compile_ids([doc_id]), read="clickhouse")
    assert len(list(tree.find_all(exp.Table))) > 1
    for select in history_selects(tree.sql(dialect="clickhouse")).values():
        predicate = next(p for p in select.args["where"].find_all(exp.In) if p.this.name == "doc_id")
        assert [v.this for v in predicate.expressions] == [doc_id]


def test_canonical_wiring_executes_generated_sql_and_keeps_ambiguous_author_denial(history_db):
    def execute(sql, settings):
        for select in history_selects(sql).values():
            assert "doc_id" in {c.name for c in select.args["where"].find_all(exp.Column)}
        cursor = history_db.execute(sql)
        return [c[0] for c in cursor.description], cursor.fetchall()

    with patch.object(ch, "execute_query", side_effect=execute):
        rows = _canonical_prepare_docs([{"doc_id": "active", "body": {}}], "reader", {"posts": ["allowed"]})
        assert rows[0]["author_key"] == "alice" and rows[0]["body"] == "current"
        for doc_id in ("deleted", "removed", "foreign", "missing"):
            with pytest.raises(HTTPException) as denied:
                _canonical_prepare_docs([{"doc_id": doc_id}], "reader", {"posts": ["allowed"]})
            assert denied.value.status_code == 403
        history_db.execute(
            "INSERT INTO documents SELECT doc_id,'bob',posted_by,body,ref_value,tags,created_at,updated_at,ad_mode,ad_target,collection_name,deleted FROM documents WHERE doc_id='active'"
        )
        with pytest.raises(HTTPException, match="ambiguous canonical"):
            _canonical_prepare_docs([{"doc_id": "active"}], "reader", {"posts": ["allowed"]})
