# Download the helper library from https://www.twilio.com/docs/python/install
from twilio.rest import Client
from twilio.twiml.messaging_response import MessagingResponse

import app.exceptions as exceptions
import app.settings as settings

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = settings.TWILIO_ACCOUNT_SID
auth_token = settings.TWILIO_AUTH_TOKEN
client = Client(account_sid, auth_token)


# send the verification code
def _is_email(contact) -> bool:
    return "@" in str(contact)


def _twilio_to(contact) -> str:
    """Twilio's `to` — the bare email for the email channel, `+`-prefixed for sms."""
    return str(contact) if _is_email(contact) else "+" + str(contact)


def _channel_for(contact) -> str:
    return "email" if _is_email(contact) else "sms"


# E2E / local mode — when TWILIO_E2E is truthy, the recovery flow uses a
# deterministic in-memory code store instead of calling Twilio. This lets the
# e2e suite drive the recovery flow without real Twilio credentials (CI has
# none). The code is fixed ("123456") so the e2e knows it. Never active in
# prod (TWILIO_E2E is unset there).
_E2E_CODE = "123456"
_local_codes: dict[str, str] = {}  # normalized contact -> code


def _twilio_e2e() -> bool:
    return str(getattr(settings, "TWILIO_E2E", "")).strip().lower() in ("1", "true", "yes")


def send_verification(contact):
    """Send a 6-digit code. `contact` is a phone number OR an email — the
    channel is chosen from it (sms vs email). One provider for both (D61).

    The message is the Twilio Verify service's template (console-configured) —
    a generic "your code is {{code}}, if you didn't request this ignore it"
    with NO username: a contact can back several accounts, so there's no single
    username to name. `{{code}}` is auto-substituted by Twilio.
    """
    if _twilio_e2e():
        _local_codes[_twilio_to(contact)] = _E2E_CODE
        return "e2e-verification-sid"
    try:
        verification = client.verify.services(settings.TWILIO_SERVICE).verifications.create(
            to=_twilio_to(contact), channel=_channel_for(contact)
        )

        return verification.sid
    except Exception:
        raise exceptions.BAD_NUM


# check the verification code
def check_verification(contact, code):
    """Check a 6-digit code against the contact (phone or email)."""
    if _twilio_e2e():
        if _local_codes.get(_twilio_to(contact)) != code:
            raise exceptions.WRONG_CODE
        return "e2e-check-sid"
    verification_check = client.verify.services(settings.TWILIO_SERVICE).verification_checks.create(
        to=_twilio_to(contact), code=code
    )
    if verification_check.status != "approved":
        raise exceptions.WRONG_CODE
    return verification_check.sid


########## Forgot Password Prompt #########


# tells the customer how to reset their pass.
def recovery_prompt(phone_number, user):
    message = client.messages.create(
        body=f'This is web10 account recovery. for {settings.PROVIDER}/{user}. to reset your password, text "RESET" . Otherwise, have a nice day :) ',
        from_=settings.TWILIO_NUMBER,
        to="+" + str(phone_number),
    )
    return message.sid


# https://www.twilio.com/docs/messaging/guides/webhook-request
# https://www.twilio.com/blog/build-secure-twilio-webhook-python-fastapi
# sends the reset password to the customer. on them typing RESET

############ WEBHOOK ################


def recovery_response(password):
    # Start our TwiML response
    resp = MessagingResponse()
    resp.message(f"Your password has been reset to {password}")
    return str(resp)


# sends a prompt if a person texts anything that is not RESET
def actionless_response():
    resp = MessagingResponse()
    resp.message(
        'No action was taken., text "RESET" to reset your password. Go to https://web10auth.netlify.app?forgot=true to recover your username too.'
    )
    return str(resp)
