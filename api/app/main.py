import logging

import jwt
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import app.docs as docs
import app.exceptions as exceptions
import app.settings as settings
from app.endpoints import auth, crud, discover, media, payments, public, schemas, system

app = FastAPI(
    title="web10",
    openapi_tags=docs.tags_metadata,
    description=docs.description,
    version="10.0.0.0",
    terms_of_service="http://example.com/terms/",
)


def _cors_origins():
    """Build allow-listed CORS origins from settings."""
    origins = set()
    for host in settings.CORS_ALLOW_ORIGINS:
        origins.add(f"http://{host}")
        origins.add(f"https://{host}")
    # The API itself may serve the UI or OpenAPI docs
    origins.add(f"http://{settings.PROVIDER}")
    origins.add(f"https://{settings.PROVIDER}")
    return list(origins)


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(payments.router)
app.include_router(system.router)
app.include_router(media.router)
# Specific routers must be registered before crud.router, which has
# catch-all patterns (/{user}/{service}) that would shadow these routes.
app.include_router(discover.router)
app.include_router(schemas.router)
app.include_router(public.router)
app.include_router(crud.router)


# Map bare Exception strings (raised by auth.py / services) to HTTPExceptions.
_EXCEPTION_MAP = {
    "LOGIN": exceptions.LOGIN,
    "AUTH": exceptions.AUTH,
    "TOKEN": exceptions.TOKEN,
    "CRUD": exceptions.CRUD,
    "MINT": exceptions.MINT,
    "STAR": exceptions.STAR,
    "DSTAR": exceptions.DSTAR,
    "RESERVED": exceptions.RESERVED,
    "NO_USER": exceptions.NO_USER,
    "NO_SELLER": exceptions.NO_SELLER,
    "EXISTS": exceptions.EXISTS,
    "PHONE_NUMBER_TAKEN": exceptions.PHONE_NUMBER_TAKEN,
    "PHONE_NUMBER_MISSING": exceptions.PHONE_NUMBER_MISSING,
    "NOT_ADMIN": exceptions.NOT_ADMIN,
    "VERIFY": exceptions.VERIFY,
    "WRONG_CODE": exceptions.WRONG_CODE,
    "PIPELINE": exceptions.PIPELINE,
    "PIPELINE_CAP": exceptions.PIPELINE_CAP,
    "TIME": exceptions.TIME,
    "SPACE": exceptions.SPACE,
    "BAD_NUM": exceptions.BAD_NUM,
    "BAD_USERNAME": exceptions.BAD_USERNAME,
    "BETA": exceptions.BETA,
    "BUSINESS_NOT_READY": exceptions.BUSINESS_NOT_READY,
    "PHONE_NUMBER_NOT_REGISTERED": exceptions.PHONE_NUMBER_NOT_REGISTERED,
    "SCHEMA_NOT_FOUND": exceptions.SCHEMA_NOT_FOUND,
    "NOT_AUTHOR": exceptions.NOT_AUTHOR,
    "ENTRY_NOT_FOUND": exceptions.ENTRY_NOT_FOUND,
    "SCHEMA_INVALID": exceptions.SCHEMA_INVALID,
}


def _mapped_response(exc: Exception):
    args = exc.args
    if args and isinstance(args[0], str) and args[0] in _EXCEPTION_MAP:
        mapped = _EXCEPTION_MAP[args[0]]
        return JSONResponse(
            status_code=mapped.status_code,
            content={"detail": mapped.detail},
            headers=mapped.headers,
        )
    return None


@app.exception_handler(jwt.exceptions.PyJWTError)
async def jwt_error_handler(request: Request, exc: jwt.exceptions.PyJWTError):
    """Forged, expired, or malformed JWTs → 401 TOKEN."""
    return JSONResponse(
        status_code=exceptions.TOKEN.status_code,
        content={"detail": exceptions.TOKEN.detail},
        headers=exceptions.TOKEN.headers,
    )


@app.exception_handler(Exception)
async def bare_exception_handler(request: Request, exc: Exception):
    resp = _mapped_response(exc)
    if resp is not None:
        return resp
    logging.error(f"{request}: unhandled {type(exc).__name__}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"status_code": 500, "message": "internal server error", "data": None},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    exc_str = f"{exc}".replace("\n", " ").replace("   ", " ")
    logging.error(f"{request}: {exc_str}")
    return JSONResponse(
        content={"status_code": 10422, "message": exc_str, "data": None},
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    )
