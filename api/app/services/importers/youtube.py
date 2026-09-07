"""YouTube Takeout parser — the first import target (plan: "port your YouTube").

Pure: (path, bytes) archive entries -> record dicts. The import worker
(app/v3/services/import_worker.py) does the writing. Transport-agnostic: the
worker feeds it the data members of a tar or zip, so the parser never touches
an archive.

Written against the REAL Google Takeout shape (verified against a live export,
"jacobs multimedia" — 81 videos, 115 comments, 1 channel, 80 MP4s). Takeout
exports YouTube as **CSV**, not the Data-API JSON:

    Takeout/YouTube and YouTube Music/
      video metadata/videos.csv      <- the catalog (Video ID, Title, Description,
                                        Privacy, Approx Duration (ms), Tags 1..17,
                                        Publish/Create Timestamp, Category)
      comments/comments.csv          <- comments ON the channel's videos
                                        (Comment ID, Video ID, Comment Text, ...)
      channels/channel.csv           <- the channel (Title, Description, ID)
      playlists/*.csv, subscriptions/subscriptions.csv, ...  (ignored)
      videos/*.mp4                   <- the actual video FILES (Phase 2)

Record shape:
  {
    "service": "staging_posts" | "comments" | "profile",
    "body": {...},                # the document body (what insert_document stores)
    "origin_id": str | None,      # the Takeout id — the idempotency key
    "ref_origin_id": str | None,  # comments only: the videoId the comment is on
    "media_url": str | None,      # staging_posts only: the thumbnail to fetch
  }

Mapping (Takeout -> web10):
  - videos.csv -> staging_posts, one per video. D19/D30: imports stage
    owner-only, never auto-publish. Only `Public`-source stages public;
    Unlisted/Private stage private (the safe default). The body carries the
    full record: title + description, the publish date (created_at — the
    worker backdates it so the catalog keeps its real dates), duration (ms ->
    s), the source privacy, the tags (Tag 1..17), the category, the watch URL,
    and the thumbnail (the public i.ytimg.com CDN, derived from the video id —
    the CSV carries no thumbnail of its own).
  - comments.csv -> comments (ref_origin_id = the videoId; the worker joins it
    to the imported post's doc_id via ref_value, the D62 join). A comment whose
    video isn't in the export (deleted video) is an orphan — dropped.
  - channel.csv -> profile (display_name, bio, channel URL).

Honest gaps (documented in the public import doc + KB social/import.md):
  - The CSV carries NO view/like counts (Takeout doesn't export them).
  - The video FILES are in the export (videos/*.mp4) but the metadata import
    (this parser) doesn't upload them — that's the Phase-2 video pipeline.
"""

import csv
import io
import json

# The real Takeout member paths (classified precisely — loose substring matching
# would misfire on playlists/*.csv, which contain "video" in the name).
_VIDEOS_PATH = "video metadata/videos.csv"
_COMMENTS_PATH = "comments/comments.csv"
_CHANNEL_PATH = "channels/channel.csv"


def _safe_str(val) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return s or None


def _parse_rows(raw: bytes) -> list[dict]:
    """A Takeout CSV member -> list of row dicts (the csv module handles the
    quoted multi-line fields — descriptions/comments contain newlines)."""
    try:
        text = raw.decode("utf-8-sig")  # -sig strips a BOM if present
    except UnicodeDecodeError:
        return []
    try:
        return [
            row
            for row in csv.DictReader(io.StringIO(text))
            if any(v and v.strip() for v in row.values() if v is not None)
        ]
    except csv.Error:
        return []


def _parse_comment_text(raw: str | None) -> str | None:
    """The Comment Text field is a JSON *sequence* — one or more concatenated
    objects (NOT an array, NOT comma-separated):
        {"text":"hello "},{"text":"5:02","videoLink":{...}},{"text":"?"}
    Flatten the `text` segments into one string."""
    if not raw:
        return None
    s = raw.strip()
    if not s:
        return None
    dec = json.JSONDecoder()
    idx = 0
    parts: list[str] = []
    try:
        while idx < len(s):
            while idx < len(s) and s[idx] in " \t\r\n,":
                idx += 1
            if idx >= len(s):
                break
            obj, idx = dec.raw_decode(s, idx)
            if isinstance(obj, dict):
                t = obj.get("text")
                if t:
                    parts.append(t)
            elif isinstance(obj, str):
                parts.append(obj)
    except json.JSONDecodeError:
        # Not a JSON sequence after all — fall back to the raw text.
        return raw.strip() or None
    return "".join(parts) or None


def _thumbnail_url(video_id: str) -> str | None:
    # The CSV carries no thumbnail; the public i.ytimg.com CDN serves one for
    # any video id (hqdefault is the always-present fallback).
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else None


def _tags(row: dict) -> list[str]:
    return [row[f"Tag {i}"].strip() for i in range(1, 18) if row.get(f"Tag {i}") and row[f"Tag {i}"].strip()]


def map_youtube_video(row: dict) -> dict | None:
    """One videos.csv row -> one staging post record (D19/D30: imports stage,
    never auto-publish)."""
    vid_id = _safe_str(row.get("Video ID"))
    if not vid_id:
        return None
    title = _safe_str(row.get("Video Title (Original)"))
    description = _safe_str(row.get("Video Description (Original)"))
    if not title and not description:
        return None

    privacy = _safe_str(row.get("Privacy")) or "Public"
    # D30 safe default: only `Public` stages as public; Unlisted/Private stage
    # private (never auto-expose). The raw value is kept for triage context.
    visibility = "public" if privacy.lower() == "public" else "private"

    text = f"{title}\n\n{description}" if title and description else (title or description)

    body: dict = {
        "text": text,
        "created_at": _safe_str(row.get("Video Publish Timestamp")) or _safe_str(row.get("Video Create Timestamp")),
        "origin": "youtube",
        "origin_id": vid_id,
        "visibility": visibility,
        "source_privacy": privacy,
        "tags": _tags(row),
        "video_url": f"https://www.youtube.com/watch?v={vid_id}",
    }

    dur_ms = _safe_str(row.get("Approx Duration (ms)"))
    if dur_ms:
        try:
            body["duration_seconds"] = int(dur_ms) // 1000
        except ValueError:
            pass

    category = _safe_str(row.get("Video Category"))
    if category:
        body["category"] = category

    return {
        "service": "staging_posts",
        "body": body,
        "origin_id": vid_id,
        "ref_origin_id": None,
        "media_url": _thumbnail_url(vid_id),
    }


def map_youtube_comment(row: dict, video_ids: set[str]) -> dict | None:
    """One comments.csv row -> one comment record — but ONLY comments on a video
    that's in the export (a comment on a deleted video is an orphan -> dropped)."""
    video_id = _safe_str(row.get("Video ID"))
    if not video_id or video_id not in video_ids:
        return None
    text = _parse_comment_text(row.get("Comment Text"))
    if not text:
        return None
    origin_id = _safe_str(row.get("Comment ID"))
    if not origin_id:
        return None

    body: dict = {
        "text": text,
        "created_at": _safe_str(row.get("Comment Create Timestamp")),
        "origin": "youtube",
        "origin_id": origin_id,
    }
    parent_id = _safe_str(row.get("Parent Comment ID"))
    if parent_id:
        body["parent_id"] = parent_id

    return {
        "service": "comments",
        "body": body,
        "origin_id": origin_id,
        "ref_origin_id": video_id,
        "media_url": None,
    }


def map_youtube_channel(row: dict) -> dict | None:
    """The channel.csv row -> the creator profile (display_name, bio, URL)."""
    title = _safe_str(row.get("Channel Title (Original)"))
    if not title:
        return None
    channel_id = _safe_str(row.get("Channel ID"))
    body = {
        "display_name": title,
        "bio": _safe_str(row.get("Channel Description (Original)")),
        "website": f"https://youtube.com/channel/{channel_id}" if channel_id else None,
    }
    return {
        "service": "profile",
        "body": body,
        "origin_id": channel_id or "channel",
        "ref_origin_id": None,
        "media_url": None,
    }


def _classify(path: str) -> str | None:
    """Which Takeout CSV member is this? Match the precise real paths (a loose
    'video' substring would misfire on playlists/*.csv)."""
    p = path.lower()
    if p.endswith(_VIDEOS_PATH):
        return "videos"
    if p.endswith(_COMMENTS_PATH):
        return "comments"
    if p.endswith(_CHANNEL_PATH):
        return "channel"
    return None


def parse_youtube(entries: list[tuple[str, bytes]]) -> list[dict]:
    """Parse all YouTube records from the archive's CSV entries.

    entries: (member_path, raw_bytes) pairs — the worker extracts these from the
    tar/zip. Videos are mapped first (the comment filter needs the set of the
    channel's video ids), then comments, then the channel.
    """
    videos: list[dict] = []
    comments: list[dict] = []
    channels: list[dict] = []

    for path, raw in entries:
        ftype = _classify(path)
        if not ftype:
            continue
        rows = _parse_rows(raw)
        bucket = {"videos": videos, "comments": comments, "channel": channels}[ftype]
        bucket.extend(r for r in rows if isinstance(r, dict))

    records: list[dict] = []
    video_ids: set[str] = set()
    for row in videos:
        rec = map_youtube_video(row)
        if rec:
            records.append(rec)
            if rec["origin_id"]:
                video_ids.add(rec["origin_id"])

    for row in comments:
        rec = map_youtube_comment(row, video_ids)
        if rec:
            records.append(rec)

    for row in channels:
        rec = map_youtube_channel(row)
        if rec:
            records.append(rec)

    return records
