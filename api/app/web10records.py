import app.settings as settings

# whitelist example
# [
#     {"username":".*",
#     "provider":".*",
#         "all":True,
#     }
# ]


def star_record():
    return {
        "service": "*",
        "username": "USERNAME",
        "hashed_password": "PASSWORD",
        "storage_capacity_mb_free":10,
        "storage_capacity_mb_paid":0,
        "storage_capacity_mb_used":0,
        "db_time_seconds_monthly":600,
        "db_time_seconds_monthly_used":0,
        "db_time_seconds_owned":0
        # no whitelist or blacklist...
        # this is a web10 exclusive document.
        # TODO implement guarding of this record from all CRUD
    }


def services_record():
    return {
        "whitelist": [],
        "blacklist": [],
        "service": "services",
        "active": True,
    }
