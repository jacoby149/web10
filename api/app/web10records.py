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
        "credits": [],
        "payment_methods": [],
        # no whitelist or blacklist...
        # this is a web10 exclusive document.
        # TODO implement guarding of this record from all CRUD
    }


def services_record():
    return {
        "whitelist": [],
        "blacklist": [],
        "service": "services",
        "cross_origins": settings.CORS_SERVICE_MANAGERS,
        "active": True,
    }
