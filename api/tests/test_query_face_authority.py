"""Canonical face authorization, with database results doubled, not ClickHouse proof."""

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlglot import parse_one

from app.main import app
from app.v3.endpoints.query import _prepare_face
from app.v3.models import PrepareFace
from app.v3.services import clickhouse as ch
from app.v3.services import safe_query as sq

FACE = PrepareFace(bodyField="profile_body", mediaField="avatar_ref", authorColumn="face_author")
COLUMNS = ["author_key", "media_ref", "media_owners"]


def test_forged_face_ref_never_reaches_resolver():
    rows = [{"face_author": "bob", "profile_body": {"avatar_ref": "private"}}]
    with (
        patch.object(ch, "execute_query", return_value=(COLUMNS, [])),
        patch.object(ch, "resolve_media_urls") as resolve,
    ):
        result = _prepare_face(rows, FACE, "anon", {"profile": ["public"]})
    resolve.assert_not_called()
    assert "avatar_url" not in result[0] and result == rows


@pytest.mark.parametrize("authenticated", [False, True])
@pytest.mark.parametrize("field", ["avatar_ref", "banner_ref"])
@pytest.mark.parametrize(
    "author,uploader,service",
    [
        ("alice", "alice", "profile"),
        ("identity-editor", "identity-editor", "web10-social-group-identity"),
        ("group-author", "human-uploader", "identity"),
    ],
)
def test_actual_resolver_uses_canonical_uploader_without_face_id(
    valid_token, authenticated, field, author, uploader, service
):
    projected = (
        ["face_author", "profile_body", "doc_id", "group_id", "score"],
        [
            (author, json.dumps({field: "face-media"}), "unrelated-post", "group-entity", 17),
        ],
    )
    signer = MagicMock()
    signer.generate_presigned_url.return_value = "synthetic-canonical-url"
    payload = {
        "sql": f"SELECT author_key AS face_author, body AS profile_body FROM `{service}`",
        "prepare": {
            "face": {
                "bodyField": "profile_body",
                "mediaField": field,
                "authorColumn": "face_author",
                "urlField": "face_url",
            },
        },
    }
    if authenticated:
        payload["token"] = valid_token
    with (
        patch.object(ch, "get_user_groups", return_value=[{"group_id": "public"}]),
        patch.object(ch, "readable_groups", return_value=["public"]),
        patch.object(
            ch, "execute_query", side_effect=[projected, (COLUMNS, [(author, "face-media", [uploader])])]
        ) as execute,
        patch.object(
            ch.client,
            "query",
            return_value=SimpleNamespace(
                result_rows=[
                    ("face-media", json.dumps({"object_key": f"{uploader}/face.png"}), "media_metadata"),
                ]
            ),
        ) as metadata,
        patch.object(ch, "get_s3_signing_client", return_value=signer),
    ):
        response = TestClient(app).post("/v3/query", json=payload)
    assert response.status_code == 200
    row = response.json()["rows"][0]
    assert row["face_url"] == "synthetic-canonical-url" and row["score"] == 17
    assert row["group_id"] == "group-entity" and row["doc_id"] == "unrelated-post"
    assert metadata.call_args.args[1]["author_key"] == uploader
    assert signer.generate_presigned_url.call_args.kwargs["Params"]["Key"] == f"{uploader}/face.png"
    sql = execute.call_args_list[1].args[0]
    assert "group_hidden_docs" in sql and "user_group_sharing" in sql and "banned_users" in sql
    assert "unrelated-post" not in sql and "JSONExtractString" in sql and "groupUniqArray" in sql
    outer = parse_one(sql, read=sq.DIALECT)
    outer.set("with_", None)
    assert sq.query_services(outer.sql(dialect=sq.DIALECT)) == {service}


@pytest.mark.parametrize(
    "raw", [None, "not JSON", "null", [], {}, {"avatar_ref": ""}, {"avatar_ref": []}, {"avatar_ref": 7}]
)
def test_missing_or_malformed_face_has_no_reads_or_stale_fallback(raw):
    rows = [{"face_author": "alice", "profile_body": raw}]
    with patch.object(ch, "execute_query") as execute, patch.object(ch, "resolve_media_urls") as resolve:
        assert "avatar_url" not in _prepare_face(rows, FACE, "anon", {"profile": ["g"]})[0]
    execute.assert_not_called()
    resolve.assert_not_called()


@pytest.mark.parametrize(
    "canonical",
    [
        [],
        [("mallory", "private", ["mallory"])],
        [("bob", "other", ["bob"])],
        [("bob", "private", [])],
        [("bob", "private", ["alice", "bob"])],
        [("bob", "private", [""])],
    ],
)
def test_exact_pair_and_unambiguous_uploader_required(canonical):
    rows = [{"face_author": "bob", "profile_body": {"avatar_ref": "private"}}]
    with (
        patch.object(ch, "execute_query", return_value=(COLUMNS, canonical)),
        patch.object(ch, "resolve_media_urls") as resolve,
    ):
        assert "avatar_url" not in _prepare_face(rows, FACE, "anon", {"profile": ["g"]})[0]
    resolve.assert_not_called()


def test_cross_service_ambiguity_and_read_failure_fail_before_mint():
    rows = [{"face_author": "bob", "profile_body": {"avatar_ref": "private"}}]
    for second in [
        (COLUMNS, [("bob", "private", ["carol"])]),
        ch.QueryExecutionError("sensitive SQL must not be logged"),
    ]:
        with (
            patch.object(ch, "execute_query", side_effect=[(COLUMNS, [("bob", "private", ["bob"])]), second]),
            patch.object(ch, "resolve_media_urls") as resolve,
        ):
            assert "avatar_url" not in _prepare_face(rows, FACE, "anon", {"profile": ["g"], "identity": ["g"]})[0]
        resolve.assert_not_called()


def test_no_readable_service_means_no_metadata_query():
    rows = [{"face_author": "bob", "profile_body": {"avatar_ref": "private"}}]
    with patch.object(ch, "execute_query") as execute, patch.object(ch, "resolve_media_urls") as resolve:
        assert "avatar_url" not in _prepare_face(rows, FACE, "anon", {"profile": []})[0]
    execute.assert_not_called()
    resolve.assert_not_called()


def test_duplicate_faces_share_resolution_and_default_author_column():
    rows = [{"author_key": "alice", "body": {"avatar_ref": "av"}, "score": n} for n in range(3)]
    face = PrepareFace(bodyField="body", mediaField="avatar_ref")
    with (
        patch.object(ch, "execute_query", return_value=(COLUMNS, [("alice", "av", ["alice"])])),
        patch.object(ch, "resolve_media_urls", return_value={"media_refs": [{"read_url": "fresh"}]}) as resolve,
    ):
        result = _prepare_face(rows, face, "viewer", {"profile": ["g"]})
    resolve.assert_called_once_with({"media_refs": ["av"]}, "alice")
    assert [row["score"] for row in result] == [0, 1, 2]
    assert all(row["avatar_url"] == "fresh" for row in result)
    assert all("avatar_url" not in row for row in rows)


def test_field_and_reference_are_sql_literals_not_expressions():
    field, ref = "avatar' OR 1=1 --", "ref' UNION SELECT * FROM documents --"
    face = PrepareFace(bodyField="body", mediaField=field)
    with patch.object(ch, "execute_query", return_value=(COLUMNS, [])) as execute:
        _prepare_face([{"author_key": "alice", "body": {field: ref}}], face, "viewer", {"profile": ["g"]})
    sql = execute.call_args.args[0]
    outer = parse_one(sql, read=sq.DIALECT)
    outer.set("with_", None)
    assert sq.query_services(outer.sql(dialect=sq.DIALECT)) == {"profile"}
    assert field not in sql and ref not in sql


@pytest.mark.parametrize("field", ["body", "author_key", "score", "avatar_url"])
def test_output_collision_is_rejected_without_dropping_data(field):
    from fastapi import HTTPException

    rows = [{"author_key": "alice", "body": {"bio": "keep"}, "score": 17, "avatar_url": "stale"}]
    face = PrepareFace(bodyField="body", mediaField="avatar_ref", urlField=field)
    with patch.object(ch, "execute_query") as execute, pytest.raises(HTTPException) as denied:
        _prepare_face(rows, face, "anon", {"profile": ["g"]})
    assert denied.value.status_code == 400
    assert rows[0]["score"] == 17 and rows[0]["body"] == {"bio": "keep"}
    execute.assert_not_called()


def test_large_page_and_opaque_strings_survive_compilation():
    rows = [{"author_key": f"a{i}", "body": {"avatar_ref": f"ref{i}"}} for i in range(1001)]
    rows[0] = {"author_key": "author'\\/../é", "body": {"avatar_ref": "opaque\\'µ"}}
    face = PrepareFace(bodyField="body", mediaField="avatar_ref")
    with patch.object(ch, "execute_query", return_value=(COLUMNS, [])) as execute:
        assert _prepare_face(rows, face, "viewer", {"profile": ["g"]}) == rows
    sql = execute.call_args.args[0]
    assert "LIMIT 1001" in sql and "GROUP BY" in sql
    assert "author'" not in sql
