"""Date candidates must not replace canonical current-state authority."""

import json
from pathlib import Path

import pytest
from sqlglot import exp, parse_one

from app.v3.services.safe_query import build_safe_query
from tests.test_query_partition_pruning import history_db as history_db


def compile_date(*, optimize=True, groups=None, sql=None):
    return build_safe_query(
        sql
        or "SELECT p.doc_id,p.author_key,p.group_id,p.body FROM posts p "
        "WHERE p.created_at >= fromUnixTimestamp64Milli(1) ORDER BY p.doc_id,p.author_key,p.group_id",
        {"posts": groups if groups is not None else ["allowed", "second"]},
        optimize_dates=optimize,
    )


def test_date_candidates_keep_existing_history_and_visibility(history_db):
    history_db.create_function("fromUnixTimestamp64Milli", 1, lambda n: n)
    actual = history_db.execute(compile_date()).fetchall()
    assert actual == history_db.execute(compile_date(optimize=False)).fetchall()
    assert [r[0] for r in actual] == ["active", "multiple", "multiple", "own"]


@pytest.mark.parametrize("latest_date,deleted,expected", [(0, 0, []), (2, 1, []), (2, 0, ["current"])])
def test_changed_creation_date_never_resurrects_old_version(history_db, latest_date, deleted, expected):
    history_db.create_function("fromUnixTimestamp64Milli", 1, lambda n: n)
    history_db.execute(
        "UPDATE documents SET created_at=?,deleted=? WHERE doc_id='active' AND updated_at=3", (latest_date, deleted)
    )
    sql = "SELECT p.body FROM posts p WHERE p.created_at >= fromUnixTimestamp64Milli(1) AND p.doc_id='active'"
    for optimize in (False, True):
        assert [r[0] for r in history_db.execute(compile_date(optimize=optimize, sql=sql))] == expected


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
def test_date_never_grants_visibility(history_db, mutation):
    history_db.create_function("fromUnixTimestamp64Milli", 1, lambda n: n)
    history_db.execute(mutation)
    result = history_db.execute(compile_date()).fetchall()
    assert result == history_db.execute(compile_date(optimize=False)).fetchall()
    assert not any(r[0] == "active" for r in result)


@pytest.mark.parametrize(
    "predicate",
    [
        "p.created_at >= fromUnixTimestamp64Milli(1) OR p.doc_id='other'",
        "NOT (p.created_at >= fromUnixTimestamp64Milli(1))",
        "created_at >= fromUnixTimestamp64Milli(1)",
        "p.created_at >= fromUnixTimestamp64Milli('1')",
        "p.created_at >= fromUnixTimestamp64Milli(-1)",
        "p.created_at >= now()",
    ],
)
def test_unsupported_predicates_keep_original_compiler(predicate):
    sql = f"SELECT * FROM posts p WHERE {predicate}"
    assert compile_date(sql=sql) == compile_date(sql=sql, optimize=False)


def test_reference_local_not_global_service_filter():
    sql = (
        "SELECT p.doc_id FROM posts p LEFT JOIN posts all_time ON p.doc_id=all_time.ref_value "
        "WHERE p.created_at >= fromUnixTimestamp64Milli(1)"
    )
    compiled = compile_date(sql=sql)
    assert "JOIN posts AS all_time" in compiled
    assert "fromUnixTimestamp64Milli(1)" in compiled
    assert compile_date(groups=[])  # empty readable set stays shape-valid


def test_caller_cte_and_output_alias_shadowing_are_not_optimized():
    for sql in [
        "WITH posts AS (SELECT * FROM notes) SELECT p.doc_id FROM posts p WHERE p.created_at >= fromUnixTimestamp64Milli(1)",
        "SELECT p.updated_at AS created_at FROM posts p WHERE p.created_at >= fromUnixTimestamp64Milli(1)",
    ]:
        args = {"posts": ["allowed"], "notes": ["allowed"]}
        assert build_safe_query(sql, args, optimize_dates=True) == build_safe_query(sql, args, optimize_dates=False)


@pytest.mark.parametrize("join", ["RIGHT", "FULL"])
def test_default_supplying_outer_join_keeps_reference_plan(join):
    sql = (
        f"SELECT p.doc_id,q.doc_id FROM posts p {join} JOIN posts q ON p.doc_id=q.doc_id "
        "WHERE p.created_at >= fromUnixTimestamp64Milli(0)"
    )
    assert compile_date(sql=sql) == compile_date(sql=sql, optimize=False)


@pytest.mark.parametrize("ids", [None, [], ["active"]])
def test_repeated_dates_fall_back_without_dropping_canonical_id_restrictions(ids):
    sql = " UNION ALL ".join(
        "SELECT p.doc_id FROM posts p WHERE p.created_at >= fromUnixTimestamp64Milli(1)" for _ in range(80)
    )
    groups = ["allowed"] + [f"{i:08x}-0000-4000-8000-000000000000" for i in range(999)]
    options = {"document_ids_by_service": {"posts": ids}} if ids is not None else {}
    reference = build_safe_query(sql, {"posts": groups}, **options)
    candidate = build_safe_query(sql, {"posts": groups}, optimize_dates=True, **options)
    assert len(candidate.encode()) < 262144
    assert candidate == reference


def test_realistic_thousand_group_multi_service_query_can_use_the_date_plan():
    groups = [f"api.localhost/groups/users/c42-c{i:06d}/followers" for i in range(1000)]
    sql = (
        "SELECT p.doc_id FROM posts p LEFT JOIN profile pr ON pr.author_key=p.author_key "
        "LEFT JOIN reactions r ON r.ref_value=p.doc_id LEFT JOIN comments c ON c.ref_value=p.doc_id "
        "WHERE p.created_at >= fromUnixTimestamp64Milli(1791633600000) LIMIT 21"
    )
    readable = {"posts": groups, "profile": groups, "reactions": [], "comments": []}
    reference = build_safe_query(sql, readable)
    optimized = build_safe_query(sql, readable, optimize_dates=True)
    assert len(reference.encode()) > 100000
    assert optimized != reference
    assert len(optimized.encode()) < 240 * 1024


def test_actual_captured_main_query_emits_a_date_candidate_plan():
    root = Path(__file__).parents[2]
    capture = json.loads((root / "research/experiments/costfn/evidence/core-feed-date-wire-v1.json").read_bytes())
    groups = [f"api.localhost/groups/users/c42-c{i:06d}/followers" for i in range(1000)]
    readable = {service: groups for service in ("posts", "profile", "reactions", "comments")}
    sql = capture["requests"][0]["payload"]["sql"]
    reference = build_safe_query(sql, readable)
    candidate = build_safe_query(sql, readable, optimize_dates=True)
    assert "IN (SELECT author_key, doc_id FROM documents WHERE" in candidate
    assert candidate != reference and len(candidate.encode()) < 240 * 1024


@pytest.mark.parametrize("variant", ["identical", "asymmetric", "empty"])
def test_shared_constants_preserve_exact_per_service_readable_sets(variant):
    noise = [f"api.localhost/groups/users/c42-c{i:06d}/followers" for i in range(1000)]
    first = ["allowed", *noise]
    second = first if variant == "identical" else ["private", *noise] if variant == "asymmetric" else []
    sql = "SELECT p.doc_id FROM posts p LEFT JOIN profile n ON p.author_key=n.author_key WHERE p.created_at >= fromUnixTimestamp64Milli(1)"
    tree = parse_one(build_safe_query(sql, {"posts": first, "profile": second}, optimize_dates=True), read="clickhouse")
    constants = [cte for cte in tree.find_all(exp.CTE) if cte.alias_or_name.startswith("__web10_date_groups_")]
    values = {tuple(literal.this for literal in cte.find_all(exp.Literal) if literal.is_string) for cte in constants}
    assert values == {tuple(ids) for ids in (first, second) if ids}
    assert len(constants) == len(values)
    assert build_safe_query("SELECT * FROM posts", {"posts": first}, optimize_dates=True) == build_safe_query(
        "SELECT * FROM posts", {"posts": first}
    )


def test_shared_constant_name_cannot_shadow_a_caller_cte_case_insensitively():
    sql = "WITH placeholder AS (SELECT 99 AS marker) SELECT p.doc_id,(SELECT marker FROM placeholder) AS marker FROM posts p WHERE p.created_at >= fromUnixTimestamp64Milli(1)"
    names = {identifier.name.casefold() for identifier in parse_one(sql, read="clickhouse").find_all(exp.Identifier)}
    collision = f"__WEB10_DATE_GROUPS_{len(names)}"
    sql = sql.replace("placeholder", collision)
    groups = [f"api.localhost/groups/users/c42-c{i:06d}/followers" for i in range(1000)]
    compiled = build_safe_query(sql, {"posts": groups}, optimize_dates=True)
    aliases = [cte.alias_or_name for cte in parse_one(compiled, read="clickhouse").find_all(exp.CTE)]
    assert collision in aliases
    assert len(aliases) == len({alias.casefold() for alias in aliases})
    assert collision.lower() + "_" in aliases
