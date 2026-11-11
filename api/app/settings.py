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
# Usernames that may read/write the node config when no admins list has been
# saved yet (bootstrap). Once an admin edits the list in the Node Config UI,
# that saved list takes over. Override with the DEFAULT_ADMINS env (comma-sep).
DEFAULT_ADMINS = ["jacoby149"]
ALGORITHM = "HS256"
PRIVATE_KEY = "8cbec8....."
TOKEN_EXPIRE_MINUTES = 87840
# Separate, durable >=32-character secret for analytics pseudonyms/context.
# Never expose this in /telemetry or reuse the authentication signing key.
POSTHOG_IDENTITY_SECRET = os.getenv("POSTHOG_IDENTITY_SECRET", "")
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
# E2E / local mode — when truthy, the recovery flow uses a deterministic
# in-memory code store instead of calling Twilio (CI has no real credentials).
# Never set in prod. See services/twilio.py.
TWILIO_E2E = ""
# Contact delivery is opt-in. Provision a private conditional-write S3 bucket
# and a separate persistent Fernet key; never reuse PRIVATE_KEY.
CONTACT_DELIVERY_STATE_BUCKET = os.getenv("CONTACT_DELIVERY_STATE_BUCKET", "")
CONTACT_DELIVERY_KEY = os.getenv("CONTACT_DELIVERY_KEY", "")
CONTACT_AUTH_URL = os.getenv("CONTACT_AUTH_URL", "")
GMAIL_CLIENT_ID = os.getenv("GMAIL_CLIENT_ID", "")
GMAIL_CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET", "")
GMAIL_REDIRECT_URI = os.getenv("GMAIL_REDIRECT_URI", "")
STRIPE_STATUS = "live"
STRIPE_TEST_KEY = "sk_test_51Khy....."
STRIPE_LIVE_KEY = "sk_live_51Khyui......"
DEV_PAY_PCT = 98

# S3-compatible object storage (media service)
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://minio:9000")

# ClickHouse v3 OLAP store
CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "clickhouse")
CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
CLICKHOUSE_DATABASE = os.getenv("CLICKHOUSE_DATABASE", "web10")
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "web10")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "web10")
CLICKHOUSE_SECURE = os.getenv("CLICKHOUSE_SECURE", "false").lower() == "true"
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

# R2: explicit opt-in; session metadata is never stored in the public media bucket.
RESUMABLE_UPLOADS_ENABLED = os.getenv("RESUMABLE_UPLOADS_ENABLED", "false").strip().lower() in ("true", "1", "yes")
RESUMABLE_STATE_BUCKET = os.getenv("RESUMABLE_STATE_BUCKET", "web10-upload-state")

# Separate media-only credentials; never reuse the node authentication key.
_media_enabled = os.getenv("MEDIA_DELIVERY_ENABLED", "false").strip().lower()
if _media_enabled not in ("true", "false", "1", "0", "yes", "no"):
    raise ValueError("invalid MEDIA_DELIVERY_ENABLED")
MEDIA_DELIVERY_ENABLED = _media_enabled in ("true", "1", "yes")
MEDIA_DELIVERY_BASE = os.getenv("MEDIA_DELIVERY_BASE", "")
MEDIA_DELIVERY_ISSUER = os.getenv("MEDIA_DELIVERY_ISSUER", "")
MEDIA_DELIVERY_AUDIENCE = os.getenv("MEDIA_DELIVERY_AUDIENCE", "")
MEDIA_DELIVERY_KID = os.getenv("MEDIA_DELIVERY_KID", "")
MEDIA_DELIVERY_PRIVATE_KEY = os.getenv("MEDIA_DELIVERY_PRIVATE_KEY", "")
MEDIA_DELIVERY_TTL = int(os.getenv("MEDIA_DELIVERY_TTL", "60"))

# HLS transcoding (D44 — the video spine). Renditions are "WxH@bitrate"
# pairs, lowest first (the player starts low and adapts up). Override the
# list per environment (e2e uses fewer/shorter renditions for speed).
HLS_RENDITIONS = os.getenv("HLS_RENDITIONS", "640x360@1M,1280x720@3M,1920x1080@6M")
# TTL for the JWT that signs the HLS manifest + every segment (10 minutes —
# the token expiry is the group-membership re-check cadence).
HLS_SIG_TTL = int(os.getenv("HLS_SIG_TTL", "600"))
# Concurrent transcodes. 1 keeps a single node's CPU from being eaten by the
# worker (a transcode must not starve request handling — D43's pool is
# separate, but ffmpeg is CPU-heavy either way).
HLS_WORKER_CONCURRENCY = int(os.getenv("HLS_WORKER_CONCURRENCY", "1"))
# Absolute per-command wall-clock ceiling. Renditions use a duration-aware
# budget within it; short clips/thumbnails keep a ten-minute maximum.
HLS_FFMPEG_TIMEOUT = int(os.getenv("HLS_FFMPEG_TIMEOUT", "21600"))

# Production read-gate algorithm; rollback never disables authorization.
READABLE_RESOLUTION_MODE = os.getenv("READABLE_RESOLUTION_MODE", "batched").strip().lower()
if READABLE_RESOLUTION_MODE not in ("batched", "per-group"):
    raise ValueError("READABLE_RESOLUTION_MODE must be batched or per-group")

# ── Query-engine evaluation seams (the paper's access-control cost function) ──
# Test-mode flags for the three-line ablation (research/digital-ocean-thinking.md).
# All default OFF: production behavior is unchanged unless a flag is set. They
# exist so the experiment can measure the access-control layer in isolation
# (C: stub the scan), a diagnostic no-policy baseline (A), and
# the per-group vs. batched readable-resolution cost. The KB records the cost +
# the fix (query-engine.md §"Readable-set resolution"); these are the seams the
# experiment drives. Never enable in a public node — A bypasses the I3 boundary
# and C returns synthetic rows.
# C: stub the columnar scan. When truthy, /v3/query returns a fixed N-row
# synthetic result instead of running the compiled SQL — isolates the policy
# layer (auth→…→compile→serialize) from the engine. N = QUERY_EVAL_STUB_ROWS.
QUERY_EVAL_STUB_EXECUTE = os.getenv("QUERY_EVAL_STUB_EXECUTE", "").lower() in ("1", "true", "yes")
QUERY_EVAL_STUB_ROWS = int(os.getenv("QUERY_EVAL_STUB_ROWS", "20"))
# A: the no-policy baseline. When truthy, /v3/query skips the readable-set
# resolution + the boundary-CTE scoping (runs the caller's SQL unscoped) — the
# credited ClickHouse baseline the causal overhead (B−A) is computed against.
QUERY_EVAL_NO_POLICY = os.getenv("QUERY_EVAL_NO_POLICY", "").lower() in ("1", "true", "yes")
# Unset follows production; explicit research overrides retain both algorithms.
QUERY_EVAL_READABLE_MODE = os.getenv("QUERY_EVAL_READABLE_MODE", "").strip().lower()
if QUERY_EVAL_READABLE_MODE not in ("", "per-group", "batched"):
    raise ValueError("QUERY_EVAL_READABLE_MODE must be empty, batched or per-group")

# ── Node version identification (the update-check foundation) ────────────
# The node's OWN version. Baked into the image at build time: api/Dockerfile
# (repo-root context) writes /web10/VERSION from the top line of the
# CHANGELOG — the project's release version, the same number cd.yml/
# deploy.yml bake into the status pill — so a Portainer GitOps rebuild with
# no env vars still ships the right one. An explicit WEB10_VERSION env wins
# (dev/e2e volume mounts shadow the baked file — the service then reports
# "unknown" honestly). Consumed by app/services/update_check.py.
WEB10_VERSION = os.getenv("WEB10_VERSION", "")

# Load environment variables into settings params.
for v in list(globals()):
    # Evaluation values above already parse their environment types. In
    # particular, the string "0" must not enable a policy-bypass flag.
    if v == "READABLE_RESOLUTION_MODE" or v.startswith(("QUERY_EVAL_", "MEDIA_DELIVERY_", "RESUMABLE_")):
        continue
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
    print("Settings loaded; configuration values omitted.")
