description = """
welcome to the new internet, where users aren't just clients.
"""

# Order matters — Swagger displays tags in this sequence.
# Follow the user journey: auth → CRUD → media → contracts → system.
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
        "name": "media",
        "description": "Media — upload confirm, list, delete.",
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
        "name": "app-store",
        "description": "App store — register, list approved, ratings.",
    },
    {
        "name": "payments",
        "description": "Payments — business management, dev pay, verify, cancel.",
    },
    {
        "name": "system",
        "description": "Node system — stats, setup wizard, config, health check.",
    },
    {
        "name": "admin",
        "description": "Admin only — data migrations, app approvals.",
    },
    {
        "name": "issue-tracking",
        "description": "Bug reports — submit, list, detail. Public submission, admin review.",
    },
    {
        "name": "default",
        "description": "Untagged endpoints — legacy routes, health check, app registry.",
    },
]
