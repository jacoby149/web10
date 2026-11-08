"""Gmail/SendGrid email delivery and private, single-use recovery challenges."""

import base64
import hashlib
import logging
import re
import secrets
import time
from email.message import EmailMessage
from urllib.parse import urlencode, urlsplit

import requests
from fastapi import HTTPException

from app import exceptions, settings
from app.services import contact_state as state

log = logging.getLogger("web10-contact")
GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send"
EMAIL = re.compile(r"^[^@\s\r\n]+@[^@\s\r\n]+\.[^@\s\r\n]+$")


def request_json(url, *, method="POST", **kwargs):
    # All callers supply fixed provider endpoints. Never follow provider redirects
    # with a credential, or expose request/response objects through errors/logs.
    log.info("[contact] provider request started")
    try:
        with requests.request(method, url, timeout=(5, 15), allow_redirects=False, stream=True, **kwargs) as response:
            if not 200 <= response.status_code < 300:
                raise ValueError()
            raw = bytearray()
            for part in response.iter_content(8192):
                raw.extend(part)
                if len(raw) > 65536:
                    raise ValueError()
            import json

            result = json.loads(raw) if raw else {}
            if not isinstance(result, dict):
                raise ValueError()
        log.info("[contact] provider request completed")
        return result
    except Exception:
        log.warning("[contact] provider request failed")
        raise state.unavailable() from None


def auth_url():
    url = settings.CONTACT_AUTH_URL.rstrip("/")
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.query or parsed.fragment:
        raise state.unavailable()
    return url


def gmail_ready():
    try:
        auth_url()
        callback = urlsplit(settings.GMAIL_REDIRECT_URI)
        return bool(
            state.ready()
            and settings.GMAIL_CLIENT_ID
            and settings.GMAIL_CLIENT_SECRET
            and callback.scheme == "https"
            and callback.netloc == settings.PROVIDER
            and callback.path == "/admin/contact/gmail/callback"
            and not callback.query
            and not callback.fragment
            and not callback.username
        )
    except Exception:
        return False


def status():
    cfg = state.load("settings")[0] if state.ready() else {}
    return {
        "available": state.ready(),
        "gmail_available": gmail_ready(),
        "email_provider": cfg.get("provider", "legacy"),
        "gmail_connected": bool(cfg.get("gmail", {}).get("refresh_token")),
        "gmail_sender": cfg.get("gmail", {}).get("sender", ""),
        "sendgrid_configured": bool(cfg.get("sendgrid_key") and cfg.get("sendgrid_sender")),
        "sendgrid_sender": cfg.get("sendgrid_sender", ""),
        "twilio_configured": bool(cfg.get("twilio_sid") and cfg.get("twilio_token") and cfg.get("twilio_service")),
    }


def configure(provider, sender, key, sid, token, service):
    if provider not in {"gmail", "sendgrid", "legacy"}:
        raise HTTPException(422, "Choose Gmail or SendGrid.")
    if sender and (len(sender) > 254 or not EMAIL.fullmatch(sender)):
        raise HTTPException(422, "Enter a valid SendGrid sender email.")

    def change(cfg):
        for name, value in [
            ("sendgrid_sender", sender),
            ("sendgrid_key", key),
            ("twilio_sid", sid),
            ("twilio_token", token),
            ("twilio_service", service),
        ]:
            if value:
                cfg[name] = value
        if provider == "gmail" and not cfg.get("gmail", {}).get("refresh_token"):
            raise HTTPException(422, "Connect Gmail before selecting it.")
        if provider == "sendgrid" and not (cfg.get("sendgrid_key") and cfg.get("sendgrid_sender")):
            raise HTTPException(422, "Configure a SendGrid sender and API key first.")
        cfg["provider"] = provider
        return cfg

    state.replace("settings", change)
    return status()


def start_gmail(admin_token):
    if not gmail_ready():
        raise state.unavailable()
    cfg = state.load("settings")[0]
    flow, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    pending = {
        "owner": state.digest(admin_token),
        "verifier": verifier,
        "expires": time.time() + 600,
        "generation": cfg.get("generation", ""),
        "phase": "pending",
    }
    if not state.save("oauth/" + state.digest(flow), pending, None):
        raise state.unavailable()
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return {
        "url": "https://accounts.google.com/o/oauth2/v2/auth?"
        + urlencode(
            {
                "client_id": settings.GMAIL_CLIENT_ID,
                "redirect_uri": settings.GMAIL_REDIRECT_URI,
                "response_type": "code",
                "scope": "openid email " + GMAIL_SCOPE,
                "state": flow,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "access_type": "offline",
                "prompt": "consent",
            }
        ),
        "flow": flow,
    }


def gmail_callback(flow, code):
    if not gmail_ready():
        raise state.unavailable()
    name = "oauth/" + state.digest(flow)
    pending, etag = state.load(name)
    if pending.get("phase") != "pending" or pending.get("expires", 0) <= time.time():
        raise HTTPException(400, "Gmail connection expired. Start again in Node Config.")
    if not state.save(name, {**pending, "phase": "exchanging"}, etag):
        raise HTTPException(409, "Gmail connection already used.")
    tokens = request_json(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": settings.GMAIL_CLIENT_ID,
            "client_secret": settings.GMAIL_CLIENT_SECRET,
            "redirect_uri": settings.GMAIL_REDIRECT_URI,
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": pending["verifier"],
        },
    )
    if GMAIL_SCOPE not in tokens.get("scope", "").split() or not tokens.get("refresh_token"):
        raise HTTPException(400, "Allow email sending and reconnect Gmail.")
    profile = request_json(
        "https://openidconnect.googleapis.com/v1/userinfo",
        method="GET",
        headers={"Authorization": "Bearer " + tokens["access_token"]},
    )
    sender = profile.get("email", "")
    if not profile.get("email_verified") or not EMAIL.fullmatch(sender):
        raise HTTPException(400, "Connect a verified Gmail mailbox.")
    pending.update(phase="staged", gmail={"sender": sender, "refresh_token": tokens["refresh_token"]})
    state.replace(name, lambda current: {**current, **pending})
    return auth_url() + "/?mode=config#gmail=" + flow


def finish_gmail(flow, admin_token):
    name = "oauth/" + state.digest(flow)
    pending, etag = state.load(name)
    if (
        pending.get("phase") != "staged"
        or pending.get("expires", 0) <= time.time()
        or not secrets.compare_digest(pending.get("owner", ""), state.digest(admin_token))
    ):
        raise HTTPException(400, "Gmail connection expired or belongs to a different login.")
    if not state.save(name, {"phase": "used"}, etag):
        raise HTTPException(409, "Gmail connection already used.")

    def change(cfg):
        if cfg.get("generation", "") != pending["generation"]:
            raise HTTPException(409, "Connection changed. Start again.")
        cfg.update(gmail=pending["gmail"], generation=secrets.token_hex(16))
        return cfg

    state.replace("settings", change)
    return status()


def disconnect_gmail():
    def change(cfg):
        cfg.pop("gmail", None)
        cfg["generation"] = secrets.token_hex(16)
        # Keep provider=gmail so recovery fails closed, never silently falls back.
        return cfg

    state.replace("settings", change)
    return status()


def send_email(recipient, subject, text, *, provider=None):
    cfg = state.load("settings")[0]
    provider = provider or cfg.get("provider", "legacy")
    if provider == "gmail":
        gmail = cfg.get("gmail", {})
        if not gmail_ready() or not gmail.get("refresh_token"):
            raise state.unavailable()
        tokens = request_json(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.GMAIL_CLIENT_ID,
                "client_secret": settings.GMAIL_CLIENT_SECRET,
                "refresh_token": gmail["refresh_token"],
                "grant_type": "refresh_token",
            },
        )
        message = EmailMessage()
        message["From"], message["To"], message["Subject"] = gmail["sender"], recipient, subject
        message.set_content(text)
        request_json(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": "Bearer " + tokens["access_token"]},
            json={"raw": base64.urlsafe_b64encode(message.as_bytes()).decode()},
        )
    elif provider == "sendgrid" and cfg.get("sendgrid_key") and cfg.get("sendgrid_sender"):
        request_json(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": "Bearer " + cfg["sendgrid_key"]},
            json={
                "personalizations": [{"to": [{"email": recipient}]}],
                "from": {"email": cfg["sendgrid_sender"]},
                "subject": subject,
                "content": [{"type": "text/plain", "value": text}],
                "tracking_settings": {
                    "click_tracking": {"enable": False, "enable_text": False},
                    "open_tracking": {"enable": False},
                },
            },
        )
    else:
        raise state.unavailable()


def budget(key, limit, gap=0):
    now = time.time()

    def change(value):
        recent = [stamp for stamp in value.get("sends", []) if now - stamp < 3600]
        if len(recent) >= limit or (recent and now - recent[-1] < gap):
            raise exceptions.RATE_LIMIT
        return {"sends": recent + [now]}

    state.replace("budget/" + key, change)


def send_code(contact):
    cfg = state.load("settings")[0] if state.configured() else {}
    if "@" not in contact or cfg.get("provider", "legacy") == "legacy":
        from app.services import twilio

        return twilio.send_verification(contact)
    contact = contact.strip().lower()
    auth_url()  # Validate before reserving state or sending any message.
    key = state.digest("email:" + contact)
    budget(key, 5, 60)
    budget("node", 100)
    code, link = f"{secrets.randbelow(1000000):06d}", secrets.token_urlsafe(32)
    generation = secrets.token_hex(16)
    record = {
        "contact": contact,
        "code": state.digest(key + code),
        "link": state.digest(link),
        "generation": generation,
        "expires": time.time() + 600,
        "attempts": 0,
        "active": False,
    }
    state.replace("challenge/" + key, lambda old: record)
    state.save("link/" + state.digest(link), {"key": key, "generation": generation}, None)
    send_email(
        contact,
        "Your web10 verification code",
        f"Your code is {code}. It expires in 10 minutes.\n\n"
        f"To sign in or reset your password, open:\n{auth_url()}/?mode=forgot#recovery={link}&node={settings.PROVIDER}\n\n"
        "If you did not request this, ignore this email.",
    )

    def activate(current):
        if current.get("generation") != generation:
            raise state.unavailable()
        return {**current, "active": True}

    state.replace("challenge/" + key, activate)


def consume(key, *, code=None, link=None, generation=None):
    name = "challenge/" + key
    for _ in range(5):
        record, etag = state.load(name)
        if link is not None and generation != record.get("generation"):
            # A superseded link has no authority over the current challenge,
            # including its attempt budget. Do not let old links lock out resets.
            raise exceptions.WRONG_CODE
        if not record.get("active") or record.get("expires", 0) <= time.time() or record.get("attempts", 5) >= 5:
            raise exceptions.WRONG_CODE
        matched = (
            secrets.compare_digest(record.get("code", ""), state.digest(key + code))
            if code is not None
            else generation == record.get("generation")
            and secrets.compare_digest(record.get("link", ""), state.digest(link))
        )
        changed = {**record, "attempts": record["attempts"] + 1, "active": not matched}
        if state.save(name, changed, etag):
            if matched:
                return record["contact"]
            raise exceptions.WRONG_CODE
    raise exceptions.WRONG_CODE


def check_code(contact, code):
    cfg = state.load("settings")[0] if state.configured() else {}
    if "@" not in contact or cfg.get("provider", "legacy") == "legacy":
        from app.services import twilio

        return twilio.check_verification(contact, code)
    if not re.fullmatch(r"[0-9]{6}", code):
        raise exceptions.WRONG_CODE
    return consume(state.digest("email:" + contact.strip().lower()), code=code)


def check_link(link):
    index = state.load("link/" + state.digest(link))[0]
    if not index.get("key"):
        raise exceptions.WRONG_CODE
    return consume(index["key"], link=link, generation=index["generation"])
