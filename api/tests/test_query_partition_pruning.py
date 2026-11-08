"""Whole-partition pruning must retain every version that can deny a read."""

import sqlite3

import pytest
from sqlglot import exp, parse_one

from app.v3.services.safe_query import _boundary_cte_sql, build_safe_query


def test_readable_group_filter_precedes_attachment_window_only():
    sql = _boundary_cte_sql("posts", ["allowed", "second"], "reader")
    tree = parse_one(sql, read="clickhouse")
    history = next(
        s
        for s in tree.find_all(exp.Select)
        if s.args.get("from_")
        and isinstance(s.args["from_"].this, exp.Table)
        and s.args["from_"].this.name == "doc_groups"
    )
    assert history.args.get("where"), "readable groups must prune complete partitions before the window"
    assert {c.name for c in history.args["where"].find_all(exp.Column)} == {"group_id"}
    assert [v.this for v in history.args["where"].find_all(exp.Literal)] == ["allowed", "second"]
    filtered = history.find_ancestor(exp.Select)
    assert filtered.args["where"].sql() == "WHERE rn = 1 AND deleted = 0"
    # Keep the group literal list once: duplicating 1,000-group lists can exceed
    # the existing ClickHouse query-size bound on multi-service queries.
    assert sql.count("'allowed'") == 1


@pytest.fixture
def history_db():
    db = sqlite3.connect(":memory:")
    db.executescript("""
      CREATE TABLE documents (doc_id TEXT, author_key TEXT, posted_by TEXT,
        body TEXT, ref_value TEXT, tags TEXT, created_at INTEGER, updated_at INTEGER,
        ad_mode TEXT, ad_target TEXT, collection_name TEXT, deleted INTEGER);
      CREATE TABLE doc_groups (doc_id TEXT, group_id TEXT, updated_at INTEGER, deleted INTEGER);
      CREATE TABLE user_blacklist (user_key TEXT, blocked_key TEXT, updated_at INTEGER, deleted INTEGER);
      CREATE TABLE group_blacklist (user_key TEXT, group_id TEXT, blocked_key TEXT, updated_at INTEGER, deleted INTEGER);
      CREATE TABLE user_group_sharing (user_key TEXT, group_id TEXT, sharing_enabled INTEGER, updated_at INTEGER, deleted INTEGER);
      CREATE TABLE group_hidden_docs (group_id TEXT, doc_id TEXT, updated_at INTEGER, deleted INTEGER);
      CREATE TABLE banned_users (username TEXT, updated_at INTEGER, deleted INTEGER);
    """)
    for name, owner in (
        ("active", "alice"),
        ("removed", "alice"),
        ("deleted", "alice"),
        ("multiple", "alice"),
        ("foreign", "bob"),
        ("own", "reader"),
    ):
        db.execute(
            "INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (name, owner, owner, "old", "", "[]", 1, 1, "none", "", "posts", 0),
        )
    db.execute(
        "INSERT INTO documents SELECT doc_id,author_key,posted_by,'current',ref_value,tags,created_at,3,ad_mode,ad_target,collection_name,deleted FROM documents WHERE doc_id='active'"
    )
    db.execute(
        "INSERT INTO documents SELECT doc_id,author_key,posted_by,body,ref_value,tags,created_at,3,ad_mode,ad_target,collection_name,1 FROM documents WHERE doc_id='deleted'"
    )
    db.executemany(
        "INSERT INTO doc_groups VALUES (?,?,?,?)",
        [
            ("active", "allowed", 1, 0),
            ("active", "allowed", 2, 1),
            ("active", "allowed", 3, 0),
            ("removed", "allowed", 1, 0),
            ("removed", "allowed", 2, 1),
            ("removed", "unreadable", 3, 0),
            ("deleted", "allowed", 1, 0),
            ("multiple", "allowed", 1, 0),
            ("multiple", "second", 1, 0),
            ("foreign", "unreadable", 1, 0),
            ("own", "allowed", 1, 0),
        ],
    )
    yield db
    db.close()


def rows(db, groups):
    sql = build_safe_query(
        "SELECT doc_id,group_id,body FROM posts ORDER BY doc_id,group_id", {"posts": groups}, member_key="reader"
    )
    return db.execute(sql).fetchall()


def test_deleted_history_and_unreadable_alternate_never_resurrect(history_db):
    assert rows(history_db, ["allowed"]) == [
        ("active", "allowed", "current"),
        ("multiple", "allowed", "old"),
        ("own", "allowed", "old"),
    ]


def test_multiple_readable_links_retain_one_row_per_group(history_db):
    assert rows(history_db, ["allowed", "second"]) == [
        ("active", "allowed", "current"),
        ("multiple", "allowed", "old"),
        ("multiple", "second", "old"),
        ("own", "allowed", "old"),
    ]


@pytest.mark.parametrize(
    "mutation",
    [
        "INSERT INTO user_blacklist VALUES ('alice','reader',4,0)",
        "INSERT INTO group_blacklist VALUES ('alice','allowed','reader',4,0)",
        "INSERT INTO group_hidden_docs VALUES ('allowed','active',4,0)",
        "INSERT INTO banned_users VALUES ('alice',4,0)",
    ],
)
def test_existing_visibility_denials_stay_after_history_resolution(history_db, mutation):
    history_db.execute(mutation)
    assert not any(row[0] == "active" for row in rows(history_db, ["allowed"]))


def test_sharing_pause_denies_other_author_but_keeps_self(history_db):
    history_db.executemany(
        "INSERT INTO user_group_sharing VALUES (?,?,?,?,?)",
        [("alice", "allowed", 0, 4, 0), ("reader", "allowed", 0, 4, 0)],
    )
    assert rows(history_db, ["allowed"]) == [("own", "allowed", "old")]


def test_empty_readable_set_has_no_group_history_scan():
    sql = _boundary_cte_sql("posts", [], "reader")
    assert "1 = 0" in sql
    assert "FROM doc_groups" not in sql


@pytest.mark.parametrize("group", ["", "allow'ed", "allowed'); SELECT * FROM documents; --"])
def test_exact_quoted_group_partition_keeps_history(history_db, group):
    history_db.execute("UPDATE doc_groups SET group_id=? WHERE group_id='allowed'", (group,))
    assert rows(history_db, [group]) == [
        ("active", group, "current"),
        ("multiple", group, "old"),
        ("own", group, "old"),
    ]


def test_duplicate_readable_ids_do_not_multiply_rows(history_db):
    assert rows(history_db, ["allowed", "allowed"]) == rows(history_db, ["allowed"])


def test_hidden_group_keeps_only_live_readable_alternate(history_db):
    history_db.execute("INSERT INTO group_hidden_docs VALUES ('allowed','multiple',4,0)")
    assert ("multiple", "second", "old") in rows(history_db, ["allowed", "second"])
    history_db.executemany(
        "INSERT INTO doc_groups VALUES (?,?,?,?)", [("multiple", "second", 5, 1), ("multiple", "unreadable", 5, 0)]
    )
    assert not any(row[0] == "multiple" for row in rows(history_db, ["allowed", "second"]))


def test_caller_cte_aggregation_stays_inside_same_boundary(history_db):
    sql = build_safe_query(
        "WITH chosen AS (SELECT * FROM posts) SELECT count(*) FROM chosen", {"posts": ["allowed"]}, member_key="reader"
    )
    assert history_db.execute(sql).fetchall() == [(3,)]
