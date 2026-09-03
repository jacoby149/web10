import secrets

import app.settings as settings

# Content moderation (D59) — the shipped default blocklist. Hate speech and
# slurs only (not general profanity). Whole-word, case-insensitive matching.
# The operator can add to or remove from this in the Node Config UI. Source:
# knowledge/knowledge-base/web10-v3/social/sensitive-words-default.md.
DEFAULT_SENSITIVE_WORDS: list[str] = [
    # Anti-Black
    "nigger",
    "niggers",
    "nigga",
    "niggas",
    "niggah",
    "niggahs",
    "n1gger",
    "n1gga",
    "niggur",
    "nigr",
    "nigs",
    # Anti-Asian
    "chink",
    "chinks",
    "gook",
    "gooks",
    # Anti-Latino / Anti-Hispanic
    "spic",
    "spics",
    "wetback",
    "wetbacks",
    "beaner",
    "beaners",
    # Anti-Indigenous / Anti-Native
    "redskin",
    "redskins",
    # Homophobic
    "fag",
    "fags",
    "faggot",
    "faggots",
    "f4ggot",
    "f4g",
    "feggot",
    "faggit",
    "f0gg0t",
    # Transphobic
    "tranny",
    "trannies",
    "tran",
    # Antisemitic
    "kike",
    "kikes",
    "k1ke",
    "yid",
    "yids",
    "kraut",
    "krauts",
    # Anti-Arab / Anti-Middle Eastern
    "sandnigger",
    "sandniggers",
    "raghead",
    "ragheads",
    # Disability slurs
    "retard",
    "retards",
    "retart",
    "r4tard",
    "spastic",
    "spastics",
    # Anti-Polish / Anti-Eastern European
    "polack",
    "polacks",
]


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


def _as_bool(value) -> bool:
    """Env overrides arrive as raw strings (settings.py's override loop)."""
    return str(value).strip().lower() == "true"


def _as_int(value) -> int:
    return int(float(str(value)))


def _as_float(value) -> float:
    return float(str(value))


def clickhouse_url() -> str:
    """The effective ClickHouse connection string, composed from the
    CLICKHOUSE_* settings. The node connects with those parts (host/port/
    user/password/database — see v3/services/clickhouse.py), not a URL; this
    is the human-readable form the Node Config UI shows and persists for
    reference."""
    s = settings
    scheme = "clickhouse+https" if _as_bool(s.CLICKHOUSE_SECURE) else "clickhouse"
    return (
        f"{scheme}://{s.CLICKHOUSE_USER}:{s.CLICKHOUSE_PASSWORD}"
        f"@{s.CLICKHOUSE_HOST}:{s.CLICKHOUSE_PORT}/{s.CLICKHOUSE_DATABASE}"
    )


def effective_config() -> dict:
    """The config the node is actually running.

    settings.py (env-overridden) is the base — what the node connects with
    and enforces at boot; the saved node_config overlays it field by field.
    The Node Config UI reads this, so a fresh node (no saved config yet)
    shows its live values — provider domain, ClickHouse URL, MinIO — instead
    of a blank form.
    """
    s = settings
    defaults = {
        "provider": s.PROVIDER,
        "db_url": clickhouse_url(),
        "db_name": s.CLICKHOUSE_DATABASE,
        "algorithm": s.ALGORITHM,
        "token_expire_minutes": _as_int(s.TOKEN_EXPIRE_MINUTES),
        "beta_required": _as_bool(s.BETA_REQUIRED),
        "verify_required": _as_bool(s.VERIFY_REQUIRED),
        "require_contact": False,
        "pay_required": False,
        "beta_code": s.BETA_CODE,
        "free_credits": _as_float(s.FREE_CREDITS),
        "free_space": _as_int(s.FREE_SPACE),
        "cors_service_managers": ", ".join(s.CORS_SERVICE_MANAGERS),
        "s3_endpoint": s.S3_ENDPOINT,
        "s3_bucket": s.S3_BUCKET,
        "s3_access_key": s.S3_ACCESS_KEY,
        "s3_secret_key": s.S3_SECRET_KEY,
        "s3_region": s.S3_REGION,
        "s3_use_ssl": _as_bool(s.S3_USE_SSL),
        "max_upload_size": _as_int(s.MAX_UPLOAD_SIZE),
        "twilio_service": s.TWILIO_SERVICE,
        "twilio_account_sid": s.TWILIO_ACCOUNT_SID,
        "twilio_auth_token": s.TWILIO_AUTH_TOKEN,
        "twilio_number": s.TWILIO_NUMBER,
        "stripe_status": s.STRIPE_STATUS,
        "stripe_test_key": s.STRIPE_TEST_KEY,
        "stripe_live_key": s.STRIPE_LIVE_KEY,
        "dev_pay_pct": _as_int(s.DEV_PAY_PCT),
        # Telemetry (D56) — public analytics IDs, admin-set in the Node
        # Config UI. No settings.py default (empty = tracking off); the
        # saved node_config is the only source. Served via GET /telemetry.
        "ga4_measurement_id": "",
        "hotjar_site_id": "",
        # Content moderation (D59) — the blocklist ships with a default
        # (hate speech only); the operator curates it in the Node Config UI.
        # auto_moderate + moderation_enabled default on; auto_hide_users empty.
        "sensitive_words": list(DEFAULT_SENSITIVE_WORDS),
        "auto_moderate": True,
        "moderation_enabled": True,
        "auto_hide_users": [],
        "node_ad_percentage": 10,
        "brand_text": "web10",
        "logo_dark": "",
        "logo_light": "",
    }
    saved = get_config()
    for key, value in saved.items():
        if value is not None:
            defaults[key] = value
    return defaults


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
