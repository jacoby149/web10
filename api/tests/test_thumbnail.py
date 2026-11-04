"""Tests for the generic thumbnailing utility (KB: media/thumbnailing.md).

Two layers, both universal (no posts/profiles/permalinks):

- ``pick_thumbnail`` — a PURE function over resolved media. The selection table:
  first image (read_url), else a video's poster (thumbnail_url), else None.
  No I/O, no access check, no schema knowledge.
- ``POST /v3/media/thumbnail`` — the convenience one-call form. Access-checked
  (I3): a doc the reader cannot read does not thumbnail for them. Returns the
  doc's own picture (``null`` when there is none); the fallback is the app's
  call, not the platform's.
"""

import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app as fastapi_app
from app.v3.services import thumbnail

# ── pickThumbnail — the pure selection ──────────────────────────────────────


class TestPickThumbnail:
    def test_first_image_is_the_thumbnail(self):
        media = [
            {"mime_type": "image/png", "read_url": "https://minio/img.png", "width": 100, "height": 80},
        ]
        result = thumbnail.pick_thumbnail(media)
        assert result == {
            "url": "https://minio/img.png",
            "alt": None,
            "is_video": False,
            "width": 100,
            "height": 80,
            "mime_type": "image/png",
        }

    def test_video_with_poster_uses_the_poster(self):
        media = [
            {
                "mime_type": "video/mp4",
                "read_url": "https://minio/v.mp4",
                "thumbnail_url": "https://minio/v-poster.jpg",
            },
        ]
        result = thumbnail.pick_thumbnail(media)
        assert result is not None
        assert result["url"] == "https://minio/v-poster.jpg"
        assert result["is_video"] is True

    def test_video_without_poster_falls_through_to_next(self):
        media = [
            {"mime_type": "video/mp4", "read_url": "https://minio/v.mp4", "thumbnail_url": None},
            {"mime_type": "image/jpeg", "read_url": "https://minio/next.jpg"},
        ]
        result = thumbnail.pick_thumbnail(media)
        assert result is not None
        assert result["url"] == "https://minio/next.jpg"
        assert result["is_video"] is False

    def test_audio_uses_cover_thumbnail_never_the_recording(self):
        result = thumbnail.pick_thumbnail(
            [
                {
                    "mime_type": "audio/mpeg",
                    "read_url": "https://minio/track.mp3",
                    "thumbnail_url": "https://minio/album.webp",
                },
            ]
        )
        assert result is not None
        assert result["url"] == "https://minio/album.webp"
        assert result["is_video"] is False

    def test_alt_text_is_carried_when_present(self):
        media = [
            {"mime_type": "image/png", "read_url": "https://minio/img.png", "alt_text": "a cat"},
        ]
        result = thumbnail.pick_thumbnail(media)
        assert result["alt"] == "a cat"

    def test_no_media_returns_none(self):
        assert thumbnail.pick_thumbnail([]) is None
        assert thumbnail.pick_thumbnail(None) is None

    def test_only_posterless_video_returns_none(self):
        media = [{"mime_type": "video/mp4", "read_url": "https://minio/v.mp4", "thumbnail_url": None}]
        assert thumbnail.pick_thumbnail(media) is None

    def test_non_dict_items_are_skipped(self):
        media = ["not-a-dict", None, {"mime_type": "image/png", "read_url": "https://minio/img.png"}]
        result = thumbnail.pick_thumbnail(media)
        assert result is not None
        assert result["url"] == "https://minio/img.png"

    @pytest.mark.parametrize("mime", ["audio/mpeg", "application/pdf"])
    def test_non_image_files_do_not_hide_later_artwork(self, mime):
        result = thumbnail.pick_thumbnail(
            [
                {"mime_type": mime, "read_url": "https://minio/file"},
                {"mime_type": "image/webp", "read_url": "https://minio/cover.webp"},
            ]
        )
        assert result["url"] == "https://minio/cover.webp"
        assert thumbnail.pick_thumbnail([{"mime_type": mime, "read_url": "https://minio/file"}]) is None


# ── POST /v3/media/thumbnail — the access-checked convenience endpoint ──────


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app)


def _doc(doc_id="abc123", author="nova", service="posts", media_refs=None):
    body = {}
    if media_refs is not None:
        body["media_refs"] = media_refs
    return {
        "doc_id": doc_id,
        "author_key": author,
        "service": service,
        "body": body,
        "ref_value": "",
        "tags": [],
        "created_at": "2026-09-07T10:00:00.000",
        "updated_at": "2026-09-07T10:00:00.000",
    }


class TestThumbnailEndpoint:
    @pytest.mark.parametrize("service", ["posts", "shop-catalog", "media_metadata"])
    @pytest.mark.parametrize("poster_owner", ["nova", "victim"])
    @pytest.mark.parametrize("mime", ["video/mp4", "audio/mpeg"])
    def test_group_authored_thumbnail_uses_canonical_uploader(self, client, service, poster_owner, mime):
        """Drive the route through the real owner-filtered resolver and signer."""
        group = "api.test/groups/users/nova/catalog"
        doc = _doc(author=group, service=service, media_refs=["v1"])
        doc["posted_by"] = "nova"
        # A caller-controlled body field must never replace the server audit actor.
        doc["body"]["posted_by"] = "victim"
        media_id = "abc123" if service == "media_metadata" else "v1"
        metadata = {
            "mime_type": mime,
            "object_key": "nova/film.mp4",
            "thumbnail_object_key": f"{poster_owner}/poster.webp",
        }

        def query(sql, params):
            if "author_key" not in params:
                row = (
                    doc["doc_id"],
                    group,
                    service,
                    json.dumps(doc["body"]),
                    "",
                    [],
                    doc["created_at"],
                    doc["updated_at"],
                )
                if "posted_by" in sql.split("FROM documents")[0]:
                    row += ("nova",)
                return SimpleNamespace(result_rows=[row])
            rows = [(media_id, json.dumps(metadata), "media_metadata")] if params["author_key"] == "nova" else []
            return SimpleNamespace(result_rows=rows)

        with (
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=[group]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=True),
            patch("app.v3.services.clickhouse.client.query", side_effect=query) as lookup,
            patch("app.v3.services.clickhouse.get_s3_signing_client"),
            patch("app.v3.services.clickhouse.get_url", side_effect=lambda key, _: "https://media.test/" + key) as sign,
        ):
            resp = client.post("/v3/media/thumbnail", json={"doc_id": "abc123"})
        assert resp.status_code == 200
        result = resp.json()["thumbnail"]
        expected_keys = {"nova/film.mp4"}
        if poster_owner == "nova":
            assert result["url"] == "https://media.test/nova/poster.webp"
            assert result["is_video"] is mime.startswith("video/")
            expected_keys.add("nova/poster.webp")
        else:
            assert result is None
        assert lookup.call_args.args[1]["author_key"] == "nova"
        assert {call.args[0] for call in sign.call_args_list} == expected_keys

    @pytest.mark.parametrize("posted_by", [None, "", "nova"])
    def test_personal_and_legacy_documents_keep_author_namespace(self, client, posted_by):
        doc = _doc(media_refs=["m1"])
        if posted_by is not None:
            doc["posted_by"] = posted_by
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["public"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=True),
            patch("app.v3.services.clickhouse.resolve_media_urls", return_value={}) as resolve,
        ):
            resp = client.post("/v3/media/thumbnail", json={"doc_id": "abc123"})
        assert resp.status_code == 200
        assert resp.json()["thumbnail"] is None
        resolve.assert_called_once_with(doc["body"], "nova")

    def test_private_group_author_never_resolves_uploader_media(self, client):
        doc = _doc(author="api.test/groups/users/nova/private", media_refs=["v1"])
        doc["posted_by"] = "nova"
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=[doc["author_key"]]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=False),
            patch("app.v3.services.clickhouse.resolve_media_urls") as resolve,
        ):
            resp = client.post("/v3/media/thumbnail", json={"doc_id": "abc123"})
        assert resp.status_code == 404
        resolve.assert_not_called()

    @pytest.mark.parametrize(
        "mime,poster,expected",
        [
            ("video/mp4", "https://minio/poster.webp", "https://minio/poster.webp"),
            ("video/mp4", None, None),
            ("audio/mpeg", None, None),
            ("audio/mpeg", "https://minio/album.webp", "https://minio/album.webp"),
        ],
    )
    def test_media_document_returns_only_a_displayable_image(self, client, mime, poster, expected):
        doc = _doc(service="media_metadata")
        resolved = {"media_refs": [{"mime_type": mime, "read_url": "https://minio/raw", "thumbnail_url": poster}]}
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["public"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=True),
            patch("app.v3.services.clickhouse.resolve_media_urls", return_value=resolved),
        ):
            resp = client.post("/v3/media/thumbnail", json={"doc_id": "abc123"})
        assert resp.status_code == 200
        result = resp.json()["thumbnail"]
        assert (result["url"] if result else None) == expected

    def test_public_doc_returns_its_thumbnail(self, client):
        doc = _doc(media_refs=["m1"])
        resolved = {"media_refs": [{"doc_id": "m1", "mime_type": "image/png", "read_url": "https://minio/img.png"}]}
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["web10.app/groups/web10/discover"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=True),
            patch("app.v3.services.clickhouse.resolve_media_urls", return_value=resolved),
        ):
            resp = client.post("/v3/media/thumbnail", json={"doc_id": "abc123"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["thumbnail"]["url"] == "https://minio/img.png"
        assert body["thumbnail"]["is_video"] is False

    def test_video_doc_returns_the_poster(self, client):
        doc = _doc(media_refs=["v1"])
        resolved = {
            "media_refs": [
                {
                    "doc_id": "v1",
                    "mime_type": "video/mp4",
                    "read_url": "https://minio/v.mp4",
                    "thumbnail_url": "https://minio/v-poster.jpg",
                }
            ]
        }
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["web10.app/groups/web10/discover"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=True),
            patch("app.v3.services.clickhouse.resolve_media_urls", return_value=resolved),
        ):
            resp = client.post("/v3/media/thumbnail", json={"doc_id": "abc123"})
        body = resp.json()
        assert body["thumbnail"]["url"] == "https://minio/v-poster.jpg"
        assert body["thumbnail"]["is_video"] is True

    def test_doc_with_no_media_returns_null_thumbnail(self, client):
        doc = _doc(media_refs=None)  # no media_refs at all
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["web10.app/groups/web10/discover"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=True),
            patch("app.v3.services.clickhouse.resolve_media_urls", return_value={}),
        ):
            resp = client.post("/v3/media/thumbnail", json={"doc_id": "abc123"})
        assert resp.status_code == 200
        assert resp.json()["thumbnail"] is None

    def test_private_doc_is_not_a_thumbnail_surface(self, client):
        # I3: a doc the reader cannot read does not thumbnail for them. The
        # reader (anon, no token) cannot read a followers-only doc → 404, and
        # resolve_media_urls is never called (no media URL minted).
        doc = _doc(media_refs=["m1"])
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["web10.app/users/nova/followers"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=False),
            patch(
                "app.v3.services.clickhouse.resolve_media_urls",
                side_effect=AssertionError("private doc must not resolve media"),
            ),
        ):
            resp = client.post("/v3/media/thumbnail", json={"doc_id": "abc123"})
        assert resp.status_code == 404

    def test_ghost_doc_404(self, client):
        with patch("app.v3.services.clickhouse.get_document_any_author", return_value=None):
            resp = client.post("/v3/media/thumbnail", json={"doc_id": "does-not-exist"})
        assert resp.status_code == 404

    def test_works_for_any_service_not_just_posts(self, client):
        # The whole point (D60): a non-social service thumbnails the same way.
        doc = _doc(service="web10-music-artwork", media_refs=["a1"])
        resolved = {"media_refs": [{"doc_id": "a1", "mime_type": "image/jpeg", "read_url": "https://minio/cover.jpg"}]}
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["web10.app/groups/web10/discover"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=True),
            patch("app.v3.services.clickhouse.resolve_media_urls", return_value=resolved),
        ):
            resp = client.post("/v3/media/thumbnail", json={"doc_id": "abc123"})
        assert resp.status_code == 200
        assert resp.json()["thumbnail"]["url"] == "https://minio/cover.jpg"

    def test_a_media_doc_returns_its_own_url(self, client):
        # A media doc (an avatar, a cover) IS the picture — the endpoint
        # resolves its own object_key to a fresh presigned read_url. This is
        # what lets an app ask "what's the picture for this avatar?" through
        # the same generic endpoint (the social preview server's fallback).
        doc = _doc(doc_id="avatar-1", service="public_media", media_refs=None)
        doc["body"] = {"object_key": "nova/avatar.png", "mime_type": "image/png"}
        resolved = {
            "media_refs": [
                {
                    "doc_id": "avatar-1",
                    "mime_type": "image/png",
                    "read_url": "https://minio/nova/avatar.png",
                    "width": 400,
                    "height": 400,
                }
            ]
        }
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["web10.app/groups/web10/discover"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=True),
            patch("app.v3.services.clickhouse.resolve_media_urls", return_value=resolved),
        ):
            resp = client.post("/v3/media/thumbnail", json={"doc_id": "avatar-1"})
        assert resp.status_code == 200
        body = resp.json()["thumbnail"]
        assert body["url"] == "https://minio/nova/avatar.png"
        assert body["is_video"] is False
        assert body["mime_type"] == "image/png"
