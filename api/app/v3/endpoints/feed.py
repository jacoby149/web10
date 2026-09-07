import logging

from fastapi import APIRouter, HTTPException, Request

import app.exceptions as exceptions
from app.v3.endpoints.auth_helper import user_or_anon
from app.v3.endpoints.documents import _check_app_permission, _mint_hls_manifest_urls
from app.v3.models import FeedRequest
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["feed"])
log = logging.getLogger("app.v3.feed")


def _resolve_avatar_url(avatar_ref: str, author_key: str) -> str | None:
    """Resolve an author's avatar_ref to a fresh presigned read URL (D69).

    Reuses the read path's `resolve_media_urls` (author-scoped, batches the
    ref, mints a fresh presigned URL offline). Returns None on any failure
    (the avatar is an enhancement — the feed renders the fallback initials).
    """
    try:
        body = ch.resolve_media_urls({"media_refs": [avatar_ref]}, author_key)
        refs = body.get("media_refs") or []
        if refs and isinstance(refs[0], dict):
            return refs[0].get("read_url")
    except Exception as e:
        log.warning("[feed] avatar resolve failed author=%s ref=%s: %s", author_key, avatar_ref, e)
    return None


@router.post("/feed")
def read_feed(request: Request, data: FeedRequest):
    """The feed read (D69): one page of posts, ranked in SQL, cursor-paged.

    The single round-trip that replaces the client's N+1 fan-out (the
    267-requests diagnosis). Returns a feed envelope:

    - `posts` — each with the resolved media + HLS manifest URLs, the pinned
      ad (`ad`) + node ad (`node_ad`) joins (the read-time attachment,
      preserved), exact `likes`/`comments` counts, and the author's `profile`
      + resolved `avatar_url`.
    - `has_more` — whether another page exists (the node fetched `limit + 1`).
    - `next_cursor` — the keyset cursor for the next page (`created_at` for
      the Newest preset, `score` for a tuned preset), or null.

    Anon-capable (a missing token reads as the node's `anon` member — the
    public board, D41). The app-contract gate applies to real users only.
    """
    reader = user_or_anon(data)
    authenticated = reader != "anon"
    if authenticated:
        _check_app_permission(request, reader, "posts", "readAll")

    # D58 read gate: filter to the groups the reader's effective role grants
    # readAll on `posts`. group_ids is already the readable set below.
    group_ids = ch.readable_groups(reader, "posts", authenticated, data.groups)
    if authenticated and not group_ids:
        raise HTTPException(status_code=403, detail="not a member of the requested group")

    # One query: the page of posts (limit + 1 → has_more), ranked in SQL,
    # keyset-cursor paged, with exact engagement counts.
    page = ch.read_feed(
        group_ids=group_ids,
        member_key=reader,
        service="posts",
        limit=data.limit,
        cursor=data.cursor,
        sort=data.sort.model_dump() if data.sort else None,
        require_membership=False,
    )

    has_more = len(page) > data.limit
    rows = page[: data.limit]

    # The next cursor rides on the last row: created_at (Newest) or score
    # (tuned). The endpoint mirrors read_feed's newest/tuned split.
    wr = float((data.sort.model_dump() if data.sort else {}).get("recency", 0.0))
    wl = float((data.sort.model_dump() if data.sort else {}).get("likes", 0.0))
    wc = float((data.sort.model_dump() if data.sort else {}).get("comments", 0.0))
    newest = (wr <= 0 and wl <= 0 and wc <= 0) or (wr > 0 and wl <= 0 and wc <= 0)
    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = (
            {"created_at": last["created_at"]} if newest else {"score": last["score"]}
        )

    # The read-time passes (the same order as the read endpoint): the ads
    # (doc.ad + doc.node_ad — D55/D57, must be preserved), then resolved media
    # + HLS manifest URLs.
    docs = ch.attach_pinned_ads(rows, reader)
    docs = ch.attach_node_ads(docs, reader)
    docs = _mint_hls_manifest_urls(ch.resolve_media_urls_in_docs(docs), reader)

    # Batched author profiles + avatars (replaces the per-author fan-out).
    author_keys = list({d["author_key"] for d in docs})
    profiles = ch.get_author_profiles(author_keys)
    for d in docs:
        info = profiles.get(d["author_key"], {})
        d["profile"] = info.get("profile")
        avatar_ref = info.get("avatar_ref")
        d["avatar_url"] = _resolve_avatar_url(avatar_ref, d["author_key"]) if avatar_ref else None

    return {"posts": docs, "has_more": has_more, "next_cursor": next_cursor}
