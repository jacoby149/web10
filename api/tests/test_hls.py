"""Tests for the HLS streaming helpers + endpoints (D44 — the video spine).

The helpers are pure (sig mint/verify, manifest synthesis, segment-key
validation) and tested directly. The endpoints are tested with the S3 client
and the access re-check mocked — the security seams under test are: sig
verification (bad/expired/wrong-doc → 403), the access re-check
(non-member → 403), and segment-key traversal rejection.
"""

from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.services import hls

# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


class TestHlsPrefix:
    def test_prefix_is_the_dir_plus_hls(self):
        assert hls.hls_prefix("alice/abc123/vacation.mp4") == "alice/abc123/hls"

    def test_prefix_single_segment_key(self):
        assert hls.hls_prefix("video.mp4") == "hls"


class TestSig:
    def test_mint_verify_roundtrip(self):
        sig = hls.mint_sig("alice", "doc-1", "alice/abc/hls")
        payload = hls.verify_sig(sig, "doc-1")
        assert payload["username"] == "alice"
        assert payload["doc_id"] == "doc-1"
        assert payload["prefix"] == "alice/abc/hls"

    def test_verify_rejects_wrong_doc(self):
        sig = hls.mint_sig("alice", "doc-1", "alice/abc/hls")
        with pytest.raises(ValueError, match="does not match"):
            hls.verify_sig(sig, "doc-2")

    def test_verify_rejects_expired(self, monkeypatch):
        monkeypatch.setattr(settings, "HLS_SIG_TTL", -10)  # mint already-expired
        sig = hls.mint_sig("alice", "doc-1", "alice/abc/hls")
        with pytest.raises(ValueError, match="invalid or expired"):
            hls.verify_sig(sig, "doc-1")

    def test_verify_rejects_tampered(self):
        sig = hls.mint_sig("alice", "doc-1", "alice/abc/hls")
        tampered = sig[:-4] + ("aaaa" if not sig.endswith("aaaa") else "bbbb")
        with pytest.raises(ValueError):
            hls.verify_sig(tampered, "doc-1")

    def test_verify_rejects_foreign_token(self):
        # A valid node token (different secret shape is impossible — same
        # secret — but a token WITHOUT the hls claims must be rejected).
        foreign = jwt.encode({"username": "alice", "doc_id": "doc-1"}, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)
        with pytest.raises(ValueError, match="malformed"):
            hls.verify_sig(foreign, "doc-1")

    def test_verify_rejects_missing(self):
        with pytest.raises(ValueError, match="missing sig"):
            hls.verify_sig("", "doc-1")


class TestManifestSynthesis:
    VARIANTS = [
        {"width": 640, "height": 360, "bitrate_kbps": 1000, "url": {"type": "minio", "value": "p/hls/360p/index.m3u8"}},
        {"width": 1280, "height": 720, "bitrate_kbps": 3000, "url": {"type": "minio", "value": "p/hls/720p/index.m3u8"}},
    ]

    def test_master_manifest_lists_all_variants_with_sig(self):
        body = hls.synthesize_master_manifest("doc-1", "SIG", self.VARIANTS)
        lines = body.splitlines()
        assert lines[0] == "#EXTM3U"
        assert any(line.startswith("#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360") for line in lines)
        assert any(line.startswith("#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720") for line in lines)
        assert "/v3/media/hls/variant?doc_id=doc-1&variant=360p&sig=SIG" in lines
        assert "/v3/media/hls/variant?doc_id=doc-1&variant=720p&sig=SIG" in lines

    def test_variant_rewrite_signs_every_segment(self):
        text = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg001.ts\n#EXTINF:2.0,\nseg002.ts\n"
        body = hls.rewrite_variant_manifest("doc-1", "360p", "SIG", text)
        lines = body.splitlines()
        assert lines[0] == "#EXTM3U"
        assert "#EXT-X-TARGETDURATION:6" in lines
        assert "/v3/media/hls/segment?doc_id=doc-1&variant=360p&seg=seg001.ts&sig=SIG" in lines
        assert "/v3/media/hls/segment?doc_id=doc-1&variant=360p&seg=seg002.ts&sig=SIG" in lines
        # No bare segment names survive.
        assert "seg001.ts\n" not in body


class TestSegmentKey:
    def test_valid(self):
        assert hls.segment_key("alice/abc/hls", "360p", "seg001.ts") == "alice/abc/hls/360p/seg001.ts"

    @pytest.mark.parametrize("variant", ["../etc", "360p/..", "abc", "360px", ""])
    def test_bad_variant(self, variant):
        with pytest.raises(ValueError):
            hls.segment_key("p", variant, "seg001.ts")

    @pytest.mark.parametrize("seg", ["../seg001.ts", "seg001.ts/..", "index.m3u8", "seg001.tsx", "segX.ts", ""])
    def test_bad_segment(self, seg):
        with pytest.raises(ValueError):
            hls.segment_key("p", "360p", seg)


# ---------------------------------------------------------------------------
# Endpoints — the security seams
# ---------------------------------------------------------------------------


def _doc_with_hls():
    return {
        "doc_id": "doc-1",
        "author_key": "alice",
        "service": "media",
        "body": {
            "video": {"type": "minio", "value": "alice/abc/vacation.mp4"},
            "transcoding_settings": {
                "enabled": True,
                "status": "done",
                "variants": [
                    {
                        "width": 640,
                        "height": 360,
                        "bitrate_kbps": 1000,
                        "url": {"type": "minio", "value": "alice/abc/hls/360p/index.m3u8"},
                    }
                ],
            },
        },
    }


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app)


def _sig(username="alice", doc_id="doc-1"):
    return hls.mint_sig(username, doc_id, "alice/abc/hls")


class TestHlsManifestEndpoint:
    def test_200_for_author(self, client):
        with patch("app.v3.endpoints.media.can_view_doc", return_value=_doc_with_hls()):
            res = client.get(f"/v3/media/hls/manifest?doc_id=doc-1&sig={_sig()}")
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("application/vnd.apple.mpegurl")
        assert "#EXTM3U" in res.text
        assert "RESOLUTION=640x360" in res.text

    def test_403_without_sig(self, client):
        res = client.get("/v3/media/hls/manifest?doc_id=doc-1")
        assert res.status_code == 403

    def test_403_expired_sig(self, client, monkeypatch):
        monkeypatch.setattr(settings, "HLS_SIG_TTL", -10)
        sig = hls.mint_sig("alice", "doc-1", "alice/abc/hls")
        res = client.get(f"/v3/media/hls/manifest?doc_id=doc-1&sig={sig}")
        assert res.status_code == 403

    def test_403_sig_for_other_doc(self, client):
        res = client.get(f"/v3/media/hls/manifest?doc_id=doc-OTHER&sig={_sig()}")
        assert res.status_code == 403

    def test_403_when_access_recheck_fails(self, client):
        # Valid sig, but the membership re-check says no (revoked member).
        with patch("app.v3.endpoints.media.can_view_doc", return_value=None):
            res = client.get(f"/v3/media/hls/manifest?doc_id=doc-1&sig={_sig()}")
        assert res.status_code == 403
        assert "not a member" in res.json()["detail"]

    def test_404_when_not_transcoded(self, client):
        doc = _doc_with_hls()
        doc["body"]["transcoding_settings"] = {"enabled": False, "status": "processing"}
        with patch("app.v3.endpoints.media.can_view_doc", return_value=doc):
            res = client.get(f"/v3/media/hls/manifest?doc_id=doc-1&sig={_sig()}")
        assert res.status_code == 404


class TestHlsVariantEndpoint:
    def test_200_and_segments_rewritten(self, client):
        variant_body = b"#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg001.ts\n"
        s3 = MagicMock()
        s3.get_object.return_value = {"Body": MagicMock(read=lambda: variant_body)}
        with (
            patch("app.v3.endpoints.media.can_view_doc", return_value=_doc_with_hls()),
            patch("app.v3.endpoints.media.get_s3_client", return_value=s3),
        ):
            res = client.get(f"/v3/media/hls/variant?doc_id=doc-1&variant=360p&sig={_sig()}")
        assert res.status_code == 200
        assert "seg=seg001.ts&sig=" in res.text
        assert "seg001.ts\n" not in res.text
        # The variant manifest is fetched from the rendition's object key.
        s3.get_object.assert_called_once()
        assert s3.get_object.call_args.kwargs["Key"] == "alice/abc/hls/360p/index.m3u8"

    def test_404_unknown_variant(self, client):
        with patch("app.v3.endpoints.media.can_view_doc", return_value=_doc_with_hls()):
            res = client.get(f"/v3/media/hls/variant?doc_id=doc-1&variant=480p&sig={_sig()}")
        assert res.status_code == 404


class TestHlsSegmentEndpoint:
    def test_200_streams_bytes(self, client):
        seg_bytes = b"\x47\x00\x00\x80" * 100  # MPEG-TS sync-byte shaped
        s3 = MagicMock()
        s3.get_object.return_value = {"Body": MagicMock(read=lambda: seg_bytes)}
        with patch("app.v3.endpoints.media.get_s3_client", return_value=s3):
            res = client.get(f"/v3/media/hls/segment?doc_id=doc-1&variant=360p&seg=seg001.ts&sig={_sig()}")
        assert res.status_code == 200
        assert res.headers["content-type"] == "video/MP2T"
        assert res.content == seg_bytes
        # Addressed under the sig's prefix — no DB involved.
        assert s3.get_object.call_args.kwargs["Key"] == "alice/abc/hls/360p/seg001.ts"

    def test_400_traversal_segment(self, client):
        res = client.get(
            f"/v3/media/hls/segment?doc_id=doc-1&variant=360p&seg=..%2F..%2Fetc%2Fpasswd&sig={_sig()}"
        )
        assert res.status_code == 400

    def test_400_traversal_variant(self, client):
        res = client.get(f"/v3/media/hls/segment?doc_id=doc-1&variant=..%2F..&seg=seg001.ts&sig={_sig()}")
        assert res.status_code == 400

    def test_403_expired_sig(self, client, monkeypatch):
        monkeypatch.setattr(settings, "HLS_SIG_TTL", -10)
        sig = hls.mint_sig("alice", "doc-1", "alice/abc/hls")
        res = client.get(f"/v3/media/hls/segment?doc_id=doc-1&variant=360p&seg=seg001.ts&sig={sig}")
        assert res.status_code == 403

    def test_404_missing_segment(self, client):
        s3 = MagicMock()
        s3.get_object.side_effect = Exception("NoSuchKey")
        with patch("app.v3.endpoints.media.get_s3_client", return_value=s3):
            res = client.get(f"/v3/media/hls/segment?doc_id=doc-1&variant=360p&seg=seg999.ts&sig={_sig()}")
        assert res.status_code == 404


class TestTranscodeEndpoint:
    def test_404_unknown_doc(self, client):
        with patch("app.v3.endpoints.media.ch.get_document", return_value=None):
            res = client.post("/v3/media/transcode", json={"token": _make_token(), "doc_id": "ghost"})
        assert res.status_code == 404

    def test_400_doc_without_video(self, client):
        doc = _doc_with_hls()
        del doc["body"]["video"]
        with patch("app.v3.endpoints.media.ch.get_document", return_value=doc):
            res = client.post("/v3/media/transcode", json={"token": _make_token(), "doc_id": "doc-1"})
        assert res.status_code == 400

    def test_404_when_not_author(self, client):
        # get_document is author-scoped: bob's lookup of alice's doc returns
        # None → 404 (no existence leak, no 403 either).
        with patch("app.v3.endpoints.media.ch.get_document", return_value=None):
            res = client.post("/v3/media/transcode", json={"token": _make_token("bob"), "doc_id": "doc-1"})
        assert res.status_code == 404

    def test_200_queues_the_job(self, client):
        with (
            patch("app.v3.endpoints.media.ch.get_document", return_value=_doc_with_hls()),
            patch("app.v3.endpoints.media.transcode.submit_transcode_job") as submit,
        ):
            res = client.post("/v3/media/transcode", json={"token": _make_token("alice"), "doc_id": "doc-1"})
        assert res.status_code == 200
        assert res.json()["status"] == "queued"
        submit.assert_called_once_with("doc-1", "alice")

    def test_processing_is_idempotent(self, client):
        doc = _doc_with_hls()
        doc["body"]["transcoding_settings"]["status"] = "processing"
        with (
            patch("app.v3.endpoints.media.ch.get_document", return_value=doc),
            patch("app.v3.endpoints.media.transcode.submit_transcode_job") as submit,
        ):
            res = client.post("/v3/media/transcode", json={"token": _make_token("alice"), "doc_id": "doc-1"})
        assert res.status_code == 200
        assert res.json()["status"] == "processing"
        submit.assert_not_called()


def _make_token(username="alice", **extra):
    from datetime import datetime, timedelta

    payload = {
        "username": username,
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": (datetime.utcnow() + timedelta(minutes=60)).isoformat(),
        **extra,
    }
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)
