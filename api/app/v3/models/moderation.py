from pydantic import BaseModel


class ModerationFlags(BaseModel):
    """Admin requests the content-moderation review queue (D59)."""

    token: str


class ModerationAutoHide(BaseModel):
    """Admin adds or removes a username from the node's ``auto_hide_users``
    list (D59). ``hide=True`` adds (keep hiding their future posts from
    discover); ``hide=False`` removes (restore future discover visibility)."""

    token: str
    username: str
    hide: bool = True
