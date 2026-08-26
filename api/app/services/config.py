import secrets

import app.settings as settings


def node_is_configured() -> bool:
    """True if the node has been set up (has users in ClickHouse)."""
    from app.v3.services import clickhouse as ch

    return ch.node_has_users()


def get_config() -> dict:
    """Returns the persisted node config, or empty dict if not configured.

    The config lives in ClickHouse (node_config table) — D48.
    """
    from app.v3.services import clickhouse as ch

    return ch.get_node_config()


def save_config(body: dict) -> dict:
    """Appends a new version of the node config (latest row wins on read)."""
    from app.v3.services import clickhouse as ch

    return ch.save_node_config(body)


def get_config_field(field: str, default=None):
    """Reads a single config field, falling back to settings.py default."""
    cfg = get_config()
    if field in cfg:
        return cfg[field]
    return getattr(settings, field, default)


def generate_jwt_keypair() -> dict:
    """Generates a random symmetric signing key (for now, HS256).
    Returns {kid, key}. Later will be RS256/EdDSA per the I1 fix."""
    kid = secrets.token_hex(4)
    key = secrets.token_urlsafe(32)
    return {"kid": kid, "key": key}


def save_jwt_key(key_data: dict) -> dict:
    """Persists the node's JWT signing key (node_config, config_id='jwt:<kid>')."""
    from app.v3.services import clickhouse as ch

    return ch.save_jwt_key(key_data)


def get_jwt_key() -> dict | None:
    """Returns the current JWT signing key, or None."""
    from app.v3.services import clickhouse as ch

    return ch.get_latest_jwt_key()


def get_latest_jwt_key() -> dict | None:
    """Returns the most recently saved JWT signing key."""
    from app.v3.services import clickhouse as ch

    return ch.get_latest_jwt_key()


def list_admins() -> list:
    """Usernames allowed to read/write this node's config.

    Source of truth is the saved config's ``admins`` list; until an admin sets
    one, fall back to settings.DEFAULT_ADMINS so the node isn't locked out.
    """
    admins = list(settings.DEFAULT_ADMINS)  # always include baseline
    cfg_admins = get_config().get("admins")
    if cfg_admins:
        admins = list(set(admins) | set(cfg_admins))
    # DEFAULT_ADMINS may arrive as a comma-separated string via env override
    if isinstance(admins, str):
        admins = [a.strip() for a in admins.split(",") if a.strip()]
    return list(admins)


def is_admin(username: str) -> bool:
    return bool(username) and username in list_admins()


def admin_exists() -> bool:
    """Checks if the node has an admin account.

    v3: setup is complete when it saved an admins list in the node config
    (the v3 users table has no admin flag — admin-ness is the config list
    that ``check_admin`` enforces).
    """
    return bool(get_config().get("admins"))
