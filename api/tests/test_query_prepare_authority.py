"""Canonical media/ad prepare authority; SQL execution remains doubled here."""

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.v3.services import clickhouse as ch


def _result(doc_id="d1", owner="alice", uploader="alice", key="alice/video.png"):
    return (
        ["doc_id", "author_key", "posted_by", "body", "ad_mode", "ad_target"],
        [(doc_id, owner, uploader, json.dumps({"type": "minio", "value": key}), "none", "")],
    )


def test_media_uses_canonical_uploader_body_and_drops_projected_ads(valid_token):
    projected = (
        ["doc_id", "author_key", "posted_by", "body", "ad", "node_ad", "score"],
        [("d1", "bob", "bob", '{"type":"minio","value":"bob/private.png"}', {"body": "fake"}, {"body": "fake"}, 17)],
    )
    signer = MagicMock()
    signer.generate_presigned_url.return_value = "synthetic-owned-url"
    with (
        patch.object(ch, "get_user_groups", return_value=[{"group_id": "g1"}]),
        patch.object(ch, "readable_groups", return_value=["g1"]),
        patch.object(ch, "execute_query", side_effect=[projected, _result(owner="group-id")]) as execute,
        patch.object(ch, "get_s3_signing_client", return_value=signer),
    ):
        response = TestClient(app).post(
            "/v3/query",
            json={
                "token": valid_token,
                "sql": "SELECT doc_id, author_key, body FROM posts",
                "prepare": {"media": True},
            },
        )
    assert response.status_code == 200
    row = response.json()["rows"][0]
    assert row["author_key"] == "group-id" and row["posted_by"] == "alice"
    assert row["body"] == {"type": "minio", "value": "alice/video.png", "url": "synthetic-owned-url"}
    assert row["score"] == 17
    assert "ad" not in row and "node_ad" not in row
    assert signer.generate_presigned_url.call_args.kwargs["Params"]["Key"] == "alice/video.png"
    canonical_sql = execute.call_args_list[1].args[0]
    assert "d.posted_by" in canonical_sql
    assert "group_hidden_docs" in canonical_sql and "user_group_sharing" in canonical_sql
    assert "bob/private.png" not in canonical_sql
    assert "d1" in canonical_sql and "g1" in canonical_sql


@pytest.mark.parametrize("authenticated", [False, True])
@pytest.mark.parametrize("grants", [[], ["g1"]])
def test_unreadable_canonical_doc_never_signs(valid_token, authenticated, grants):
    payload = {"sql": "SELECT doc_id, body FROM posts", "prepare": {"media": True}}
    if authenticated:
        payload["token"] = valid_token
    with (
        patch.object(ch, "get_user_groups", return_value=[{"group_id": "g1"}]),
        patch.object(ch, "readable_groups", return_value=grants),
        patch.object(
            ch, "execute_query", side_effect=[_result(owner="bob", uploader="bob", key="bob/private.png"), ([], [])]
        ) as execute,
        patch.object(ch, "get_s3_signing_client") as signer,
    ):
        response = TestClient(app).post("/v3/query", json=payload)
    assert response.status_code == 403
    assert execute.call_count == (2 if grants else 1)
    signer.assert_not_called()


@pytest.mark.parametrize("doc_id", [None, "", 7, {}, []])
def test_non_document_projection_does_not_mint(valid_token, doc_id):
    with (
        patch.object(ch, "get_user_groups", return_value=[{"group_id": "g1"}]),
        patch.object(ch, "readable_groups", return_value=["g1"]),
        patch.object(ch, "execute_query", return_value=(["doc_id", "body"], [(doc_id, "{}")])) as execute,
        patch.object(ch, "get_s3_signing_client") as signer,
    ):
        response = TestClient(app).post(
            "/v3/query",
            json={
                "token": valid_token,
                "sql": "SELECT doc_id, body FROM posts",
                "prepare": {"media": True},
            },
        )
    assert response.status_code == 200
    execute.assert_called_once()
    signer.assert_not_called()


def test_aggregate_prepare_remains_noop(valid_token):
    with (
        patch.object(ch, "get_user_groups", return_value=[{"group_id": "g1"}]),
        patch.object(ch, "readable_groups", return_value=["g1"]),
        patch.object(ch, "execute_query", return_value=(["count"], [(3,)])) as execute,
        patch.object(ch, "get_s3_signing_client") as signer,
    ):
        response = TestClient(app).post(
            "/v3/query",
            json={
                "token": valid_token,
                "sql": "SELECT count() AS count FROM posts",
                "prepare": {"media": True},
            },
        )
    assert response.status_code == 200 and response.json()["rows"] == [{"count": 3}]
    execute.assert_called_once()
    signer.assert_not_called()


@pytest.mark.parametrize("field", ["body", "ad_mode", "ad_target", "ad", "node_ad"])
def test_reserved_aggregate_alias_does_not_request_canonical_data(field):
    from app.v3.endpoints.query import _prepare_rows
    from app.v3.models import PrepareSpec

    rows = [{"doc_id": "aggregate-key", field: 3}]
    with patch.object(ch, "execute_query") as execute, patch.object(ch, "get_s3_signing_client") as signer:
        assert _prepare_rows(rows, "anon", PrepareSpec(media=True, ads=True), {"posts": ["g1"]}) == rows
    execute.assert_not_called()
    signer.assert_not_called()


def test_explicit_large_prepared_result_not_truncated(valid_token):
    columns = ["doc_id", "author_key", "posted_by", "body", "ad_mode", "ad_target"]
    values = [(f"d{i}", "alice", "alice", "{}", "none", "") for i in range(1001)]
    with (
        patch.object(ch, "get_user_groups", return_value=[{"group_id": "g1"}]),
        patch.object(ch, "readable_groups", return_value=["g1"]),
        patch.object(ch, "execute_query", side_effect=[(columns, values), (columns, values)]) as execute,
    ):
        response = TestClient(app).post(
            "/v3/query",
            json={
                "token": valid_token,
                "sql": "SELECT doc_id, body FROM posts LIMIT 1001",
                "prepare": {"media": True},
            },
        )
    assert response.status_code == 200 and response.json()["count"] == 1001
    assert "LIMIT 1002" in execute.call_args_list[1].args[0]


def test_canonical_read_failure_does_not_sign():
    from fastapi import HTTPException

    from app.v3.endpoints.query import _canonical_prepare_docs

    with (
        patch.object(ch, "execute_query", side_effect=ch.QueryExecutionError("synthetic")),
        patch.object(ch, "get_s3_signing_client") as signer,
        pytest.raises(HTTPException) as denied,
    ):
        _canonical_prepare_docs([{"doc_id": "d1", "body": {}}], "anon", {"posts": ["g1"]})
    assert denied.value.status_code == 403
    signer.assert_not_called()


def test_ambiguous_author_identity_denied():
    from fastapi import HTTPException

    from app.v3.endpoints.query import _canonical_prepare_docs

    columns, rows = _result()
    rows += _result(owner="bob", uploader="bob")[1]
    with patch.object(ch, "execute_query", return_value=(columns, rows)), pytest.raises(HTTPException) as denied:
        _canonical_prepare_docs([{"doc_id": "d1", "body": {}}], "anon", {"posts": ["g1"]})
    assert denied.value.status_code == 403


@pytest.mark.parametrize("authenticated", [False, True])
def test_canonical_ads_and_hls_keep_independent_uploaders(valid_token, authenticated):
    from types import SimpleNamespace

    from app.services import config as cfg
    from app.services import hls

    columns = ["doc_id", "author_key", "posted_by", "body", "ad_mode", "ad_target"]
    projected = (columns, [("d1", "bob", "bob", '{"media_refs":["foreign"]}', "pinned", "forged-ad")])
    canonical = (columns, [("d1", "group-main", "alice", '{"media_refs":["main-media"]}', "pinned", "real-ad")])
    owners = []

    def query(sql, params):
        if "author_key" in params:
            owner = params["author_key"]
            owners.append(owner)
            meta = {
                "object_key": f"{owner}/tree/video.mp4",
                "transcoding_settings": {"enabled": True, "status": "done"},
            }
            return SimpleNamespace(result_rows=[(params["r0"], json.dumps(meta), "media_metadata")])
        if "SELECT ad.doc_id" in sql:
            # The real pinned loader must receive canonical, not projected preferences.
            assert params["t0"] == "real-ad"
            return SimpleNamespace(
                result_rows=[("real-ad", "group-ad", '{"media_refs":["ad-media"]}', ["ad"], "carol")]
            )
        assert "node_ad" in sql
        return SimpleNamespace(
            result_rows=[
                ("node-ad", "group-node", '{"status":"active","media_refs":["node-media"]}', ["node_ad"], "dave")
            ]
        )

    payload = {"sql": "SELECT doc_id, author_key, body FROM posts", "prepare": {"media": True, "ads": True}}
    if authenticated:
        payload["token"] = valid_token
    with (
        patch.object(ch, "get_user_groups", return_value=[{"group_id": "g1"}]),
        patch.object(ch, "readable_groups", return_value=["g1"]),
        patch.object(ch, "execute_query", side_effect=[projected, canonical]),
        patch.object(ch.client, "query", side_effect=query),
        patch.object(ch, "get_s3_signing_client", return_value=MagicMock()),
        patch.object(
            cfg,
            "get_config_field",
            side_effect=lambda key, default=None: 100 if key == "node_ad_percentage" else default,
        ),
    ):
        response = TestClient(app).post("/v3/query", json=payload)
    assert response.status_code == 200
    row = response.json()["rows"][0]
    assert row["ad_target"] == "real-ad" and row["ad"]["doc_id"] == "real-ad"
    assert owners == ["alice", "carol", "dave"]
    for doc, owner in [(row, "alice"), (row["ad"], "carol"), (row["node_ad"], "dave")]:
        ref = doc["body"]["media_refs"][0]
        claims = hls.verify_sig(ref["transcoding_settings"]["manifest_url"].split("sig=")[1], ref["doc_id"])
        assert claims["prefix"] == f"{owner}/tree/hls"
        assert claims["authenticated"] is authenticated


def test_app_contract_denial_stops_canonical_read(valid_token):
    with patch.object(ch, "get_app_permissions", return_value={}), patch.object(ch, "execute_query") as execute:
        response = TestClient(app).post(
            "/v3/query",
            headers={"Origin": "https://app.example"},
            json={
                "token": valid_token,
                "sql": "SELECT doc_id, author_key, body FROM posts",
                "prepare": {"media": True},
            },
        )
    assert response.status_code == 403
    execute.assert_not_called()
