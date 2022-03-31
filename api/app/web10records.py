import app.settings as settings
import datetime 

def star_record():
    return {
        "service": "*",
        "username": "USERNAME",
        "hashed_password": "PASSWORD",
        "phone_number": "PHONE_NUMBER",
        "customer_id": False,
        "storage_capacity_mb":settings.FREE_SPACE,
        "credits":0,
        "last_replenish": datetime.datetime(1997,12,28),
        # no whitelist or blacklist...
        # this is a web10 exclusive document.
    }


def services_record():
    return {
        "service": "services",
        "whitelist": [],
        "blacklist": [],
    }
