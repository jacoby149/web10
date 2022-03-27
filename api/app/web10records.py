import app.settings as settings

def star_record():
    return {
        "service": "*",
        "username": "USERNAME",
        "hashed_password": "PASSWORD",
        "storage_capacity_mb":settings.FREE_SPACE,
        "credits":settings.FREE_CREDITS,
        "last_refresh":-1,
        # no whitelist or blacklist...
        # this is a web10 exclusive document.
    }


def services_record():
    return {
        "service": "services",
        "whitelist": [],
        "blacklist": [],
    }
