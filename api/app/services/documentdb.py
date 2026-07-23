import datetime
import itertools
import logging
import re
import secrets

import pymongo
from bson.objectid import ObjectId

import app.exceptions as exceptions
import app.settings as settings
from app.models.core import dotdict
from app.services import records as records

log = logging.getLogger(__name__)

# Server-managed metadata fields — the client must never set or forge these.
IMMUTABLE_METADATA = frozenset(("_author", "_source_node", "_created_at"))

#################################
####### CONNECTING TO DB ########
#################################

DB_URL = settings.DB_URL
client = pymongo.MongoClient(DB_URL)
db = client[settings.DB]


################################
######### EMULATION ############
################################


# transforms a db found doc for user reading
def to_gui(doc):
    _id = doc["_id"]
    doc = doc["body"]
    doc["_id"] = _id
    # I6: ensure server-managed metadata is always present on read
    for field in IMMUTABLE_METADATA:
        if field not in doc:
            doc[field] = None
    return doc


# transforms user submitted doc for db writing
# I6: injects server-managed metadata; strips any client-supplied values
def to_db(_doc, service, author=None, source_node=None):
    doc = {}
    if "_id" in _doc:
        doc["_id"] = _doc["_id"]
        del _doc["_id"]
    doc["service"] = service
    body = {k: v for k, v in _doc.items() if k not in IMMUTABLE_METADATA}
    # I6: server always wins — inject metadata from token + server clock
    if author is not None:
        body["_author"] = author
    if source_node is not None:
        body["_source_node"] = source_node
    body["_created_at"] = datetime.datetime.utcnow()
    doc["body"] = body
    return doc


# transforms a query/update field name for db
def to_db_field(field):
    if field == "_id":
        return field
    else:
        return f"body.{field}"


# transforms user query for db
# safe since ops are for values not fields
def q_t(_q, service):
    q = {"service": service}
    for field in _q:
        # in web10, fields of a query arent allowed to start with a dollar sign.
        # dollar signs have a special meaning for pagination purposes, so we trim them out.
        if field[0] != "$":
            q[to_db_field(field)] = _q[field]
    return q


# transforms users update for db
# I6: strips any operator targeting immutable metadata fields
def u_t(_u):
    u = {}
    for op in _u:
        u[op] = {}
        for field in _u[op]:
            if "$" in "".join(u[op].keys()):
                # dont let fancy updates work yet.
                raise exceptions.DB_NOT_ALLOWED
            # _id selects the document in the query; it never belongs in an
            # update. to_db_field maps it to the top-level Mongo _id (immutable
            # by engine contract — MongoDB rejects any $set on it with code 66,
            # "Performing an update on the path '_id' would modify the immutable
            # field '_id'", even to the same value). Clients that round-trip a
            # whole record (e.g. the social app's saveProfile, which spreads the
            # existing profile — _id included — into the $set payload) hit this
            # on every edit. Drop it here so every client is protected.
            if field == "_id":
                log.warning("u_t: dropped client update of immutable '_id' via %s", op)
                continue
            db_field = to_db_field(field)
            # I6: silently drop updates targeting immutable server-managed fields
            if field in IMMUTABLE_METADATA:
                log.warning(
                    "I6: blocked client update of immutable field '%s' via %s",
                    field,
                    op,
                )
                continue
            u[op][db_field] = _u[op][field]
    return u


# changes mongodb query sort syntax to mongodb python sort syntax.
# fields are body-prefixed like query fields — without it, $sort ordered
# by a nonexistent top-level field and was a silent no-op.
def sort_t(sort):
    return [(to_db_field(k), sort[k]) for k in sort]


# assumes number fields are only in arrays.


def get_pull(u):
    pull = {"$pull": {}}
    if "$unset" not in u:
        raise exceptions.BAD_PULL
    for field in u["$unset"]:
        split = field.split(".")
        if split[-1].isdigit():  # is it an array index
            new_field = ".".join(split[0:-1])
            pull["$pull"][new_field] = None
    return pull


###############################
###### PHONE_NUMBER FUNCTIONS ########
###############################


def register_phone_number(phone_number, username):
    db["web10"]["phone_number"].insert_one({"phone_number": phone_number, "username": username})


def unregister_phone_number(username):
    db["web10"]["phone_number"].delete_one({"username": username})


def set_phone_number(phone_number, username):
    db[username].update_one(q_t({"service": "*"}, "services"), u_t({"$set": {"phone_number": phone_number}}))


def get_phone_number(username):
    res = get_star(username)
    if res:
        if "phone_number" in res:
            return res["phone_number"]
    return None


def get_phone_record(phone_number):
    phone_number_collection = db["web10"]["phone_number"]
    return phone_number_collection.find_one({"phone_number": phone_number})


################################
####### USER FUNCTIONS #########
################################


def get_term_record(username, service):
    query = q_t({"service": service}, "services")
    record = db[f"{username}"].find_one(query)
    if record is None:
        return None
    return to_gui(record)


def get_star(user):
    return get_term_record(user, "*")


# sets an phone_number address to verified


def set_verified(user, verified=True):
    return db[user].update_one(q_t({"service": "*"}, "services"), u_t({"$set": {"verified": verified}}))


# sets an phone_number address to verified


def is_verified(user):
    return get_star(user)["verified"]


def get_user(username: str):
    doc = get_star(username)
    if doc is None:
        raise exceptions.NO_USER
    return dotdict(doc)


def create_user(form_data, hash):
    username, password, phone_number = form_data.username, form_data.password, form_data.phone
    if username in ["web10", "anon"]:
        raise exceptions.RESERVED
    if get_star(username):
        raise exceptions.EXISTS
    if settings.VERIFY_REQUIRED:
        if get_phone_record(phone_number):
            raise exceptions.PHONE_NUMBER_TAKEN
        # do this as early as possible TODO dangerous?
        set_phone_number(phone_number, username)
    # (*) record that holds both username and the password
    new_user = records.star_record()
    new_user["username"] = username
    new_user["hashed_password"] = hash(password)
    new_user = to_db(new_user, "services")

    # (services) record that allows auth.localhost to modify service terms
    services_terms = to_db(records.services_record(), "services")

    # insert the records to create / sign up the user
    user_col = db[username]
    user_col.insert_one(new_user)
    set_phone_number(phone_number, username)
    user_col.insert_one(services_terms)
    return "successfully created a new user"


def change_pass(user, new_pass, hash):
    q = q_t({"service": "*"}, "services")
    u = u_t({"$set": {"hashed_password": hash(new_pass)}})
    db[user].update_one(q, u)
    return "successfully changed your password."


########################
### account recovery ###
########################


def temp_pass(phone_number, hash):
    new_pass = secrets.token_urlsafe(6)
    print("IN TEMP PASS, : ", phone_number)
    user = get_phone_record(phone_number)["username"]  # TODO make get_phone_record secure
    change_pass(user, new_pass, hash)  # TODO put hash algo
    return new_pass


##########################
######### CRUD ###########
##########################


def create(user, service, _data, author=None, source_node=None):
    if star_found([_data]):
        raise exceptions.DSTAR
    # A service's terms record ("services" collection-service) must be unique
    # per target service — never create a second one (root cause of duplicate
    # contracts). Callers should update the existing record instead.
    if service == "services" and isinstance(_data, dict) and _data.get("service"):
        if db[f"{user}"].find_one({"service": "services", "body.service": _data["service"]}) is not None:
            raise exceptions.DUPLICATE_SERVICE
    # I6: strip client-supplied immutable metadata before passing to to_db()
    _data = {k: v for k, v in _data.items() if k not in IMMUTABLE_METADATA}
    data = to_db(_data, service, author=author, source_node=source_node)
    result = db[f"{user}"].insert_one(data)
    _data["_id"] = str(result.inserted_id)
    # I6: return the server-injected metadata
    _data["_author"] = author
    _data["_source_node"] = source_node
    _data["_created_at"] = data["body"]["_created_at"]
    return _data


def read(user, service, query):
    # get the skip sort, and limit values if they are there.
    # TODO add exceptions for each of the ways the inputs can be bad!!!!
    skip = query["$skip"] if "$skip" in query else 0
    sort = sort_t(query["$sort"]) if "$sort" in query else [("_id", 1)]
    limit = query["$limit"] if "$limit" in query else 0
    query = q_t(query, service)

    records = db[f"{user}"].find(query).sort(sort).skip(skip).limit(limit)
    records = [to_gui(record) for record in records]
    for record in records:
        if record["_id"]:
            record["_id"] = str(record["_id"])
    return records


def update(user, service, query, update):
    # check if the update is with array pulls
    pull = False
    if "PULL" in update:
        if update["PULL"]:
            pull = True
        del update["PULL"]

    if "_id" in query:
        query["_id"] = ObjectId(query["_id"])

    # Star Checking !
    if star_selected(user, service, query):
        raise exceptions.STAR
    for op in update:
        for item in update[op]:
            if item == "service" and update[op][item] == "*":
                raise exceptions.DSTAR
    query = q_t(query, service)
    update = u_t(update)
    doc = db[user].find_one_and_update(query, update, return_document=pymongo.ReturnDocument.AFTER)
    if doc is None:
        return {"matchedCount": 0, "modifiedCount": 0}
    if pull:
        db[user].update_one(query, get_pull(update))
    record = to_gui(doc)
    if "_id" in record:
        record["_id"] = str(record["_id"])
    return record


def delete(user, service, query):
    if "_id" in query:
        query["_id"] = ObjectId(query["_id"])
    if star_selected(user, service, query):
        raise exceptions.STAR
    query = q_t(query, service)
    db[f"{user}"].delete_many(query)
    # TODO return {deletedCount : response.deleted_count} if possible
    return "successfully deleted"


##########################
###### AGGREGATE #########
##########################

# the 5th verb. read-only by construction: the server prepends scoping
# stages so the dev's pipeline runs on clean user-space docs and cannot
# even name the service/star fields (invariant I3).

# stages a dev's pipeline may use. everything else is rejected.
AGG_STAGES = {
    "$match",
    "$project",
    "$group",
    "$sort",
    "$skip",
    "$limit",
    "$unwind",
    "$addFields",
    "$set",
    "$count",
    "$facet",
    "$bucket",
    "$bucketAuto",
    "$sample",
    "$sortByCount",
}

# operators rejected wherever they appear, however deeply nested:
# js execution, cross-collection reads, cross-collection writes.
AGG_FORBIDDEN = {
    "$where",
    "$function",
    "$accumulator",
    "$lookup",
    "$graphLookup",
    "$unionWith",
    "$out",
    "$merge",
}


# deep-walks every key so forbidden operators can't hide inside
# $match expressions, $group accumulators, or $facet sub-pipelines.
def scan_forbidden(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if key in AGG_FORBIDDEN:
                raise exceptions.PIPELINE
            scan_forbidden(value)
    elif isinstance(node, list):
        for item in node:
            scan_forbidden(item)


def validate_pipeline(pipeline):
    if not isinstance(pipeline, list):
        raise exceptions.PIPELINE
    if len(pipeline) > int(settings.AGG_MAX_STAGES):
        raise exceptions.PIPELINE_CAP
    for stage in pipeline:
        if not isinstance(stage, dict) or len(stage) != 1:
            raise exceptions.PIPELINE
        op = next(iter(stage))
        if op not in AGG_STAGES:
            raise exceptions.PIPELINE
        if op == "$limit":
            if not isinstance(stage["$limit"], int) or stage["$limit"] > int(settings.AGG_MAX_DOCS):
                raise exceptions.PIPELINE_CAP
        if op == "$facet":
            if not isinstance(stage["$facet"], dict):
                raise exceptions.PIPELINE
            for sub_pipeline in stage["$facet"].values():
                validate_pipeline(sub_pipeline)
    scan_forbidden(pipeline)


def aggregate(user, service, pipeline):
    validate_pipeline(pipeline)
    # scoping is unescapable: match the service, drop the star record,
    # then rebase docs to body so the dev's stages start from the same
    # user-space shape that read() returns.
    scoped = [
        {"$match": {"service": service, "body.service": {"$ne": "*"}}},
        {"$addFields": {"body._id": {"$toString": "$_id"}}},
        {"$replaceRoot": {"newRoot": "$body"}},
    ] + pipeline
    cursor = db[f"{user}"].aggregate(
        scoped,
        maxTimeMS=int(settings.AGG_MAX_TIME_MS),
        allowDiskUse=False,
    )
    return list(itertools.islice(cursor, int(settings.AGG_MAX_DOCS)))


##########################
#### Star Protection #####
##########################


# returns true if star service is inside the input
def star_found(services_docs):
    star = list(filter(lambda x: "service" in x and x["service"] == "*", services_docs))
    if len(star) > 0:
        return True
    return False


# sees if a mongodb query selects the star service
def star_selected(user, service, query):
    if service == "services":
        records = read(user, service, query)
        return star_found(records)
    return False


##########################
# customer id, + numbers
##########################


def get_customer_id(user):
    star = get_star(user)
    if star is None:
        raise exceptions.NO_USER
    if "customer_id" in star:
        return star["customer_id"]
    return None


def set_customer_id(user, customer_id):
    return db[user].update_one(q_t({"service": "*"}, "services"), u_t({"$set": {"customer_id": customer_id}}))


def get_business_id(user):
    star = get_star(user)
    if star is None:
        raise exceptions.NO_SELLER
    if "business_id" in star:
        return star["business_id"]
    return None


def set_business_id(user, business_id):
    return db[user].update_one(q_t({"service": "*"}, "services"), u_t({"$set": {"business_id": business_id}}))


###############################
### Service Term Enforcement ##
###############################


def is_in_cross_origins(site, username, service):
    record = get_term_record(username, service)
    if record is None:
        return False
    matches = list(filter(lambda x: re.fullmatch(site, x), record["cross_origins"]))
    return len(matches) > 0


def get_approved(username, provider, owner, service, action):
    record = get_term_record(owner, service)
    if record is None:
        return False
    if (username == owner) and (provider == settings.PROVIDER):
        return True

    def is_listed(e):
        list_hit = (bool(re.fullmatch(e["username"], username))) and (bool(re.fullmatch(e["provider"], provider)))
        action_permitted = action in e and e[action]
        all_permitted = "all" in e and e["all"]
        return list_hit and (action_permitted or all_permitted)

    if "whitelist" not in record:
        on_whitelist = False
    else:
        on_whitelist = len(list(filter(is_listed, record["whitelist"]))) > 0

    if "blacklist" not in record:
        on_blacklist = False
    else:
        on_blacklist = len(list(filter(is_listed, record["blacklist"]))) > 0
    return not (on_blacklist) and on_whitelist


######################
# Balance Tracking
######################


# units scales the flat per-action cost — aggregate passes its
# pipeline stage count so heavier queries spend more credits.
def charge(user, action, units=1):
    query = q_t({"service": "*"}, "services")
    cost = float(settings.COST[action]) * units
    update = u_t({"$inc": {"credits_spent": cost}})
    db[f"{user}"].update_one(query, update)


def replenish(user):
    query = q_t({"service": "*"}, "services")
    update = u_t(
        {
            "$max": {
                "credits_spent": 0,
            },
            "$currentDate": {"last_replenish": True},
        }
    )
    db[f"{user}"].update_one(query, update)


def subscription_update(user, c, s):
    query = q_t({"service": "*"}, "services")
    update = u_t(
        {
            "$set": {
                "credit_limit": c,
                "space_limit": s,
            },
        }
    )
    db[f"{user}"].update_one(query, update)


def get_collection_size(user):
    # camelCase: real mongo accepts both spellings, ferretdb only this one.
    # on ferretdb/documentdb the size is a postgres-derived estimate --
    # fine for space gating (decided in plan phase 1).
    return db.command("collStats", user)["size"] / (1024 * 1024)


def emit_event(user, action, service, site):
    """Emit a per-request metering event to the capped web10.metering_events collection.

    Aggregate exhaust only — individual record contents stay sovereign.
    """
    _ensure_capped("metering_events", settings.METERING_EVENTS_MAX)
    db["web10"]["metering_events"].insert_one(
        {
            "user": user,
            "action": action,
            "service": service,
            "site": site,
            "ts": datetime.datetime.utcnow(),
        }
    )


def _ensure_capped(name, max_docs):
    """Create a capped collection if it doesn't already exist."""
    existing = set(db.list_collection_names())
    if name not in existing:
        db.create_collection(name, capped=True, size=1048576, max=max_docs)


############################
#### app store #####
############################

# appstore stats


def get_apps(skip=0, limit=0):
    """Public storefront: only admin-approved apps appear here."""
    apps = [
        {"url": app["url"], "visits": app["visits"]}
        for app in db["web10"]["apps"]
        .find({"approved": True})
        .sort("visits", pymongo.DESCENDING)
        .skip(skip)
        .limit(limit)
    ]
    return apps


def list_apps_admin():
    """Admin-facing list of every registered app, including its approval
    state. Historical apps that predate the `approved` flag arrive as
    pending (the field is absent) so the operator can curate them once."""
    apps = []
    for app in db["web10"]["apps"].find({}).sort("visits", pymongo.DESCENDING):
        apps.append(
            {
                "url": app.get("url"),
                "visits": app.get("visits", 0),
                "approved": bool(app.get("approved", False)),
                "name": app.get("name", ""),
                "registered_at": app.get("registered_at"),
            }
        )
    return apps


def set_app_approval(url: str, approved: bool):
    """Admin toggles whether an app is shown in the public App Store."""
    db["web10"]["apps"].update_one({"url": url}, {"$set": {"approved": bool(approved)}})


def get_user_count():
    return len(db.list_collection_names())


def total_size():
    return db.command("dbstats")["storageSize"]


# app registration


def register_app(info):
    """Any app can self-register; new entries are pending admin approval
    (setOnInsert so a repeat visit from an already-known app never resets
    the approval state)."""
    url = info.get("url")
    if not url:
        return
    db["web10"]["apps"].update_one(
        {"url": url},
        {
            "$inc": {"visits": 1},
            "$setOnInsert": {
                "approved": False,
                "name": info.get("name", ""),
                "registered_at": datetime.datetime.utcnow().isoformat(),
            },
        },
        upsert=True,
    )


# --- Media helpers ---


def create_media_record(username: str, record: dict) -> dict:
    # I6: strip client-supplied immutable metadata
    record = {k: v for k, v in record.items() if k not in IMMUTABLE_METADATA}
    record["_created_at"] = datetime.datetime.utcnow()
    doc = {"service": "media", "body": record}
    result = db[username].insert_one(doc)
    record["_id"] = str(result.inserted_id)
    return record


def read_media_records(username: str, query: dict | None = None) -> list[dict]:
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
    mongo_query = {"service": "media"}
    for field, value in query.items():
        if field.startswith("$"):
            continue
        if field == "_id":
            mongo_query["_id"] = ObjectId(value)
        else:
            mongo_query[f"body.{field}"] = value
    result = db[username].delete_many(mongo_query)
    return result.deleted_count


def user_collection_exists(username: str) -> bool:
    return username in db.list_collection_names()


# ---------------------------------------------------------------------------
# Discovery index helpers (web10.discovery_posts)
#
# The discovery index is a CROSS-USER projection. CRUD on a user collection
# is scoped to one user — there is no "PATCH /*/posts". The index stores
# only what's needed for public display: text, tags, author, created_at.
#
# Engagement counts are NOT cached here. They are derived at read time from
# the public ledger (web10.public), which holds all reactions/comments/reposts.
# ---------------------------------------------------------------------------

DISCOVERY_COLLECTION = "discovery_posts"


def _ensure_system_collection(name: str):
    """Return the web10-system collection ``web10.<name>``, creating it if absent.

    System collections (discovery index, public ledger, schema registry) live
    in the settings.DB database under a ``web10.`` name prefix — i.e.
    ``db["web10"][name]`` is the collection literally named ``web10.<name>``.

    Existence checks and creation MUST go through the DATABASE handle (``db``),
    NOT through ``db["web10"]``: ``db`` is ``client[settings.DB]`` (a Database),
    so ``db["web10"]`` is a *Collection*, and calling ``list_collection_names()``
    / ``create_collection()`` on a Collection raises ``TypeError``. That bug
    500'd every discovery/ledger/schema request against a real node; the fully
    mocked pymongo in the test suite hid it (a MagicMock accepts any call).
    """
    full_name = f"web10.{name}"
    if full_name not in set(db.list_collection_names()):
        db.create_collection(full_name)
    return db["web10"][name]


def _ensure_discovery_collection():
    """Ensure the discovery_posts collection and indexes exist."""
    col = _ensure_system_collection(DISCOVERY_COLLECTION)
    # created_at index powers the "recent" feed sort; the text index powers
    # /discover/search. Both are supported by MongoDB and FerretDB.
    col.create_index([("created_at", -1)], name="discovery_created_at")
    col.create_index([("body_text", "text"), ("tags", "text")], name="discovery_text_index")


def upsert_discovery_post(username: str, service: str, post: dict) -> dict:
    """Upsert a projection of a post into the discovery index.

    Called as a background task from CRUD endpoints when a post is
    created or updated in a service where anon is whitelisted.
    """
    _ensure_discovery_collection()
    body_text = post.get("text", "") or post.get("body", "") or ""
    tags = post.get("tags", []) or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    created_at = post.get("created_at") or datetime.datetime.utcnow().isoformat()
    post_id = str(post.get("_id", ""))

    col = db["web10"][DISCOVERY_COLLECTION]
    col.update_one(
        {"post_id": post_id, "author": username, "service": service},
        {
            "$set": {
                "author": username,
                "service": service,
                "post_id": post_id,
                "body_text": body_text,
                "tags": tags,
                "created_at": created_at,
                "updated_at": datetime.datetime.utcnow().isoformat(),
            }
        },
        upsert=True,
    )


def remove_discovery_post(username: str, service: str, post_id: str):
    """Remove a post from the discovery index."""
    try:
        db["web10"][DISCOVERY_COLLECTION].delete_one(
            {
                "post_id": str(post_id),
                "author": username,
                "service": service,
            }
        )
    except Exception:
        pass


def _ledger_engagement_for_post(post_key: str) -> dict:
    """Count engagement for a post from the public ledger.

    post_key is the target string that ledger entries reference
    (e.g. "{username}/{service}/{post_id}").
    Engagement is schema-agnostic — keyed by payload.action.
    """
    _ensure_public_collection()
    col = db["web10"][PUBLIC_COLLECTION]
    pipeline = [
        {"$match": {"target": post_key}},
        {
            "$group": {
                "_id": "$payload.action",
                "count": {"$sum": 1},
            }
        },
    ]
    counts = {doc["_id"]: doc["count"] for doc in col.aggregate(pipeline)}
    return {
        "likes": counts.get("like", 0) + counts.get("reaction", 0),
        "comments": counts.get("comment", 0),
        "reposts": counts.get("repost", 0),
    }


def _engagement_score(engagement: dict) -> int:
    """Compute engagement score: likes*1 + comments*3 + reposts*5."""
    return engagement.get("likes", 0) * 1 + engagement.get("comments", 0) * 3 + engagement.get("reposts", 0) * 5


def _discovery_post_to_dict(doc: dict) -> dict:
    """Convert a discovery index document to a clean dict with live engagement."""
    if doc is None:
        return {}
    post_key = f"{doc['author']}/{doc['service']}/{doc['post_id']}"
    engagement = _ledger_engagement_for_post(post_key)
    return {
        "author": doc["author"],
        "service": doc["service"],
        "post_id": doc["post_id"],
        "body_text": doc.get("body_text", ""),
        "tags": doc.get("tags", []),
        "created_at": doc.get("created_at"),
        "engagement": engagement,
        "engagement_score": _engagement_score(engagement),
    }


def query_discovery_posts(sort_by: str = "recent", limit: int = 50, skip: int = 0) -> list[dict]:
    """Query the discovery index for the feed.

    For trending sort, we enrich each doc with live engagement from the
    ledger and sort in Python (the index is small enough). For recent,
    we sort by created_at from the index.
    """
    _ensure_discovery_collection()
    col = db["web10"][DISCOVERY_COLLECTION]

    if sort_by == "trending":
        docs = list(col.find().limit(limit + skip))
        enriched = [_discovery_post_to_dict(d) for d in docs]
        enriched.sort(key=lambda p: p["engagement_score"], reverse=True)
        return enriched[skip : skip + limit]
    else:
        docs = list(col.find().sort("created_at", -1).skip(skip).limit(limit))
        return [_discovery_post_to_dict(d) for d in docs]


def search_discovery_posts(query: str, limit: int = 50, skip: int = 0) -> list[dict]:
    """Full-text search the discovery index, most recent first.

    We deliberately do NOT use a ``{"$meta": "textScore"}`` projection/sort:
    on FerretDB a meta projection returns only ``_id`` + score (dropping the
    document fields), which breaks the downstream projection. Returning full
    documents ordered by recency works identically on MongoDB and FerretDB;
    relevance ranking on the small discovery index isn't worth the
    incompatibility.
    """
    _ensure_discovery_collection()
    col = db["web10"][DISCOVERY_COLLECTION]
    docs = list(col.find({"$text": {"$search": query}}).sort("created_at", -1).skip(skip).limit(limit))
    return [_discovery_post_to_dict(d) for d in docs]


def trending_topics(limit: int = 20) -> list[dict]:
    """Aggregate trending hashtags from the discovery index."""
    _ensure_discovery_collection()
    col = db["web10"][DISCOVERY_COLLECTION]
    pipeline = [
        {"$unwind": "$tags"},
        {"$match": {"tags": {"$regex": "^#"}}},
        {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": limit},
    ]
    docs = list(col.aggregate(pipeline))
    return [{"topic": d["_id"], "count": d["count"]} for d in docs]


def suggested_users(limit: int = 20) -> list[dict]:
    """Suggest users based on discovery index activity + engagement."""
    _ensure_discovery_collection()
    col = db["web10"][DISCOVERY_COLLECTION]
    docs = list(col.find())
    author_posts: dict[str, list[dict]] = {}
    for d in docs:
        author_posts.setdefault(d["author"], []).append(d)
    users = []
    for author, posts in author_posts.items():
        score = sum(_discovery_post_to_dict(p)["engagement_score"] for p in posts)
        users.append(
            {
                "username": author,
                "post_count": len(posts),
                "engagement_score": score,
            }
        )
    users.sort(key=lambda u: u["engagement_score"], reverse=True)
    return users[:limit]


def lookup_discovery_post(username: str, service: str, post_id: str) -> dict:
    """Look up a single post in the discovery index."""
    _ensure_discovery_collection()
    col = db["web10"][DISCOVERY_COLLECTION]
    doc = col.find_one({"post_id": str(post_id), "author": username, "service": service})
    return _discovery_post_to_dict(doc)


# ---------------------------------------------------------------------------
# Schema registry helpers (web10.schemas)
# ---------------------------------------------------------------------------

SCHEMAS_COLLECTION = "schemas"


def _ensure_schemas_collection():
    _ensure_system_collection(SCHEMAS_COLLECTION)


def register_schema(author: str, name: str, schema_def: dict) -> dict:
    """Register a new JSON Schema. Returns the schema document."""
    _ensure_schemas_collection()
    import uuid as uuid_mod

    doc = {
        "_id": f"{settings.PROVIDER}.uuid6:{uuid_mod.uuid4()}",
        "author": author,
        "name": name,
        "schema": schema_def,
        "created_at": datetime.datetime.utcnow().isoformat(),
        "updated_at": datetime.datetime.utcnow().isoformat(),
    }
    db["web10"][SCHEMAS_COLLECTION].insert_one(doc)
    return doc


def get_schema(schema_id: str) -> dict | None:
    """Fetch a schema by ID (anon OK)."""
    _ensure_schemas_collection()
    return db["web10"][SCHEMAS_COLLECTION].find_one({"_id": schema_id})


def update_schema(schema_id: str, author: str, updates: dict) -> dict | None:
    """Update a schema (author only). Returns updated doc or None."""
    _ensure_schemas_collection()
    updates["updated_at"] = datetime.datetime.utcnow().isoformat()
    return db["web10"][SCHEMAS_COLLECTION].find_one_and_update(
        {"_id": schema_id, "author": author},
        {"$set": updates},
        return_document=pymongo.ReturnDocument.AFTER,
    )


def delete_schema(schema_id: str, author: str) -> bool:
    """Delete a schema (author only). Returns True if deleted."""
    _ensure_schemas_collection()
    result = db["web10"][SCHEMAS_COLLECTION].delete_one({"_id": schema_id, "author": author})
    return result.deleted_count > 0


# ---------------------------------------------------------------------------
# Public ledger helpers (web10.public)
#
# The public ledger is the single write-open surface for structured,
# validated interactions. Any authenticated user can create entries.
# Anyone (including anon) can read them.
#
# Engagement (reactions, comments, reposts) lives here. The discovery
# index derives engagement counts from the ledger at read time.
# ---------------------------------------------------------------------------

PUBLIC_COLLECTION = "public"


def _ensure_public_collection():
    _ensure_system_collection(PUBLIC_COLLECTION).create_index(
        [("schema_id", 1), ("target", 1), ("author", 1)],
        name="public_query_index",
    )


def create_public_entry(author: str, schema_id: str, target: str, payload: dict) -> dict:
    """Create a public ledger entry. Returns the entry document."""
    _ensure_public_collection()
    import uuid as uuid_mod

    doc = {
        "_id": f"{settings.PROVIDER}.uuid6:{uuid_mod.uuid4()}",
        "author": author,
        "schema_id": schema_id,
        "target": target,
        "payload": payload,
        "created_at": datetime.datetime.utcnow().isoformat(),
        "updated_at": datetime.datetime.utcnow().isoformat(),
    }
    db["web10"][PUBLIC_COLLECTION].insert_one(doc)
    return doc


def query_public_entries(
    schema_id: str | None = None,
    target: str | None = None,
    author: str | None = None,
    limit: int = 50,
    skip: int = 0,
) -> list[dict]:
    """Query the public ledger (anon OK)."""
    _ensure_public_collection()
    query = {}
    if schema_id:
        query["schema_id"] = schema_id
    if target:
        query["target"] = target
    if author:
        query["author"] = author
    return list(db["web10"][PUBLIC_COLLECTION].find(query).sort("created_at", -1).skip(skip).limit(limit))


def update_public_entry(entry_id: str, author: str, updates: dict) -> dict | None:
    """Update a public entry (author only)."""
    _ensure_public_collection()
    updates["updated_at"] = datetime.datetime.utcnow().isoformat()
    return db["web10"][PUBLIC_COLLECTION].find_one_and_update(
        {"_id": entry_id, "author": author},
        {"$set": updates},
        return_document=pymongo.ReturnDocument.AFTER,
    )


def delete_public_entry(entry_id: str, author: str) -> bool:
    """Delete a public entry (author only)."""
    _ensure_public_collection()
    result = db["web10"][PUBLIC_COLLECTION].delete_one({"_id": entry_id, "author": author})
    return result.deleted_count > 0


# ---------------------------------------------------------------------------
# Background indexing helpers
# ---------------------------------------------------------------------------


def service_allows_anon(username: str, service: str) -> bool:
    """Check if a service has anon whitelisted."""
    term = get_term_record(username, service)
    if term is None:
        return False
    for entry in term.get("whitelist", []):
        if entry.get("username") == "anon":
            return True
    return False


def background_index_post(username: str, service: str, post: dict):
    """Background task: upsert a post into the discovery index if the service allows anon."""
    try:
        if service_allows_anon(username, service):
            upsert_discovery_post(username, service, post)
    except Exception:
        # Non-fatal for the write, but log — a silent swallow here is exactly
        # what let the db["web10"] Database/Collection bug hide (posts never
        # indexed, feed empty, no error anywhere).
        log.warning("discovery index upsert failed for %s/%s", username, service, exc_info=True)


def background_remove_post(username: str, service: str, post_id: str):
    """Background task: remove a post from the discovery index."""
    try:
        remove_discovery_post(username, service, post_id)
    except Exception:
        pass
