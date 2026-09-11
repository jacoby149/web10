import html
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

import app.settings as settings
from app.v3.services import clickhouse as ch

router = APIRouter(tags=["share"])
log = logging.getLogger("app.v3.share")

# The web10 brand mark — the fallback og:image when a post has no media and
# the author has no avatar. Served from the social app's static assets (the
# crawler resolves it against the social origin, where the SPA is hosted).
_BRAND_IMAGE = "/keys-mark.png"

_TITLE_LIMIT = 100
_DESC_LIMIT = 200


def _is_publicly_readable(group_ids: list[str]) -> bool:
    """True if any of the post's groups grants readAll on posts to the public
    class (anyone/anon) — the D58 read gate, evaluated for an anonymous reader.

    A public post is in the discover group (public by design, D41); a
    followers-only / private post is in a group that does not grant anon read.
    This is the whole privacy floor: only what an anonymous visitor could
    already read may appear in a preview.
    """
    for gid in group_ids:
        try:
            if ch.can_read_group(gid, "anon", "posts", authenticated=False):
                return True
        except Exception as e:
            log.warning("[share] can_read_group failed group=%s: %s", gid, e)
    return False


def _pick_thumbnail(resolved_refs: list, author_avatar_url: str | None) -> tuple[str | None, str | None, str | None]:
    """Pick the preview image from a post's resolved media refs.

    Returns ``(image_url, alt_text, is_video)``. Selection (KB: share-preview.md):
    the first item that has an image — an image's presigned ``read_url``, a
    video's presigned ``thumbnail_url`` (the D44 poster) — else the author's
    avatar, else the web10 brand mark.
    """
    for ref in resolved_refs:
        if not isinstance(ref, dict):
            continue
        mime = (ref.get("mime_type") or "")
        is_video = mime.startswith("video/")
        if is_video:
            thumb = ref.get("thumbnail_url")
            if thumb:
                return thumb, ref.get("alt_text"), True
            # No poster yet (transcode pending) — fall through to the next item.
            continue
        # An image (or any non-video with a read_url) is a usable preview.
        read_url = ref.get("read_url")
        if read_url:
            return read_url, ref.get("alt_text"), False
    # No usable media — fall back to the author's avatar, then the brand mark.
    if author_avatar_url:
        return author_avatar_url, None, False
    return _BRAND_IMAGE, None, False


def _truncate(s: str | None, limit: int) -> str | None:
    if not s:
        return None
    s = " ".join(s.split())  # collapse whitespace/newlines to single spaces
    if len(s) <= limit:
        return s
    return s[: limit - 1].rstrip() + "…"


def _meta_tag(name: str, value: str | None, prop: bool = False) -> str:
    if not value:
        return ""
    attr = "property" if prop else "name"
    return f'    <meta {attr}="{html.escape(name)}" content="{html.escape(value, quote=True)}" />\n'


def _render(
    *,
    url: str,
    title: str,
    description: str,
    image: str | None,
    image_alt: str | None,
    image_type: str | None,
    is_video: bool,
    site_name: str = "web10",
) -> str:
    """Render the preview HTML document (the crawler reads only the <head>)."""
    og_type = "video.other" if is_video else "article"
    head = []
    head.append(_meta_tag("charset", "utf-8"))
    head.append(f'    <meta name="viewport" content="width=device-width, initial-scale=1" />\n')
    # Open Graph
    head.append(_meta_tag("og:type", og_type, prop=True))
    head.append(_meta_tag("og:site_name", site_name, prop=True))
    head.append(_meta_tag("og:title", title, prop=True))
    head.append(_meta_tag("og:description", description, prop=True))
    head.append(_meta_tag("og:url", url, prop=True))
    if image:
        head.append(_meta_tag("og:image", image, prop=True))
        head.append(_meta_tag("og:image:alt", image_alt or title, prop=True))
        if image_type:
            head.append(_meta_tag("og:image:type", image_type, prop=True))
    # Twitter Card (mirror)
    head.append(_meta_tag("twitter:card", "summary_large_image"))
    head.append(_meta_tag("twitter:title", title))
    head.append(_meta_tag("twitter:description", description))
    if image:
        head.append(_meta_tag("twitter:image", image))
        head.append(_meta_tag("twitter:image:alt", image_alt or title))

    body_link = f'    <a href="{html.escape(url, quote=True)}" rel="noopener">View on web10</a>'
    return (
        "<!DOCTYPE html>\n"
        '<html lang="en">\n'
        "  <head>\n"
        + "".join(head)
        + f"    <title>{html.escape(title)}</title>\n"
        "  </head>\n"
        "  <body style=\"font-family:system-ui,sans-serif;padding:2rem;color:#09090b;\">\n"
        f"    <h1 style=\"font-size:1.25rem;margin:0 0 .5rem;\">{html.escape(title)}</h1>\n"
        f"    <p style=\"color:#52525b;margin:0 0 1rem;\">{html.escape(description)}</p>\n"
        f"{body_link}\n"
        "  </body>\n"
        "</html>\n"
    )


@router.get("/share/post/{username}/{post_id}", response_class=HTMLResponse)
def share_post_preview(username: str, post_id: str):
    """Render a post's link-preview (Open Graph + Twitter Card) for crawlers.

    Public, no token, no app contract — the one surface where the node answers
    a link-preview crawler on behalf of the app (D71). The browser never hits
    this (the social nginx proxies only known crawler User-Agents here); it
    gets the SPA.

    Privacy floor (I3 / D41): the post previews-with-content only if it is
    publicly readable (some group grants anon readAll on posts). Otherwise a
    generic web10 card is rendered — no post text, no media, no author data.
    A nonexistent / tombstoned doc_id → 404 (a deleted post does not preview).
    """
    doc = ch.get_document_any_author(post_id)
    if not doc or doc.get("service") != "posts":
        log.info("[share] ghost post post_id=%s author=%s", post_id, None if not doc else doc.get("author_key"))
        raise HTTPException(status_code=404, detail="not found")

    author_key = doc["author_key"]
    body = doc.get("body", {}) or {}
    text = body.get("text")
    canonical_url = f"{settings.SOCIAL_ORIGIN.rstrip('/')}/u/{username}/p/{post_id}"

    # Privacy floor: is this post publicly readable?
    group_ids = ch.get_doc_groups(post_id)
    if not _is_publicly_readable(group_ids):
        log.info("[share] private post → generic card post_id=%s groups=%s", post_id, group_ids)
        return _render(
            url=canonical_url,
            title="A post on web10",
            description="Open web10 to view this post.",
            image=f"{settings.SOCIAL_ORIGIN.rstrip('/')}{_BRAND_IMAGE}",
            image_alt="web10",
            image_type=None,
            is_video=False,
        )

    # Public post — resolve media (fresh presigned thumbnails) + the author's
    # profile (display name + avatar), the same primitives the app's read uses.
    resolved_body = ch.resolve_media_urls(dict(body), author_key)
    resolved_refs = resolved_body.get("media_refs") or []
    if not isinstance(resolved_refs, list):
        resolved_refs = []

    profiles = ch.get_author_profiles([author_key])
    info = profiles.get(author_key, {}) or {}
    profile = info.get("profile") or {}
    display_name = profile.get("display_name") if isinstance(profile, dict) else None
    avatar_ref = info.get("avatar_ref")
    avatar_url = None
    if avatar_ref:
        try:
            av = ch.resolve_media_urls({"media_refs": [avatar_ref]}, author_key)
            av_refs = av.get("media_refs") or []
            if av_refs and isinstance(av_refs[0], dict):
                avatar_url = av_refs[0].get("read_url")
        except Exception as e:
            log.warning("[share] avatar resolve failed author=%s ref=%s: %s", author_key, avatar_ref, e)

    image, image_alt, is_video = _pick_thumbnail(resolved_refs, avatar_url)
    if image and not image.startswith("http"):
        image = f"{settings.SOCIAL_ORIGIN.rstrip('/')}{image}"

    title = _truncate(text, _TITLE_LIMIT) or f"@{username} on web10"
    description = _truncate(text, _DESC_LIMIT) or "A post on web10"

    log.info(
        "[share] public post preview post_id=%s author=%s title=%r image=%s is_video=%s",
        post_id, author_key, title, image, is_video,
    )
    return _render(
        url=canonical_url,
        title=title,
        description=description,
        image=image,
        image_alt=image_alt,
        image_type=None,
        is_video=is_video,
    )
