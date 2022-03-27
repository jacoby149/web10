# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client


# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ['TWILIO_ACCOUNT_SID']
auth_token = os.environ['TWILIO_AUTH_TOKEN']
client = Client(account_sid, auth_token)


service = client.verify.services.create(
                                     friendly_name='My First Verify Service'
                                 )

print(service.sid)


verification = client.verify \
                     .services('VAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX') \
                     .verifications \
                     .create(to='+15017122661', channel='sms')

print(verification.status)

verification_check = client.verify \
                           .services('VAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX') \
                           .verification_checks \
                           .create(to='+15017122661', code='123456')

print(verification_check.status)