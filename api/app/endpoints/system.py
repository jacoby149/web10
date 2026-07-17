import requests
from fastapi import APIRouter

import app.exceptions as exceptions
from app.models.auth import Token
import app.settings as settings
from app.services import documentdb as db
from app.services import stripe as pay
from app.services.auth import check_admin, decode_token

router = APIRouter()


@router.post("/stats", include_in_schema=False)
async def stats(skip: int = 0, limit: int = 0):
    apps = db.get_apps(skip, limit)
    users = db.get_user_count()
    size = db.total_size()
    return {"apps": apps, "users": users, "storage": size}


@router.get("/pwa_listing", include_in_schema=False)
async def pwa(url: str):
    try:
        resp = requests.get(url + "manifest.json", {"Accept": "application/json"}, timeout=1)
    except requests.exceptions.RequestException:
        raise exceptions.NO_PWA
    return resp.json()


@router.post("/register_app", include_in_schema=False)
async def register_app(info: dict):
    if "url" not in info:
        return
    fragments = [
        "http://",
        "localhost",
        "file://",
        "vscode-webview:/",
        "--",
        ".html",
        "web10.dev",
        ".id.repl.co",
    ]
    for fragment in fragments:
        if fragment in info["url"]:
            return
    db.register_app(info)


def mget_customer_id(username):
    customer_id = db.get_customer_id(username)
    if not customer_id:
        customer_id = pay.make_customer()
        db.set_customer_id(username, customer_id)
    return customer_id


def subscription_update(user):
    if settings.PAY_REQUIRED:
        credit, space = pay.credit_space(mget_customer_id(user))
    else:
        credit, space = 100000000, 100000000
    db.subscription_update(user, credit, space)
    return credit, space


@router.post("/get_plan", include_in_schema=False)
async def get_plan(token: Token):
    check_admin(token)
    user = decode_token(token.token).username
    credit, space = subscription_update(user)
    return {"space": space, "credits": credit, "used_space": db.get_collection_size(user)}
