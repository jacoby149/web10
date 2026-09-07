"""YouTube Takeout parser — the first import target (plan: "port your YouTube").

Pure: (path, bytes) entries from a Takeout archive -> record dicts. The import
worker (app/v3/services/import_worker.py) does the writing. Transport-agnostic:
the worker feeds it the JSON members of a tar or zip, so the parser never
touches an archive.

Record shape:
  {
    "service": "staging_posts" | "comments" | "profile",
    "body": {...},                # the document body (what insert_document stores)
    "origin_id": str | None,      # the Takeout id — the idempotency key
    "ref_origin_id": str | None,  # comments only: the videoId the comment is on
    "media_url": str | None,      # staging_posts only: the thumbnail to fetch
  }

Mapping (Takeout -> web10):
  - My videos (videos.json) -> staging_posts, one per video. D19/D30: imports
    stage owner-only, never auto-publish. The body carries the full record:
    title+description, the publish date (created_at — the worker passes it to
    insert_document so the catalog keeps its real dates), duration, stats, the
    source privacy, and the watch URL (the link-embeds path until the creator
    re-uploads the file).
  - Comments on your videos -> comments (ref_origin_id = the videoId; the
    worker joins it to the imported post's doc_id via ref_value, the D62
    join). Comments you left on OTHER people's videos (Takeout's "My
    comments") are dropped — they'd point at posts that don't exist on this
    node.
  - My channels -> profile (display_name, bio, website).

What Takeout does NOT give us (the honest gaps, documented in the public
import doc):
  - the video FILES — metadata + thumbnails only; Google never exports the
    bytes, so the creator re-uploads (or the post embeds the watch URL).
  - the subscriber list — no export path exists; the audience follows you.
"""

import json
import re


def _safe_str(val) -> str | None:
    if val is None or val == "":
        return None
    return str(val).strip()


def _parse_duration(iso: str | None):
    if not iso:
        return None
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
    if not m:
        return None
    hours = int(m.group(1) or "0")
    mins = int(m.group(2) or "0")
    secs = int(m.group(3) or "0")
    return hours * 3600 + mins * 60 + secs


def _parse_tags(text: str | None) -> list[str]:
    if not text:
        return []
    return re.findall(r"#(\w+)", text)


def _int_or_zero(val) -> int:
    try:
        return int(val or 0)
    except (TypeError, ValueError):
        return 0


def _thumbnail_url(snippet: dict) -> str | None:
    thumbnails = snippet.get("thumbnails") or {}
    thumb = thumbnails.get("high") or thumbnails.get("default") or {}
    return _safe_str(thumb.get("url"))


def map_youtube_video(video: dict) -> dict | None:
    """One upload -> one staging post record (D19/D30: imports stage, never
    auto-publish)."""
    vid_id = _safe_str(video.get("id"))
    if not vid_id:
        return None
    snippet = video.get("snippet") or {}
    title = _safe_str(snippet.get("title"))
    description = _safe_str(snippet.get("description"))
    if not title and not description:
        return None

    privacy = _safe_str((video.get("status") or {}).get("privacyStatus")) or "public"
    # D30 safe default: only `public` stages as public; unlisted/private stage
    # as private (never auto-expose). The raw value is kept for triage context.
    visibility = "public" if privacy == "public" else "private"

    text = f"{title}\n\n{description}" if title and description else (title or description)

    body = {
        "text": text,
        "created_at": _safe_str(snippet.get("publishedAt")),
        "origin": "youtube",
        "origin_id": vid_id,
        "visibility": visibility,
        "source_privacy": privacy,
        "tags": _parse_tags(text),
        "video_url": f"https://www.youtube.com/watch?v={vid_id}",
    }

    dur = _parse_duration((video.get("contentDetails") or {}).get("duration"))
    if dur is not None:
        body["duration_seconds"] = dur

    stats = video.get("statistics") or {}
    body["view_count"] = _int_or_zero(stats.get("viewCount"))
    body["like_count"] = _int_or_zero(stats.get("likeCount"))
    body["comment_count"] = _int_or_zero(stats.get("commentCount"))

    return {
        "service": "staging_posts",
        "body": body,
        "origin_id": vid_id,
        "ref_origin_id": None,
        "media_url": _thumbnail_url(snippet),
    }


def map_youtube_comment(comment: dict, video_ids: set[str]) -> dict | None:
    """One comment -> one comment record — but ONLY comments on the user's own
    videos. Takeout's comment export may include comments the user left on
    OTHER people's videos (My comments); those would point at posts that don't
    exist on this node, so they're dropped."""
    snippet = comment.get("snippet") or {}
    text = _safe_str(snippet.get("textDisplay"))
    if not text:
        return None

    video_id = _safe_str(snippet.get("videoId"))
    if not video_id or video_id not in video_ids:
        return None

    origin_id = _safe_str(comment.get("id")) or _safe_str(snippet.get("topLevelCommentId"))
    body = {
        "text": text,
        "created_at": _safe_str(snippet.get("publishedAt")),
        "origin": "youtube",
        "origin_id": origin_id,
    }
    parent_id = _safe_str(snippet.get("parentId"))
    if parent_id:
        body["parent_id"] = parent_id
    author = _safe_str(snippet.get("authorDisplayName"))
    if author:
        body["author_username"] = author.lower().replace(" ", "_")
        body["author_provider"] = "youtube"

    return {
        "service": "comments",
        "body": body,
        "origin_id": origin_id,
        "ref_origin_id": video_id,
        "media_url": None,
    }


def map_youtube_channel(channel: dict) -> dict | None:
    """The channel -> the creator profile (display_name, bio, website)."""
    snippet = channel.get("snippet") or {}
    title = _safe_str(snippet.get("title"))
    if not title:
        return None
    custom_url = _safe_str(snippet.get("customUrl"))
    body = {
        "display_name": title,
        "bio": _safe_str(snippet.get("description")),
        "website": f"https://youtube.com{custom_url}" if custom_url else None,
    }
    return {
        "service": "profile",
        "body": body,
        "origin_id": _safe_str(channel.get("id")) or "channel",
        "ref_origin_id": None,
        "media_url": None,
    }


def _classify(path: str) -> str | None:
    """Which Takeout JSON file is this?

    Written against the real Takeout shape (My videos/videos.json, My
    comments/comments.json, My channels/…). "comment" is checked before
    "video" — a comments file under a videos path must classify as comments.
    """
    p = path.lower()
    if not p.endswith(".json"):
        return None
    if "comment" in p:
        return "comment"
    if "video" in p or "upload" in p:
        return "video"
    if "channel" in p:
        return "channel"
    return None


def parse_youtube(entries: list[tuple[str, bytes]]) -> list[dict]:
    """Parse all YouTube records from the archive's JSON entries.

    entries: (member_path, raw_bytes) pairs — the worker extracts these from
    the tar/zip. Videos are mapped first (the comment filter needs the set of
    the user's video ids), then comments, then the channel.
    """
    videos: list[dict] = []
    comments: list[dict] = []
    channels: list[dict] = []

    for path, raw in entries:
        ftype = _classify(path)
        if not ftype:
            continue
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
        items = data.get("items") or data
        if not isinstance(items, list):
            continue
        bucket = {"video": videos, "comment": comments, "channel": channels}[ftype]
        bucket.extend(i for i in items if isinstance(i, dict))

    records: list[dict] = []
    video_ids: set[str] = set()
    for v in videos:
        rec = map_youtube_video(v)
        if rec:
            records.append(rec)
            if rec["origin_id"]:
                video_ids.add(rec["origin_id"])

    for c in comments:
        rec = map_youtube_comment(c, video_ids)
        if rec:
            records.append(rec)

    for ch_ in channels:
        rec = map_youtube_channel(ch_)
        if rec:
            records.append(rec)

    return records
