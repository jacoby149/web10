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
    PRIVATE_KEY = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"

TOKEN_EXPIRE_MINUTES = os.environ.get("TOKEN_EXPIRE_MINUTES")
if TOKEN_EXPIRE_MINUTES == None:
    TOKEN_EXPIRE_MINUTES = 30

BETA_CODE = os.environ.get("BETA_CODE")
if BETA_CODE == None:
    BETA_CODE = "weeb10beta"
