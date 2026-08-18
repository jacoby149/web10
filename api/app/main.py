import logging
import uuid

import jwt
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import app.docs as docs
import app.exceptions as exceptions
from app.endpoints import auth, system
from app.middleware import log_requests
from app.v3 import endpoints as v3

app = FastAPI(
    title="web10",
    openapi_tags=docs.tags_metadata,
    description=docs.description,
    version="10.0.0.0",
    terms_of_service="http://example.com/terms/",
)


# CORS is intentionally wide open. The API's security boundary is the
# scoped, expiring token in each request body (certify + is_permitted +
# the per-service ACL), NOT the browser origin. web10 apps are stateless
# frontends anyone can build and host anywhere, so gatekeeping origins
# would only break legitimate apps without adding security. The token
# never rides on a browser cookie (the SDK sends it in the request body),
# so we don't need — and deliberately don't enable — credentialed CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(log_requests)

app.include_router(auth.router)
app.include_router(system.router)
app.include_router(v3.router)


# Map bare Exception strings (raised by auth.py / services) to HTTPExceptions.
_EXCEPTION_MAP = {
    "LOGIN": exceptions.LOGIN,
    "AUTH": exceptions.AUTH,
    "TOKEN": exceptions.TOKEN,
    "CRUD": exceptions.CRUD,
    "NO_USER": exceptions.NO_USER,
    "EXISTS": exceptions.EXISTS,
    "PHONE_NUMBER_TAKEN": exceptions.PHONE_NUMBER_TAKEN,
    "PHONE_NUMBER_MISSING": exceptions.PHONE_NUMBER_MISSING,
    "NOT_ADMIN": exceptions.NOT_ADMIN,
    "VERIFY": exceptions.VERIFY,
    "WRONG_CODE": exceptions.WRONG_CODE,
    "BAD_NUM": exceptions.BAD_NUM,
    "BAD_USERNAME": exceptions.BAD_USERNAME,
    "BETA": exceptions.BETA,
    "PHONE_NUMBER_NOT_REGISTERED": exceptions.PHONE_NUMBER_NOT_REGISTERED,
}


# A handler registered for the base Exception is installed by Starlette in the
# outermost ServerErrorMiddleware, which WRAPS the CORSMiddleware added above —
# so responses produced by `bare_exception_handler` never pass back through CORS
# and ship WITHOUT `Access-Control-Allow-Origin`. To a browser that reads as a
# CORS failure ("No 'Access-Control-Allow-Origin' header is present"), masking
# every real error — e.g. an expired token, where services raise a bare
# `Exception("TOKEN")` — as an opaque "Failed to fetch". CORS is wildcard +
# credential-less (see above), so we stamp the header on every handler response
# ourselves; for handlers that DO run inside CORSMiddleware (PyJWTError,
# RequestValidationError) the middleware simply overwrites it with the same
# value, so this is safe and idempotent.
def _with_cors(headers: dict | None = None) -> dict:
    merged = dict(headers or {})
    merged["access-control-allow-origin"] = "*"
    return merged


def _mapped_response(exc: Exception):
    args = exc.args
    if args and isinstance(args[0], str) and args[0] in _EXCEPTION_MAP:
        mapped = _EXCEPTION_MAP[args[0]]
        return JSONResponse(
            status_code=mapped.status_code,
            content={"detail": mapped.detail},
            headers=_with_cors(mapped.headers),
        )
    return None


@app.exception_handler(jwt.exceptions.PyJWTError)
async def jwt_error_handler(request: Request, exc: jwt.exceptions.PyJWTError):
    """Forged, expired, or malformed JWTs → 401 TOKEN."""
    return JSONResponse(
        status_code=exceptions.TOKEN.status_code,
        content={"detail": exceptions.TOKEN.detail},
        headers=_with_cors(exceptions.TOKEN.headers),
    )


@app.exception_handler(Exception)
async def bare_exception_handler(request: Request, exc: Exception):
    resp = _mapped_response(exc)
    if resp is not None:
        return resp
    # Unhandled exception. Surface the type + message (and a correlation id) in
    # the response body so the failure is diagnosable from the browser console
    # without shelling into the box to read the traceback. This is safe: the
    # code is open source, so the exception class + message reveal nothing the
    # source doesn't. The full traceback (which can carry runtime secrets — the
    # star record's password hash, tokens, another user's data) stays in the
    # server log ONLY, keyed to the same error_id for correlation.
    error_id = uuid.uuid4().hex[:12]
    logging.error(f"{request}: [{error_id}] unhandled {type(exc).__name__}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "status_code": 500,
            "message": "internal server error",
            "error": type(exc).__name__,
            "detail": str(exc),
            "error_id": error_id,
            "data": None,
        },
        headers=_with_cors(),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    exc_str = f"{exc}".replace("\n", " ").replace("   ", " ")
    logging.error(f"{request}: {exc_str}")
    return JSONResponse(
        content={"status_code": 10422, "message": exc_str, "data": None},
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        headers=_with_cors(),
    )
