"""Adversarial query boundary and capability-minter regression tests."""

from unittest.mock import patch

import pytest
import sqlglot
from fastapi import HTTPException
from starlette.requests import Request

from app.v3.endpoints import query as endpoint
from app.v3.models import PrepareSpec, QueryRequest
from app.v3.services.safe_query import UnsafeQueryError, build_safe_query, query_services


@pytest.mark.parametrize(
    "sql",
    [
        "WITH logs AS (SELECT 1) SELECT * FROM web10.logs",
        "WITH tables AS (SELECT 1) SELECT * FROM system.tables",
        "SELECT * FROM catalog.web10.posts",
        "SELECT * FROM web10.posts",
        "WITH x AS (SELECT * FROM system.tables) SELECT * FROM x",
    ],
)
@pytest.mark.parametrize("allowed", [None, frozenset({"logs", "tables", "posts"}), frozenset({"*"})])
def test_qualified_references_rejected_even_with_collisions(sql, allowed):
    with pytest.raises(UnsafeQueryError, match="qualified"):
        query_services(sql, allowed)
    with pytest.raises(UnsafeQueryError, match="qualified"):
        build_safe_query(sql, {"posts": ["g"]}, allowed_services=allowed)


def test_nested_cte_is_not_visible_to_outer_table_reference():
    sql = "SELECT * FROM logs JOIN (WITH logs AS (SELECT 1) SELECT * FROM logs) x ON 1 = 1"
    with pytest.raises(UnsafeQueryError, match="unknown table 'logs'"):
        query_services(sql, {"posts"})
    # In unrestricted mode the outer name MUST receive a boundary CTE.
    assert query_services(sql) == {"logs"}
    assert "collection_name = 'logs'" in build_safe_query(sql, {"logs": ["g"]})


def test_nested_raw_reference_cannot_be_hidden():
    with pytest.raises(UnsafeQueryError, match="raw table"):
        query_services("SELECT * FROM users JOIN (WITH users AS (SELECT 1) SELECT 1) x ON 1 = 1")


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT 1 LIMIT 999999999999",
        "SELECT 1 UNION ALL SELECT 2 LIMIT 999999999999",
        "SELECT 1 LIMIT 1 WITH TIES",
    ],
)
def test_caller_limit_cannot_remove_outer_cap(sql):
    tree = sqlglot.parse_one(build_safe_query(sql, {}, max_limit=1000), dialect="clickhouse")
    assert tree.args["limit"].expression.this == "1000"


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT 1 SETTINGS max_result_rows = 0",
        "SELECT * FROM (SELECT 1 SETTINGS max_execution_time = 0)",
    ],
)
def test_caller_settings_rejected(sql):
    with pytest.raises(UnsafeQueryError, match="settings"):
        query_services(sql)


@pytest.mark.parametrize(
    "prepare",
    [
        {"media": True},
        {"ads": True},
        {"face": {"bodyField": "body", "mediaField": "avatar_ref"}},
    ],
)
def test_fabricated_table_free_rows_never_mint(prepare):
    endpoint._query_log.clear()
    request = Request({"type": "http", "headers": []})
    data = QueryRequest(
        sql="SELECT 'victim' AS author_key, 'private' AS doc_id, "
        '\'{"media_refs":["secret"],"avatar_ref":"secret"}\' AS body',
        prepare=prepare,
    )
    with (
        patch.object(
            endpoint.ch,
            "execute_query",
            return_value=(["doc_id", "author_key", "body"], [("private", "victim", '{"media_refs":["secret"]}')]),
        ),
        patch.object(endpoint.ch, "get_user_groups", return_value=[]),
        patch.object(endpoint.ch, "read_document_by_id") as canonical,
        patch.object(endpoint.ch, "resolve_media_urls") as mint,
    ):
        result = endpoint.run_query(request, data)
    assert result["count"] == 1
    canonical.assert_not_called()  # No source service, so no canonical carrier.
    mint.assert_not_called()
    assert endpoint._prepare_rows([{"author_key": "victim", "body": {}}], "anon", PrepareSpec(**prepare))


@pytest.mark.parametrize("rows,byte_limit", [([("x",)] * 1001, 100000), ([("x" * 200,)], 100)])
def test_endpoint_rejects_oversized_results(rows, byte_limit):
    endpoint._query_log.clear()
    with (
        patch.object(endpoint.ch, "get_user_groups", return_value=[]),
        patch.object(endpoint.ch, "execute_query", return_value=(["value"], rows)),
        patch.object(endpoint, "MAX_RESULT_BYTES", byte_limit),
    ):
        with pytest.raises(HTTPException) as exc:
            endpoint.run_query(Request({"type": "http", "headers": []}), QueryRequest(sql="SELECT 1"))
    assert exc.value.status_code == 400


@pytest.mark.parametrize("authenticated", [False, True])
@pytest.mark.parametrize("allowed", [{"posts"}, {"*"}])
def test_canonical_read_rechecks_current_boundary(authenticated, allowed):
    with (
        patch.object(
            endpoint.ch,
            "read_document_by_id",
            return_value={"doc_id": "real", "author_key": "alice", "body": {"media_refs": ["stale"]}},
        ) as read,
        patch.object(endpoint.ch, "readable_groups", return_value=["g"]) as gate,
        patch.object(
            endpoint.ch,
            "execute_query",
            return_value=(["doc_id", "author_key", "body"], [("real", "alice", '{"media_refs":["current"]}')]),
        ) as execute,
    ):
        doc = endpoint._canonical_prepare_doc("real", "reader", authenticated, {"posts"}, allowed, ["g"])
    read.assert_called_once_with("real", "reader", "posts", authenticated)
    gate.assert_called_once_with("reader", "posts", authenticated, ["g"])
    assert "collection_name = 'posts'" in execute.call_args.args[0]
    assert doc["body"]["media_refs"] == ["current"]


@pytest.mark.parametrize(
    "located,readable,results",
    [
        (None, ["g"], []),
        ({"doc_id": "wrong", "author_key": "alice"}, ["g"], []),
        ({"doc_id": "real", "author_key": "alice"}, [], []),
        ({"doc_id": "real", "author_key": "alice"}, ["g"], []),
        ({"doc_id": "real", "author_key": "alice"}, ["g"], [("real", "foreign", "{}")]),
    ],
)
def test_fabricated_revoked_hidden_and_mismatched_carriers_never_sign(located, readable, results):
    with (
        patch.object(endpoint.ch, "read_document_by_id", return_value=located),
        patch.object(endpoint.ch, "readable_groups", return_value=readable),
        patch.object(endpoint.ch, "execute_query", return_value=(["doc_id", "author_key", "body"], results)),
        patch.object(endpoint.ch, "resolve_media_urls_in_docs") as mint,
        patch.object(endpoint.ch, "attach_pinned_ads") as ads,
    ):
        endpoint._prepare_rows(
            [{"doc_id": "real", "author_key": "victim", "body": {"media_refs": ["secret"]}}],
            "reader",
            PrepareSpec(media=True, ads=True),
            True,
            {"posts"},
            {"posts"},
            ["g"],
        )
    mint.assert_not_called()
    ads.assert_not_called()


def test_projection_cannot_change_prepared_body_author_or_ads():
    canonical = {
        "doc_id": "real",
        "author_key": "alice",
        "body": {"media_refs": ["legit"]},
        "ad_mode": "none",
        "ad_target": "",
    }
    forged = {
        "doc_id": "real",
        "author_key": "victim",
        "body": {"media_refs": ["secret"]},
        "ad_mode": "pinned",
        "ad_target": "private",
        "ad": {"body": {"media_refs": ["secret"]}},
        "node_ad": {"body": {"media_refs": ["secret"]}},
        "like_count": 5,
    }
    with (
        patch.object(endpoint, "_canonical_prepare_doc", return_value=canonical) as read,
        patch.object(endpoint.ch, "attach_pinned_ads", side_effect=lambda docs, reader: docs) as ads,
        patch.object(endpoint.ch, "attach_node_ads", side_effect=lambda docs, reader: docs),
        patch.object(endpoint.ch, "resolve_media_urls_in_docs", side_effect=lambda docs: docs) as mint,
        patch.object(endpoint, "_mint_hls_manifest_urls", side_effect=lambda docs, reader, auth: docs),
    ):
        rows = endpoint._prepare_rows(
            [forged, forged], "reader", PrepareSpec(media=True, ads=True), True, {"posts"}, {"posts"}, ["g"]
        )
    read.assert_called_once()
    assert ads.call_args.args[0][0] == canonical
    assert mint.call_args.args[0][0] == canonical
    assert rows[0]["author_key"] == "alice"
    assert rows[0]["body"] == {"media_refs": ["legit"]}
    assert rows[0]["like_count"] == 5
    assert "ad" not in rows[0] and "node_ad" not in rows[0]


def test_selected_ad_is_reauthorized_and_replaced_before_signing():
    carrier = {"doc_id": "real", "author_key": "alice", "body": {}}
    canonical_ad = {"doc_id": "ad1", "author_key": "bob", "body": {"media_refs": ["authorized"]}}
    with (
        patch.object(endpoint, "_canonical_prepare_doc", side_effect=[carrier, canonical_ad]) as read,
        patch.object(
            endpoint.ch,
            "attach_pinned_ads",
            side_effect=lambda docs, reader: [
                {**docs[0], "ad": {"doc_id": "ad1", "author_key": "victim", "body": {"media_refs": ["secret"]}}}
            ],
        ),
        patch.object(endpoint.ch, "attach_node_ads", side_effect=lambda docs, reader: docs),
        patch.object(endpoint.ch, "get_document_any_author", return_value={"service": "ads"}),
        patch.object(endpoint.ch, "resolve_media_urls_in_docs", side_effect=lambda docs: docs) as mint,
        patch.object(endpoint, "_mint_hls_manifest_urls", side_effect=lambda docs, reader, auth: docs),
    ):
        rows = endpoint._prepare_rows(
            [{"doc_id": "real"}], "reader", PrepareSpec(media=True, ads=True), True, {"posts"}, {"posts", "ads"}, ["g"]
        )
    assert read.call_args_list[1].args == ("ad1", "reader", True, ["ads"], {"posts", "ads"})
    assert mint.call_args.args[0][0]["ad"] == canonical_ad
    assert rows[0]["ad"] == canonical_ad


def test_prepare_cannot_read_ungranted_ad_service():
    with patch.object(endpoint.ch, "read_document_by_id") as read:
        assert endpoint._canonical_prepare_doc("private", "reader", True, {"private_ads"}, {"posts"}) is None
    read.assert_not_called()


def test_inaccessible_selected_ad_is_removed_before_media_pass():
    carrier = {"doc_id": "real", "author_key": "alice", "body": {}}
    with (
        patch.object(endpoint, "_canonical_prepare_doc", side_effect=[carrier, None]),
        patch.object(
            endpoint.ch,
            "attach_pinned_ads",
            side_effect=lambda docs, reader: [
                {**docs[0], "ad": {"doc_id": "private", "body": {"media_refs": ["secret"]}}}
            ],
        ),
        patch.object(endpoint.ch, "attach_node_ads", side_effect=lambda docs, reader: docs),
        patch.object(endpoint.ch, "get_document_any_author", return_value={"service": "ads"}),
        patch.object(endpoint.ch, "resolve_media_urls_in_docs", side_effect=lambda docs: docs) as mint,
        patch.object(endpoint, "_mint_hls_manifest_urls", side_effect=lambda docs, reader, auth: docs),
    ):
        rows = endpoint._prepare_rows(
            [{"doc_id": "real"}], "reader", PrepareSpec(media=True, ads=True), True, {"posts"}, {"posts", "ads"}, ["g"]
        )
    assert "ad" not in mint.call_args.args[0][0]
    assert "ad" not in rows[0]


def test_combined_face_and_media_preserves_media():
    endpoint._query_log.clear()
    with (
        patch.object(endpoint.ch, "get_user_groups", return_value=[{"group_id": "g"}]),
        patch.object(endpoint.ch, "readable_groups", return_value=["g"]),
        patch.object(endpoint.ch, "execute_query", return_value=(["doc_id", "count"], [("real", 5)])),
        patch.object(
            endpoint,
            "_canonical_prepare_doc",
            return_value={"doc_id": "real", "author_key": "alice", "body": {"media_refs": ["legit"]}},
        ),
        patch.object(
            endpoint.ch,
            "resolve_media_urls_in_docs",
            side_effect=lambda docs: [{**docs[0], "body": {"media_refs": [{"read_url": "signed-legit"}]}}],
        ),
        patch.object(endpoint, "_mint_hls_manifest_urls", side_effect=lambda docs, reader, auth: docs),
        patch.object(endpoint.ch, "resolve_media_urls") as face_mint,
    ):
        result = endpoint.run_query(
            Request({"type": "http", "headers": []}),
            QueryRequest(
                sql="SELECT doc_id FROM posts",
                prepare={"media": True, "face": {"bodyField": "profile_body", "mediaField": "avatar_ref"}},
            ),
        )
    assert "prepare_disabled" not in result
    assert result["rows"][0]["count"] == 5
    assert result["rows"][0]["body"]["media_refs"][0]["read_url"] == "signed-legit"
    face_mint.assert_not_called()


@pytest.mark.parametrize("service", ["profile", "web10-social-group-identity", "shop-brand"])
@pytest.mark.parametrize("authenticated", [False, True])
@pytest.mark.parametrize("wildcard", [False, True])
def test_face_request_without_source_id_signs_only_boundary_verified_pair(service, authenticated, wildcard):
    row = {"author_key": "alice", "body": {"avatar_ref": "av1"}, "group_id": "g"}
    with (
        patch.object(endpoint.ch, "readable_groups", return_value=["g"]) as gate,
        patch.object(
            endpoint.ch,
            "execute_query",
            return_value=(["doc_id", "author_key", "body"], [("face1", "alice", '{"avatar_ref":"av1"}')]),
        ) as execute,
        patch.object(endpoint.ch, "resolve_media_urls", return_value={"media_refs": [{"read_url": "signed"}]}) as mint,
    ):
        result = endpoint._prepare_rows(
            [row, row],
            "reader",
            PrepareSpec(face={"bodyField": "body", "mediaField": "avatar_ref"}),
            authenticated,
            {service},
            {"*"} if wildcard else {service},
            ["g"],
        )
    gate.assert_called_once_with("reader", service, authenticated, ["g"])
    sql = execute.call_args.args[0]
    assert f"collection_name = '{service}'" in sql
    assert "JSONExtractString(body, 'avatar_ref') = 'av1'" in sql
    assert "author_key = 'alice'" in sql
    assert execute.call_args.kwargs["settings"]["readonly"] == 1
    mint.assert_called_once_with({"media_refs": ["av1"]}, "alice")
    assert all(r["avatar_url"] == "signed" for r in result)


@pytest.mark.parametrize(
    "author,ref,canonical",
    [
        ("victim", "private-avatar", []),
        ("alice", "private-avatar", []),
        ("victim", "av1", [("face1", "alice", '{"avatar_ref":"av1"}')]),
        ("alice", "private-avatar", [("face1", "alice", '{"avatar_ref":"av1"}')]),
    ],
)
def test_forged_face_author_and_refs_or_inaccessible_profiles_never_sign(author, ref, canonical):
    with (
        patch.object(endpoint.ch, "readable_groups", return_value=["g"]),
        patch.object(endpoint.ch, "execute_query", return_value=(["doc_id", "author_key", "body"], canonical)),
        patch.object(endpoint.ch, "resolve_media_urls") as mint,
    ):
        result = endpoint._prepare_rows(
            [{"author_key": author, "profile_body": {"avatar_ref": ref}, "avatar_url": "forged"}],
            "anon",
            PrepareSpec(face={"bodyField": "profile_body", "mediaField": "avatar_ref"}),
            False,
            {"profile"},
            None,
            ["g"],
        )
    mint.assert_not_called()
    assert "avatar_url" not in result[0]


def test_face_cannot_use_ungranted_or_unreadable_service():
    with (
        patch.object(endpoint.ch, "readable_groups", return_value=[]) as gate,
        patch.object(endpoint.ch, "execute_query") as execute,
        patch.object(endpoint.ch, "resolve_media_urls") as mint,
    ):
        endpoint._prepare_rows(
            [{"author_key": "alice", "body": {"avatar_ref": "av1"}}],
            "reader",
            PrepareSpec(face={"bodyField": "body", "mediaField": "avatar_ref"}),
            True,
            {"profile", "secret"},
            {"profile"},
            ["g"],
        )
    gate.assert_called_once_with("reader", "profile", True, ["g"])
    execute.assert_not_called()
    mint.assert_not_called()


def test_shipped_anon_face_query_returns_signed_avatar_end_to_end():
    endpoint._query_log.clear()
    with (
        patch.object(endpoint.ch, "readable_groups", return_value=["g"]),
        patch.object(
            endpoint.ch,
            "execute_query",
            side_effect=[
                (["author_key", "body"], [("alice", '{"avatar_ref":"av1"}')]),
                (["doc_id", "author_key", "body"], [("face1", "alice", '{"avatar_ref":"av1"}')]),
            ],
        ),
        patch.object(endpoint.ch, "resolve_media_urls", return_value={"media_refs": [{"read_url": "signed"}]}),
    ):
        result = endpoint.run_query(
            Request({"type": "http", "headers": []}),
            QueryRequest(
                sql="SELECT author_key AS author_key, body AS body FROM profile "
                "WHERE author_key IN ('alice') "
                "QUALIFY row_number() OVER (PARTITION BY author_key ORDER BY created_at DESC) = 1",
                groups=["g"],
                prepare={"face": {"bodyField": "body", "mediaField": "avatar_ref"}},
            ),
        )
    assert result == {
        "rows": [{"author_key": "alice", "body": {"avatar_ref": "av1"}, "avatar_url": "signed"}],
        "count": 1,
    }


def test_wildcard_compiles_services_but_not_caller_ctes():
    sql = "WITH x AS (SELECT * FROM notes) SELECT * FROM x"
    assert query_services(sql, {"*"}) == {"notes"}
    compiled = build_safe_query(sql, {"notes": ["g"]}, allowed_services={"*"})
    assert "collection_name = 'notes'" in compiled
    assert "collection_name = 'x'" not in compiled


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT * FROM documents",
        "SELECT * FROM group_members",
        "SELECT * FROM node_config",
        "SELECT * FROM group",
        "SELECT * FROM node",
        "SELECT * FROM group_meta",
        "SELECT * FROM numbers(10)",
        "SELECT * FROM s3('https://example.com')",
        "ALTER TABLE notes DELETE WHERE 1 = 1",
    ],
)
def test_wildcard_never_opens_reserved_tables_functions_or_management(sql):
    with pytest.raises(UnsafeQueryError):
        query_services(sql, {"*", "group", "node", "group_meta"})
    with pytest.raises(UnsafeQueryError):
        build_safe_query(sql, {"notes": ["g"]}, allowed_services={"*", "group", "node", "group_meta"})


def test_wildcard_group_metadata_still_requires_opt_in_and_boundary():
    sql = "SELECT * FROM notes JOIN group_meta USING (group_id)"
    assert query_services(sql, {"*"}, group_meta=True) == {"notes"}
    compiled = build_safe_query(sql, {"notes": ["g"]}, allowed_services={"*"}, group_meta=(["g"], ["g", "private"]))
    assert "CASE WHEN" in compiled
    assert "collection_name = 'group_meta'" not in compiled


@pytest.mark.parametrize("service", ["group", "node", "group_meta", "documents"])
def test_wildcard_prepare_never_locates_reserved_service(service):
    with patch.object(endpoint.ch, "read_document_by_id") as read:
        assert endpoint._canonical_prepare_doc("real", "reader", True, {service}, {"*"}) is None
    read.assert_not_called()


@pytest.mark.parametrize("allowed", [None, {"*"}, {"group", "node"}])
@pytest.mark.parametrize("service", ["group", "node"])
def test_management_namespaces_are_not_document_services(service, allowed):
    with pytest.raises(UnsafeQueryError, match="reserved namespace"):
        query_services(f"SELECT * FROM {service}", allowed)
    with (
        patch.object(endpoint.ch, "readable_groups") as gate,
        patch.object(endpoint.ch, "resolve_media_urls") as mint,
    ):
        endpoint._prepare_rows(
            [{"author_key": "alice", "body": {"avatar_ref": "av1"}}],
            "reader",
            PrepareSpec(face={"bodyField": "body", "mediaField": "avatar_ref"}),
            True,
            {service},
            allowed,
            ["g"],
        )
    gate.assert_not_called()
    mint.assert_not_called()


def test_app_wildcard_select_and_media_prepare_use_canonical_notes():
    endpoint._query_log.clear()
    with (
        patch.object(endpoint, "user_or_anon", return_value="reader"),
        patch.object(endpoint, "app_contract_origin", return_value="https://notes.example"),
        patch.object(endpoint.ch, "get_app_permissions", return_value={"*": ["readAll"]}),
        patch.object(endpoint.ch, "readable_groups", return_value=["g"]),
        patch.object(endpoint.ch, "read_document_by_id", return_value={"doc_id": "real", "author_key": "alice"}),
        patch.object(
            endpoint.ch,
            "execute_query",
            side_effect=[
                (["doc_id"], [("real",)]),
                (["doc_id", "author_key", "body"], [("real", "alice", '{"media_refs":["legit"]}')]),
            ],
        ) as execute,
        patch.object(endpoint.ch, "resolve_media_urls_in_docs", side_effect=lambda docs: docs) as mint,
        patch.object(endpoint, "_mint_hls_manifest_urls", side_effect=lambda docs, reader, auth: docs),
    ):
        result = endpoint.run_query(
            Request({"type": "http", "headers": []}),
            QueryRequest(
                sql="SELECT doc_id FROM notes",
                groups=["g"],
                prepare={"media": True},
            ),
        )
    assert result["rows"][0]["body"] == {"media_refs": ["legit"]}
    assert mint.call_args.args[0][0]["author_key"] == "alice"
    assert all("collection_name = 'notes'" in call.args[0] for call in execute.call_args_list)


@pytest.mark.parametrize("preparation", [False, True])
def test_backend_errors_are_generic_and_correlated_without_secret_logs(caplog, preparation):
    endpoint._query_log.clear()
    secret = "password=backend-secret https://internal:credential@clickhouse"
    with (
        patch.object(endpoint.ch, "get_user_groups", return_value=[]),
        patch.object(
            endpoint.ch,
            "execute_query",
            side_effect=(None if preparation else endpoint.ch.QueryExecutionError(secret)),
            return_value=(["one"], [(1,)]),
        ),
        patch.object(endpoint, "_prepare_rows", side_effect=endpoint.ch.QueryExecutionError(secret)),
    ):
        with pytest.raises(HTTPException) as exc:
            endpoint.run_query(
                Request({"type": "http", "headers": []}),
                QueryRequest(
                    sql="SELECT 1",
                    prepare={"media": True} if preparation else None,
                ),
            )
    assert exc.value.status_code == 400
    assert "reference: " in exc.value.detail
    reference = exc.value.detail.split("reference: ")[1].rstrip(")")
    assert reference in caplog.text
    assert secret not in caplog.text + exc.value.detail
