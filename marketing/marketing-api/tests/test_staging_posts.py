"""D19 Phase A regression: imported posts land in staging_posts (owner-only),
NOT the legacy anon-readable `posts` collection. The legacy bug
auto-published a user's whole import; the fix is per-collection visibility
(decisions.md D30) — the marketing-api parsers tag the service, main.py
writes it. These tests assert the parsers' output for every platform's
post records.
"""

import pytest

from app.validation import VALIDATORS, validate_record
from app.instagram import map_instagram_post, parse_instagram
from app.facebook import map_facebook_post
from app.youtube import map_youtube_video


POST_SERVICES = {"staging_posts"}
NON_POST_SERVICES = {"posts", "media", "comments", "contacts", "profile"}


def _post_records(records):
    return [r for r in records if r.get("service") in POST_SERVICES]


def _legacy_post_records(records):
    return [r for r in records if r.get("service") == "posts"]


# ─── instagram ────────────────────────────────────────────────────────────────


def test_instagram_post_record_uses_staging_posts_service():
    post = {
        "post_id": "ig_1",
        "post_text": "summer ☀ #beach",
        "post_timestamp": "2026-07-01T12:00:00Z",
        "media": [
            {"media_id": "ig_m1", "media_filename": "pic.jpg", "media_alt_text": "alt"},
        ],
        "comments": [],
    }
    records = map_instagram_post(post)

    # exactly one staging post per feed post (the rest are media/comments)
    staged = _post_records(records)
    assert len(staged) == 1, [r["service"] for r in records]
    assert staged[0]["service"] == "staging_posts"
    assert staged[0]["body"]["origin"] == "instagram"
    assert staged[0]["body"]["origin_id"] == "ig_1"

    # regression: NO record lands in the legacy anon-readable `posts`. That
    # collection is what auto-published imports before D19 Phase A.
    assert _legacy_post_records(records) == [], "instagram import leaked into legacy `posts`"


def test_instagram_media_and_comments_keep_their_own_services():
    # Only the POST record moves to staging_posts. media stays `media`,
    # comments stay `comments` — those services are already owner-scoped
    # (no anon whitelist), so they don't auto-publish.
    post = {
        "post_id": "ig_2",
        "post_text": "hello",
        "post_timestamp": "2026-07-02T12:00:00Z",
        "media": [
            {"media_id": "ig_m2", "media_filename": "x.jpg"},
        ],
        "comments": [
            {"comment_id": "c1", "comment_body": "nice", "comment_timestamp": "2026-07-02T13:00:00Z"},
        ],
    }
    records = map_instagram_post(post)
    services = {r["service"] for r in records}
    assert "staging_posts" in services
    assert "media" in services
    assert "comments" in services
    assert "posts" not in services  # legacy anon-readable posts must NOT be written


# ─── facebook ────────────────────────────────────────────────────────────────


def test_facebook_post_record_uses_staging_posts_service():
    item = {
        "Post ID": "fb_1",
        "Post text": "hello from facebook",
        "Post created time": "2026-06-30T10:00:00Z",
        "Post privacy": "Public",
    }
    record = map_facebook_post(item)
    assert record is not None
    assert record["service"] == "staging_posts"
    assert record["body"]["origin"] == "facebook"
    assert record["body"]["origin_id"] == "fb_1"
    # visibility is preserved as informational source-privacy metadata for
    # the staging triage UI; the COLLECTION is the security boundary.
    assert record["body"]["visibility"] == "public"


def test_facebook_post_does_not_use_legacy_posts():
    item = {
        "Post ID": "fb_2",
        "Post text": "private memory",
        "Post created time": "2026-06-29T10:00:00Z",
        "Post privacy": "Only me",
    }
    record = map_facebook_post(item)
    assert record is not None
    assert record["service"] != "posts"
    assert record["service"] == "staging_posts"


# ─── youtube ──────────────────────────────────────────────────────────────────


def test_youtube_video_record_uses_staging_posts_service():
    video = {
        "id": "yt_1",
        "snippet": {
            "title": "First video",
            "description": "a description",
            "publishedAt": "2026-06-01T00:00:00Z",
            "thumbnails": {"high": {"url": "https://img/y.jpg", "width": 1280, "height": 720}},
        },
        "status": {"privacyStatus": "public"},
        "contentDetails": {"duration": "PT1M30S"},
        "statistics": {"viewCount": "12", "likeCount": "3", "commentCount": "1"},
    }
    records = map_youtube_video(video)

    staged = _post_records(records)
    assert len(staged) == 1
    assert staged[0]["service"] == "staging_posts"
    assert staged[0]["body"]["origin"] == "youtube"
    assert staged[0]["body"]["origin_id"] == "yt_1"
    # youtube's `unlisted` clips map to `friends` for the staging UI's
    # default; renamed collection ownership holds regardless.
    assert staged[0]["body"]["visibility"] == "public"
    assert _legacy_post_records(records) == [], "youtube import leaked into legacy `posts`"


def test_youtube_thumbnail_record_still_uses_media_service():
    video = {
        "id": "yt_2",
        "snippet": {
            "title": "T",
            "publishedAt": "2026-06-01T00:00:00Z",
            "thumbnails": {"high": {"url": "https://img/y.jpg", "width": 100, "height": 100}},
        },
        "status": {"privacyStatus": "private"},
    }
    records = map_youtube_video(video)
    services = {r["service"] for r in records}
    assert "staging_posts" in services
    assert "media" in services
    assert "posts" not in services  # legacy anon-readable `posts` is gone from imports


# ─── validation registry ─────────────────────────────────────────────────────


def test_staging_posts_is_a_validated_service():
    # VALIDATORS must know about staging_posts so the import pipeline
    # applies the same body-shape check it applies to posts. A missing
    # validator means a malformed import silently passes.
    assert "staging_posts" in VALIDATORS
    valid, err = validate_record(
        {
            "service": "staging_posts",
            "origin_id": "1",
            "body": {
                "text": "hi",
                "created_at": "2026-01-01T00:00:00Z",
                "origin": "instagram",
            },
        }
    )
    assert valid, err


def test_staging_posts_validation_rejects_missing_required_field():
    # schema's `required` field (`created_at`) must still bite on staged posts
    valid, _ = validate_record(
        {
            "service": "staging_posts",
            "origin_id": "x",
            "body": {"text": "no created_at"},
        }
    )
    assert valid is False


# ─── full pipeline: a tiny instagram ZIP ──────────────────────────────────────


@pytest.fixture
def fake_instagram_zip(tmp_path):
    import zipfile
    import json as _json

    post = {
        "post_id": "ig_p1",
        "post_text": "from the archive",
        "post_timestamp": "2026-07-15T12:00:00Z",
        "media": [],
        "comments": [],
    }
    info = {"profile": {}}

    path = tmp_path / "ig.zip"
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("posts/2026_july/ig_p1.json", _json.dumps(post))
        zf.writestr("your_instagram_information/index.json", _json.dumps(info))
    return path


def test_parse_instagram_writes_staging_posts_for_post_records(fake_instagram_zip, monkeypatch):
    # parse_instagram reads from the open ZipFile, not the entries list, so
    # the same ZIP that drove _run_pipeline above is what we feed here.
    import zipfile

    with zipfile.ZipFile(fake_instagram_zip, "r") as zf:
        entries = [{"path": z.filename, "data": zf.read(z.filename)} for z in zf.infolist() if not z.is_dir()]

        records = parse_instagram(zf, entries)
    staged = _post_records(records)
    assert len(staged) == 1
    assert staged[0]["service"] == "staging_posts"
    assert _legacy_post_records(records) == [], "import pipeline still writes legacy `posts`"
