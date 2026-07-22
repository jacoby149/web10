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
    response = db[user].update_one(query, update)
    if pull:
        db[user].update_one(query, get_pull(update))
    return {
        "matchedCount": response.matched_count,
        "modifiedCount": response.modified_count,
    }


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
    apps = [
        {"url": app["url"], "visits": app["visits"]}
        for app in db["web10"]["apps"].find({}).sort("visits", pymongo.DESCENDING).skip(skip).limit(limit)
    ]
    return apps


def get_user_count():
    return len(db.list_collection_names())


def total_size():
    return db.command("dbstats")["storageSize"]


# app registration


def register_app(info):
    db["web10"]["apps"].update_one({"url": info["url"]}, {"$inc": {"visits": 1}}, True)


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
