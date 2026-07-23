import json
from .utils import safe_str, safe_num, parse_timestamp, parse_tags, parse_mentions, find_json_entries


def map_instagram_post(post: dict) -> list[dict]:
    records = []
    created_at = parse_timestamp(post.get("post_timestamp"))
    text = safe_str(post.get("post_text"))
    media_list = post.get("media") or []
    comments_list = post.get("comments") or []

    # Parse tagged users
    tagged = []
    raw_tagged = post.get("tagged_users")
    if raw_tagged:
        try:
            parsed = json.loads(raw_tagged)
            if isinstance(parsed, list):
                tagged = [
                    {"username": str(u.get("username", "")), "provider": "instagram"}
                    for u in parsed
                    if isinstance(u, dict) and u.get("username")
                ]
        except (json.JSONDecodeError, TypeError):
            pass

    mentions = list({json.dumps(m, sort_keys=True): m for m in (parse_mentions(text, "instagram") + tagged)}.values())

    # Location
    location = {}
    loc_name = safe_str(post.get("post_location"))
    if loc_name:
        location["name"] = loc_name
    lat = safe_num(post.get("post_latitude"))
    lon = safe_num(post.get("post_longitude"))
    if lat is not None:
        location["lat"] = lat
    if lon is not None:
        location["lon"] = lon

    # Media records
    media_refs = []
    for m in media_list:
        media_body = {
            "url": m.get("media_filename") or "",
            "created_at": parse_timestamp(m.get("media_timestamp")) or created_at,
            "origin": "instagram",
            "origin_id": m.get("media_id"),
            "caption": safe_str(m.get("media_alt_text")),
            "alt_text": safe_str(m.get("media_alt_text")),
        }
        w = safe_num(m.get("media_width"))
        h = safe_num(m.get("media_height"))
        if w is not None:
            media_body["width"] = w
        if h is not None:
            media_body["height"] = h
        dur = safe_num(m.get("media_duration"))
        if dur is not None:
            media_body["duration_seconds"] = dur

        records.append(
            {
                "service": "media",
                "body": media_body,
                "origin": "instagram",
                "origin_id": m.get("media_id"),
            }
        )
        media_refs.append("")  # placeholder, filled after write

    post_body = {
        "text": text,
        "created_at": created_at,
        "origin": "instagram",
        "origin_id": post.get("post_id"),
        "visibility": "public",
        "tags": parse_tags(text),
        "mentions": mentions,
    }
    if media_refs:
        post_body["media_refs"] = media_refs
    if location:
        post_body["location"] = location

    # D19 content lifecycle: imported posts land in the owner-only
    # `staging_posts` collection, NOT the legacy anon-readable `posts` —
    # importing your history must NOT auto-publish it to the world.
    # Publishing happens from the social app's staging UI (Phase C), which
    # moves the record to `public_posts` or `private_posts`. decisions.md D30.
    records.append(
        {
            "service": "staging_posts",
            "body": post_body,
            "origin": "instagram",
            "origin_id": post.get("post_id"),
        }
    )

    # Comments
    for c in comments_list:
        rec = _map_instagram_comment(c, post.get("post_id"))
        if rec:
            records.append(rec)
        for child in c.get("child_comments") or []:
            child_rec = _map_instagram_comment(child, post.get("post_id"), c.get("comment_id"))
            if child_rec:
                records.append(child_rec)

    return records


def _map_instagram_comment(comment: dict, post_id: str | None, parent_id: str | None = None):
    if not post_id:
        return None
    text = safe_str(comment.get("comment_body"))
    if not text:
        return None

    body = {
        "post_id": post_id,
        "text": text,
        "created_at": parse_timestamp(comment.get("comment_timestamp")),
        "origin": "instagram",
        "origin_id": comment.get("comment_id"),
    }
    if parent_id:
        body["parent_id"] = parent_id
    author = safe_str(comment.get("comment_owner_username"))
    if author:
        body["author_username"] = author
        body["author_provider"] = "instagram"

    return {
        "service": "comments",
        "body": body,
        "origin": "instagram",
        "origin_id": comment.get("comment_id"),
    }


def map_instagram_profile(profile: dict) -> dict | None:
    display_name = safe_str(profile.get("full_name"))
    if not display_name:
        return None

    return {
        "service": "profile",
        "body": {
            "display_name": display_name,
            "bio": safe_str(profile.get("biography")),
            "website": safe_str(profile.get("external_url")),
            "updated_at": __import__("datetime").datetime.now().isoformat(),
        },
        "origin": "instagram",
    }


def map_instagram_follows(relations: list[dict]) -> list[dict]:
    results = []
    for r in relations:
        username = safe_str(r.get("username"))
        if not username:
            continue
        results.append(
            {
                "service": "contacts",
                "body": {
                    "username": username,
                    "provider": "instagram",
                    "display_name": safe_str(r.get("full_name")),
                    "added_at": __import__("datetime").datetime.now().isoformat(),
                },
                "origin": "instagram",
                "origin_id": r.get("user_id"),
            }
        )
    return results


def parse_instagram(zf, entries: list[dict]) -> list[dict]:
    """Parse all Instagram records from ZIP entries."""
    records = []
    json_entries = find_json_entries(entries)

    # Profile
    profile_entry = next(
        (e for e in entries if "index.json" in e["path"] or "your Instagram information.json" in e["path"]), None
    )
    if profile_entry:
        try:
            raw = zf.read(profile_entry["path"]).decode("utf-8")
            profile = json.loads(raw)
            rec = map_instagram_profile(profile)
            if rec:
                records.append(rec)
        except Exception:
            pass

    # Follows
    follows_entry = next((e for e in entries if "list.json" in e["path"] and "relationships" in e["path"]), None)
    if follows_entry:
        try:
            raw = zf.read(follows_entry["path"]).decode("utf-8")
            data = json.loads(raw)
            if isinstance(data, list):
                records.extend(map_instagram_follows(data))
        except Exception:
            pass

    # Posts
    post_entries = [e for e in json_entries if "posts/" in e["path"] and e["path"].endswith(".json")]
    for pe in post_entries:
        try:
            raw = zf.read(pe["path"]).decode("utf-8")
            post = json.loads(raw)
            records.extend(map_instagram_post(post))
        except Exception:
            continue

    return records
