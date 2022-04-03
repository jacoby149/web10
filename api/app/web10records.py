import app.settings as settings
import datetime 

def star_record():
    return {
        "service": "*",
        "username": "USERNAME",
        "hashed_password": "PASSWORD",
        "phone_number": "PHONE_NUMBER",
        "verified":False,
        "customer_id": None,
        "credits_spent":0,
    }


def services_record():
    return {
        "service": "services",
        "whitelist": [],
        "blacklist": [],
    }
