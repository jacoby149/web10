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
        "credit_limit": settings.FREE_CREDITS,
        "space_limit": settings.FREE_SPACE,
        "credits_spent":0,
        "last_replenish": datetime.datetime(1997,12,28),
    }


def services_record():
    return {
        "service": "services",
        "whitelist": [],
        "blacklist": [],
    }
