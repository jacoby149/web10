description = """
welcome to the new internet, where users aren't just clients.
"""

# Order matters — Swagger displays tags in this sequence.
# Follow the user journey: auth → CRUD → contracts → groups → media → system.
tags_metadata = [
    {
        "name": "auth",
        "description": "Authentication — signup, login, token minting, phone/email verification.",
    },
    {
        "name": "account",
        "description": "Account management — profile, password, phone, email, recovery.",
    },
    {
        "name": "documents",
        "description": "Document CRUD — create, read, update, delete. User from JWT. Server generates doc_id (UUID7).",
    },
    {
        "name": "app-contracts",
        "description": "App contracts — per-app service permissions. Add, list, revoke.",
    },
    {
        "name": "group-contracts",
        "description": "Group contracts — create, list, join, leave, members, invites, requests, blocking, sharing.",
    },
    {
        "name": "media",
        "description": "Media — upload confirm, list, delete.",
    },
    {
        "name": "app-store",
        "description": "App store — register, list approved, ratings.",
    },
    {
        "name": "system",
        "description": "Node system — stats, setup wizard, config, health check.",
    },
    {
        "name": "admin",
        "description": "Admin only — data migrations, app approvals, bug reports.",
    },
]
