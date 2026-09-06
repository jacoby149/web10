"""Tests for the flexible-read security boundary (safe_query).

Each test pins one facet of the guarantee: the caller's query can only reach
the boundary CTEs (group-filtered), never the raw tables. The "rejected" tests
are the security-critical ones — they are the membrane that must not leak.
"""

import pytest

from app.v3.services.safe_query import UnsafeQueryError, build_safe_query, query_services

DISCOVER = "web10.app/groups/web10/discover"
FOLLOWERS = "web10.app/groups/users/alice/followers"


# ── The happy path: the boundary CTE is injected and group-filtered ──────────


def test_simple_service_query_gets_boundary_cte():
    out = build_safe_query("SELECT doc_id FROM posts", {"posts": [DISCOVER]})
    # The caller's `posts` is now a CTE filtered to the readable group.
    assert "posts AS (" in out
    assert DISCOVER in out
    assert "collection_name = 'posts'" in out
    # The caller's SELECT is preserved, reading from the CTE.
    assert out.rstrip().endswith("SELECT doc_id FROM posts")


def test_no_readable_groups_degrades_to_empty_not_error():
    out = build_safe_query("SELECT doc_id FROM posts", {"posts": []})
    assert "posts AS (" in out
    assert "1 = 0" in out  # shape-valid, returns nothing


def test_self_join_across_services_injects_both_ctes():
    out = build_safe_query(
        "SELECT p.doc_id FROM posts p JOIN comments c ON c.ref_value = p.doc_id",
        {"posts": [DISCOVER], "comments": [DISCOVER]},
    )
    assert "posts AS (" in out and "comments AS (" in out
    # Both CTEs are present and group-filtered.
    assert out.count("IN ('web10.app/groups/web10/discover')") == 2


def test_caller_cte_referencing_service_orders_correctly():
    # The caller CTE `t` references `posts`; the `posts` CTE must come first.
    out = build_safe_query(
        "WITH t AS (SELECT doc_id FROM posts) SELECT * FROM t",
        {"posts": [DISCOVER]},
    )
    posts_pos = out.index("posts AS (")
    t_pos = out.index("t AS (")
    assert posts_pos < t_pos, "service CTE must precede the caller CTE that uses it"


def test_group_ids_are_quoted_into_the_filter():
    out = build_safe_query("SELECT 1 FROM posts", {"posts": [DISCOVER, FOLLOWERS]})
    assert f"'{DISCOVER}', '{FOLLOWERS}'" in out


# ── The membrane: every escape attempt is rejected ───────────────────────────


def test_raw_table_rejected():
    with pytest.raises(UnsafeQueryError, match="raw table 'documents'"):
        build_safe_query("SELECT * FROM documents", {"posts": [DISCOVER]})


def test_raw_table_in_subquery_rejected():
    with pytest.raises(UnsafeQueryError, match="raw table 'documents'"):
        build_safe_query(
            "SELECT * FROM posts WHERE doc_id IN (SELECT doc_id FROM documents)",
            {"posts": [DISCOVER]},
        )


def test_raw_table_in_caller_cte_rejected():
    with pytest.raises(UnsafeQueryError, match="raw table 'doc_groups'"):
        build_safe_query(
            "WITH t AS (SELECT * FROM doc_groups) SELECT * FROM t",
            {"posts": [DISCOVER]},
        )


def test_table_function_rejected():
    for q in ("SELECT * FROM file('/etc/passwd')", "SELECT * FROM numbers(10)"):
        with pytest.raises(UnsafeQueryError, match="table function"):
            build_safe_query(q, {"posts": [DISCOVER]})


def test_stacked_statements_rejected():
    with pytest.raises(UnsafeQueryError, match="one statement"):
        build_safe_query("SELECT * FROM posts; DROP TABLE documents", {"posts": [DISCOVER]})


def test_comment_cannot_hide_a_raw_table():
    # The parser strips the comment before the walk; the hidden ref is still
    # a real table node in the tree.
    with pytest.raises(UnsafeQueryError, match="raw table 'documents'"):
        build_safe_query(
            "SELECT * FROM (SELECT * FROM documents /* x */) t",
            {"posts": [DISCOVER]},
        )


def test_unknown_table_rejected():
    with pytest.raises(UnsafeQueryError, match="unknown table 'system_tables'"):
        build_safe_query("SELECT * FROM system_tables", {"posts": [DISCOVER]})


def test_system_table_rejected():
    with pytest.raises(UnsafeQueryError, match="unknown table 'tables'"):
        build_safe_query("SELECT * FROM system.tables", {"posts": [DISCOVER]})


def test_ungranted_service_rejected():
    # `comments` is not in readable_groups_by_service, so it is not allowed.
    with pytest.raises(UnsafeQueryError, match="unknown table 'comments'"):
        build_safe_query("SELECT * FROM comments", {"posts": [DISCOVER]})


def test_non_select_rejected():
    for q in ("INSERT INTO documents SELECT 1", "DROP TABLE documents"):
        with pytest.raises(UnsafeQueryError, match="only SELECT"):
            build_safe_query(q, {"posts": [DISCOVER]})


def test_unparseable_rejected():
    with pytest.raises(UnsafeQueryError, match="does not parse"):
        build_safe_query("SELECT FROM WHERE", {"posts": [DISCOVER]})


def test_qualified_raw_table_rejected():
    # A db-qualified ref to a raw table is still caught by name.
    with pytest.raises(UnsafeQueryError, match="raw table 'documents'"):
        build_safe_query("SELECT * FROM default.documents", {"posts": [DISCOVER]})


# ── The boundary is on the input, not the output ─────────────────────────────


def test_aggregation_cannot_leak_past_the_boundary():
    # The caller can aggregate, but only over the boundary CTE (their groups).
    # The CTE is what they read; there is no raw table to aggregate over.
    out = build_safe_query(
        "SELECT author_key, count(*) AS n FROM posts GROUP BY author_key",
        {"posts": [DISCOVER]},
    )
    # The aggregation runs over the CTE, which is already group-filtered.
    assert "FROM posts GROUP BY author_key" in out
    assert DISCOVER in out


# ── The engine is a FULL read path (block/sharing/hidden, not just groups) ───


def test_boundary_cte_includes_block_sharing_hidden_filters():
    # The engine must enforce the same visibility rules as the existing read
    # path: a blocked user's docs, a paused-sharing author's docs, and hidden
    # docs are hidden. Without these, a comment from a blocked user would leak
    # through the ref filter.
    #
    # The filters are NOT IN / tuple-NOT IN subqueries, NOT LEFT ANTI JOIN —
    # a ClickHouse 24.8 bug breaks CTE inlining when the CTE body combines a
    # JOIN with a LEFT ANTI JOIN (the CTE's columns become unresolvable). The
    # NOT IN forms are semantically identical and inline cleanly.
    reader = "web10.app/users/bob"
    out = build_safe_query("SELECT doc_id FROM posts", {"posts": [DISCOVER]}, member_key=reader)
    # All four filter tables are present, keyed on the reader.
    assert "user_blacklist" in out
    assert "group_blacklist" in out
    assert "user_group_sharing" in out
    assert "group_hidden_docs" in out
    # The reader is the filter key (a blocked user's docs are hidden from
    # them; a paused-sharing author's docs are hidden from them).
    assert reader in out
    # The filters are NOT IN / tuple-NOT IN (the CTE-inline-safe form).
    assert "NOT IN" in out
    assert "LEFT ANTI JOIN" not in out


# ── query_services: the pre-flight (which services does the query touch) ─────


def test_query_services_collects_the_services_used():
    assert query_services("SELECT doc_id FROM posts") == {"posts"}
    assert query_services("SELECT p.doc_id FROM posts p JOIN comments c ON c.ref_value = p.doc_id") == {
        "posts",
        "comments",
    }


def test_query_services_caller_cte_is_not_a_service():
    # A caller CTE that references a service: only the service is reported.
    assert query_services("WITH t AS (SELECT doc_id FROM posts) SELECT * FROM t") == {"posts"}


def test_query_services_no_tables_is_empty():
    # A constant query touches no service (nothing to gate, nothing to inject).
    assert query_services("SELECT 1") == set()


def test_query_services_unrestricted_mode_allows_any_service_name():
    # allowed=None (no contract gate): any non-raw, non-function table name is
    # a service — the boundary CTE still walls it to an (empty) collection.
    assert query_services("SELECT * FROM my_app_service", None) == {"my_app_service"}


def test_query_services_rejects_raw_table():
    with pytest.raises(UnsafeQueryError, match="raw table 'documents'"):
        query_services("SELECT * FROM documents", None)


def test_query_services_rejects_ungranted_service():
    with pytest.raises(UnsafeQueryError, match="unknown table 'comments'"):
        query_services("SELECT * FROM comments", {"posts"})


def test_query_services_rejects_non_select():
    with pytest.raises(UnsafeQueryError, match="only SELECT"):
        query_services("INSERT INTO posts VALUES (1)", {"posts"})


# ── max_limit: the performance bound (not a security one) ────────────────────


def test_max_limit_appended_when_absent():
    out = build_safe_query("SELECT doc_id FROM posts", {"posts": [DISCOVER]}, max_limit=1000)
    assert out.rstrip().endswith("LIMIT 1000")


def test_max_limit_not_appended_when_caller_has_one():
    out = build_safe_query("SELECT doc_id FROM posts LIMIT 5", {"posts": [DISCOVER]}, max_limit=1000)
    assert "LIMIT 1000" not in out
    assert "LIMIT 5" in out


def test_max_limit_appended_to_unbounded_union():
    out = build_safe_query(
        "SELECT 1 FROM posts UNION ALL SELECT 1 FROM comments",
        {"posts": [DISCOVER], "comments": [DISCOVER]},
        max_limit=1000,
    )
    assert out.rstrip().endswith("LIMIT 1000")


def test_max_limit_not_appended_when_union_has_trailing_limit():
    # A trailing LIMIT on a union applies to the whole set operation; sqlglot
    # attaches it to the rightmost operand — the injector must see it.
    out = build_safe_query(
        "SELECT 1 FROM posts UNION ALL SELECT 1 FROM comments LIMIT 7",
        {"posts": [DISCOVER], "comments": [DISCOVER]},
        max_limit=1000,
    )
    assert "LIMIT 1000" not in out
    assert "LIMIT 7" in out


def test_max_limit_subquery_limit_does_not_count():
    # A LIMIT inside a subquery doesn't bound the outer query.
    out = build_safe_query(
        "SELECT * FROM (SELECT doc_id FROM posts LIMIT 5) t",
        {"posts": [DISCOVER]},
        max_limit=1000,
    )
    assert out.rstrip().endswith("LIMIT 1000")
