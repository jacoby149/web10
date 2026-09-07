"""Tests for the YouTube Takeout parser (app/services/importers/youtube.py).

The parser is pure: (path, bytes) entries -> record dicts. No I/O, no ClickHouse.
"""

import json

from app.services.importers.youtube import (
    _classify,
    map_youtube_channel,
    map_youtube_comment,
    map_youtube_video,
    parse_youtube,
)

# ---------------------------------------------------------------------------
# Fixtures — realistic Takeout shapes
# ---------------------------------------------------------------------------


def _video(vid="dQw4w9WgXcQ", title="Never Gonna Give You Up", desc="A classic.\n#music #retro",
           published="2019-05-01T12:00:00Z", duration="PT3M33S", privacy="public",
           views="1000", likes="50", comments="7"):
    return {
        "id": vid,
        "snippet": {
            "title": title,
            "description": desc,
            "publishedAt": published,
            "thumbnails": {
                "default": {"url": f"https://i.ytimg.com/vi/{vid}/default.jpg"},
                "high": {"url": f"https://i.ytimg.com/vi/{vid}/hq720.jpg"},
            },
        },
        "status": {"privacyStatus": privacy},
        "contentDetails": {"duration": duration},
        "statistics": {"viewCount": views, "likeCount": likes, "commentCount": comments},
    }


def _comment(cid="c1", text="great video", video_id="dQw4w9WgXcQ",
             published="2019-05-02T00:00:00Z", author="Some Fan", parent=None):
    snippet = {
        "textDisplay": text,
        "videoId": video_id,
        "publishedAt": published,
        "authorDisplayName": author,
    }
    if parent:
        snippet["parentId"] = parent
    return {"id": cid, "snippet": snippet}


def _channel(cid="UC1", title="My Channel", desc="I make videos", custom_url="/@mychannel"):
    return {
        "id": cid,
        "snippet": {"title": title, "description": desc, "customUrl": custom_url},
    }


# ---------------------------------------------------------------------------
# map_youtube_video
# ---------------------------------------------------------------------------


class TestMapVideo:
    def test_full_record(self):
        rec = map_youtube_video(_video())
        assert rec is not None
        assert rec["service"] == "staging_posts"
        assert rec["origin_id"] == "dQw4w9WgXcQ"
        assert rec["ref_origin_id"] is None
        body = rec["body"]
        assert body["origin"] == "youtube"
        assert body["origin_id"] == "dQw4w9WgXcQ"
        assert body["created_at"] == "2019-05-01T12:00:00Z"
        assert body["visibility"] == "public"
        assert body["source_privacy"] == "public"
        assert body["duration_seconds"] == 3 * 60 + 33  # PT3M33S = 3 min 33 sec
        assert body["view_count"] == 1000
        assert body["like_count"] == 50
        assert body["comment_count"] == 7
        assert body["video_url"] == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        assert "#music" in body["text"]
        assert body["tags"] == ["music", "retro"]
        # the high-res thumbnail wins
        assert rec["media_url"] == "https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg"

    def test_unlisted_stages_private(self):
        # D30 safe default: only `public` stages as public; unlisted/private stage private.
        rec = map_youtube_video(_video(privacy="unlisted"))
        assert rec["body"]["visibility"] == "private"
        assert rec["body"]["source_privacy"] == "unlisted"

    def test_private_stages_private(self):
        rec = map_youtube_video(_video(privacy="private"))
        assert rec["body"]["visibility"] == "private"

    def test_missing_id_returns_none(self):
        v = _video()
        del v["id"]
        assert map_youtube_video(v) is None

    def test_no_title_no_desc_returns_none(self):
        assert map_youtube_video(_video(title="", desc="")) is None

    def test_duration_hours(self):
        rec = map_youtube_video(_video(duration="PT1H2M3S"))
        assert rec["body"]["duration_seconds"] == 3600 + 120 + 3

    def test_no_thumbnails(self):
        v = _video()
        v["snippet"]["thumbnails"] = {}
        rec = map_youtube_video(v)
        assert rec["media_url"] is None


# ---------------------------------------------------------------------------
# map_youtube_comment
# ---------------------------------------------------------------------------


class TestMapComment:
    def test_comment_on_own_video(self):
        rec = map_youtube_comment(_comment(), video_ids={"dQw4w9WgXcQ"})
        assert rec is not None
        assert rec["service"] == "comments"
        assert rec["origin_id"] == "c1"
        assert rec["ref_origin_id"] == "dQw4w9WgXcQ"
        body = rec["body"]
        assert body["text"] == "great video"
        assert body["origin"] == "youtube"
        assert body["author_username"] == "some_fan"
        assert body["author_provider"] == "youtube"

    def test_comment_on_other_video_dropped(self):
        # The user's comment on SOMEONE ELSE's video points at a post that
        # doesn't exist on this node — dropped.
        rec = map_youtube_comment(_comment(video_id="otherVideo"), video_ids={"dQw4w9WgXcQ"})
        assert rec is None

    def test_comment_with_parent(self):
        rec = map_youtube_comment(_comment(parent="c0"), video_ids={"dQw4w9WgXcQ"})
        assert rec["body"]["parent_id"] == "c0"

    def test_empty_text_dropped(self):
        assert map_youtube_comment(_comment(text=""), video_ids={"dQw4w9WgXcQ"}) is None


# ---------------------------------------------------------------------------
# map_youtube_channel
# ---------------------------------------------------------------------------


class TestMapChannel:
    def test_channel_to_profile(self):
        rec = map_youtube_channel(_channel())
        assert rec is not None
        assert rec["service"] == "profile"
        body = rec["body"]
        assert body["display_name"] == "My Channel"
        assert body["bio"] == "I make videos"
        assert body["website"] == "https://youtube.com/@mychannel"

    def test_no_title_returns_none(self):
        assert map_youtube_channel(_channel(title="")) is None


# ---------------------------------------------------------------------------
# _classify
# ---------------------------------------------------------------------------


class TestClassify:
    def test_video(self):
        assert _classify("YouTube and Google/My videos/videos.json") == "video"

    def test_upload(self):
        assert _classify("YouTube and Google/My uploads/uploads.json") == "video"

    def test_comment_wins_over_video(self):
        # A comments file under a videos path must classify as comments.
        assert _classify("YouTube and Google/My videos/comments.json") == "comment"

    def test_channel(self):
        assert _classify("YouTube and Google/My channels/channels.json") == "channel"

    def test_non_json(self):
        assert _classify("YouTube and Google/My videos/video.mp4") is None


# ---------------------------------------------------------------------------
# parse_youtube (end-to-end over synthetic entries)
# ---------------------------------------------------------------------------


class TestParseYoutube:
    def _entries(self):
        videos = {"items": [_video("v1", "One"), _video("v2", "Two")]}
        comments = {"items": [
            _comment("c1", "on v1", video_id="v1"),
            _comment("c2", "on v2", video_id="v2"),
            _comment("c3", "on a stranger's video", video_id="zzz"),
        ]}
        channels = {"items": [_channel()]}
        return [
            ("YouTube and Google/My videos/videos.json", json.dumps(videos).encode()),
            ("YouTube and Google/My videos/comments.json", json.dumps(comments).encode()),
            ("YouTube and Google/My channels/channels.json", json.dumps(channels).encode()),
            ("YouTube and Google/My videos/video.mp4", b"not json"),
        ]

    def test_counts(self):
        records = parse_youtube(self._entries())
        by_service = {}
        for r in records:
            by_service.setdefault(r["service"], []).append(r)
        # 2 videos -> 2 staging posts
        assert len(by_service["staging_posts"]) == 2
        # 3 comments, but the one on a stranger's video is dropped -> 2
        assert len(by_service["comments"]) == 2
        # 1 channel -> 1 profile
        assert len(by_service["profile"]) == 1

    def test_comments_join_own_videos_only(self):
        records = parse_youtube(self._entries())
        comment_refs = {r["ref_origin_id"] for r in records if r["service"] == "comments"}
        assert comment_refs == {"v1", "v2"}
        assert "zzz" not in comment_refs

    def test_malformed_json_skipped(self):
        entries = [("x/videos.json", b"{not valid json")]
        assert parse_youtube(entries) == []

    def test_empty(self):
        assert parse_youtube([]) == []
