"""bugbot.py — D70: bug reports push to the node's admins as a DM.

A submitted bug report is durable in the ``bug_reports`` table (the record);
this module is the delivery — a DM from the ``bugbot`` user to every node
admin, in the standard DM shape (a 2-member ``dm-bugbot-{admin}`` group + a
``posts`` doc). The bot is a real node user, lazy-provisioned and idempotent;
its writes go through the same ``insert_document`` + group-attach path a
human DM does, gated by the same D58 write check.

Best-effort by contract: a delivery failure (any admin, any step) is logged
and swallowed — the report is already durable, and a DM hiccup must never
fail the submitter's request.

KB: knowledge/knowledge-base/web10-v3/social/bug-reports.md
"""

import logging
import secrets

import app.settings as settings
from app.services import config as config_svc
from app.services.auth import get_password_hash
from app.v3.services import clickhouse as ch

log = logging.getLogger(__name__)

BOT_USERNAME = "bugbot"

# The exact DM contract the social app creates (dms.ts DM_ROLES, the D58
# per-service map shape) — a bot-created group is indistinguishable from a
# user-created one.
DM_ROLES = [
    {
        "name": "member",
        "permissions": {
            "posts": ["readAll", "create", "updateOwn", "deleteOwn"],
            "comments": ["readAll", "create", "updateOwn", "deleteOwn"],
        },
    },
]

# The DM message is a summary — the full record (stack trace, screenshots)
# stays on the bug_reports row, reachable via the admin detail endpoint.
_DESCRIPTION_CAP = 500
_STACK_CAP = 300


def ensure_bugbot_user() -> None:
    """Idempotently provision the ``bugbot`` user.

    Random unguessable password, no contact — nobody logs in as the bot, the
    API acts as it directly. A human who signs up as ``bugbot`` gets the
    normal EXISTS (the account exists); the bot is provisioned at the node
    level, never through /v3/signup.
    """
    if ch.get_user(BOT_USERNAME) is not None:
        return
    ch.create_user(BOT_USERNAME, get_password_hash(secrets.token_urlsafe(32)))
    log.info("[bugbot] provisioned the %s user", BOT_USERNAME)


def _dm_group_name(a: str, b: str) -> str:
    """The deterministic DM group name (sorted — both parties derive it).

    Mirrors the social app's ``dmGroupName`` (``dm-${[a,b].sort().join('-')}``).
    Usernames are ``[a-z0-9-]``, so JS lexicographic sort and Python
    code-point sort agree.
    """
    return f"dm-{'-'.join(sorted([a, b]))}"


def _find_dm_group(admin: str) -> str | None:
    """The existing dm-bugbot-{admin} group, in either creator-embedded shape.

    The group_id embeds its creator (``{provider}/groups/users/{creator}/
    {slug}``), and the admin may have DM'd the bot first — so both shapes are
    checked before creating (the social app's findDmGroup matches by name
    suffix for the same reason).
    """
    slug = _dm_group_name(BOT_USERNAME, admin)
    for creator in (BOT_USERNAME, admin):
        group_id = f"{settings.PROVIDER}/groups/users/{creator}/{slug}"
        if ch.get_group(group_id):
            return group_id
    return None


def _ensure_dm_group(admin: str) -> str:
    """The dm-bugbot-{admin} group, created (bot as creator) when absent."""
    existing = _find_dm_group(admin)
    if existing:
        return existing
    slug = _dm_group_name(BOT_USERNAME, admin)
    group_id = f"{settings.PROVIDER}/groups/users/{BOT_USERNAME}/{slug}"
    ch.create_group(group_id, DM_ROLES, "invite_only")
    ch.add_group_member(group_id, BOT_USERNAME, "member")
    ch.add_group_member(group_id, admin, "member")
    log.info("[bugbot] created DM group %s for admin %s", group_id, admin)
    return group_id


def _report_message(report: dict) -> str:
    """The DM body — a summary a human can act on, with the pointer."""
    lines = [f"Bug report {report['report_id']}"]
    lines.append(report["description"][:_DESCRIPTION_CAP])
    details = []
    if report.get("username"):
        details.append(f"user: {report['username']}")
    if report.get("email"):
        details.append(f"email: {report['email']}")
    if report.get("page_url"):
        details.append(f"page: {report['page_url']}")
    if report.get("app_version"):
        details.append(f"app: {report['app_version']}")
    if report.get("device_info"):
        details.append(f"device: {report['device_info']}")
    if report.get("browser_info"):
        details.append(f"browser: {report['browser_info']}")
    if report.get("error_message"):
        details.append(f"error: {report['error_message'][:_STACK_CAP]}")
    if report.get("stack_trace"):
        first_line = report["stack_trace"].strip().splitlines()[0] if report["stack_trace"].strip() else ""
        if first_line:
            details.append(f"trace: {first_line[:_STACK_CAP]}")
    shot_count = len(report.get("screenshots") or [])
    if shot_count:
        details.append(f"screenshots: {shot_count} (see admin console)")
    if details:
        lines.append(" · ".join(details))
    return "\n".join(lines)


def deliver_bug_report(report: dict) -> list[str]:
    """DM the report to every node admin. Returns the delivered group ids.

    ``report`` is the full row shape from ``get_bug_report`` (includes
    ``screenshots``). Best-effort: any failure is logged and swallowed — the
    report is already durable in the bug_reports table.
    """
    admins = config_svc.list_admins()
    if not admins:
        log.info("[bugbot] no admins configured — report %s not delivered", report.get("report_id"))
        return []

    try:
        ensure_bugbot_user()
    except Exception:
        log.exception("[bugbot] provisioning failed (report %s is durable)", report.get("report_id"))
        return []
    delivered = []
    for admin in admins:
        if admin == BOT_USERNAME:
            continue
        try:
            group_id = _ensure_dm_group(admin)
            # The D58 write gate, applied to the bot exactly as to any user:
            # it may only write into groups its effective role grants create
            # on (membership, which _ensure_dm_group just established).
            if not ch.can_write_group(group_id, BOT_USERNAME, "posts"):
                log.warning("[bugbot] no write grant in %s — skipping %s", group_id, admin)
                continue
            body = {
                "message": _report_message(report),
                "subject": f"Bug report {report['report_id']}",
                "sender_username": BOT_USERNAME,
                "sender_provider": settings.PROVIDER,
                "recipient_username": admin,
                "recipient_provider": settings.PROVIDER,
                "report_id": report["report_id"],
                "screenshot_count": len(report.get("screenshots") or []),
                "media_refs": [],
            }
            doc = ch.insert_document(BOT_USERNAME, "posts", body)
            ch.attach_doc_to_groups(doc["doc_id"], [group_id])
            delivered.append(group_id)
            log.info(
                "[bugbot] delivered report %s to %s (doc %s in %s)",
                report["report_id"], admin, doc["doc_id"], group_id,
            )
        except Exception:
            log.exception("[bugbot] delivery to %s failed (report %s is durable)", admin, report.get("report_id"))
    return delivered
