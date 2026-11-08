"""Registered HTTP route + verified JWT + offline real SigV4, isolated from conftest mocks."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.parametrize(
    "case",
    [
        "foreign",
        "owned",
        "malformed",
        "tokens",
        "metadata-original",
        "metadata-thumbnail",
        "raw-foreign",
        "raw-owned",
        "query-owner-anon",
        "query-owner-auth",
        "query-owner-unprepared",
        "query-face-anon",
        "query-face-auth",
        "query-face-unprepared",
        "pinned-member-active",
        "pinned-member-revoked",
        "pinned-member-rejoined",
        "pinned-member-never",
        "pinned-member-revoked-tie",
        "pinned-member-revoked-other-member",
        "pinned-member-revoked-other-group",
        "pinned-member-alternate-group",
        "pinned-member-active-group-uploader",
        "pinned-member-revoked-group-uploader",
        "pinned-link-active",
        "pinned-link-removed",
        "pinned-link-reattached",
        "pinned-link-never",
        "pinned-link-removed-tie",
        "pinned-link-removed-tie-reversed",
        "pinned-link-removed-other-document",
        "pinned-link-removed-other-group",
        "pinned-link-removed-crossed-grants",
        "pinned-link-alternate-group",
        "pinned-link-active-group-uploader",
        "pinned-link-removed-group-uploader",
        "node-link-active",
        "node-link-removed",
        "node-link-reattached",
        "node-link-never",
        "node-link-active-group-uploader",
        "node-link-removed-group-uploader",
        "node-link-removed-tie",
        "node-link-removed-tie-reversed",
        "node-link-removed-other-document",
        "node-link-removed-other-group",
        "node-link-alternate-group",
        "node-link-active-other-document-removal",
        "node-doc-active",
        "node-doc-deleted",
        "node-doc-detagged",
        "node-doc-paused",
        "node-doc-reactivated",
        "node-doc-restored",
        "node-doc-retagged",
        "node-doc-deleted-group-uploader",
        "node-doc-active-group-uploader",
        "node-doc-active-other-document-deletion",
        "node-doc-active-other-author-deletion",
        "node-doc-deleted-tie",
        "node-doc-deleted-tie-reversed",
        "pinned-hidden-active",
        "pinned-hidden-hidden",
        "pinned-hidden-unhidden",
        "pinned-hidden-other-document",
        "pinned-hidden-other-group",
        "pinned-hidden-hidden-group-uploader",
        "pinned-hidden-same-group-active",
        "pinned-hidden-same-group-hidden",
        "pinned-hidden-same-group-unhidden",
        "pinned-hidden-same-group-hidden-group-uploader",
        "pinned-hidden-alternate-visible",
        "pinned-hidden-alternate-revoked",
        "pinned-hidden-alternate-removed",
        "pinned-hidden-crossed-grants",
        "pinned-hidden-unhidden-tie",
        "pinned-hidden-unhidden-tie-reversed",
        "pinned-hidden-rehidden",
        "pinned-hidden-hidden-other-document-unhide",
        "pinned-hidden-hidden-other-group-unhide",
        "pinned-hidden-alternate-hidden-primary-visible",
        "pinned-hidden-active-other-service",
        "pinned-hidden-hidden-other-service",
    ],
)
def test_read_url_owner_boundary(case):
    result = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), case],
        cwd=Path(__file__).resolve().parents[1],
        env={**os.environ, "AWS_EC2_METADATA_DISABLED": "true"},
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def _probe(case):
    import hashlib
    import hmac
    import logging
    import runpy
    import socket
    from datetime import UTC, datetime, timedelta
    from unittest.mock import patch
    from urllib.parse import parse_qsl, quote, unquote, urlsplit

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    runpy.run_path(str(Path(__file__).with_name("conftest.py")))
    for name in list(sys.modules):
        if name == "boto3" or name == "botocore" or name.startswith(("boto3.", "botocore.")):
            del sys.modules[name]

    def no_network(*args, **kwargs):
        raise AssertionError("network forbidden")

    socket.socket.connect = no_network
    socket.socket.connect_ex = no_network
    socket.create_connection = no_network
    socket.getaddrinfo = no_network

    import boto3
    import botocore
    import jwt
    from botocore.config import Config
    from fastapi.testclient import TestClient

    import app.settings as settings
    from app.main import app
    from app.v3.endpoints import media

    assert Path(boto3.__file__).is_file() and Path(botocore.__file__).is_file()
    settings.PRIVATE_KEY = "synthetic-route-jwt-key-not-a-production-secret"
    settings.ALGORITHM = "HS256"
    settings.S3_BUCKET = "synthetic-media"
    settings.READ_URL_EXPIRY = 3600
    access, secret = "SYNTHETICACCESS", "synthetic-sigv4-secret"
    signer = boto3.client(
        "s3",
        endpoint_url="https://s3.synthetic.invalid",
        aws_access_key_id=access,
        aws_secret_access_key=secret,
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    assert signer.generate_presigned_url.__module__ == "botocore.signers"
    print(f"real signer: boto3={boto3.__version__} botocore={botocore.__version__}")

    def verify(url, key):
        parsed = urlsplit(url)
        pairs = dict(parse_qsl(parsed.query, keep_blank_values=True))
        assert parsed.netloc == "s3.synthetic.invalid"
        assert unquote(parsed.path) == f"/{settings.S3_BUCKET}/{key}"
        assert pairs["X-Amz-Algorithm"] == "AWS4-HMAC-SHA256"
        assert pairs["X-Amz-Expires"] == str(settings.READ_URL_EXPIRY)
        assert pairs["X-Amz-SignedHeaders"] == "host"
        stamp = datetime.strptime(pairs["X-Amz-Date"], "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
        assert abs((datetime.now(UTC) - stamp).total_seconds()) < 60
        credential = pairs["X-Amz-Credential"].split("/")
        assert credential == [access, stamp.strftime("%Y%m%d"), "us-east-1", "s3", "aws4_request"]
        query = "&".join(
            f"{quote(k, safe='-_.~')}={quote(v, safe='-_.~')}"
            for k, v in sorted(pairs.items())
            if k != "X-Amz-Signature"
        )
        canonical = f"GET\n{parsed.path}\n{query}\nhost:{parsed.netloc}\n\nhost\nUNSIGNED-PAYLOAD"
        scope = "/".join(credential[1:])
        to_sign = f"AWS4-HMAC-SHA256\n{pairs['X-Amz-Date']}\n{scope}\n{hashlib.sha256(canonical.encode()).hexdigest()}"
        derived = ("AWS4" + secret).encode()
        for part in credential[1:]:
            derived = hmac.new(derived, part.encode(), hashlib.sha256).digest()
        expected = hmac.new(derived, to_sign.encode(), hashlib.sha256).hexdigest()
        assert hmac.compare_digest(expected, pairs["X-Amz-Signature"])

    def token(username="alice", expired=False, wrong_key=False):
        return jwt.encode(
            {
                "username": username,
                "expires": (datetime.now(UTC) + timedelta(hours=-1 if expired else 1)).isoformat(),
                "site": "auth.localhost",
                "provider": settings.PROVIDER,
                "target": settings.PROVIDER,
            },
            "synthetic-wrong-key-with-sufficient-length" if wrong_key else settings.PRIVATE_KEY,
            algorithm=settings.ALGORITHM,
        )

    if case.startswith(("pinned-member-", "pinned-link-", "node-link-", "node-doc-", "pinned-hidden-")):
        import sqlite3
        from types import SimpleNamespace

        from app.services import config as cfg
        from app.v3.services import clickhouse as ch

        # Retained disclosure replays must deny removed membership/attachment capabilities.
        is_doc = case.startswith("node-doc-")
        is_hidden = case.startswith("pinned-hidden-")
        is_node = is_doc or case.startswith("node-link-")
        is_link = is_node or case.startswith("pinned-link-")
        prefix = (
            "pinned-hidden-"
            if is_hidden
            else "node-doc-"
            if is_doc
            else "node-link-"
            if is_node
            else "pinned-link-"
            if is_link
            else "pinned-member-"
        )
        state = case.removeprefix(prefix)
        connected = os.environ.get("H01_AD_CLICKHOUSE") == "1"
        key = "bob/private-creative.png"
        carrier = {
            "doc_id": "carrier",
            "author_key": "alice",
            "body": {"text": "readable carrier"},
            "ad_mode": "none" if is_node else "pinned",
            "ad_target": "" if is_node else "creative",
        }
        schemas = [
            "documents (doc_id String, author_key String, body String, tags Array(String), posted_by String, deleted UInt8, updated_at UInt64)",
            "doc_groups (doc_id String, group_id String, deleted UInt8, updated_at UInt64)",
            "group_members (group_id String, member_key String, role String, joined_at UInt64, deleted UInt8, updated_at UInt64)",
            "group_hidden_docs (group_id String, doc_id String, deleted UInt8, updated_at UInt64)",
        ]
        body = json.dumps({"text": "synthetic restricted creative", "type": "minio", "value": key, "status": "active"})
        setup = (
            [f"CREATE TABLE {schema} ENGINE = Memory" for schema in schemas]
            if connected
            else [
                "CREATE TABLE documents (doc_id TEXT, author_key TEXT, body TEXT, tags TEXT, posted_by TEXT, deleted INTEGER, updated_at INTEGER)",
                "CREATE TABLE doc_groups (doc_id TEXT, group_id TEXT, deleted INTEGER, updated_at INTEGER)",
                "CREATE TABLE group_members (group_id TEXT, member_key TEXT, role TEXT, joined_at INTEGER, deleted INTEGER, updated_at INTEGER)",
                "CREATE TABLE group_hidden_docs (group_id TEXT, doc_id TEXT, deleted INTEGER, updated_at INTEGER)",
            ]
        )
        if is_doc or is_hidden:
            # Add compiler projection columns before inserting any history rows.
            for name, default in [
                ("collection_name", "posts"),
                ("ref_value", ""),
                ("created_at", ""),
                ("ad_mode", "none"),
                ("ad_target", ""),
            ]:
                setup.append(
                    f"ALTER TABLE documents ADD COLUMN {name} {'String' if connected else 'TEXT'} DEFAULT '{default}'"
                )
        tags = "['ad']" if connected else "'[\"ad\"]'"
        if is_node:
            tags = "['ad','node_ad']" if connected else '\'["ad","node_ad"]\''
        author = "group-author" if state.endswith("group-uploader") else "bob"
        setup += [
            "INSERT INTO documents (doc_id,author_key,body,tags,posted_by,deleted,updated_at) "
            f"VALUES ('creative','{author}','{body}',{tags},'bob',0,1)",
        ]
        if is_hidden and state.endswith("other-service"):
            setup[-1] = (
                "INSERT INTO documents (doc_id,author_key,body,tags,posted_by,deleted,updated_at,collection_name) "
                f"VALUES ('creative','{author}','{body}',{tags},'bob',0,1,'scores')"
            )
        if not is_link or state != "never":
            setup.append("INSERT INTO doc_groups VALUES ('creative','creative-group',0,1)")
        if is_link and (state.startswith("removed") or state == "reattached"):
            updated = 1 if state.startswith("removed-tie") else 2
            tombstone = f"INSERT INTO doc_groups VALUES ('creative','creative-group',1,{updated})"
            if state == "removed-tie-reversed":
                setup.insert(-1, tombstone)
            else:
                setup.append(tombstone)
        if is_link and state == "reattached":
            setup.append("INSERT INTO doc_groups VALUES ('creative','creative-group',0,3)")
        if is_link and state == "removed-other-document":
            setup.append("INSERT INTO doc_groups VALUES ('unrelated','creative-group',0,3)")
        if is_link and state == "removed-other-group":
            setup.append("INSERT INTO doc_groups VALUES ('creative','unrelated-group',0,3)")
        if is_node and state == "active-other-document-removal":
            setup.append("INSERT INTO doc_groups VALUES ('unrelated','creative-group',1,3)")
        if is_link and state == "removed-crossed-grants":
            setup += [
                "INSERT INTO doc_groups VALUES ('creative','alternate-group',0,3)",
                "INSERT INTO group_members VALUES ('alternate-group','alice','reader',1,0,1)",
                "INSERT INTO group_members VALUES ('alternate-group','alice','reader',1,1,2)",
            ]
        if is_link and state == "alternate-group":
            setup.append("INSERT INTO doc_groups VALUES ('creative','creative-group',1,2)")
        if is_link or state != "never":
            setup.append("INSERT INTO group_members VALUES ('creative-group','alice','reader',1,0,1)")
        if state.startswith("revoked") or state == "rejoined" or (not is_link and state == "alternate-group"):
            updated = 1 if state == "revoked-tie" else 2
            setup.append(f"INSERT INTO group_members VALUES ('creative-group','alice','reader',1,1,{updated})")
        if state == "rejoined":
            setup.append("INSERT INTO group_members VALUES ('creative-group','alice','reader',3,0,3)")
        if state == "revoked-other-member":
            setup.append("INSERT INTO group_members VALUES ('creative-group','carol','reader',1,0,3)")
        if state == "revoked-other-group":
            setup.append("INSERT INTO group_members VALUES ('unrelated-group','alice','reader',1,0,3)")
        if state == "alternate-group":
            setup += [
                "INSERT INTO group_members VALUES ('alternate-group','alice','reader',1,0,3)",
                "INSERT INTO doc_groups VALUES ('creative','alternate-group',0,3)",
            ]
        creative_group = ch.DISCOVER_GROUP_ID if is_node else "creative-group"
        if is_node:
            # Public inventory does not require an explicit reader-membership row.
            setup = [
                sql.replace("creative-group", creative_group) for sql in setup if "INSERT INTO group_members" not in sql
            ]
        if is_doc:
            if state in {"active-other-document-deletion", "active-other-author-deletion"}:
                other_doc = "unrelated" if state == "active-other-document-deletion" else "creative"
                other_author = author if state == "active-other-document-deletion" else "carol"
                setup.append(
                    "INSERT INTO documents (doc_id,author_key,body,tags,posted_by,deleted,updated_at) "
                    f"VALUES ('{other_doc}','{other_author}','{body}',{tags},'carol',1,3)"
                )
            elif not state.startswith("active"):
                deleted = int(state.startswith("deleted") or state == "restored")
                current_tags = ("['ad']" if connected else "'[\"ad\"]'") if state in {"detagged", "retagged"} else tags
                current_body = json.dumps(
                    {
                        **json.loads(body),
                        "text": "newer creative",
                        "status": "paused" if state in {"paused", "reactivated"} else "active",
                    }
                )
                updated = 1 if state.startswith("deleted-tie") else 2
                tombstone = (
                    "INSERT INTO documents (doc_id,author_key,body,tags,posted_by,deleted,updated_at) "
                    f"VALUES ('creative','{author}','{current_body}',{current_tags},'bob',{deleted},{updated})"
                )
                if state == "deleted-tie-reversed":
                    setup.insert(
                        next(i for i, sql in enumerate(setup) if sql.startswith("INSERT INTO documents")), tombstone
                    )
                else:
                    setup.append(tombstone)
                if state in {"reactivated", "restored", "retagged"}:
                    current_body = json.dumps({**json.loads(body), "text": "latest active creative"})
                    setup.append(
                        "INSERT INTO documents (doc_id,author_key,body,tags,posted_by,deleted,updated_at) "
                        f"VALUES ('creative','{author}','{current_body}',{tags},'bob',0,3)"
                    )
        if is_hidden:
            carrier_group = creative_group if state.startswith("same-group-") else "carrier-group"
            expected_visible = state in {
                "active",
                "unhidden",
                "other-document",
                "other-group",
                "same-group-active",
                "same-group-unhidden",
                "alternate-visible",
                "unhidden-tie",
                "unhidden-tie-reversed",
                "alternate-hidden-primary-visible",
                "active-other-service",
            }
            setup += [
                "INSERT INTO documents (doc_id,author_key,body,tags,posted_by,deleted,updated_at,ad_mode,ad_target) "
                f"VALUES ('carrier','alice','{json.dumps(carrier['body'])}',{tags},'alice',0,1,'pinned','creative')",
                f"INSERT INTO doc_groups VALUES ('carrier','{carrier_group}',0,1)",
            ]
            if carrier_group != creative_group:
                setup.append(f"INSERT INTO group_members VALUES ('{carrier_group}','alice','reader',1,0,1)")
            # Execute the entire actual compiler boundary against the same snapshot.
            visibility_schemas = [
                "user_blacklist (user_key String, blocked_key String, deleted UInt8, updated_at UInt64)",
                "group_blacklist (user_key String, group_id String, blocked_key String, deleted UInt8, updated_at UInt64)",
                "user_group_sharing (user_key String, group_id String, sharing_enabled UInt8, deleted UInt8, updated_at UInt64)",
                "banned_users (username String, deleted UInt8, updated_at UInt64)",
            ]
            for schema in visibility_schemas:
                setup.append(
                    f"CREATE TABLE {schema} ENGINE = Memory"
                    if connected
                    else "CREATE TABLE "
                    + schema.replace("String", "TEXT").replace("UInt8", "INTEGER").replace("UInt64", "INTEGER")
                )
            if state not in {"active", "same-group-active", "alternate-hidden-primary-visible", "active-other-service"}:
                hidden_doc = "unrelated" if state == "other-document" else "creative"
                hidden_group = "unrelated-group" if state == "other-group" else "creative-group"
                setup.append(f"INSERT INTO group_hidden_docs VALUES ('{hidden_group}','{hidden_doc}',0,2)")
                if state in {"unhidden", "same-group-unhidden", "rehidden"} or state.startswith("unhidden-tie"):
                    unhide_version = 2 if state.startswith("unhidden-tie") else 3
                    unhide = f"INSERT INTO group_hidden_docs VALUES ('creative-group','creative',1,{unhide_version})"
                    if state == "unhidden-tie-reversed":
                        setup.insert(-1, unhide)
                    else:
                        setup.append(unhide)
                if state == "rehidden":
                    setup.append("INSERT INTO group_hidden_docs VALUES ('creative-group','creative',0,4)")
                if state in {"hidden-other-document-unhide", "hidden-other-group-unhide"}:
                    other_doc = "unrelated" if state == "hidden-other-document-unhide" else "creative"
                    other_group = "unrelated-group" if state == "hidden-other-group-unhide" else "creative-group"
                    setup.append(f"INSERT INTO group_hidden_docs VALUES ('{other_group}','{other_doc}',1,3)")
            if state.startswith("alternate-") or state == "crossed-grants":
                setup.append("INSERT INTO doc_groups VALUES ('creative','alternate-group',0,1)")
                if state != "crossed-grants":
                    setup.append("INSERT INTO group_members VALUES ('alternate-group','alice','reader',1,0,1)")
                if state == "alternate-revoked":
                    setup.append("INSERT INTO group_members VALUES ('alternate-group','alice','reader',1,1,3)")
                if state == "alternate-removed":
                    setup.append("INSERT INTO doc_groups VALUES ('creative','alternate-group',1,3)")
                if state == "alternate-hidden-primary-visible":
                    setup.append("INSERT INTO group_hidden_docs VALUES ('alternate-group','creative',0,3)")
        db = sqlite3.connect(":memory:", check_same_thread=False)
        if not connected:
            db.create_function("has", 2, lambda tags, tag: tag in json.loads(tags))
            db.executescript(";".join(setup) + ";")

        def execute(sql, params):
            if connected:
                # Only fixed synthetic string values are bound; no actual driver/HTTP claim.
                bound = sql % {k: "'" + v.replace("'", "''") + "'" for k, v in params.items()}
                result = subprocess.run(
                    [
                        "docker",
                        "run",
                        "--rm",
                        "-i",
                        "--network",
                        "none",
                        "--memory",
                        "512m",
                        "--cpus",
                        "1",
                        "--entrypoint",
                        "clickhouse",
                        "clickhouse/clickhouse-server:24.8",
                        "local",
                        "--multiquery",
                    ],
                    input=";".join([*setup, bound + " FORMAT JSONCompact"]) + ";",
                    text=True,
                    capture_output=True,
                    timeout=30,
                    check=True,
                )
                rows = json.loads(result.stdout)["data"]
            else:
                import re

                rows = db.execute(re.sub(r"%\((\w+)\)s", r":\1", sql), params).fetchall()
                if sql.startswith(("SELECT ad.doc_id", "SELECT doc_id, author_key, body, tags, posted_by")):
                    rows = [(*r[:3], json.loads(r[3]), *r[4:]) for r in rows]
            return SimpleNamespace(result_rows=rows)

        with (
            patch.object(ch.client, "query", side_effect=execute),
            patch.object(
                ch, "get_group", return_value={"roles": [{"name": "reader", "permissions": {"posts": ["readAll"]}}]}
            ),
            patch.object(ch, "readable_groups", return_value=[carrier_group if is_hidden else "carrier-group"]),
            patch.object(ch, "read_documents_in_groups", return_value=[carrier]),
            patch.object(ch, "get_s3_signing_client", return_value=signer) as factory,
            patch.object(
                cfg,
                "get_config_field",
                side_effect=lambda name, default=None: 100 if is_node and name == "node_ad_percentage" else 0,
            ),
        ):
            allowed = None if is_node else ch.can_read_group("creative-group", "alice", "posts", authenticated=True)
            if not is_node:
                assert allowed is (is_hidden or is_link or state in {"active", "rejoined", "active-group-uploader"})
            if is_hidden:
                from app.v3.services import safe_query as sq

                creative_groups = [creative_group]
                if state.startswith("alternate-") or state == "crossed-grants":
                    creative_groups.append("alternate-group")
                # Use actual live membership gates; an attachment and grant in
                # different groups must not combine into creative authority.
                readable = [g for g in creative_groups if ch.can_read_group(g, "alice", "posts", authenticated=True)]
                creative_service = "scores" if state.endswith("other-service") else "posts"
                boundary_rows = execute(sq._boundary_cte_sql(creative_service, readable, "alice"), {}).result_rows
                visible = [r for r in boundary_rows if r[0] == "creative"]
                assert bool(visible) is expected_visible
                carrier_rows = execute(sq._boundary_cte_sql("posts", [carrier_group], "alice"), {}).result_rows
                assert any(r[0] == "carrier" for r in carrier_rows)
                assert ch.can_read_group(carrier_group, "alice", "posts", authenticated=True)
            if is_link:
                from sqlglot import exp, parse_one

                from app.v3.services import safe_query as sq

                # Execute the actual compiler's attachment boundary, not a copied policy query.
                tree = parse_one(sq._boundary_cte_sql("posts", [creative_group], "alice"), read=sq.DIALECT)
                boundary = next(q.this for q in tree.find_all(exp.Subquery) if q.alias == "dg")
                current = execute(
                    f"SELECT count(*) FROM ({boundary.sql(dialect=sq.DIALECT)}) current_links "
                    "WHERE doc_id = %(doc_id)s AND group_id = %(group_id)s",
                    {"doc_id": "creative", "group_id": creative_group},
                ).result_rows[0][0]
                current = int(current)  # ClickHouse JSON serializes UInt64 counts as strings.
                # The compiler's timestamp-only ordering is not a tie-policy oracle.
                if not state.startswith("removed-tie"):
                    assert bool(current) is (
                        is_doc
                        or state in {"active", "reattached", "active-group-uploader", "active-other-document-removal"}
                    )
                if is_doc:
                    document_boundary = next(q.this for q in tree.find_all(exp.Subquery) if q.alias == "d")
                    canonical = execute(
                        f"SELECT doc_id, tags, body FROM ({document_boundary.sql(dialect=sq.DIALECT)}) current_docs "
                        "WHERE doc_id = %(doc_id)s AND author_key = %(author)s",
                        {"doc_id": "creative", "author": author},
                    ).result_rows
                    # The compiler's timestamp-only ordering is not a tie-policy oracle.
                    if not state.startswith("deleted-tie"):
                        assert bool(canonical) is (not state.startswith("deleted"))
                    canonical_tags = (
                        (canonical[0][1] if connected else json.loads(canonical[0][1])) if canonical else []
                    )
                    current_inventory = (
                        bool(canonical)
                        and "node_ad" in canonical_tags
                        and json.loads(canonical[0][2])["status"] == "active"
                    )
                    if not state.startswith("deleted-tie"):
                        assert current_inventory is (
                            state.startswith("active") or state in {"reactivated", "restored", "retagged"}
                        )
            if state == "alternate-group" and not is_node:
                assert ch.can_read_group("alternate-group", "alice", "posts", authenticated=True)
            response = TestClient(app).post(
                "/v3/read",
                json={
                    "token": token(),
                    "service": "posts",
                    "groups": [carrier_group if is_hidden else "carrier-group"],
                },
            )
        db.close()
        assert response.status_code == 200
        doc = response.json()[0]
        if is_hidden:
            # Exploit replay: no fresh signing or creative delivery from hidden-only authority.
            assert doc["doc_id"] == "carrier" and doc["body"]["text"] == "readable carrier"
            if not expected_visible:
                if "ad" in doc:
                    verify(doc["ad"]["body"]["url"], key)
                    print("hidden-only synthetic capability independently verified before denial assertion")
                assert "ad" not in doc
                factory.assert_not_called()
            else:
                creative = doc["ad"]
                assert creative["author_key"] == author and creative["posted_by"] == "bob"
                verify(creative["body"]["url"], key)
                factory.assert_called_once()
            print(
                f"pinned hidden evidence: engine={'ClickHouse-local' if connected else 'SQLite substitute'} "
                f"state={state} boundary_visible={bool(visible)} policy_allows={expected_visible} "
                f"carrier_visible=True inline_ad={'ad' in doc} signer_calls={factory.call_count}"
            )
            return
        if is_doc:
            # Retained disclosure replay: current document eligibility precedes signing.
            assert "ad" not in doc
            if state.startswith("deleted") or state in {"detagged", "paused"}:
                if "node_ad" in doc:
                    verify(doc["node_ad"]["body"]["url"], key)
                    print("ineligible-document synthetic capability independently verified before denial assertion")
                assert "node_ad" not in doc
                factory.assert_not_called()
            else:
                creative = doc["node_ad"]
                assert creative["author_key"] == author and creative["posted_by"] == "bob"
                assert creative["body"]["text"] == (
                    "latest active creative"
                    if state in {"reactivated", "restored", "retagged"}
                    else "synthetic restricted creative"
                )
                verify(creative["body"]["url"], key)
                factory.assert_called_once()
            print(
                f"node document evidence: state={state} current_inventory={current_inventory} inline_node_ad={'node_ad' in doc}"
            )
            return
        if is_node:
            # Retained disclosure replay: only current Discover attachments can authorize signing.
            assert "ad" not in doc
            if state not in {"active", "reattached", "active-group-uploader", "active-other-document-removal"}:
                if "node_ad" in doc:
                    verify(doc["node_ad"]["body"]["url"], key)
                    print("removed-Discover synthetic capability independently verified before denial assertion")
                assert "node_ad" not in doc
                factory.assert_not_called()
            else:
                assert doc["node_ad"]["author_key"] == author and doc["node_ad"]["posted_by"] == "bob"
                verify(doc["node_ad"]["body"]["url"], key)
                factory.assert_called_once()
            print(
                f"node attachment evidence: engine={'ClickHouse-local' if connected else 'SQLite substitute'} state={state} current_attachment={bool(current)} inline_node_ad={'node_ad' in doc}"
            )
            return
        attaches = (
            state in {"active", "reattached", "alternate-group", "active-group-uploader"}
            if is_link
            else state in {"active", "rejoined", "alternate-group", "active-group-uploader"}
        )
        if not attaches:
            if "ad" in doc:
                verify(doc["ad"]["body"]["url"], key)
                print("removed-authority synthetic capability independently verified before denial assertion")
            assert "ad" not in doc
            factory.assert_not_called()
        else:
            assert doc["ad"]["author_key"] == author and doc["ad"]["posted_by"] == "bob"
            assert doc["ad"]["body"]["text"] == "synthetic restricted creative"
            verify(doc["ad"]["body"]["url"], key)
            factory.assert_called_once()
        if is_link:
            print(
                f"pinned attachment evidence: engine={'ClickHouse-local' if connected else 'SQLite substitute'} state={state} current_attachment={bool(current)} inline_ad={'ad' in doc}"
            )
        else:
            print(
                f"pinned membership evidence: engine={'ClickHouse-local' if connected else 'SQLite substitute'} state={state} direct_allowed={allowed} inline_ad={'ad' in doc}"
            )
        return

    if case.startswith(("query-owner-", "query-face-")):
        import sqlite3
        from types import SimpleNamespace

        from app.v3.services import clickhouse as ch
        from app.v3.services import safe_query as sq

        # Retained foreign-issuance reproduction, now a denial regression.
        key = "bob/private.png"
        is_face = case.startswith("query-face-")
        body = json.dumps({"avatar_ref": "private-media"} if is_face else {"type": "minio", "value": key})
        sql = (
            f"SELECT 'bob' AS face_owner, '{body}' AS profile_body"
            if is_face
            else f"SELECT 'alice' AS author_key, 'bob' AS posted_by, '{body}' AS body"
        )
        assert sq.query_services(sql, allowed_services=None) == set()
        executed = []

        def execute_constant(compiled, **kwargs):
            executed.append(compiled)
            # Execute the actual compiler output, not a preselected result row.
            # SQLite is only a stand-in for this table-free literal SELECT.
            with sqlite3.connect(":memory:") as db:
                cursor = db.execute(compiled)
                return [c[0] for c in cursor.description], cursor.fetchall()

        prepared = not case.endswith("unprepared")
        prepare = (
            {"face": {"bodyField": "profile_body", "mediaField": "avatar_ref", "authorColumn": "face_owner"}}
            if is_face
            else {"media": True}
        )
        request = {"sql": sql, "prepare": prepare} if prepared else {"sql": sql}
        if case.endswith("-auth"):
            request["token"] = token()

        def face_metadata(sql, params):
            assert params == {"author_key": "bob", "r0": "private-media"}
            return SimpleNamespace(result_rows=[("private-media", json.dumps({"object_key": key}), "media_metadata")])

        with (
            patch.object(settings, "QUERY_EVAL_NO_POLICY", False),
            patch.object(settings, "QUERY_EVAL_STUB_EXECUTE", False),
            patch.object(ch, "get_user_groups", return_value=[]),
            patch.object(ch, "readable_groups") as readable,
            patch.object(ch, "execute_query", side_effect=execute_constant),
            patch.object(ch.client, "query", side_effect=face_metadata),
            patch.object(ch, "get_s3_signing_client", return_value=signer) as factory,
        ):
            response = TestClient(app).post("/v3/query", json=request)
        if prepared:
            assert response.status_code in (200, 403)
            if response.status_code == 200:
                row = response.json()["rows"][0]
                url = row.get("avatar_url") if is_face else row["body"].get("url")
                if url:
                    verify(url, key)
                    print("prepared-query foreign capability independently verified; SQLite execution substitute")
                assert url is None, "fabricated query owner minted a foreign capability"
            factory.assert_not_called()
            return
        assert response.status_code == 200, response.status_code
        assert len(executed) == 1 and "LIMIT" in executed[0].upper()
        readable.assert_not_called()
        row = response.json()["rows"][0]
        if is_face:
            assert row["face_owner"] == "bob" and json.loads(row["profile_body"]) == {"avatar_ref": "private-media"}
            assert "avatar_url" not in row
            factory.assert_not_called()
            return
        assert row["author_key"] == "alice" and row["posted_by"] == "bob"
        assert row["body"]["value"] == key
        assert "url" not in row["body"]
        factory.assert_not_called()
        return

    if case.startswith("raw-"):
        from app.v3.services import clickhouse as ch

        foreign = case == "raw-foreign"
        key = "bob/private.png" if foreign else "alice/a%2Fb +?#.png"
        doc = {
            "author_key": "group-id",
            "posted_by": "alice",
            "body": {"nested": [{"type": "minio", "value": key, "url": "stale"}]},
        }
        if not foreign:
            for field, owner in (("ad", "bob"), ("node_ad", "carol")):
                doc[field] = {
                    "author_key": "other-group",
                    "posted_by": owner,
                    "body": {"type": "minio", "value": f"{owner}/owned.png"},
                }
        with patch.object(ch, "get_s3_signing_client", return_value=signer) as factory:
            resolved = ch.resolve_media_urls_in_docs([doc])[0]
        url = resolved["body"]["nested"][0]["url"]
        if url is not None:
            verify(url, key)
            print("raw capability independently verified", flush=True)
        if foreign:
            assert url is None, "valid foreign capability minted through document wrapper"
            factory.assert_not_called()
        else:
            for field, owner in (("ad", "bob"), ("node_ad", "carol")):
                verify(resolved[field]["body"]["url"], f"{owner}/owned.png")
        return

    if case.startswith("metadata-"):
        from types import SimpleNamespace

        from app.v3.services import clickhouse as ch

        field = "object_key" if case == "metadata-original" else "thumbnail_object_key"
        output = "read_url" if field == "object_key" else "thumbnail_url"
        row = {field: "bob/private.png", "url": "legacy-original", "thumbnail_url": "legacy-thumb"}
        # Helper-level proof only: no persisted DB row, HTTP auth chain or retrieval.
        with (
            patch.object(
                ch.client,
                "query",
                return_value=SimpleNamespace(result_rows=[("m1", json.dumps(row), "media_metadata")]),
            ),
            patch.object(ch, "get_s3_signing_client", return_value=signer) as factory,
        ):
            resolved = ch.resolve_media_urls({"media_refs": ["m1"]}, "alice")["media_refs"][0]
        if resolved[output] is not None:
            verify(resolved[output], row[field])
            print("metadata foreign capability independently verified")
        assert resolved[output] is None, "valid foreign capability minted from owner-scoped metadata"
        factory.assert_not_called()
        return

    records = []

    class Capture(logging.Handler):
        def emit(self, record):
            records.append(record)

    capture = Capture()
    logger = logging.getLogger("web10-media")
    logger.addHandler(capture)
    logger.setLevel(logging.INFO)
    client = TestClient(app, raise_server_exceptions=False)
    with (
        patch.object(media, "get_s3_client", return_value=object()) as bucket_client,
        patch.object(media, "ensure_bucket") as bucket,
        patch.object(media, "get_s3_signing_client", return_value=signer) as factory,
        patch.object(signer, "generate_presigned_url", wraps=signer.generate_presigned_url) as sign,
    ):
        if case == "foreign":
            keys = ["bob/private.png", "alice2/private.png", "alice%2Fprivate.png", "Alice/private.png"]
        elif case == "owned":
            keys = [
                "alice/unconfirmed.png",
                "alice/nested/thumb.jpg",
                "alice/video/720p/seg001.ts",
                "alice/video/master.m3u8",
                "alice/a%2Fb +?#.png",
                "alice/../bob/opaque.png",
            ]
        elif case == "malformed":
            keys = [None, "", 7, True, [], {}, "alice/"]
        else:
            keys = ["alice/private.png"] * 5
        tokens = [token() for _ in keys]
        if case == "tokens":
            tokens = ["bad-token", token(wrong_key=True), token(expired=True), token("anon"), ""]
        for key, credential in zip(keys, tokens, strict=True):
            for mock in (bucket_client, bucket, factory, sign):
                mock.reset_mock()
            response = client.post("/v3/media/read-url", json={"token": credential, "body": {"object_key": key}})
            # On vulnerable source, prove the foreign capability BEFORE the denial assertion.
            if response.status_code == 200:
                verify(response.json()["read_url"], key)
            expected = {"foreign": 403, "owned": 200, "malformed": 400, "tokens": 401}[case]
            assert response.status_code == expected, (
                case,
                response.status_code,
                "valid capability minted" if response.status_code == 200 else "denied",
            )
            if expected == 200:
                bucket_client.assert_called_once_with()
                bucket.assert_called_once_with(bucket_client.return_value)
                factory.assert_called_once_with()
                sign.assert_called_once_with(
                    "get_object", Params={"Bucket": settings.S3_BUCKET, "Key": key}, ExpiresIn=3600
                )
            else:
                for mock in (bucket_client, bucket, factory, sign):
                    mock.assert_not_called()
        if case != "tokens":
            messages = [record.getMessage() for record in records]
            allowed = {
                "[media] read-url denied: invalid key",
                "[media] read-url denied: foreign namespace",
                "[media] read-url accepted: owner namespace",
                "[media] read-url signing: started",
                "[media] read-url signing: completed",
            }
            assert messages and set(messages) <= allowed
            if case == "owned":
                assert set(messages) == allowed - {
                    "[media] read-url denied: invalid key",
                    "[media] read-url denied: foreign namespace",
                }


def test_authorized_group_read_resolves_media_as_posted_by(valid_token):
    from types import SimpleNamespace
    from unittest.mock import patch

    from fastapi.testclient import TestClient

    from app.main import app
    from app.v3.services import clickhouse as ch

    group_id = "web10.app/groups/alice/jazz"
    posts = [{"doc_id": "p1", "author_key": group_id, "posted_by": "alice", "body": {"media_refs": ["m1"]}}]
    metadata = {"object_key": "alice/unconfirmed.png", "thumbnail_object_key": "bob/foreign.jpg"}
    with (
        patch.object(ch, "get_group", return_value={"join_policy": "open", "roles": [], "discoverable": False}),
        patch.object(ch, "_get_group_member_counts", return_value={group_id: 1}),
        patch.object(ch, "is_group_member", return_value=True),
        patch.object(ch, "read_documents_in_groups", return_value=posts),
        patch.object(
            ch.client,
            "query",
            return_value=SimpleNamespace(result_rows=[("m1", json.dumps(metadata), "media_metadata")]),
        ) as query,
        patch.object(ch, "get_s3_signing_client") as factory,
    ):
        factory.return_value.generate_presigned_url.return_value = "https://synthetic.invalid/fresh"
        response = TestClient(app).get("/v3/groups/detail", params={"group_id": group_id, "token": valid_token})
    assert response.status_code == 200
    ref = response.json()["posts"][0]["body"]["media_refs"][0]
    assert ref["read_url"] == "https://synthetic.invalid/fresh"
    assert ref["thumbnail_url"] is None
    assert query.call_args.args[1]["author_key"] == "alice"
    assert factory.return_value.generate_presigned_url.call_args.kwargs["Params"]["Key"] == metadata["object_key"]


@pytest.mark.parametrize("field,output", [("object_key", "read_url"), ("thumbnail_object_key", "thumbnail_url")])
@pytest.mark.parametrize(
    "key", ["bob/x", "alice2/x", "Alice/x", "alice%2Fx", "alice/", 0, False, [], {}, ["alice/x"], {"key": "alice/x"}]
)
@pytest.mark.parametrize("mixed", [False, True])
def test_metadata_rejects_invalid_key_independently(field, output, key, mixed, caplog):
    import logging
    from copy import deepcopy
    from types import SimpleNamespace
    from unittest.mock import patch

    from app.v3.services import clickhouse as ch

    caplog.set_level(logging.INFO, logger=ch.log.name)
    companion = "thumbnail_object_key" if field == "object_key" else "object_key"
    companion_output = "thumbnail_url" if output == "read_url" else "read_url"
    meta = {
        field: key,
        "url": "stale-original",
        "thumbnail_url": "stale-thumb",
        "width": 12,
        "height": 34,
        "duration_seconds": 2,
        "mime_type": "video/mp4",
        "filename": "clip",
        "size_bytes": 42,
        "transcoding_settings": {"enabled": True, "status": "done", "variants": [], "manifest_url": "stale"},
    }
    if mixed:
        meta[companion] = "alice/good"
    rows = [("bad", json.dumps(meta), "media_metadata")]
    if mixed:
        rows.append(("good", json.dumps({"object_key": "alice/good"}), "public_media"))
    body = {"text": "unchanged", "media_refs": ["good", "bad", "bad"] if mixed else ["bad"]}
    original = deepcopy(body)
    with (
        patch.object(ch.client, "query", return_value=SimpleNamespace(result_rows=rows)),
        patch.object(ch, "get_s3_signing_client") as factory,
    ):
        factory.return_value.generate_presigned_url.return_value = "fresh"
        result = ch.resolve_media_urls(body, "alice")
    assert body == original and result["text"] == body["text"]
    assert [r["doc_id"] for r in result["media_refs"]] == body["media_refs"]
    ref = result["media_refs"][-1]
    assert ref[output] is None
    assert ref[companion_output] == (
        "fresh" if mixed else meta[companion_output if companion_output == "thumbnail_url" else "url"]
    )
    if field == "object_key":
        assert ref["object_key"] == key
    for name in ("width", "height", "duration_seconds", "mime_type", "filename", "size_bytes"):
        assert ref[name] == meta[name]
    assert ref["transcoding_settings"] == {"enabled": True, "status": "done", "variants": []}
    if mixed:
        assert result["media_refs"][0]["read_url"] == "fresh"
        factory.return_value.generate_presigned_url.assert_called_once()
        assert factory.return_value.generate_presigned_url.call_args.kwargs["Params"]["Key"] == "alice/good"
    else:
        factory.assert_not_called()
    messages = [r.getMessage() for r in caplog.records if r.name == ch.log.name]
    assert messages == [f"[media] metadata signing: accepted keys={int(mixed)}"] + (
        ["[media] metadata signing: completed"] if mixed else []
    )


@pytest.mark.parametrize("owner", ["", None, 0, False, [], {}])
def test_metadata_invalid_owner_never_signs(owner):
    from types import SimpleNamespace
    from unittest.mock import patch

    from app.v3.services import clickhouse as ch

    with (
        patch.object(
            ch.client,
            "query",
            return_value=SimpleNamespace(
                result_rows=[
                    ("m", '{"object_key":"alice/x","thumbnail_object_key":"/x","url":"stale"}', "media_metadata")
                ]
            ),
        ),
        patch.object(ch, "get_s3_signing_client") as factory,
    ):
        ref = ch.resolve_media_urls({"media_refs": ["m"]}, owner)["media_refs"][0]
    assert ref["read_url"] is None and ref["thumbnail_url"] is None
    factory.assert_not_called()


@pytest.mark.parametrize("key", [None, "", "absent"])
def test_metadata_keyless_legacy_fallback(key):
    from types import SimpleNamespace
    from unittest.mock import patch

    from app.v3.services import clickhouse as ch

    meta = {"url": "legacy-original", "thumbnail_url": "legacy-thumbnail"}
    if key != "absent":
        meta.update(object_key=key, thumbnail_object_key=key)
    with (
        patch.object(
            ch.client, "query", return_value=SimpleNamespace(result_rows=[("m", json.dumps(meta), "media_metadata")])
        ),
        patch.object(ch, "get_s3_signing_client") as factory,
    ):
        ref = ch.resolve_media_urls({"media_refs": ["m"]}, "alice")["media_refs"][0]
    assert ref["read_url"] == meta["url"] and ref["thumbnail_url"] == meta["thumbnail_url"]
    factory.assert_not_called()


def test_metadata_owned_opaque_keys_dedup_and_signer_failure():
    from types import SimpleNamespace
    from unittest.mock import patch

    from app.v3.services import clickhouse as ch

    keys = ["alice/unconfirmed", "alice/a%2Fb +?#", "alice/../bob/opaque"]
    rows = [
        (str(i), json.dumps({"object_key": key, "thumbnail_object_key": key}), "media_metadata")
        for i, key in enumerate(keys)
    ]
    with (
        patch.object(ch.client, "query", return_value=SimpleNamespace(result_rows=rows)),
        patch.object(ch, "get_s3_signing_client") as factory,
    ):
        sign = factory.return_value.generate_presigned_url
        sign.side_effect = lambda operation, Params, ExpiresIn: "fresh:" + Params["Key"]
        result = ch.resolve_media_urls({"media_refs": ["2", "0", "1", "2"]}, "alice")
        assert [c.kwargs["Params"]["Key"] for c in sign.call_args_list] == keys
        assert all(r["read_url"] == r["thumbnail_url"] == "fresh:" + r["object_key"] for r in result["media_refs"])
        sign.side_effect = RuntimeError("synthetic signer failure")
        with pytest.raises(RuntimeError, match="synthetic signer failure"):
            ch.resolve_media_urls({"media_refs": ["0"]}, "alice")


@pytest.mark.parametrize(
    "key", ["bob/x", "alice2/x", "Alice/x", "alice%2Fx", "alice/", "", None, 0, False, [], {}, ["alice/x"]]
)
@pytest.mark.parametrize("mixed", [False, True])
def test_raw_invalid_leaf_suppresses_stale_url(key, mixed):
    from copy import deepcopy
    from unittest.mock import patch

    from app.v3.services import clickhouse as ch

    leaf = {"type": "minio", "value": key, "url": "stale", "label": "keep"}
    body = {"nested": [[leaf]], "plain": {"type": 0, "value": "alice/x", "url": "keep"}}
    if mixed:
        body["nested"][0].append({"type": "minio", "value": "alice/good"})
    original = deepcopy(body)
    with patch.object(ch, "get_s3_signing_client") as factory:
        factory.return_value.generate_presigned_url.return_value = "fresh"
        result = ch.resolve_minio_types(body, "alice")
    assert body == original
    assert result["nested"][0][0] == {**leaf, "url": None}
    assert result["plain"] == body["plain"]
    if mixed:
        assert result["nested"][0][1]["url"] == "fresh"
        factory.assert_called_once_with()
    else:
        factory.assert_not_called()


@pytest.mark.parametrize("owner", ["", None, 0, False, [], {}])
def test_raw_invalid_owner_and_missing_value(owner):
    from unittest.mock import patch

    from app.v3.services import clickhouse as ch

    body = [{"type": "minio", "value": "alice/x", "url": "stale"}, {"type": "minio", "url": "stale"}]
    with patch.object(ch, "get_s3_signing_client") as factory:
        assert ch.resolve_minio_types(body, owner) == [{**leaf, "url": None} for leaf in body]
    factory.assert_not_called()


def test_raw_owned_order_opaque_keys_lazy_factory_and_failure():
    from copy import deepcopy
    from unittest.mock import call, patch

    import app.settings as settings
    from app.v3.services import clickhouse as ch

    keys = ["alice/unconfirmed", "alice/a%2Fb +?#", "alice/../bob/opaque", "alice/unconfirmed"]
    body = {"nested": [{"type": "minio", "value": key} for key in keys]}
    original = deepcopy(body)
    with patch.object(ch, "get_s3_signing_client") as factory:
        sign = factory.return_value.generate_presigned_url
        sign.side_effect = lambda operation, Params, ExpiresIn: "fresh:" + Params["Key"]
        result = ch.resolve_minio_types(body, "alice")
        assert body == original
        assert [leaf["url"] for leaf in result["nested"]] == ["fresh:" + key for key in keys]
        factory.assert_called_once_with()
        assert sign.call_args_list == [
            call("get_object", Params={"Bucket": settings.S3_BUCKET, "Key": key}, ExpiresIn=settings.READ_URL_EXPIRY)
            for key in keys
        ]
        sign.side_effect = RuntimeError("synthetic signer failure")
        with pytest.raises(RuntimeError, match="synthetic signer failure"):
            ch.resolve_minio_types(body, "alice")
        factory.reset_mock()
        plain = {"nested": [{"type": 0, "value": "alice/x"}, None, False, 3]}
        assert ch.resolve_minio_types(plain, "alice") is plain
        factory.assert_not_called()
        with pytest.raises(TypeError):
            ch.resolve_minio_types(plain)
        missing = {"type": "minio", "url": "stale", "label": "keep"}
        assert ch.resolve_minio_types(missing, "alice") == {**missing, "url": None}
        factory.assert_not_called()


@pytest.mark.parametrize("posted_by", ["", "uploader"])
def test_raw_wrapper_uses_each_entry_owner_for_both_resolvers(posted_by):
    from copy import deepcopy
    from unittest.mock import patch

    from app.v3.services import clickhouse as ch

    def entry(author):
        owner = posted_by or author
        return {
            "author_key": author,
            "posted_by": posted_by,
            "body": {"media_refs": ["m"], "raw": {"type": "minio", "value": owner + "/x"}},
        }

    doc = {**entry("alice"), "ad": entry("bob"), "node_ad": entry("carol")}
    original = deepcopy(doc)
    with (
        patch.object(ch, "resolve_media_urls", side_effect=lambda body, owner: body) as metadata,
        patch.object(ch, "get_s3_signing_client") as factory,
    ):
        factory.return_value.generate_presigned_url.return_value = "fresh"
        result = ch.resolve_media_urls_in_docs([doc])[0]
    assert doc == original
    assert [c.args[1] for c in metadata.call_args_list] == [posted_by or a for a in ("alice", "bob", "carol")]
    assert all(e["body"]["raw"]["url"] == "fresh" for e in (result, result["ad"], result["node_ad"]))


if __name__ == "__main__":
    _probe(sys.argv[1])
