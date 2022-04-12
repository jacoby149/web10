# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client
import app.settings as settings
import app.exceptions as exceptions

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = settings.TWILIO_ACCOUNT_SID
auth_token = settings.TWILIO_AUTH_TOKEN
client = Client(account_sid, auth_token)

# send the verification code
def send_verification(phone_number,username):
    try:
        verification = client.verify \
                            .services(settings.TWILIO_SERVICE) \
                            .verifications \
                            .create(channel_configuration={
                                'substitutions': {
                                    'username': username
                                }
                            }, to="+"+str(phone_number), channel='sms')

        return verification.sid
    except:
        raise exceptions.BAD_NUM

# check the verification code
def check_verification(phone_number,code):
    verification_check = client.verify \
                            .services(settings.TWILIO_SERVICE) \
                            .verification_checks \
                            .create(to="+"+str(phone_number), code=code)
    return verification_check.sid