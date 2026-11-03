import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

import app.exceptions as exceptions
from app.models.auth import Token
from app.services.auth import certify, decode_token
from app.v3.services import clickhouse as ch
from app.v3.services.domains import normalize_domain, verify_txt

router = APIRouter(tags=["account"])
logger = logging.getLogger("web10-domains")


class DomainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str | None = None
    domain: str = Field(max_length=1024)


def _caller(data: DomainRequest) -> str:
    if not data.token:
        raise exceptions.TOKEN
    certify(Token(token=data.token))
    username = decode_token(data.token).username
    if not username or username == "anon" or ch.get_user(username) is None:
        raise exceptions.TOKEN
    return username


def _domain(data: DomainRequest) -> str:
    try:
        return normalize_domain(data.domain)
    except ValueError:
        raise HTTPException(400, detail="invalid_domain") from None


@router.post("/domains/verify")
def verify_domain(data: DomainRequest):
    username = _caller(data)
    domain = _domain(data)
    current = ch.get_user_domain(username)
    error = None
    if current and current["domain"] and current["domain"] != domain:
        error = "release_required"
    elif ch.domain_claimed_by_other(domain, username):
        error = "domain_taken"
    else:
        from app import settings

        error = verify_txt(domain, settings.PROVIDER, username)
    if error:
        logger.info("[domains] verification denied code=%s", error)
        return JSONResponse(status_code=400, content={"domain": domain, "verified": False, "error": error})
    # Recheck after DNS, but do not mistake this check/write pair for a
    # distributed uniqueness constraint: ClickHouse provides no CAS here.
    current = ch.get_user_domain(username)
    if current is None:
        raise exceptions.TOKEN
    if current["domain"] and current["domain"] != domain:
        return JSONResponse(status_code=400, content={"domain": domain, "verified": False, "error": "release_required"})
    if ch.domain_claimed_by_other(domain, username):
        return JSONResponse(status_code=400, content={"domain": domain, "verified": False, "error": "domain_taken"})
    ch.set_domain(username, domain, 1)
    logger.info("[domains] verification stored")
    return {"domain": domain, "verified": True, "provider": settings.PROVIDER, "user": username}


@router.post("/domains/release")
def release_domain(data: DomainRequest):
    username = _caller(data)
    domain = _domain(data)
    current = ch.get_user_domain(username)
    if not current or current["domain"] != domain:
        raise HTTPException(400, detail="domain_mismatch")
    ch.set_domain(username, "", 0)
    logger.info("[domains] alias released")
    return {"domain": domain, "released": True}


@router.get("/users/{username}/domain")
def user_domain(username: str):
    current = ch.get_user_domain(username)
    return {"username": username, **(current or {"domain": None, "verified": False})}
