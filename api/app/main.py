from datetime import datetime, timedelta
from re import M
from fastapi import FastAPI, Request, status, BackgroundTasks
from fastapi import Form, Response
from passlib.context import CryptContext
from fastapi.middleware.cors import CORSMiddleware
import requests
import jwt

import app.settings as settings
import app.docs as docs
import app.models as models
import app.exceptions as exceptions

# interfaces
import app.mongo as db
import app.twilio as mobile
import app.stripe as pay

#############################################
########### APP INITIALIZATION ##############
#############################################
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
app = FastAPI(
    title="web10",
    openapi_tags=docs.tags_metadata,
    description=docs.description,
    version="10.0.0.0",
    terms_of_service="http://example.com/terms/",
)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

####################################################
################## Handle 422s #####################
####################################################

import logging
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    exc_str = f"{exc}".replace("\n", " ").replace("   ", " ")
    logging.error(f"{request}: {exc_str}")
    content = {"status_code": 10422, "message": exc_str, "data": None}
    return JSONResponse(
        content=content, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY
    )


####################################################
########### User Password Authentication ###########
####################################################
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def authenticate_user(username: str, password: str):
    user = db.get_user(username)
    if not user:
        raise exceptions.LOGIN
    if not verify_password(password, user.hashed_password):
        raise exceptions.LOGIN
    return user


##################################################
########### Token Based Authentication ###########
##################################################
def decode_token(token: str, private_key=False) -> models.TokenData:
    if private_key:
        payload = jwt.decode(
            token, settings.PRIVATE_KEY, algorithms=[settings.ALGORITHM]
        )
    else:
        payload = jwt.decode(token, options={"verify_signature":False})
    token_data = models.TokenData()
    token_data.populate_from_payload(payload)
    return token_data


# check if a token can be minted given a submitted token
def can_mint(submission_token, mint_token):
    # TODO CHECK FOR PROTOCOL
    if submission_token.username == mint_token.username:
        pass
    else:
        raise exceptions.MINT
    if not submission_token.site:
        raise exceptions.MINT
    elif submission_token.site in settings.CORS_SERVICE_MANAGERS:
        pass
    elif submission_token.site == mint_token.site:
        pass
    else:
        raise exceptions.MINT

    if submission_token.provider == settings.PROVIDER:
        if submission_token.provider == mint_token.provider:
            pass
    else:
        raise exceptions.MINT

    return True


# certify a web10 token with a remote provider
def certify_with_remote_provider(token: models.Token):
    decoded = decode_token(token.token)
    url = f"{decoded.provider}/certify"
    response = requests.post(url, json=token.json())
    return response.status_code == 200

def anon_token():
    return models.TokenData(username="anon",provider=settings.PROVIDER,target=settings.PROVIDER)

# checks if :
# a token certifies with it's provider, is targetted to this provider, is cross origin approved, and whitelisted
def is_permitted(token: models.Token, username, service, action):
    # TODO ADD WHITELIST AND BLACKLISING
    print(token)
    if token.token!=None:
        decoded = decode_token(token.token)
    else:
        decoded= anon_token()
    if settings.PROVIDER == decoded.provider:
        certified = certify(token)
    else:
        certified = certify_with_remote_provider(token)

    if certified:
        if not decoded.target:
            if decoded.username == username and decoded.provider == settings.PROVIDER:
                return True
            else:
                return False
        elif decoded.target != settings.PROVIDER:
            return False
        if decoded.username=="anon" or decoded.site in settings.CORS_SERVICE_MANAGERS or db.is_in_cross_origins(
            decoded.site, username, service
        ):
            if db.get_approved(
                decoded.username, decoded.provider, username, service, action
            ):
                return True
    return False

# check if a token is the highest level token
def check_admin(token:models.Token):    
    if not is_permitted(token,decode_token(token.token).username,"*",None):
        raise exceptions.NOT_ADMIN


##############################################
############ Web10 Routes For You ############
##############################################

def recover(From):
    # DO THE ACTUAL RECOVERY
    password = db.temp_pass(From,get_password_hash)
    return mobile.recovery_response(password)

@app.post("/recovery_bot",include_in_schema=False)
async def recovery_bot(From: str = Form(...), Body: str = Form(...)):
    print("IN RECOVERY BOT")
    response = recover(From.replace("+","")) if Body=="RESET" else mobile.actionless_response()
    return Response(content=str(response), media_type="application/xml")

@app.post("/recovery_prompt")
async def send_recovery_prompt(phone_form: models.PhoneForm):
    phone_number = phone_form.phone_number
    phone_rec = db.get_phone_record(phone_number)
    print(phone_rec)
    user = phone_rec["username"]
    return mobile.recovery_prompt(phone_form.phone_number,user)

# make a new web10 account
@app.post("/change_pass",include_in_schema=False)
async def change_pass(form_data: models.SignUpForm):
    if authenticate_user(form_data.username, form_data.password):
        return db.change_pass(form_data.username,form_data.new_pass,get_password_hash)
    raise exceptions.LOGIN

# change a phone number
@app.post("/change_phone",include_in_schema=False)
async def change_phone(form_data: models.SignUpForm):
    if authenticate_user(form_data.username, form_data.password):
        if db.get_phone_record(form_data.phone):
            raise exceptions.PHONE_NUMBER_TAKEN
        db.set_phone_number(form_data.phone,form_data.username)
        db.unregister_phone_number(form_data.username)
        db.set_verified(form_data.username,False)
        return mobile.send_verification(form_data.phone,form_data.username)
    raise exceptions.LOGIN

# check that an phone_number verification code is valid
@app.post("/verify_code",include_in_schema=False)
async def verify_mobile_code(token: models.Token):
    check_admin(token)
    decoded = decode_token(token.token)
    phone_number = db.get_phone_number(decoded.username)
    code = token.query["code"]
    res = mobile.check_verification(phone_number,code)
    db.register_phone_number(phone_number,decoded.username)
    db.set_verified(decoded.username)
    return res

# check that an phone_number verification code is valid
@app.post("/mobile_login",include_in_schema=False)
async def mobile_login(token: models.Token):
    code = token.query["code"]
    phone_number = token.query["phone"]
    mobile.check_verification(phone_number,code)
    rec = db.get_phone_record(phone_number)
    if not rec : raise exceptions.PHONE_NUMBER_NOT_REGISTERED
    token_data = models.TokenData(
        username=rec["username"],
        provider=settings.PROVIDER,
        site="mobile",
        expires=(datetime.utcnow() + timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES)).isoformat()
    )
    return {
        "token": jwt.encode(
            token_data.dict(), settings.PRIVATE_KEY, algorithm=settings.ALGORITHM
        )
    }


# mail an phone_number verification code
@app.post("/send_code",include_in_schema=False)
async def send_mobile_code(token: models.Token):
    check_admin(token)
    decoded = decode_token(token.token)
    phone_number = db.get_phone_number(decoded.username)
    return mobile.send_verification(phone_number,decoded.username)

def mget_customer_id(username):
    customer_id = db.get_customer_id(username)
    if not customer_id:
        customer_id = pay.make_customer()
        db.set_customer_id(username,customer_id)
    return customer_id

@app.post("/manage_space",include_in_schema=False)
async def manage_space(token: models.Token):
    check_admin(token)    
    username = decode_token(token.token).username
    customer_id = mget_customer_id(username)
    return pay.manage_space(customer_id)

@app.post("/manage_credits",include_in_schema=False)
async def manage_credits(token: models.Token):
    check_admin(token)    
    username = decode_token(token.token).username
    customer_id = mget_customer_id(username)
    return pay.manage_credits(customer_id)


@app.post("/manage_subscriptions",include_in_schema=False)
async def manage_subscription(token: models.Token):
    check_admin(token)    
    decoded = decode_token(token.token)
    customer_id = mget_customer_id(decoded.username)
    return pay.create_portal_session(customer_id)

def mget_business_id(username):
    business_id = db.get_business_id(username)
    if not business_id:
        business_id = pay.make_business()
        db.set_business_id(username,business_id)
    return business_id

@app.post("/manage_business",include_in_schema=False)
async def manage_business(token: models.Token):
    check_admin(token)    
    username = decode_token(token.token).username
    bus_id = mget_business_id(username)
    return pay.create_business_session(bus_id)

@app.post("/business_login",include_in_schema=False)
async def business_login(token: models.Token):
    check_admin(token)    
    username = decode_token(token.token).username
    bus_id = mget_business_id(username)
    return pay.business_login_session(bus_id)


@app.post("/dev_pay")
async def subscription_checkout_session(pay_data:models.PayData):
    certify(models.Token(token=pay_data.token))
    decoded = decode_token(pay_data.token)
    username = decoded.username
    customer_id = mget_customer_id(username)
    bus_id = mget_business_id(pay_data.seller)
    return pay.create_dev_pay_session(customer_id,bus_id,pay_data)

@app.patch("/dev_pay")
async def verify_subscription(pay_data:models.PayData):
    certify(models.Token(token=pay_data.token))
    decoded = decode_token(pay_data.token)
    username = decoded.username
    customer_id = mget_customer_id(username)
    return pay.get_dev_pay_metadata(customer_id,pay_data)

@app.delete("/dev_pay")
async def cancel_subscription(pay_data:models.PayData):
    certify(models.Token(token=pay_data.token))
    decoded = decode_token(pay_data.token)
    username = decoded.username
    customer_id = mget_customer_id(username)
    return pay.cancel_dev_pay_subscription(customer_id,pay_data)

# check that a token is a valid non expired token written by this web10 server.
@app.post("/certify")
async def certify_token(token: models.Token):
    return certify(token)


def certify(token: models.Token):
    try:
        if token.token==None:
            token_data = anon_token()
            print(token_data)
        else:
            token_data = decode_token(token.token, private_key=True)
        if token_data.provider != settings.PROVIDER:
            raise exceptions.TOKEN
        if token_data.username is None:
            raise exceptions.TOKEN
        if token_data.username!="anon" and datetime.utcnow() > datetime.fromisoformat(token_data.expires):
            raise exceptions.TOKEN
    except:
        raise exceptions.TOKEN
    return True


# make a web10 token via. user password flow, or via. submitted token
@app.post("/web10token", response_model=models.Token)
async def create_web10_token(form_data: models.TokenForm):
    token_data = models.TokenData()
    token_data.populate_from_token_form(form_data)
    if (not form_data.password) and (not form_data.token):
        raise exceptions.LOGIN
    try:
        if form_data.password:
            if authenticate_user(form_data.username, form_data.password):
                if form_data.site in settings.CORS_SERVICE_MANAGERS:
                    pass
        elif form_data.token:
            if certify(models.Token(token=form_data.token)):
                if can_mint(decode_token(form_data.token), token_data):
                    pass
    except Exception as e:
        raise e
    token_data.expires = (
        datetime.utcnow() + timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES)
    ).isoformat()
    token_data.provider = settings.PROVIDER
    return {
        "token": jwt.encode(
            token_data.dict(), settings.PRIVATE_KEY, algorithm=settings.ALGORITHM
        )
    }

#checks that usernames are alphanumeric + dashes
def kosher(s):
    return s == ''.join([c for c in s if c.isalnum() or c in ['-']])

# make a new web10 account
@app.post("/signup",include_in_schema=False)
async def signup(form_data: models.SignUpForm):
    form_data = models.dotdict(form_data)
    if settings.BETA_REQUIRED and form_data.betacode != settings.BETA_CODE:
        raise exceptions.BETA
    if not kosher(form_data.username):
        raise exceptions.BAD_USERNAME
    res = db.create_user(form_data, get_password_hash)
    try : 
        mobile.send_verification(form_data.phone,form_data.username)
    except:
        pass
    return res

# gets the homepage stats
@app.post("/stats",include_in_schema=False)
async def stats(skip:int = 0,limit:int = 0):
    apps = db.get_apps(skip,limit)
    users = db.get_user_count()
    size = db.total_size()
    return {
        "apps":apps,
        "users":users,
        "storage":size
        }

# gets the homepage stats
@app.get("/pwa_listing",include_in_schema=False)
async def pwa(url:str):
    try:
        resp = requests.get(url+"manifest.json",{'Accept': 'application/json'},timeout=1)
    except requests.exceptions.RequestException as e:  # This is the correct syntax
        raise exceptions.NO_PWA
    return resp.json()

@app.post("/register_app",include_in_schema=False)
async def register_app(info:dict):
    if "url" not in info:
        return
    # fragments of url that disqualify an app from being registered.
    fragments = [
       "http://",
       "localhost", 
       "file://",
       "vscode-webview:/",
       "--",
       ".html",
       "web10.dev",
       ".id.repl.co"
    ] 
    for fragment in fragments:
        if fragment in info["url"]:
            return
    db.register_app(info)

def subscription_update(user):
    if settings.PAY_REQUIRED:
        credit,space = pay.credit_space(mget_customer_id(user))
    else:
        credit,space = 100000000,100000000
    # also serves to update subscription details from stripe
    db.subscription_update(user,credit,space)
    return credit,space

@app.post("/get_plan",include_in_schema=False)
async def get_plan(token: models.Token):
    check_admin(token)    
    user = decode_token(token.token).username
    credit,space = subscription_update(user)
    return {"space":space,"credits":credit,"used_space":db.get_collection_size(user)}

#####################################################
############ Web10 Routes Managed By You ############
#####################################################

def check(user):
    star = db.get_star(user)
    if settings.VERIFY_REQUIRED and not star["verified"]:
        raise exceptions.VERIFY
    if star["last_replenish"].month != datetime.now().month:
        subscription_update(user)
        db.replenish(user)
    if settings.PAY_REQUIRED and star["credit_limit"] < star["credits_spent"]:
        raise exceptions.TIME
    if settings.PAY_REQUIRED and star["space_limit"] < db.get_collection_size(user):
        raise exceptions.SPACE
    return True

@app.post("/{user}/{service}", tags=["web10"])
async def create_records(user, service, token: models.Token,b_t:BackgroundTasks):
    if not is_permitted(token, user, service, "create"):
        raise exceptions.CRUD
    check(user)
    res = db.create(user, service, token.query)
    b_t.add_task(db.charge,user,"create")
    return res

# web10 uses patch for get in CRUD since get requests can't have a secure body
@app.patch("/{user}/{service}", tags=["web10"])
async def read_records(user, service, token: models.Token,b_t:BackgroundTasks):
    if not is_permitted(token, user, service, "read"):
        raise exceptions.CRUD
    if service != "services" : check(user)
    if token.query==None:token.query={}
    res = db.read(user, service, token.query)
    # dont charge for "services"
    if service =="services": return res
    b_t.add_task(db.charge,user,"read")
    return res


@app.put("/{user}/{service}", tags=["web10"])
async def update_records(user, service, token: models.Token,b_t:BackgroundTasks):
    if not is_permitted(token, user, service, "update"):
        raise exceptions.CRUD
    check(user)
    res = db.update(user, service, token.query, token.update)
    b_t.add_task(db.charge,user,"update")
    return res



@app.delete("/{user}/{service}", tags=["web10"])
async def delete_records(user, service, token: models.Token,b_t:BackgroundTasks):
    if not is_permitted(token, user, service, "delete"):
        raise exceptions.CRUD
    if service != "services" : check(user)
    res = db.delete(user, service, token.query)
    # dont charge for "services"
    if service =="services": return res
    b_t.add_task(db.charge,user,"delete")
    return res
