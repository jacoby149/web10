"""The generic link-preview card renderer (KB: media/thumbnailing.md).

A universal primitive: given a *card spec* (title, description, image, url,
type), render the Open Graph / Twitter Card HTML. It knows **nothing** about
posts, profiles, or permalinks — the app supplies the content, the platform
renders the card (the universal web standard). Any app on the node can preview
its docs through this; the social app is just the first consumer.

This is the D60 split: the *renderer* is generic (the platform's), the *content*
(permalink → doc → title/desc/image) is the app's. The social app's preview
server maps its permalink to a doc, reads it via the SDK, picks the thumbnail
(the generic `media/thumbnail`), and calls this to get the card HTML.
"""

import html
import logging

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from app.v3.models import PreviewRender

router = APIRouter(tags=["preview"])
log = logging.getLogger("app.v3.preview")


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
    og_type: str | None = None,
) -> str:
    """Render the preview HTML document (the crawler reads only the <head>)."""
    og_type = og_type or ("video.other" if is_video else "article")
    head = []
    head.append(_meta_tag("charset", "utf-8"))
    head.append('    <meta name="viewport" content="width=device-width, initial-scale=1" />\n')
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
        "  <head>\n" + "".join(head) + f"    <title>{html.escape(title)}</title>\n"
        "  </head>\n"
        '  <body style="font-family:system-ui,sans-serif;padding:2rem;color:#09090b;">\n'
        f'    <h1 style="font-size:1.25rem;margin:0 0 .5rem;">{html.escape(title)}</h1>\n'
        f'    <p style="color:#52525b;margin:0 0 1rem;">{html.escape(description)}</p>\n'
        f"{body_link}\n"
        "  </body>\n"
        "</html>\n"
    )


@router.post("/preview/render", response_class=HTMLResponse)
def render_preview(data: PreviewRender):
    """Generic: render an Open Graph / Twitter Card from a spec. Zero social
    knowledge — the app supplies the content (title, description, image, url,
    type); the platform renders the card. Public, no token (rendering is pure —
    no read, no access check; the app has already read the doc it's previewing).
    """
    log.info(
        "[preview] render card url=%s title=%r image=%s og_type=%s",
        data.url,
        data.title,
        data.image,
        data.og_type or ("video.other" if data.is_video else "article"),
    )
    return _render(
        url=data.url,
        title=data.title,
        description=data.description,
        image=data.image,
        image_alt=data.image_alt,
        image_type=data.image_type,
        is_video=data.is_video,
        site_name=data.site_name,
        og_type=data.og_type,
    )
