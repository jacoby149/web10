"""Tests for the YouTube Takeout parser (app/services/importers/youtube.py).

The parser is pure: (path, bytes) archive entries -> record dicts. No I/O, no
ClickHouse. Written against the REAL Takeout shape (CSV, "YouTube and YouTube
Music" paths) — verified against a live export.
"""

from app.services.importers.youtube import (
    _classify,
    _parse_comment_text,
    map_youtube_channel,
    map_youtube_comment,
    map_youtube_video,
    parse_youtube,
)

B = "Takeout/YouTube and YouTube Music/"


def _videos_csv(rows):
    cols = [
        "Video ID",
        "Approx Duration (ms)",
        "Video Description (Original)",
        "Channel ID",
        "Tag 1",
        "Tag 2",
        "Video Title (Original)",
        "Privacy",
        "Video State",
        "Video Create Timestamp",
        "Video Publish Timestamp",
        "Video Category",
    ]
    lines = [",".join(cols)]
    for r in rows:
        lines.append(",".join(str(r.get(c, "")) for c in cols))
    return "\n".join(lines).encode()


def _video_row(
    vid="JIY6_VBi4l8",
    title="Apartment Dorm Tour",
    desc="like and subscribe",
    privacy="Public",
    dur_ms="144000",
    published="2018-12-02T02:55:54+00:00",
    created="2018-12-02T02:45:06+00:00",
    tags=("#Student", "#College"),
    category="People",
):
    return {
        "Video ID": vid,
        "Approx Duration (ms)": dur_ms,
        "Video Description (Original)": desc,
        "Channel ID": "UCEPOvrQOmvMc9UmQj0ERcnA",
        "Tag 1": tags[0] if len(tags) > 0 else "",
        "Tag 2": tags[1] if len(tags) > 1 else "",
        "Video Title (Original)": title,
        "Privacy": privacy,
        "Video State": "",
        "Video Create Timestamp": created,
        "Video Publish Timestamp": published,
        "Video Category": category,
    }


def _comments_csv(rows):
    cols = [
        "Comment ID",
        "Channel ID",
        "Comment Create Timestamp",
        "Price",
        "Parent Comment ID",
        "Video ID",
        "Comment Text",
        "Top-Level Comment ID",
    ]
    lines = [",".join(cols)]
    for r in rows:
        lines.append(",".join(str(r.get(c, "")) for c in cols))
    return "\n".join(lines).encode()


def _comment_row(
    cid="c1", text='{"text":"great video"}', video_id="JIY6_VBi4l8", ts="2024-08-08T09:53:08+00:00", parent=""
):
    return {
        "Comment ID": cid,
        "Channel ID": "UCEPOvrQOmvMc9UmQj0ERcnA",
        "Comment Create Timestamp": ts,
        "Price": "0",
        "Parent Comment ID": parent,
        "Video ID": video_id,
        "Comment Text": text,
        "Top-Level Comment ID": "",
    }


def _channel_csv(title="jacobs multimedia", desc="Making some dope videos.", cid="UCEPOvrQOmvMc9UmQj0ERcnA"):
    cols = [
        "Channel ID",
        "Channel Country",
        "Channel Description (Original)",
        "Channel Title (Original)",
        "Channel Visibility",
    ]
    return (",".join(cols) + "\n" + f"{cid},US,{desc},{title},Public").encode()


# ---------------------------------------------------------------------------
# _parse_comment_text (the JSON sequence)
# ---------------------------------------------------------------------------


class TestParseCommentText:
    def test_single_object(self):
        assert _parse_comment_text('{"text":"hello"}') == "hello"

    def test_consecutive_objects(self):
        raw = '{"text":"what is the violin piece at "},{"text":"5:02","videoLink":{"externalVideoId":"x","startTimeSeconds":302}},{"text":"?"}'
        assert _parse_comment_text(raw) == "what is the violin piece at 5:02?"

    def test_empty(self):
        assert _parse_comment_text("") is None
        assert _parse_comment_text(None) is None

    def test_not_json_falls_back_to_raw(self):
        assert _parse_comment_text("plain text, no json") == "plain text, no json"


# ---------------------------------------------------------------------------
# map_youtube_video
# ---------------------------------------------------------------------------


class TestMapVideo:
    def test_full_record(self):
        rec = map_youtube_video(_video_row())
        assert rec is not None
        assert rec["service"] == "staging_posts"
        assert rec["origin_id"] == "JIY6_VBi4l8"
        body = rec["body"]
        assert body["origin"] == "youtube"
        assert body["created_at"] == "2018-12-02T02:55:54+00:00"
        assert body["visibility"] == "public"
        assert body["source_privacy"] == "Public"
        assert body["duration_seconds"] == 144  # 144000 ms
        assert body["tags"] == ["#Student", "#College"]
        assert body["category"] == "People"
        assert body["video_url"] == "https://www.youtube.com/watch?v=JIY6_VBi4l8"
        assert "#Student" in body["text"] or "Apartment Dorm Tour" in body["text"]
        assert rec["media_url"] == "https://i.ytimg.com/vi/JIY6_VBi4l8/hqdefault.jpg"

    def test_unlisted_stages_private(self):
        assert map_youtube_video(_video_row(privacy="Unlisted"))["body"]["visibility"] == "private"

    def test_private_stages_private(self):
        assert map_youtube_video(_video_row(privacy="Private"))["body"]["visibility"] == "private"

    def test_missing_id_returns_none(self):
        row = _video_row()
        row["Video ID"] = ""
        assert map_youtube_video(row) is None

    def test_no_title_no_desc_returns_none(self):
        assert map_youtube_video(_video_row(title="", desc="")) is None

    def test_no_view_like_counts(self):
        # The CSV carries no statistics — the body must not invent them.
        body = map_youtube_video(_video_row())["body"]
        assert "view_count" not in body
        assert "like_count" not in body


# ---------------------------------------------------------------------------
# map_youtube_comment
# ---------------------------------------------------------------------------


class TestMapComment:
    def test_comment_on_own_video(self):
        rec = map_youtube_comment(_comment_row(), video_ids={"JIY6_VBi4l8"})
        assert rec is not None
        assert rec["service"] == "comments"
        assert rec["origin_id"] == "c1"
        assert rec["ref_origin_id"] == "JIY6_VBi4l8"
        assert rec["body"]["text"] == "great video"
        assert rec["body"]["origin"] == "youtube"

    def test_comment_on_missing_video_dropped(self):
        # A comment on a deleted video (not in the export) is an orphan.
        assert map_youtube_comment(_comment_row(video_id="deleted"), video_ids={"JIY6_VBi4l8"}) is None

    def test_comment_with_parent(self):
        rec = map_youtube_comment(_comment_row(parent="c0"), video_ids={"JIY6_VBi4l8"})
        assert rec["body"]["parent_id"] == "c0"

    def test_empty_text_dropped(self):
        assert map_youtube_comment(_comment_row(text=""), video_ids={"JIY6_VBi4l8"}) is None


# ---------------------------------------------------------------------------
# map_youtube_channel
# ---------------------------------------------------------------------------


class TestMapChannel:
    def test_channel_to_profile(self):
        rec = map_youtube_channel(
            {
                "Channel ID": "UCE",
                "Channel Country": "US",
                "Channel Description (Original)": "dope",
                "Channel Title (Original)": "jacobs multimedia",
                "Channel Visibility": "Public",
            }
        )
        assert rec is not None
        assert rec["service"] == "profile"
        assert rec["body"]["display_name"] == "jacobs multimedia"
        assert rec["body"]["bio"] == "dope"
        assert rec["body"]["website"] == "https://youtube.com/channel/UCE"

    def test_no_title_returns_none(self):
        assert map_youtube_channel({"Channel Title (Original)": ""}) is None


# ---------------------------------------------------------------------------
# _classify (the real paths — must NOT misfire on playlists)
# ---------------------------------------------------------------------------


class TestClassify:
    def test_videos(self):
        assert _classify(B + "video metadata/videos.csv") == "videos"

    def test_comments(self):
        assert _classify(B + "comments/comments.csv") == "comments"

    def test_channel(self):
        assert _classify(B + "channels/channel.csv") == "channel"

    def test_playlists_ignored(self):
        # "video" appears in the name — must NOT classify as videos.
        assert _classify(B + "playlists/rap beats-videos.csv") is None

    def test_subscriptions_ignored(self):
        assert _classify(B + "subscriptions/subscriptions.csv") is None

    def test_video_texts_ignored(self):
        assert _classify(B + "video metadata/video texts.csv") is None

    def test_mp4_ignored(self):
        assert _classify(B + "videos/Some Video.mp4") is None


# ---------------------------------------------------------------------------
# parse_youtube (end-to-end over synthetic CSV entries)
# ---------------------------------------------------------------------------


class TestParseYoutube:
    def _entries(self):
        videos = _videos_csv(
            [
                _video_row("v1", "One"),
                _video_row("v2", "Two", privacy="Private"),
            ]
        )
        comments = _comments_csv(
            [
                _comment_row("c1", '{"text":"on v1"}', video_id="v1"),
                _comment_row("c2", '{"text":"on v2"}', video_id="v2"),
                _comment_row("c3", '{"text":"on a deleted video"}', video_id="zzz"),
            ]
        )
        channel = _channel_csv()
        return [
            (B + "video metadata/videos.csv", videos),
            (B + "comments/comments.csv", comments),
            (B + "channels/channel.csv", channel),
            (B + "playlists/rap beats-videos.csv", b"Video ID\nv1\n"),
            (B + "videos/v1.mp4", b"not data"),
        ]

    def test_counts(self):
        records = parse_youtube(self._entries())
        by = {}
        for r in records:
            by.setdefault(r["service"], []).append(r)
        assert len(by["staging_posts"]) == 2
        # 3 comments, but the one on a deleted video is dropped -> 2
        assert len(by["comments"]) == 2
        assert len(by["profile"]) == 1

    def test_comments_join_own_videos_only(self):
        records = parse_youtube(self._entries())
        refs = {r["ref_origin_id"] for r in records if r["service"] == "comments"}
        assert refs == {"v1", "v2"}
        assert "zzz" not in refs

    def test_visibility_mapping(self):
        records = parse_youtube(self._entries())
        vis = {r["origin_id"]: r["body"]["visibility"] for r in records if r["service"] == "staging_posts"}
        assert vis == {"v1": "public", "v2": "private"}

    def test_empty(self):
        assert parse_youtube([]) == []

    def test_malformed_csv_skipped(self):
        assert parse_youtube([(B + "video metadata/videos.csv", b"")]) == []
