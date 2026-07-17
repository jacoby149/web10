import json
from .utils import safe_str, parse_timestamp, parse_tags, parse_mentions


def parse_facebook_privacy(privacy: str | None):
    if not privacy:
        return None
    lower = privacy.lower()
    if "public" in lower:
        return "public"
    if "friend" in lower:
        return "friends"
    if "only me" in lower or "private" in lower:
        return "private"
    return None


def _parse_json_field(val: str | None):
    if not val:
        return []
    try:
        parsed = json.loads(val)
        return parsed if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def map_facebook_post(post: dict) -> dict | None:
    text = safe_str(post.get("Post text"))
    created_at = parse_timestamp(post.get("Post created time"))
    if not created_at and not text:
        return None

    body = {
        "text": text,
        "created_at": created_at,
        "updated_at": parse_timestamp(post.get("Post updated time")),
        "origin": "facebook",
        "origin_id": safe_str(post.get("Post ID")) or safe_str(post.get("Post URL")),
        "visibility": parse_facebook_privacy(post.get("Post privacy")),
        "tags": parse_tags(text),
        "mentions": parse_mentions(text, "facebook"),
    }

    location = safe_str(post.get("Post location"))
    if location:
        body["location"] = {"name": location}

    attachments = _parse_json_field(post.get("Post attachments"))
    if attachments:
        body["media_refs"] = [
            str(a.get("url", "")) if isinstance(a, dict) and "url" in a else ""
            for a in attachments
        ]

    return {
        "service": "posts",
        "body": body,
        "origin": "facebook",
        "origin_id": safe_str(post.get("Post ID")),
    }


def map_facebook_photo(photo: dict) -> dict | None:
    url = safe_str(photo.get("Photo URL"))
    created_at = parse_timestamp(photo.get("Photo created time"))
    if not url and not created_at:
        return None

    body = {
        "url": url or "",
        "created_at": created_at,
        "origin": "facebook",
        "origin_id": safe_str(photo.get("Photo ID")),
        "caption": safe_str(photo.get("Photo description")),
        "visibility": parse_facebook_privacy(photo.get("Photo privacy")),
    }
    w = photo.get("Photo width")
    h = photo.get("Photo height")
    try:
        wn = int(w)
        if wn > 0:
            body["width"] = wn
    except (ValueError, TypeError):
        pass
    try:
        hn = int(h)
        if hn > 0:
            body["height"] = hn
    except (ValueError, TypeError):
        pass

    return {
        "service": "media",
        "body": body,
        "origin": "facebook",
        "origin_id": safe_str(photo.get("Photo ID")),
    }


def map_facebook_friend(friend: dict) -> dict | None:
    name = safe_str(friend.get("Friend name"))
    if not name:
        return None

    return {
        "service": "contacts",
        "body": {
            "username": name.lower().replace(" ", "_"),
            "provider": "facebook",
            "display_name": name,
            "added_at": __import__("datetime").datetime.now().isoformat(),
        },
        "origin": "facebook",
        "origin_id": safe_str(friend.get("Friend ID")),
    }


def map_facebook_comment(comment: dict) -> dict | None:
    text = safe_str(comment.get("Comment body"))
    if not text:
        return None

    body = {
        "text": text,
        "created_at": parse_timestamp(comment.get("Comment created time")),
        "origin": "facebook",
        "origin_id": safe_str(comment.get("Comment ID")),
    }

    post_id = safe_str(comment.get("Comment post ID"))
    if post_id:
        body["post_id"] = post_id
    elif comment.get("Comment post URL"):
        import re
        m = re.search(r"/posts/(\d+)", str(comment["Comment post URL"]))
        if m:
            body["post_id"] = m.group(1)

    author = safe_str(comment.get("Comment author name"))
    if author:
        body["author_username"] = author.lower().replace(" ", "_")
        body["author_provider"] = "facebook"

    return {
        "service": "comments",
        "body": body,
        "origin": "facebook",
        "origin_id": safe_str(comment.get("Comment ID")),
    }


def _detect_facebook_file(path: str):
    p = path.lower()
    if "your posts.json" in p:
        return "post"
    if "your photos.json" in p:
        return "photo"
    if "your friends list.json" in p:
        return "friend"
    if "your comments.json" in p:
        return "comment"
    return None


def parse_facebook(zf, entries: list[dict]) -> list[dict]:
    """Parse all Facebook records from ZIP entries."""
    records = []
    json_entries = [e for e in entries if e["path"].endswith(".json")]

    for entry in json_entries:
        ftype = _detect_facebook_file(entry["path"])
        if not ftype:
            continue
        try:
            raw = zf.read(entry["path"]).decode("utf-8")
            data = json.loads(raw)
            if not isinstance(data, list):
                continue
            for item in data:
                mapper = {
                    "post": map_facebook_post,
                    "photo": map_facebook_photo,
                    "friend": map_facebook_friend,
                    "comment": map_facebook_comment,
                }[ftype]
                rec = mapper(item)
                if rec:
                    records.append(rec)
        except Exception:
            continue

    return records
