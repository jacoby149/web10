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


def send_verification(contact, username=""):
    """Send a 6-digit code. `contact` is a phone number OR an email — the
    channel is chosen from it (sms vs email). One provider for both (D61)."""
    try:
        kwargs = {"to": _twilio_to(contact), "channel": _channel_for(contact)}
        if username:
            kwargs["channel_configuration"] = {"substitutions": {"username": username}}
        verification = client.verify.services(settings.TWILIO_SERVICE).verifications.create(**kwargs)

        return verification.sid
    except Exception:
        raise exceptions.BAD_NUM


# check the verification code
def check_verification(contact, code):
    """Check a 6-digit code against the contact (phone or email)."""
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
