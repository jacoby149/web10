import os
import app.pyinfisical as secret_manager


#################################
##### configurable variables ####
#################################

PROVIDER = "api.localhost"
CORS_SERVICE_MANAGERS = """
    auth.localhost, 
    auth.web10.app, 
    auth.web10.dev
"""
DB = "testing"
DB_URL = "mongodb+srv://web10:jSol....."
ALGORITHM = "HS256"
PRIVATE_KEY = "8cbec8....."
TOKEN_EXPIRE_MINUTES = 87840
COST_CREATE =  0.000025
COST_UPDATE = 0.000025
COST_READ = 0.000005
COST_DELETE = 0.000002
FREE_CREDITS = 0.10
FREE_SPACE = 8
BETA_REQUIRED = False
VERIFY_REQUIRED = False
PAY_REQUIRED = False
BETA_CODE = "web10betacode"
TWILIO_SERVICE = "VAbce...."
TWILIO_ACCOUNT_SID = "AC3594...."
TWILIO_AUTH_TOKEN = "460d....."
TWILIO_NUMBER = "+12764004437"
STRIPE_STATUS = "live"
STRIPE_TEST_KEY = "sk_test_51Khy....."
STRIPE_TEST_CREDIT_SUB_ID = "price_1Kh...."
STRIPE_TEST_SPACE_SUB_ID = "price_1Ki...."
STRIPE_LIVE_KEY = "sk_live_51Khyui......"
STRIPE_LIVE_CREDIT_SUB_ID = "price_1Kkb....."
STRIPE_LIVE_SPACE_SUB_ID = "price_1Kkb7....."    
DEV_PAY_PCT = 98

# load secrets
secrets = secret_manager.get_secrets()

# goes through the above config variables 
# checks if env vars of those names exist and sets them if they do
vars = [v for v in globals()]
for v in vars :
    # Load secret variables into settings params.
    if v in secrets:
        globals()[v] = secrets[v]
    # Load environment variables into settings params.
    env_val = os.getenv(v)
    if env_val == None:
        continue
    else:
        globals()[v] = env_val

# Initiate some quality of life variables around the config.
CORS_SERVICE_MANAGERS = [site.strip() for site in
                         CORS_SERVICE_MANAGERS.split(",")]
COST = {}
COST["create"] = COST_CREATE 
COST["read"] = COST_READ
COST["update"] = COST_UPDATE
COST["delete"] = COST_DELETE

if __name__ == "__main__":
    print(globals())
