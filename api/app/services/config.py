import secrets

import app.settings as settings


def _get_config_col():
    from app.services.documentdb import db
    return db["web10"]["config"]


def _get_key_col():
    from app.services.documentdb import db
    return db["web10"]["jwt_keys"]


def node_is_configured() -> bool:
    """True if the node has been set up (admin account exists)."""
    from app.services.documentdb import db
    return len([c for c in db.list_collection_names() if c not in ("web10", "admin")]) > 0


def get_config() -> dict:
    """Returns the persisted node config, or empty dict if not configured."""
    col = _get_config_col()
    doc = col.find_one({"_id": "node"})
    if not doc:
        return {}
    return doc.get("body", {})


def save_config(body: dict) -> dict:
    """Upserts the node config document."""
    col = _get_config_col()
    col.update_one({"_id": "node"}, {"$set": {"body": body}}, upsert=True)
    return body


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
    """Persists the node's JWT signing key."""
    col = _get_key_col()
    col.update_one({"_id": key_data["kid"]}, {"$set": key_data}, upsert=True)
    return key_data


def get_jwt_key() -> dict | None:
    """Returns the current JWT signing key, or None."""
    col = _get_key_col()
    return col.find_one_and_sort(sort=[("ts", -1)]) if col.find_one() else None


def get_latest_jwt_key() -> dict | None:
    """Returns the most recently saved JWT signing key."""
    col = _get_key_col()
    docs = list(col.find().sort("ts", -1))
    return docs[0] if docs else None


def create_admin(username: str, password_hash: str, phone: str = "") -> str:
    """Creates the first admin user. This is the setup completion step."""
    from app.services import records
    from app.services.documentdb import db, to_db

    user_col = db[username]
    new_user = records.star_record()
    new_user["username"] = username
    new_user["hashed_password"] = password_hash
    new_user["admin"] = True
    if phone:
        new_user["phone_number"] = phone
    new_user = to_db(new_user, "services")
    user_col.insert_one(new_user)

    services_terms = to_db(records.services_record(), "services")
    user_col.insert_one(services_terms)

    return "admin created"


def admin_exists() -> bool:
    """Checks if any admin account exists."""
    from app.services.documentdb import db
    for coll_name in db.list_collection_names():
        if coll_name in ("web10", "admin"):
            continue
        doc = db[coll_name].find_one({"service": "*", "body.admin": True})
        if doc:
            return True
    return False
