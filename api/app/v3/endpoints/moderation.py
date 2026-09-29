import logging

from fastapi import APIRouter

import app.exceptions as exceptions
from app.models.auth import Token
from app.services import config as config_svc
from app.services.auth import check_admin
from app.v3.models import ModerationAutoHide, ModerationBan, ModerationFlags
from app.v3.services import clickhouse as ch
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

    ``hide=True`` adds the user AND retroactively hides their existing discover
    posts (the sweep, D59a); ``hide=False`` removes them AND restores their
    existing discover posts. The write-path hook still governs future posts.
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
    # Retroactive sweep (D59a): hiding a user takes effect immediately — their
    # EXISTING discover posts are hidden too, not just future ones. Restoring
    # (hide=False) brings them back. Best-effort: a sweep failure must never
    # fail the list update (the list is the source of truth for future posts).
    try:
        doc_ids = ch.get_user_discover_posts(username)
        for doc_id in doc_ids:
            if data.hide:
                ch.hide_doc_from_group(ch.DISCOVER_GROUP_ID, doc_id, moderation.NODE_MODERATOR)
            else:
                ch.unhide_doc_from_group(ch.DISCOVER_GROUP_ID, doc_id)
        if doc_ids:
            log.info("[moderation] %s %d discover post(s) for %s", "hid" if data.hide else "restored", len(doc_ids), username)
    except Exception as e:
        log.warning("[moderation] retroactive sweep failed (non-fatal): %s: %s", type(e).__name__, e)
    return {"username": username, "hide": data.hide, "auto_hide_users": users}


@router.post("/ban", tags=["admin"])
def moderation_ban(data: ModerationBan):
    """Add or remove a username from the node's ``banned_users`` list (D59a —
    the node-level ban). ``ban=True`` bans the user (their content is filtered
    out of every read path — the board read + the query engine); ``ban=False``
    unbans (their content returns). Node-local, reversible, admin only.
    """
    check_admin(Token(token=data.token))
    current = config_svc.get_config()
    users = list(current.get("banned_users") or [])
    username = data.username.strip()
    if not username:
        raise exceptions.CRUD
    if data.ban and username not in users:
        users.append(username)
    elif not data.ban and username in users:
        users.remove(username)
    current["banned_users"] = users
    config_svc.save_config(current)
    log.info("[moderation] ban %s %s", "added" if data.ban else "removed", username)
    return {"username": username, "ban": data.ban, "banned_users": users}
