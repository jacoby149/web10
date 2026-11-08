"""Admin-only delivery setup; Google callback stages, never grants authority."""

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import Field

from app import exceptions, settings
from app.models.auth import Token
from app.services import contact_delivery as delivery
from app.services.auth import check_admin, decode_token

router = APIRouter(prefix="/admin/contact", tags=["admin"])
log = logging.getLogger("web10-contact")


def _admin(data):
    decoded = decode_token(data.token, private_key=True)
    if decoded.provider != settings.PROVIDER or getattr(decoded, "client_id", None):
        raise exceptions.NOT_ADMIN
    check_admin(data)


class Flow(Token):
    flow: str = Field(min_length=40, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")


class DeliveryConfig(Token):
    provider: Literal["gmail", "sendgrid", "legacy"]
    sender: str = Field(default="", max_length=254)
    sendgrid_key: str = Field(default="", max_length=512)
    twilio_sid: str = Field(default="", max_length=100)
    twilio_token: str = Field(default="", max_length=512)
    twilio_service: str = Field(default="", max_length=100)


class TestDelivery(Token):
    provider: Literal["gmail", "sendgrid"]


@router.post("/status")
def status(data: Token):
    _admin(data)
    return delivery.status()


@router.post("/configure")
def configure(data: DeliveryConfig):
    _admin(data)
    return delivery.configure(
        data.provider, data.sender, data.sendgrid_key, data.twilio_sid, data.twilio_token, data.twilio_service
    )


@router.post("/gmail/start")
def start(data: Token):
    _admin(data)
    return delivery.start_gmail(data.token)


@router.get("/gmail/callback")
def callback(request: Request):
    query = request.query_params
    # Avoid credentials in the API server's access-log scope. Upstream proxy
    # callback access logs must also omit query strings (deployment gate).
    request.scope["query_string"] = b""
    headers = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}
    flow, code = query.get("state", ""), query.get("code", "")
    if not (40 <= len(flow) <= 100 and 0 < len(code) <= 4096) or query.get("error"):
        return HTMLResponse("Gmail connection cancelled. Return to Node Config and try again.", 400, headers=headers)
    try:
        destination = delivery.gmail_callback(flow, code)
        return RedirectResponse(destination, status_code=303, headers=headers)
    except Exception:
        log.warning("[contact] Gmail callback failed")
        return HTMLResponse(
            "Gmail connection failed or expired. Return to Node Config and reconnect.", 400, headers=headers
        )


@router.post("/gmail/finish")
def finish(data: Flow):
    _admin(data)
    return delivery.finish_gmail(data.flow, data.token)


@router.post("/gmail/disconnect")
def disconnect(data: Token):
    _admin(data)
    return delivery.disconnect_gmail()


@router.post("/test")
def test_email(data: TestDelivery):
    _admin(data)
    current = delivery.status()
    sender = current["gmail_sender" if data.provider == "gmail" else "sendgrid_sender"]
    if not sender:
        raise HTTPException(422, "Connect and save the sender before sending a test.")
    delivery.budget("test", 5, 60)
    delivery.budget("node", 100)
    delivery.send_email(
        sender,
        "web10 email delivery test",
        "Your node submitted this test email successfully. No password or account was changed.",
        provider=data.provider,
    )
    return {"submitted": True}
