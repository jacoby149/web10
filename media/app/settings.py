import os

#################################
##### configurable variables ####
#################################

# web10 node provider (the API that issued tokens)
PROVIDER = os.getenv("PROVIDER", "api.localhost")

# JWT signing key (shared with the node API)
ALGORITHM = os.getenv("ALGORITHM", "HS256")
PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")

# MongoDB connection
DB_URL = os.getenv("DB_URL", "mongodb://api:27017")
DB = os.getenv("DB", "testing")

# S3-compatible object storage
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://minio:9000")
S3_BUCKET = os.getenv("S3_BUCKET", "web10-media")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "minioadmin")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "minioadmin")
S3_REGION = os.getenv("S3_REGION", "us-east-1")
S3_USE_SSL = os.getenv("S3_USE_SSL", "false").lower() == "true"

# Presigned URL lifetimes (seconds)
UPLOAD_URL_EXPIRY = int(os.getenv("UPLOAD_URL_EXPIRY", "300"))
READ_URL_EXPIRY = int(os.getenv("READ_URL_EXPIRY", "60"))

# Max upload size (bytes) - 500MB default
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", "524288000"))

# CORS origins
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
