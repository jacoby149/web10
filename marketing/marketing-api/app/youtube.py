import json
from .utils import safe_str, parse_tags


def parse_duration(iso: str | None):
    if not iso:
        return None
    import re

    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
    if not m:
        return None
    hours = int(m.group(1) or "0")
    mins = int(m.group(2) or "0")
    secs = int(m.group(3) or "0")
    return hours * 3600 + mins * 60 + secs


def map_youtube_video(video: dict) -> list[dict]:
    records = []
    vid_id = safe_str(video.get("id")) or safe_str((video.get("snippet") or {}).get("channelId"))
    snippet = video.get("snippet") or {}
    title = safe_str(snippet.get("title"))
    description = safe_str(snippet.get("description"))
    created_at = snippet.get("publishedAt")
    privacy = (video.get("status") or {}).get("privacyStatus")

    visibility = {
        "public": "public",
        "private": "private",
        "unlisted": "friends",
    }.get(privacy)

    text = f"{title}\n\n{description}" if title and description else (title or description or "")

    # Thumbnail media record
    media_refs = []
    media_records = []
    thumbnails = snippet.get("thumbnails") or {}
    thumb = thumbnails.get("high") or thumbnails.get("default", {})
    if thumb and thumb.get("url"):
        media_body = {
            "url": thumb["url"],
            "created_at": created_at,
            "origin": "youtube",
            "origin_id": f"thumb_{vid_id}" if vid_id else None,
            "thumbnail_url": thumb["url"],
            "caption": title,
            "width": thumb.get("width"),
            "height": thumb.get("height"),
        }
        media_records.append(
            {
                "service": "media",
                "body": media_body,
                "origin": "youtube",
                "origin_id": f"thumb_{vid_id}",
            }
        )
        media_refs.append("")

    post_body = {
        "text": text,
        "created_at": created_at,
        "origin": "youtube",
        "origin_id": vid_id,
        "visibility": visibility,
        "tags": parse_tags(text),
    }
    # `visibility` preserves the source-platform's privacy (public/private/
    # unlisted) as informational metadata for the staging triage UI; the
    # record is owner-only because it lives in staging_posts (D30).

    duration = video.get("contentDetails", {}).get("duration")
    if duration:
        dur = parse_duration(duration)
        if dur is not None:
            post_body["duration_seconds"] = dur

    stats = video.get("statistics") or {}
    post_body["view_count"] = int(stats.get("viewCount") or 0)
    post_body["like_count"] = int(stats.get("likeCount") or 0)
    post_body["comment_count"] = int(stats.get("commentCount") or 0)

    if media_refs:
        post_body["media_refs"] = media_refs

    # D19 content lifecycle: imported videos land in owner-only
    # staging_posts (not the legacy anon-readable `posts`), so importing a
    # YouTube history never auto-publishes it. The staging UI (Phase C)
    # moves a record to public_posts or private_posts to publish.
    records.append(
        {
            "service": "staging_posts",
            "body": post_body,
            "origin": "youtube",
            "origin_id": vid_id,
        }
    )
    records.extend(media_records)
    return records


def map_youtube_comment(comment: dict) -> dict | None:
    snippet = comment.get("snippet") or {}
    text = safe_str(snippet.get("textDisplay"))
    if not text:
        return None

    body = {
        "text": text,
        "created_at": snippet.get("publishedAt"),
        "origin": "youtube",
        "origin_id": safe_str(snippet.get("topLevelCommentId")) or safe_str(comment.get("id")),
    }

    video_id = safe_str(snippet.get("videoId"))
    if video_id:
        body["post_id"] = video_id

    parent_id = safe_str(snippet.get("parentId"))
    if parent_id:
        body["parent_id"] = parent_id

    author = safe_str(snippet.get("authorDisplayName"))
    if author:
        body["author_username"] = author.lower().replace(" ", "_")
        body["author_provider"] = "youtube"

    return {
        "service": "comments",
        "body": body,
        "origin": "youtube",
        "origin_id": safe_str(comment.get("id")),
    }


def map_youtube_channel(channel: dict) -> dict | None:
    snippet = channel.get("snippet") or {}
    title = safe_str(snippet.get("title"))
    if not title:
        return None

    return {
        "service": "profile",
        "body": {
            "display_name": title,
            "bio": safe_str(snippet.get("description")),
            "website": f"https://youtube.com{snippet['customUrl']}" if snippet.get("customUrl") else None,
            "updated_at": __import__("datetime").datetime.now().isoformat(),
        },
        "origin": "youtube",
    }


def _detect_youtube_file(path: str):
    p = path.lower()
    if any(k in p for k in ("video", "videos", "upload")):
        return "video"
    if "comment" in p:
        return "comment"
    if any(k in p for k in ("channel", "my channels")):
        return "channel"
    return None


def parse_youtube(zf, entries: list[dict]) -> list[dict]:
    """Parse all YouTube records from ZIP entries."""
    records = []
    json_entries = [e for e in entries if e["path"].endswith(".json")]

    for entry in json_entries:
        ftype = _detect_youtube_file(entry["path"])
        if not ftype:
            continue
        try:
            raw = zf.read(entry["path"]).decode("utf-8")
            data = json.loads(raw)
            items = data.get("items") or data
            if not isinstance(items, list):
                continue
            for item in items:
                if ftype == "video":
                    records.extend(map_youtube_video(item))
                elif ftype == "comment":
                    rec = map_youtube_comment(item)
                    if rec:
                        records.append(rec)
                elif ftype == "channel":
                    rec = map_youtube_channel(item)
                    if rec:
                        records.append(rec)
        except Exception:
            continue

    return records
