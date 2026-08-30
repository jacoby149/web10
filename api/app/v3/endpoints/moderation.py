import logging

from fastapi import APIRouter

import app.exceptions as exceptions
from app.models.auth import Token
from app.services import config as config_svc
from app.services.auth import check_admin
from app.v3.models import ModerationAutoHide, ModerationFlags
from app.v3.services import moderation

router = APIRouter(tags=["moderation"])
log = logging.getLogger(__name__)


@router.post("/flags", tags=["admin"])
def moderation_flags(data: ModerationFlags):
    """The content-moderation review queue (D59): users with auto-hidden /
    flagged posts, newest first. Admin only."""
    check_admin(Token(token=data.token))
    return {"flags": moderation.get_flags()}


@router.post("/auto-hide", tags=["admin"])
def moderation_auto_hide(data: ModerationAutoHide):
    """Add or remove a username from the node's ``auto_hide_users`` list (D59).

    ``hide=True`` keeps the user's future posts auto-hidden from discover;
    ``hide=False`` restores their future discover visibility. Already-hidden
    posts are unaffected (unhide them individually via the board moderation).
    Admin only.
    """
    check_admin(Token(token=data.token))
    current = config_svc.get_config()
    users = list(current.get("auto_hide_users") or [])
    username = data.username.strip()
    if not username:
        raise exceptions.CRUD
    if data.hide and username not in users:
        users.append(username)
    elif not data.hide and username in users:
        users.remove(username)
    current["auto_hide_users"] = users
    config_svc.save_config(current)
    log.info("[moderation] auto-hide %s %s", "added" if data.hide else "removed", username)
    return {"username": username, "hide": data.hide, "auto_hide_users": users}
