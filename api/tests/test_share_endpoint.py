"""Tests for the share-preview endpoint (D71) — the post permalink's Open
Graph / Twitter Card tags, rendered for link-preview crawlers.

The endpoint is public (no token) and answers a crawler on behalf of the SPA.
The load-bearing guarantees these pin:

- A **public** post previews with content: the post text becomes the
  title/description, the first media item (image, or a video's poster)
  becomes the thumbnail, and the canonical permalink is og:url.
- A **private / followers-only** post NEVER leaks: the preview is a generic
  web10 card with no post text, no media URL, no author data (I3 / D41).
- A **ghost** (nonexistent / tombstoned / non-post) doc_id → 404.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app as fastapi_app


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app)


def _post_doc(doc_id="abc123", author="nova", text="hello world", media_refs=None):
    body = {"text": text}
    if media_refs is not None:
        body["media_refs"] = media_refs
    return {
        "doc_id": doc_id,
        "author_key": author,
        "service": "posts",
        "body": body,
        "ref_value": "",
        "tags": [],
        "created_at": "2026-09-07T10:00:00.000",
        "updated_at": "2026-09-07T10:00:00.000",
    }


class TestSharePostPreview:
    def test_public_post_renders_og_tags(self, client):
        doc = _post_doc(text="check out this clip", media_refs=["m1"])
        resolved = {
            "text": "check out this clip",
            "media_refs": [
                {
                    "doc_id": "m1",
                    "mime_type": "image/png",
                    "read_url": "https://minio.web10.app/img.png",
                    "thumbnail_url": None,
                },
            ],
        }
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["web10.app/groups/web10/discover"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=True),
            patch("app.v3.services.clickhouse.resolve_media_urls", return_value=resolved),
            patch("app.v3.services.clickhouse.get_author_profiles", return_value={}),
        ):
            resp = client.get("/v3/share/post/nova/abc123")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]
        body = resp.text
        # The post text becomes the title + description.
        assert 'property="og:title" content="check out this clip"' in body
        assert 'property="og:description" content="check out this clip"' in body
        # The first image is the thumbnail.
        assert 'property="og:image" content="https://minio.web10.app/img.png"' in body
        # The canonical permalink is og:url.
        assert 'property="og:url" content="https://social.localhost/u/nova/p/abc123"' in body
        # Twitter card mirrors.
        assert 'name="twitter:card" content="summary_large_image"' in body
        assert 'name="twitter:image" content="https://minio.web10.app/img.png"' in body
        # A text post is an article, not a video.
        assert 'property="og:type" content="article"' in body

    def test_public_video_post_uses_poster_and_video_type(self, client):
        doc = _post_doc(text="new drop", media_refs=["v1"])
        resolved = {
            "text": "new drop",
            "media_refs": [
                {
                    "doc_id": "v1",
                    "mime_type": "video/mp4",
                    "read_url": "https://minio.web10.app/v.mp4",
                    "thumbnail_url": "https://minio.web10.app/v-poster.jpg",
                },
            ],
        }
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["web10.app/groups/web10/discover"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=True),
            patch("app.v3.services.clickhouse.resolve_media_urls", return_value=resolved),
            patch("app.v3.services.clickhouse.get_author_profiles", return_value={}),
        ):
            resp = client.get("/v3/share/post/nova/abc123")
        body = resp.text
        # A video post is typed as video.other and uses the poster frame.
        assert 'property="og:type" content="video.other"' in body
        assert 'property="og:image" content="https://minio.web10.app/v-poster.jpg"' in body

    def test_private_post_renders_generic_card_no_leak(self, client):
        # A followers-only / private post: no group grants anon readAll on
        # posts. The preview must be a generic web10 card — NO post text, NO
        # media URL, NO author-specific data (I3 / D41).
        secret = "top secret caption that must not leak"
        doc = _post_doc(text=secret, media_refs=["m1"])
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["web10.app/users/nova/followers"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=False),
            # If the endpoint (wrongly) tried to resolve media for a private
            # post, this would mint a URL — the anti-test asserts it never does.
            patch(
                "app.v3.services.clickhouse.resolve_media_urls",
                side_effect=AssertionError("private post must not resolve media"),
            ),
            patch(
                "app.v3.services.clickhouse.get_author_profiles",
                side_effect=AssertionError("private post must not read the profile"),
            ),
        ):
            resp = client.get("/v3/share/post/nova/abc123")
        assert resp.status_code == 200
        body = resp.text
        # The generic card.
        assert "A post on web10" in body
        # NO leak of the post content.
        assert secret not in body
        # NO media URL minted for a private post.
        assert "minio.web10.app" not in body
        # og:url is still the canonical permalink (the link is shareable).
        assert 'property="og:url" content="https://social.localhost/u/nova/p/abc123"' in body

    def test_ghost_post_404(self, client):
        with patch("app.v3.services.clickhouse.get_document_any_author", return_value=None):
            resp = client.get("/v3/share/post/nova/does-not-exist")
        assert resp.status_code == 404

    def test_non_post_doc_404(self, client):
        # A doc_id that resolves to a non-post service (e.g. a media doc) is
        # not a shareable post → 404.
        doc = _post_doc()
        doc["service"] = "media_metadata"
        with patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc):
            resp = client.get("/v3/share/post/nova/abc123")
        assert resp.status_code == 404

    def test_text_only_post_falls_back_to_brand_image(self, client):
        # No media, no avatar → the brand mark is the og:image.
        doc = _post_doc(text="just words")
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["web10.app/groups/web10/discover"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=True),
            patch("app.v3.services.clickhouse.resolve_media_urls", side_effect=lambda body, author: body),
            patch("app.v3.services.clickhouse.get_author_profiles", return_value={}),
        ):
            resp = client.get("/v3/share/post/nova/abc123")
        body = resp.text
        assert 'property="og:image" content="https://social.localhost/keys-mark.png"' in body
        assert 'property="og:title" content="just words"' in body

    def test_long_text_is_truncated(self, client):
        long_text = "word " * 100  # 500 chars, well over the 100-char title cap
        doc = _post_doc(text=long_text.strip())
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["web10.app/groups/web10/discover"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=True),
            patch("app.v3.services.clickhouse.resolve_media_urls", side_effect=lambda body, author: body),
            patch("app.v3.services.clickhouse.get_author_profiles", return_value={}),
        ):
            resp = client.get("/v3/share/post/nova/abc123")
        body = resp.text
        # The title is truncated to ~100 chars (ends with the ellipsis).
        assert 'property="og:title" content="' in body
        title = body.split('property="og:title" content="')[1].split('"')[0]
        assert len(title) <= 100
        assert title.endswith("…")

    def test_author_avatar_used_when_no_media(self, client):
        # No media, but the author has an avatar → the avatar is the og:image.
        doc = _post_doc(text="hi")
        with (
            patch("app.v3.services.clickhouse.get_document_any_author", return_value=doc),
            patch("app.v3.services.clickhouse.get_doc_groups", return_value=["web10.app/groups/web10/discover"]),
            patch("app.v3.services.clickhouse.can_read_group", return_value=True),
            patch(
                "app.v3.services.clickhouse.resolve_media_urls",
                side_effect=lambda body, author: {
                    "media_refs": [{"read_url": "https://minio.web10.app/avatar.png"}]
                    if body.get("media_refs") == ["av-1"]
                    else body
                },
            ),
            patch(
                "app.v3.services.clickhouse.get_author_profiles",
                return_value={"nova": {"profile": {"display_name": "Nova"}, "avatar_ref": "av-1"}},
            ),
        ):
            resp = client.get("/v3/share/post/nova/abc123")
        body = resp.text
        assert 'property="og:image" content="https://minio.web10.app/avatar.png"' in body
