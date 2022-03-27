import app.settings as settings
import datetime 

def star_record():
    return {
        "service": "*",
        "username": "USERNAME",
        "hashed_password": "PASSWORD",
        "storage_capacity_mb":settings.FREE_SPACE,
        "credits":settings.FREE_CREDITS,
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
