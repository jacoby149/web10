import os

# url of the web10 server online
PROVIDER = os.environ.get("PROVIDER")
if PROVIDER == None:
    PROVIDER = "api.localhost"

CORS_SERVICE_MANAGERS = os.environ.get("CORS_SERVICE_MANAGERS")
if CORS_SERVICE_MANAGERS == None:
    CORS_SERVICE_MANAGERS = ["auth.localhost,auth.web10.app,auth.web10.dev"]

# https://www.mongodb.com/atlas/database
DB_URL = os.environ.get("DB_URL")
if DB_URL == None:
    DB_URL = "mongodb+srv://web10:web10@cluster0.jnagr.mongodb.net/myFirstDatabase?retryWrites=true&w=majority"

ALGORITHM = os.environ.get("ALGORITHM")
if ALGORITHM == None:
    ALGORITHM = "HS256"

PRIVATE_KEY = os.environ.get("PRIVATE_KEY")
if PRIVATE_KEY == None:
    PRIVATE_KEY = "01d25e094faa6ca2556c818166b1a9563b93f9099f6f0f4caa6cf63b88e5d3e1"

TOKEN_EXPIRE_MINUTES = os.environ.get("TOKEN_EXPIRE_MINUTES")
if TOKEN_EXPIRE_MINUTES == None:
    TOKEN_EXPIRE_MINUTES = 30

CREATE = os.environ.get("CREATE")
if CREATE == None:
    CREATE = 1.0/360

UPDATE = os.environ.get("UPDATE")
if UPDATE == None:
    UPDATE = 1.0/360

READ = os.environ.get("READ")
if READ == None:
    READ = 1.0/1800

DELETE = os.environ.get("DELETE")
if DELETE == None:
    DELETE = 1.0/5400


FREE_CREDITS = os.environ.get("FREE_CREDITS")
if FREE_CREDITS == None:
    FREE_CREDITS = 10

FREE_SPACE = os.environ.get("FREE_SPACE")
if FREE_SPACE == None:
    FREE_SPACE = 64

COST = {"create":CREATE,"read":READ,"update":UPDATE,"delete":DELETE}

BETA_CODE = os.environ.get("BETA_CODE")
if BETA_CODE == None:
    BETA_CODE = "weeb10beta"

BETA_REQUIRED = False
VERIFY_REQUIRED = True
PAY_REQUIRED = True

# plugin specific settings
TWILIO_SERVICE=""
TWILIO_ACCOUNT_SID = ""
TWILIO_AUTH_TOKEN = ""

# lahu-qxvl-xdxx-kdff-nnog one time stripey
if PROVIDER == "api.localhost" : 
    STRIPE_KEY = "sk_test_"
    STRIPE_CREDIT_SUB_ID = "price_"
    STRIPE_SPACE_SUB_ID = "price_"
else : 
    STRIPE_KEY = "sk_live"
    STRIPE_CREDIT_SUB_ID = "price_"
    STRIPE_SPACE_SUB_ID = "price_"

# 5% + 30 cents
DEV_PAY_PCT = 98