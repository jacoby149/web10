from datetime import datetime

from fastapi import APIRouter, BackgroundTasks

import app.exceptions as exceptions
from app.models.auth import Token
import app.settings as settings
from app.services import mongo as db
from app.services.auth import check_admin, decode_token, is_permitted
from app.services import stripe as pay

router = APIRouter()


def subscription_update(user):
    if settings.PAY_REQUIRED:
        credit, space = pay.credit_space(mget_customer_id(user))
    else:
        credit, space = 100000000, 100000000
    db.subscription_update(user, credit, space)
    return credit, space


def check(user):
    star = db.get_star(user)
    if settings.VERIFY_REQUIRED and not star["verified"]:
        raise exceptions.VERIFY
    if star["last_replenish"].month != datetime.now().month:
        subscription_update(user)
        db.replenish(user)
    if settings.PAY_REQUIRED and star["credit_limit"] < star["credits_spent"]:
        raise exceptions.TIME
    if settings.PAY_REQUIRED and star["space_limit"] < db.get_collection_size(user):
        raise exceptions.SPACE
    return True


def mget_customer_id(username):
    customer_id = db.get_customer_id(username)
    if not customer_id:
        customer_id = pay.make_customer()
        db.set_customer_id(username, customer_id)
    return customer_id


def mget_business_id(username):
    business_id = db.get_business_id(username)
    if not business_id:
        business_id = pay.make_business()
        db.set_business_id(username, business_id)
    return business_id


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
