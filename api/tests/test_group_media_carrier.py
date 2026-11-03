"""Execute carrier SQL and signed HLS requests over synthetic storage, not real users."""

import json
import re
import sqlite3
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.hls import mint_sig
from app.v3.services import clickhouse as ch

GROUP = "node/groups/users/alice/movies"
BOARD = "node/groups/discover"
MEDIA = "media-1"


@pytest.fixture
def store(monkeypatch):
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.executescript("""
        CREATE TABLE documents (doc_id TEXT, author_key TEXT, posted_by TEXT,
          collection_name TEXT, body TEXT, deleted INT, updated_at INT,
          ref_value TEXT DEFAULT '', tags TEXT DEFAULT '[]', created_at INT DEFAULT 1,
          ad_mode TEXT DEFAULT 'none', ad_target TEXT DEFAULT '');
        CREATE TABLE doc_groups (doc_id TEXT, group_id TEXT, deleted INT, updated_at INT);
        CREATE TABLE user_blacklist (user_key TEXT, blocked_key TEXT, deleted INT, updated_at INT);
        CREATE TABLE group_blacklist (user_key TEXT, group_id TEXT, blocked_key TEXT, deleted INT, updated_at INT);
        CREATE TABLE user_group_sharing (user_key TEXT, group_id TEXT, sharing_enabled INT, deleted INT, updated_at INT);
        CREATE TABLE group_hidden_docs (doc_id TEXT, group_id TEXT, deleted INT, updated_at INT);
        CREATE TABLE banned_users (username TEXT, deleted INT, updated_at INT);
    """)
    db.create_function(
        "JSONExtractArrayRaw", 2, lambda b, k: json.dumps([json.dumps(x) for x in json.loads(b).get(k, [])])
    )
    db.create_function("has", 2, lambda a, x: x in json.loads(a))
    db.create_function("unhex", 1, lambda s: bytes.fromhex(s).decode())

    def query(sql, parameters=None):
        sql = re.sub(r"%\((\w+)\)s", r":\1", sql)
        return SimpleNamespace(result_rows=db.execute(sql, parameters or {}).fetchall())

    monkeypatch.setattr(ch, "client", SimpleNamespace(query=query))
    grants = {(BOARD, "anyone"): {"role": "reader"}}
    monkeypatch.setattr(
        ch, "is_group_member", lambda g, u: (g, u) in grants and u not in {"anyone", "authenticated", "anon"}
    )
    monkeypatch.setattr(ch, "get_group_member", lambda g, u: grants.get((g, u)))
    roles = [{"name": "reader", "permissions": {"posts": ["readAll"], "tracks": ["readAll"]}}]
    monkeypatch.setattr(ch, "get_group", lambda g: {"roles": roles})
    monkeypatch.setattr(ch, "get_doc_groups", lambda _: [])
    media = {
        "doc_id": MEDIA,
        "author_key": "alice",
        "body": {
            "transcoding_settings": {
                "enabled": True,
                "variants": [{"width": 432, "height": 360, "bitrate_kbps": 1000}],
            }
        },
    }
    monkeypatch.setattr(ch, "get_document_any_author", lambda _: media)
    yield db, grants
    db.close()


def carrier(db, *, author=GROUP, uploader="alice", service="posts", ref=MEDIA, version=1, deleted=0):
    db.execute(
        "INSERT INTO documents (doc_id,author_key,posted_by,collection_name,body,updated_at,deleted) VALUES (?,?,?,?,?,?,?)",
        ("post-1", author, uploader, service, json.dumps({"media_refs": [ref]}), version, deleted),
    )


def attachment(db, *, group=BOARD, version=1, deleted=0):
    db.execute("INSERT INTO doc_groups VALUES (?,?,?,?)", ("post-1", group, deleted, version))


def manifest(reader="anon", authenticated=False):
    sig = mint_sig(reader, MEDIA, "alice/upload/hls", authenticated)
    return TestClient(app).get("/v3/media/hls/manifest", params={"doc_id": MEDIA, "sig": sig})


@pytest.mark.parametrize("reader,authenticated", [("anon", False), ("bob", True)])
@pytest.mark.parametrize("service", ["posts", "tracks"])
def test_public_group_carrier_streams_for_non_uploader(store, reader, authenticated, service):
    db, _ = store
    carrier(db, service=service)
    attachment(db)
    response = manifest(reader, authenticated)
    assert response.status_code == 200, response.text
    assert "#EXTM3U" in response.text


def test_personal_legacy_carrier_still_streams(store):
    db, _ = store
    carrier(db, author="alice", uploader="")
    attachment(db)
    assert manifest().status_code == 200


@pytest.mark.parametrize(
    "change",
    [
        "deleted",
        "reference_removed",
        "detached",
        "wrong_uploader",
        "wrong_service",
        "hidden",
        "blocked",
        "paused",
        "banned",
    ],
)
@pytest.mark.parametrize("author", [GROUP, "alice"])
def test_unreadable_or_stale_group_carrier_cannot_stream(store, change, author):
    db, _ = store
    carrier(db, author=author)
    attachment(db)
    if change == "deleted":
        carrier(db, author=author, version=2, deleted=1)
    elif change == "reference_removed":
        carrier(db, author=author, version=2, ref="other-media")
    elif change == "detached":
        attachment(db, version=2, deleted=1)
    elif change == "wrong_uploader":
        carrier(db, author=author, version=2, uploader="mallory")
    elif change == "wrong_service":
        carrier(db, author=author, version=2, service="private-notes")
    elif change == "hidden":
        db.execute("INSERT INTO group_hidden_docs VALUES (?,?,0,1)", ("post-1", BOARD))
    elif change == "blocked":
        db.execute("INSERT INTO user_blacklist VALUES (?,'anon',0,1)", (author,))
    elif change == "paused":
        db.execute("INSERT INTO user_group_sharing VALUES (?,?,0,0,1)", (author, BOARD))
    else:
        db.execute("INSERT INTO banned_users VALUES (?,0,1)", (author,))
    assert manifest().status_code == 403


def test_private_membership_and_revocation(store):
    db, grants = store
    grants.clear()
    carrier(db)
    attachment(db)
    assert manifest("bob", True).status_code == 403
    grants[(BOARD, "bob")] = {"role": "reader"}
    assert manifest("bob", True).status_code == 200
    del grants[(BOARD, "bob")]
    assert manifest("bob", True).status_code == 403


def test_authenticated_class_never_upgrades_anonymous_stream(store):
    db, grants = store
    grants.clear()
    grants[(BOARD, "authenticated")] = {"role": "reader"}
    carrier(db)
    attachment(db)
    assert manifest().status_code == 403
    assert manifest("bob", True).status_code == 200


@pytest.mark.parametrize("kind", ["document", "attachment"])
def test_tombstone_wins_tied_history(store, kind):
    db, _ = store
    carrier(db)
    attachment(db)
    if kind == "document":
        carrier(db, deleted=1)
    else:
        attachment(db, deleted=1)
    assert manifest().status_code == 403


def test_unpublished_upload_never_streams_for_bystander(store):
    assert manifest().status_code == 403


def test_restored_carrier_and_attachment_stream_again(store):
    db, _ = store
    carrier(db, deleted=1)
    attachment(db, deleted=1)
    carrier(db, version=2)
    attachment(db, version=2)
    assert manifest().status_code == 200


def test_foreign_reference_does_not_borrow_another_readable_carrier(store):
    db, _ = store
    carrier(db, uploader="mallory")
    attachment(db)
    carrier(db, author="alice", uploader="", ref="other-media")
    assert manifest().status_code == 403


def test_group_local_block_denies_only_its_attachment(store):
    db, grants = store
    carrier(db)
    attachment(db)
    db.execute("INSERT INTO group_blacklist VALUES (?,?, 'anon',0,1)", (GROUP, BOARD))
    assert manifest().status_code == 403
    grants[("other-board", "anyone")] = {"role": "reader"}
    attachment(db, group="other-board")
    assert manifest().status_code == 200


def test_hidden_or_removed_link_does_not_suppress_independent_readable_link(store):
    db, grants = store
    carrier(db)
    attachment(db)
    attachment(db, group="other-board")
    db.execute("INSERT INTO group_hidden_docs VALUES (?,?,0,1)", ("post-1", BOARD))
    assert manifest().status_code == 403
    grants[("other-board", "anyone")] = {"role": "reader"}
    assert manifest().status_code == 200
    attachment(db, group="other-board", version=2, deleted=1)
    assert manifest().status_code == 403


@pytest.mark.parametrize("mime", ["image/webp", "audio/mpeg", "video/mp4", "application/pdf"])
def test_group_media_resolution_keeps_human_upload_owner(store, monkeypatch, mime):
    # All file types share the same resolver; no publicness/ownership backfill.
    db, _ = store
    db.execute(
        "INSERT INTO documents (doc_id,author_key,posted_by,collection_name,body,updated_at,deleted) VALUES (?,?,?,?,?,1,0)",
        (MEDIA, "alice", "", "media_metadata", json.dumps({"object_key": "alice/upload/file", "mime_type": mime})),
    )
    signer = Mock()
    signer.generate_presigned_url.return_value = "synthetic-owned-url"
    monkeypatch.setattr(ch, "get_s3_signing_client", lambda: signer)
    doc = {"author_key": GROUP, "posted_by": "alice", "body": {"media_refs": [MEDIA]}}
    ref = ch.resolve_media_urls_in_docs([doc])[0]["body"]["media_refs"][0]
    assert ref["read_url"] == "synthetic-owned-url" and ref["mime_type"] == mime
    assert signer.generate_presigned_url.call_args.kwargs["Params"]["Key"] == "alice/upload/file"
