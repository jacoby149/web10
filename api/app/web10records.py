import app.settings as settings

def star_record():
    return {
        "service": "*",
        "username": "USERNAME",
        "hashed_password": "PASSWORD",
        "storage_capacity_mb":settings.SPACE,
        "writes":settings.WRITES,
        "reads":settings.READS,
        "deletes":settings.DELETES,
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
