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
        "whitelist": [],
        "blacklist": [],
        "body": {
            "service": "*",
            "username": "USERNAME",
            "hashed_password": "PASSWORD",
            "credits": [],
            "payment_methods": [],
        },
    }


def services_record():
    return {
        "whitelist": [],
        "blacklist": [],
        "body": {
            "service": "services",
            "cross_origins": settings.CORS_SERVICE_MANAGERS,
            "active": True,
            "banlist": [],
        },
    }
