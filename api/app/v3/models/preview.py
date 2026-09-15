from pydantic import BaseModel


class PreviewRender(BaseModel):
    """A link-preview card spec (KB: media/thumbnailing.md). The app supplies
    the content; the platform renders the OG/Twitter card. No token — rendering
    is pure (no read, no access check)."""

    title: str
    description: str
    url: str
    image: str | None = None
    image_alt: str | None = None
    image_type: str | None = None
    is_video: bool = False
    og_type: str | None = None  # defaults to "video.other" if is_video, else "article"
    site_name: str = "web10"
