"""Registered HTTP route + verified JWT + offline real SigV4, isolated from conftest mocks."""

import os
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.parametrize("case", ["foreign", "owned", "malformed", "tokens"])
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
    from unittest.mock import patch

    from fastapi.testclient import TestClient

    from app.main import app
    from app.v3.services import clickhouse as ch

    group_id = "web10.app/groups/alice/jazz"
    posts = [{"doc_id": "p1", "author_key": group_id, "posted_by": "alice", "body": {"media_refs": ["m1"]}}]
    resolved = {"media_refs": [{"object_key": "alice/unconfirmed.png", "read_url": "https://synthetic.invalid/fresh"}]}
    with (
        patch.object(ch, "get_group", return_value={"join_policy": "open", "roles": [], "discoverable": False}),
        patch.object(ch, "_get_group_member_counts", return_value={group_id: 1}),
        patch.object(ch, "is_group_member", return_value=True),
        patch.object(ch, "read_documents_in_groups", return_value=posts),
        patch.object(ch, "resolve_media_urls", return_value=resolved) as resolve,
    ):
        response = TestClient(app).get("/v3/groups/detail", params={"group_id": group_id, "token": valid_token})
    assert response.status_code == 200
    assert response.json()["posts"][0]["body"] == resolved
    resolve.assert_called_once_with(posts[0]["body"], "alice")


if __name__ == "__main__":
    _probe(sys.argv[1])
