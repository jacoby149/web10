from datetime import datetime

from fastapi import APIRouter, BackgroundTasks

import app.exceptions as exceptions
from app.models.auth import Token
import app.settings as settings
from app.services import documentdb as db
from app.services.auth import check_admin, decode_token, is_permitted

router = APIRouter()


def check(user):
    star = db.get_star(user)
    if settings.VERIFY_REQUIRED and not star["verified"]:
        raise exceptions.VERIFY
    if star["last_replenish"].month != datetime.now().month:
        db.subscription_update(user, settings.FREE_CREDITS, settings.FREE_SPACE)
        db.replenish(user)
    if star["credit_limit"] < star["credits_spent"]:
        raise exceptions.TIME
    if star["space_limit"] < db.get_collection_size(user):
        raise exceptions.SPACE
    return True


@router.post("/{user}/{service}", tags=["web10"])
async def create_records(user: str, service: str, token: Token, b_t: BackgroundTasks):
    if not is_permitted(token, user, service, "create"):
        raise exceptions.CRUD
    check(user)
    res = db.create(user, service, token.query)
    b_t.add_task(db.charge, user, "create")
    return res


@router.patch("/{user}/{service}", tags=["web10"])
async def read_records(user: str, service: str, token: Token, b_t: BackgroundTasks):
    if not is_permitted(token, user, service, "read"):
        raise exceptions.CRUD
    if service != "services":
        check(user)
    if token.query is None:
        token.query = {}
    res = db.read(user, service, token.query)
    if service == "services":
        return res
    b_t.add_task(db.charge, user, "read")
    return res


@router.post("/{user}/{service}/aggregate", tags=["web10"])
async def aggregate_records(user: str, service: str, token: Token, b_t: BackgroundTasks):
    if not is_permitted(token, user, service, "read"):
        raise exceptions.CRUD
    check(user)
    pipeline = token.pipeline if token.pipeline is not None else []
    res = db.aggregate(user, service, pipeline)
    b_t.add_task(db.charge, user, "aggregate", max(1, len(pipeline)))
    return res


@router.put("/{user}/{service}", tags=["web10"])
async def update_records(user: str, service: str, token: Token, b_t: BackgroundTasks):
    if not is_permitted(token, user, service, "update"):
        raise exceptions.CRUD
    check(user)
    res = db.update(user, service, token.query, token.update)
    b_t.add_task(db.charge, user, "update")
    return res


@router.delete("/{user}/{service}", tags=["web10"])
async def delete_records(user: str, service: str, token: Token, b_t: BackgroundTasks):
    if not is_permitted(token, user, service, "delete"):
        raise exceptions.CRUD
    if service != "services":
        check(user)
    res = db.delete(user, service, token.query)
    if service == "services":
        return res
    b_t.add_task(db.charge, user, "delete")
    return res