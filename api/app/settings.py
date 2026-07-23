import os

#################################
##### configurable variables ####
#################################

PROVIDER = "api.localhost"
# The authenticator trust list: sites that may handle consent and mint
# tokens for other apps (see services/auth.py). This is a real trust
# boundary and must stay narrow — authenticators only, never all frontends.
# Browser CORS is handled separately in main.py (wide open by design).
CORS_SERVICE_MANAGERS = """
    auth.localhost,
    auth.web10.app,
    auth.dev.web10.app
"""
DB = "testing"
DB_URL = "mongodb+srv://web10:jSol....."
# Usernames that may read/write the node config when no admins list has been
# saved yet (bootstrap). Once an admin edits the list in the Node Config UI,
# that saved list takes over. Override with the DEFAULT_ADMINS env (comma-sep).
DEFAULT_ADMINS = ["jacoby149"]
ALGORITHM = "HS256"
PRIVATE_KEY = "8cbec8....."
TOKEN_EXPIRE_MINUTES = 87840
COST_CREATE = 0.000025
COST_UPDATE = 0.000025
COST_READ = 0.000005
COST_DELETE = 0.000002
COST_AGGREGATE = 0.000005  # per pipeline stage
AGG_MAX_STAGES = 20
AGG_MAX_TIME_MS = 2000
AGG_MAX_DOCS = 1000
METERING_EVENTS_MAX = 100000
FREE_CREDITS = 0.10
FREE_SPACE = 8
BETA_REQUIRED = False
VERIFY_REQUIRED = False
BETA_CODE = "web10betacode"
TWILIO_SERVICE = "VAbce...."
TWILIO_ACCOUNT_SID = "AC3594...."
TWILIO_AUTH_TOKEN = "460d....."
TWILIO_NUMBER = "+12764004437"
STRIPE_STATUS = "live"
STRIPE_TEST_KEY = "sk_test_51Khy....."
STRIPE_LIVE_KEY = "sk_live_51Khyui......"
DEV_PAY_PCT = 98

# S3-compatible object storage (media service)
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://minio:9000")
# Presigned URLs are handed to the BROWSER, so they must embed a host the
# browser can reach over the page's scheme (HTTPS in prod). S3_ENDPOINT is the
# INTERNAL address the API container uses to talk to MinIO (e.g.
# http://web10-prod-minio:9000) — signing browser URLs with it produces
# unreachable, HTTP-only links that trip Mixed-Content on an HTTPS page.
# S3_PUBLIC_ENDPOINT is the public host (e.g. https://minio.web10.app) used
# ONLY to sign presigned URLs; signing is offline so the API never connects to
# it. Defaults to S3_ENDPOINT so local/e2e (one host for both) are unchanged.
S3_PUBLIC_ENDPOINT = os.getenv("S3_PUBLIC_ENDPOINT", S3_ENDPOINT)
S3_BUCKET = os.getenv("S3_BUCKET", "web10-media")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "minioadmin")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "minioadmin")
S3_REGION = os.getenv("S3_REGION", "us-east-1")
S3_USE_SSL = os.getenv("S3_USE_SSL", "false").lower() == "true"
# SSL for the public signing endpoint; defaults to on when it's an https URL.
S3_PUBLIC_USE_SSL = (
    os.getenv(
        "S3_PUBLIC_USE_SSL", "true" if S3_PUBLIC_ENDPOINT.startswith("https") else str(S3_USE_SSL).lower()
    ).lower()
    == "true"
)
UPLOAD_URL_EXPIRY = int(os.getenv("UPLOAD_URL_EXPIRY", "300"))
READ_URL_EXPIRY = int(os.getenv("READ_URL_EXPIRY", "60"))
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", "524288000"))

# Load environment variables into settings params.
for v in list(globals()):
    env_val = os.getenv(v)
    if env_val is not None:
        globals()[v] = env_val

# Initiate some quality of life variables around the config.
CORS_SERVICE_MANAGERS = [site.strip() for site in CORS_SERVICE_MANAGERS.split(",")]
COST = {}
COST["create"] = COST_CREATE
COST["read"] = COST_READ
COST["update"] = COST_UPDATE
COST["delete"] = COST_DELETE
COST["aggregate"] = COST_AGGREGATE

if __name__ == "__main__":
    print(globals())
