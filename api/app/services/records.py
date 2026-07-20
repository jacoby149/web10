import datetime

import app.settings as settings


def star_record():
    return {
        "service": "*",
        "username": "USERNAME",
        "hashed_password": "PASSWORD",
        "phone_number": "PHONE_NUMBER",
        "verified": False,
        "customer_id": None,
        "business_id": None,
        "credit_limit": settings.FREE_CREDITS,  # operator-set quota: rate/abuse throttle
        "space_limit": settings.FREE_SPACE,  # operator-set quota: storage cap (incl. imports)
        "credits_spent": 0,
        "last_replenish": datetime.datetime(1997, 12, 28),
    }


def services_record():
    return {
        "service": "services",
        "whitelist": [],
        "blacklist": [],
    }
