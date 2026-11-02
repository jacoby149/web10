"""Registered HTTP route + verified JWT + offline real SigV4, isolated from conftest mocks."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.parametrize(
    "case",
    ["foreign", "owned", "malformed", "tokens", "metadata-original", "metadata-thumbnail", "raw-foreign", "raw-owned"],
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
