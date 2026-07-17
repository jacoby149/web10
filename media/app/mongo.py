import pymongo

import app.settings as settings

client = pymongo.MongoClient(settings.DB_URL)
db = client[settings.DB]


def get_term_record(username: str, service: str) -> dict | None:
    """Fetch a user's terms record for a given service."""
    query = {"service": "services", "body.service": service}
    record = db[username].find_one(query)
    if record is None:
        return None
    body = record.get("body", {})
    body["_id"] = str(record["_id"])
    return body


def is_in_cross_origins(site: str, username: str, service: str) -> bool:
    """Check if a site is in the cross_origins list for a user's service."""
    import re

    record = get_term_record(username, service)
    if record is None:
        return False
    cross_origins = record.get("cross_origins", [])
    return any(re.fullmatch(pattern, site) for pattern in cross_origins)


def get_approved(username: str, provider: str, owner: str, service: str, action: str) -> bool:
    """Check if (username, provider) is whitelisted and not blacklisted for an action on owner's service."""
    import re

    record = get_term_record(owner, service)
    if record is None:
        return False
    if username == owner and provider == settings.PROVIDER:
        return True

    def is_listed(entry: dict) -> bool:
        username_match = re.fullmatch(entry.get("username", ""), username)
        provider_match = re.fullmatch(entry.get("provider", ""), provider)
        if not (username_match and provider_match):
            return False
        action_permitted = entry.get(action, False)
        all_permitted = entry.get("all", False)
        return action_permitted or all_permitted

    whitelist = record.get("whitelist", [])
    blacklist = record.get("blacklist", [])
    on_whitelist = any(is_listed(e) for e in whitelist)
    on_blacklist = any(is_listed(e) for e in blacklist)
    return on_whitelist and not on_blacklist


def create_media_record(username: str, record: dict) -> dict:
    """Insert a media metadata record into the user's collection."""
    doc = {"service": "media", "body": record}
    result = db[username].insert_one(doc)
    record["_id"] = str(result.inserted_id)
    return record


def read_media_records(username: str, query: dict | None = None) -> list[dict]:
    """Read media metadata records from the user's collection."""
    if query is None:
        query = {}
    mongo_query = {"service": "media"}
    for field, value in query.items():
        if field.startswith("$"):
            continue
        mongo_query[f"body.{field}"] = value
    records = list(db[username].find(mongo_query).sort("_id", 1))
    result = []
    for r in records:
        body = r.get("body", {})
        body["_id"] = str(r["_id"])
        result.append(body)
    return result


def delete_media_records(username: str, query: dict) -> int:
    """Delete media metadata records from the user's collection."""
    mongo_query = {"service": "media"}
    for field, value in query.items():
        if field.startswith("$"):
            continue
        if field == "_id":
            from bson.objectid import ObjectId
            mongo_query["_id"] = ObjectId(value)
        else:
            mongo_query[f"body.{field}"] = value
    result = db[username].delete_many(mongo_query)
    return result.deleted_count


def user_collection_exists(username: str) -> bool:
    """Check if a user's collection exists."""
    return username in db.list_collection_names()
