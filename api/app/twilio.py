# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client
import app.settings as settings

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = settings.TWILIO_ACCOUNT_SID
auth_token = settings.TWILIO_AUTH_TOKEN
client = Client(account_sid, auth_token)

# send the verification code
def send_verification(email,username):
    print(email)
    verification = client.verify \
                        .services(settings.TWILIO_SERVICE) \
                        .verifications \
                        .create(channel_configuration={
                            'substitutions': {
                                'username': username
                            }
                        }, to=email, channel='email')

    return verification.sid

# check the verification code
def check_verification(email,code):
    verification_check = client.verify \
                            .services(settings.TWILIO_SERVICE) \
                            .verification_checks \
                            .create(to=email, code=code)
    return verification_check.sid