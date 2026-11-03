"""Real RSA capabilities and existing authorization/signing integration seams."""

import base64
import io
import json
import os
import subprocess
import sys
import time
from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlsplit

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app
from app.services import hls
from app.services import media_delivery as delivery
from app.v3.endpoints import media
from app.v3.models import ReadUrlRequest
from app.v3.services import clickhouse as ch


def pem(key):
    return key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()


@pytest.fixture(scope="module")
def rsa_pem():
    return pem(rsa.generate_private_key(public_exponent=65537, key_size=2048))


@pytest.fixture
def enabled(monkeypatch, rsa_pem):
    for name, value in {
        "ENABLED": True,
        "BASE": "https://delivery.example",
        "ISSUER": "test-node",
        "AUDIENCE": "test-media",
        "KID": "media-1",
        "PRIVATE_KEY": rsa_pem,
        "TTL": 600,
    }.items():
        monkeypatch.setattr(settings, "MEDIA_DELIVERY_" + name, value)


def decode(url):
    parts = urlsplit(url)
    cap = parse_qs(parts.query)["cap"][0]
    jwk = delivery.public_jwks()["keys"][0]
    assert not {"d", "p", "q", "dp", "dq", "qi"} & jwk.keys()
    public = jwt.PyJWK.from_dict(jwk).key
    claims = jwt.decode(cap, public, algorithms=["RS256"], issuer="test-node", audience="test-media")
    assert jwt.get_unverified_header(cap) == {"alg": "RS256", "typ": "JWT", "kid": "media-1"}
    encoded = parts.path.removeprefix("/media/")
    assert "=" not in encoded
    assert base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode() == claims["key"]
    assert claims["bucket"] == settings.S3_BUCKET
    assert claims["method"] == "GET" and claims["v"] == 1
    assert 0 < claims["exp"] - claims["iat"] <= 600
    return claims


@pytest.mark.parametrize("key", ["alice/hello.png", "alice/../a//%2f?# +", "alice/\u2603/\u00e9.png"])
def test_public_verification_and_opaque_keys(enabled, key):
    claims = decode(delivery.get_url(key))
    assert claims["key"] == key
    assert set(claims) == {"iss", "aud", "iat", "exp", "v", "bucket", "key", "method"}


@pytest.mark.parametrize(
    "base",
    [
        "http://cdn.example",
        "https://cdn.example/",
        "https://cdn.example/prefix",
        "https://u:p@cdn.example",
        "https://cdn.example?x=1",
        "https://cdn.example#f",
        "https://cdn.example:443",
        "https://cdn.example\n",
        "https://cdn..example",
        "https://-cdn.example",
        "https://cdn.example\\evil",
    ],
)
def test_invalid_base_fails_closed(enabled, monkeypatch, base):
    monkeypatch.setattr(settings, "MEDIA_DELIVERY_BASE", base)
    with pytest.raises(ValueError):
        delivery.get_url("alice/a", MagicMock())


@pytest.mark.parametrize(
    "name,value",
    [
        ("TTL", 0),
        ("TTL", 601),
        ("TTL", "60"),
        ("TTL", True),
        ("ISSUER", ""),
        ("AUDIENCE", " "),
        ("KID", ""),
        ("PRIVATE_KEY", "broken"),
    ],
)
def test_invalid_configuration(enabled, monkeypatch, name, value):
    monkeypatch.setattr(settings, "MEDIA_DELIVERY_" + name, value)
    with pytest.raises(ValueError):
        delivery.validate_configuration()


@pytest.mark.parametrize(
    "key", [rsa.generate_private_key(public_exponent=65537, key_size=1024), ec.generate_private_key(ec.SECP256R1())]
)
def test_rejects_weak_or_non_rsa(enabled, monkeypatch, key):
    monkeypatch.setattr(settings, "MEDIA_DELIVERY_PRIVATE_KEY", pem(key))
    with pytest.raises(ValueError):
        delivery.validate_configuration()


def test_separate_key(enabled, monkeypatch, rsa_pem):
    monkeypatch.setattr(settings, "PRIVATE_KEY", rsa_pem)
    with pytest.raises(ValueError, match="separate"):
        delivery.validate_configuration()


def test_invalid_enabled_config_blocks_startup_before_workers(enabled, monkeypatch):
    from app.main import _start_hls_workers
    from app.services import transcode

    monkeypatch.setattr(settings, "MEDIA_DELIVERY_BASE", "http://unsafe.example")
    workers = MagicMock()
    monkeypatch.setattr(transcode, "start_workers", workers)
    with pytest.raises(ValueError):
        _start_hls_workers()
    workers.assert_not_called()


def test_disabled_preserves_mock_signer(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_DELIVERY_ENABLED", False)
    signer = MagicMock()
    signer.generate_presigned_url.return_value = "legacy"
    assert delivery.get_url("alice/a", signer) == "legacy"
    signer.generate_presigned_url.assert_called_once_with(
        "get_object", Params={"Bucket": settings.S3_BUCKET, "Key": "alice/a"}, ExpiresIn=settings.READ_URL_EXPIRY
    )
    assert delivery.public_jwks() == {"keys": []}


@pytest.mark.parametrize("flag,expected", [("0", False), ("false", False), ("1", True), ("true", True)])
def test_environment_types(flag, expected):
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import json; import app.settings as s; print(json.dumps([s.MEDIA_DELIVERY_ENABLED, s.MEDIA_DELIVERY_TTL]))",
        ],
        env={**os.environ, "MEDIA_DELIVERY_ENABLED": flag, "MEDIA_DELIVERY_TTL": "45"},
        capture_output=True,
        text=True,
        check=True,
    )
    assert json.loads(result.stdout) == [expected, 45]


def test_bad_environment_flag():
    result = subprocess.run(
        [sys.executable, "-c", "import app.settings"],
        env={**os.environ, "MEDIA_DELIVERY_ENABLED": "maybe"},
        capture_output=True,
    )
    assert result.returncode != 0


def test_three_signing_sinks_and_public_route(enabled, monkeypatch):
    monkeypatch.setattr(media, "_user", lambda _: "alice")
    monkeypatch.setattr(media, "ensure_bucket", lambda _: None)
    response = media.read_url(ReadUrlRequest(token="synthetic", body={"object_key": "alice/a"}))
    assert decode(response["read_url"])["key"] == "alice/a"
    assert response["expires_in"] == 600
    with pytest.raises(Exception) as denied:
        media.read_url(ReadUrlRequest(token="synthetic", body={"object_key": "bob/a"}))
    assert denied.value.status_code == 403
    monkeypatch.setattr(
        ch.client,
        "query",
        lambda *a, **kw: type(
            "Rows",
            (),
            {
                "result_rows": [
                    ("ref", json.dumps({"object_key": "alice/a", "thumbnail_object_key": "alice/t"}), "media_metadata")
                ]
            },
        )(),
    )
    resolved = ch.resolve_media_urls({"media_refs": ["ref"]}, "alice")["media_refs"][0]
    assert decode(resolved["read_url"])["key"] == "alice/a"
    assert decode(resolved["thumbnail_url"])["key"] == "alice/t"
    raw = ch.resolve_minio_types({"type": "minio", "value": "alice/a"}, "alice")
    assert decode(raw["url"])["key"] == "alice/a"
    assert ch.resolve_minio_types({"type": "minio", "value": "bob/a"}, "alice")["url"] is None
    assert TestClient(app).get("/v3/media/jwks").json() == delivery.public_jwks()


def test_hls_variant_http_parent_expiry(enabled, monkeypatch):
    monkeypatch.setattr(settings, "HLS_SIG_TTL", 30)
    sig = hls.mint_sig("bob", "doc", "alice/id/hls")
    parent = hls.verify_sig(sig, "doc")
    doc = {
        "author_key": "alice",
        "body": {
            "video": {"type": "minio", "value": "alice/id/raw.mp4"},
            "transcoding_settings": {
                "variants": [{"height": 360, "url": {"type": "minio", "value": "alice/id/hls/360p/index.m3u8"}}]
            },
        },
    }
    monkeypatch.setattr(media, "can_view_doc", lambda *a: doc)
    s3 = MagicMock()
    s3.get_object.return_value = {"Body": io.BytesIO(b"#EXTM3U\n#EXTINF:4,\nseg000.ts\n")}
    monkeypatch.setattr(media, "get_s3_client", lambda: s3)
    client = TestClient(app)
    response = client.get("/v3/media/hls/variant", params={"doc_id": "doc", "variant": "360p", "sig": sig})
    assert response.status_code == 200
    claims = decode(response.text.splitlines()[-1])
    assert claims["key"] == "alice/id/hls/360p/seg000.ts"
    assert claims["exp"] == parent["exp"]
    s3.get_object.assert_called_once()
    monkeypatch.setattr(media, "can_view_doc", lambda *a: None)
    assert (
        client.get("/v3/media/hls/variant", params={"doc_id": "doc", "variant": "360p", "sig": sig}).status_code == 403
    )
    s3.get_object.assert_called_once()


@pytest.mark.parametrize("parent_ttl", [120, 600, 900])
def test_hls_expiry_independent_of_direct_ttl(enabled, monkeypatch, parent_ttl):
    now = int(time.time())
    monkeypatch.setattr(settings, "MEDIA_DELIVERY_TTL", 60)
    monkeypatch.setattr(settings, "HLS_SIG_TTL", parent_ttl)
    monkeypatch.setattr(delivery.time, "time", lambda: now)
    direct = decode(delivery.get_url("alice/a"))
    sig = hls.mint_sig("alice", "doc", "alice/id/hls")
    url = hls.rewrite_variant_manifest("doc", "360p", sig, "seg000.ts").strip()
    segment = decode(url)
    assert direct["iat"] == segment["iat"] == now
    assert direct["exp"] == now + 60
    assert segment["exp"] == min(now + parent_ttl, now + 600)
    assert now + 61 < segment["exp"] <= now + parent_ttl


@pytest.mark.parametrize("exp", [None, int(time.time()) - 10, "9999999999"])
def test_hls_rejects_missing_expired_or_malformed_parent(enabled, exp):
    claims = {"username": "alice", "doc_id": "doc", "prefix": "alice/id/hls"}
    if exp is not None:
        claims["exp"] = exp
    sig = jwt.encode(claims, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)
    with pytest.raises(ValueError):
        hls.rewrite_variant_manifest("doc", "360p", sig, "seg000.ts")


def test_hls_rejects_tampered_parent_and_bad_segments(enabled):
    sig = hls.mint_sig("alice", "doc", "alice/id/hls")
    with pytest.raises(ValueError):
        hls.rewrite_variant_manifest("doc", "360p", sig + "bad", "seg000.ts")
    with pytest.raises(ValueError):
        hls.rewrite_variant_manifest("doc", "360p", sig, "../foreign.ts")
