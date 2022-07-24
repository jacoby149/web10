import pymongo
from bson.objectid import ObjectId
import app.settings as settings
import app.models as models
import app.web10records as records
import app.exceptions as exceptions
import os
import re
import datetime


#################################
####### CONNECTING TO DB ########
#################################

client_url = os.environ.get("DB_URL")
if not client_url:
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
    return doc


# transforms user submitted doc for db writing
def to_db(_doc, service):
    doc = {}
    if "_id" in _doc:
        doc["_id"] = _doc["_id"]
        del _doc['_id']
    doc["service"] = service
    doc["body"] = _doc
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
        q[to_db_field(field)] = _q[field]
    return q


# transforms users update for db
# safe because ops are for values not fields
def u_t(_u):
    u = {}
    for op in _u:
        u[op] = {}
        for field in _u[op]:
            if "$" in "".join(u[op].keys()):
                # dont let fancy updates work yet.
                raise exceptions.DB_NOT_ALLOWED
            u[op][to_db_field(field)] = _u[op][field]
    return u

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
    db['web10']['phone_number'].insert_one(
        {"phone_number": phone_number, "username": username})


def unregister_phone_number(username):
    db['web10']['phone_number'].delete_one({"username": username})


def set_phone_number(phone_number, username):
    db[username].update_one(
        q_t({"service": "*"}, "services"), u_t({"$set": {"phone_number": phone_number}}))


def get_phone_number(username):
    res = get_star(username)
    if res:
        if "phone_number" in res:
            return res["phone_number"]
    return None

def get_phone_record(phone_number):
    phone_number_collection = db['web10']['phone_number']
    return phone_number_collection.find_one({"phone_number": phone_number})

################################
####### USER FUNCTIONS #########
################################


def get_term_record(username, service):
    query = q_t({"service": service}, 'services')
    record = db[f"{username}"].find_one(query)
    if record == None:
        return None
    return to_gui(record)


def get_star(user):
    return get_term_record(user, "*")

# sets an phone_number address to verified


def set_verified(user, verified=True):
    return db[user].update_one(
        q_t({"service": "*"}, 'services'),
        u_t({"$set": {"verified": verified}})
    )

# sets an phone_number address to verified


def is_verified(user):
    return get_star(user)["verified"]


def get_user(username: str):
    doc = get_star(username)
    if doc == None:
        raise exceptions.NO_USER
    return models.dotdict(doc)


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
    return "success"


def change_pass(user, new_pass, hash):
    q = q_t({"service": "*"}, "services")
    u = u_t({"$set": {"hashed_password": hash(new_pass)}})
    db[user].update_one(q, u)
    return "success"

##########################
######### CRUD ###########
##########################


def create(user, service, _data):
    if star_found([_data]):
        raise exceptions.DSTAR
    data = to_db(_data, service)
    result = db[f"{user}"].insert_one(data)
    _data["_id"] = str(result.inserted_id)
    return _data


def read(user, service, query):
    query = q_t(query, service)
    records = db[f"{user}"].find(query)
    records = [to_gui(record) for record in records]
    for record in records:
        if record["_id"]:
            record["_id"] = str(record["_id"])
    return records


def update(user, service, query, update):
    # check if the update is with array pulls
    pull = False
    if "PULL" in update:
        if update["PULL"] == True:
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
    db[user].update_one(query, update)
    if pull:
        db[user].update_one(query, get_pull(update))
    return "success"


def delete(user, service, query):
    if "_id" in query:
        query["_id"] = ObjectId(query["_id"])
    if star_selected(user, service, query):
        raise exceptions.STAR
    query = q_t(query, service)
    db[f"{user}"].delete_many(query)
    return "success"


##########################
#### Star Protection #####
##########################

# returns true if star service is inside the input
def star_found(services_docs):
    star = list(
        filter(lambda x: "service" in x and x["service"] == "*", services_docs))
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
    if star == None:
        raise exceptions.NO_USER
    if "customer_id" in star:
        return star["customer_id"]
    return None


def set_customer_id(user, customer_id):
    return db[user].update_one(
        q_t({"service": "*"}, 'services'),
        u_t({"$set": {"customer_id": customer_id}})
    )


def get_business_id(user):
    star = get_star(user)
    if star == None:
        raise exceptions.NO_SELLER
    if "business_id" in star:
        return star["business_id"]
    return None


def set_business_id(user, business_id):
    return db[user].update_one(
        q_t({"service": "*"}, 'services'),
        u_t({"$set": {"business_id": business_id}})
    )

###############################
### Service Term Enforcement ##
###############################


def is_in_cross_origins(site, username, service):
    record = get_term_record(username, service)
    if record == None:
        return False
    matches = list(filter(lambda x: re.fullmatch(
        site, x), record["cross_origins"]))
    return len(matches) > 0


def get_approved(username, provider, owner, service, action):
    record = get_term_record(owner, service)
    if record == None:
        return False
    if (username == owner) and (provider == settings.PROVIDER):
        return True

    def is_listed(e):
        list_hit = (bool(re.fullmatch(e["username"], username))) and (
            bool(re.fullmatch(e["provider"], provider))
        )
        action_permitted = action in e and e[action] == True
        all_permitted = "all" in e and e["all"] == True
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

def charge(user, action):
    query = q_t({"service": "*"}, "services")
    cost = settings.COST[action]
    update = u_t({"$inc": {"credits_spent": cost}})
    db[f"{user}"].update_one(query, update)


def replenish(user):
    query = q_t({"service": "*"}, "services")
    update = u_t({
        "$max": {
            "credits_spent": 0,
        },
        "$currentDate": {"last_replenish": True},
    })
    db[f"{user}"].update_one(query, update)


def subscription_update(user, c, s):
    query = q_t({"service": "*"}, "services")
    update = u_t({
        "$set": {
            "credit_limit": c,
            "space_limit": s,
        },
    })
    db[f"{user}"].update_one(query, update)


def get_collection_size(user):
    return db.command("collstats", user)["size"]/(1024*1024)

############################
#### app store #####
############################

# appstore stats


def get_apps():
    apps = [{"url": app["url"],
             "visits":app["visits"]}
            for app in db["web10"]["apps"].find({}).sort('visits',pymongo.DESCENDING)]
    return apps


def get_user_count():
    return len(db.list_collection_names())


def total_size():
    return db.command("dbstats")["storageSize"]

# app registration


def register_app(info):
    db["web10"]["apps"].update_one({"url": info["url"]}, {
        "$inc": {"visits": 1}}, True)
