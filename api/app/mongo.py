import pymongo
import app.settings as settings
import app.models as models
import app.web10records as records
import os


#################################
####### CONNECTING TO DB ########
#################################

client_url = os.environ.get('DB_URL')
if not client_url:
    DB_URL = settings.DB_URL
client = pymongo.MongoClient(DB_URL)
db = client["web10"]


################################
####### USER FUNCTIONS #########
################################

def get_user(username: str):
    if f'{username}/services' not in db.list_collection_names():
        raise Exception("user does not exist")
    query = {"body.service":"*"}
    doc = db[f'{username}/services'].find_one(query)
    if (doc == None):
        raise Exception("no (*) service found")
    return models.dotdict(doc["body"])

def create_user(form_data, hash):
    username,password = form_data.username,form_data.password

    if f'{username}/services' in db.list_collection_names():
        return "user already exists"
   

    # (*) record that holds both username and the password
    new_user = records.star_record()
    new_user["body"]["username"] = username
    new_user["body"]["hashed_password"] = hash(password)

    # (services) record that allows auth.localhost to modify service terms
    services_terms = records.services_record()

    # insert the records to create / sign up the user
    db[f'{username}/services'].insert_one(new_user) 
    db[f'{username}/services'].insert_one(services_terms)
    return "success"

##########################
######### CRUD ###########
##########################

def create(user,service,query):
    result = db[f'{user}/{service}'].insert_one(query)
    return result

def read(user,service,query):
    #TODO whitelists + blacklist filtering
    records = db[f'{user}/{service}'].find(query)
    records=[record for record in records]
    for record in records : 
        if record["_id"] : 
            record["_id"] = str(record["_id"])
    return records

def update(user,service,query,value):
    #TODO whitelists + blacklist filtering
    result = db[f'{user}/{service}'].update_many(query, value)
    return result

def delete(user,service,query):
    #TODO whitelists + blacklist filtering
    result = db[f'{user}/{service}'].delete_many(query)
    return result


##########################
######### CRUD ###########
##########################

def is_in_cross_origins(site, username, service):
    record = db[f'{username}/services'].find_one({"body.service":service})
    print("AAYYYYYYY!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    print(record)
    return (site in record["body"]["cross_origins"])

def get_approved(username,provider, owner, service, action):
    record = db[f'{owner}/services'].find_one({"body.service":service})
    print(username,owner,provider)
    if (username == owner) and (provider == settings.PROVIDER): return True

    def is_approved(e): 
        return ((e["username"] == username or e["username"] == "*") and (e["provider"] == provider) and (e[action] == True))

    return (len(list(filter(is_approved, record["body"]["whitelist"]))) > 0)
