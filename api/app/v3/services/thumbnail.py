"""The generic thumbnail primitive (KB: media/thumbnailing.md).

A universal, schema-free selection: given a document's *resolved* media, pick
the picture that represents it. It knows only the resolved-media shape
(`mime_type`, `read_url`, `thumbnail_url`, …) that the platform read already
produces — never a `posts` doc, a `profile`, or a permalink. Any app's doc
thumbnails through this.

The selection is PURE (no I/O, no access check): the caller already holds the
resolved media from the read it did to get the doc, so picking the thumbnail
needs no second read. The *fallback* (no picture → author avatar → brand mark)
is deliberately NOT here — that is an app decision, and baking it in would make
the primitive social-specific (the D60 leak this module exists to remove).
"""

from typing import Any


def pick_thumbnail(resolved_media: list[Any]) -> dict | None:
    """Pick the best thumbnail from a list of resolved media refs.

    Selection, in order (the table in media/thumbnailing.md):

    | Resolved media item | returns |
    |---|---|
    | First item is an **image** (any non-video with a `read_url`) | that item's `read_url` |
    | First item is a **video** with a `thumbnail_url` (the D44 poster) | the `thumbnail_url` |
    | First item is a **video** with no poster yet (transcode pending) | fall through to the next item |
    | No item yields a usable image | `None` |

    Returns ``{url, alt, is_video, width, height, mime_type}`` or ``None``.
    ``None`` means "this doc has no usable picture" — the caller decides the
    fallback (the author's avatar, a brand mark, nothing).
    """
    for ref in resolved_media or []:
        if not isinstance(ref, dict):
            continue
        mime = ref.get("mime_type") or ""
        is_video = mime.startswith("video/")
        if is_video:
            thumb = ref.get("thumbnail_url")
            if thumb:
                return {
                    "url": thumb,
                    "alt": ref.get("alt_text"),
                    "is_video": True,
                    "width": ref.get("width"),
                    "height": ref.get("height"),
                    "mime_type": mime,
                }
            # No poster yet (transcode pending) — fall through to the next item.
            continue
        # An image (or any non-video with a read_url) is a usable thumbnail.
        read_url = ref.get("read_url")
        if read_url:
            return {
                "url": read_url,
                "alt": ref.get("alt_text"),
                "is_video": False,
                "width": ref.get("width"),
                "height": ref.get("height"),
                "mime_type": mime,
            }
    return None
