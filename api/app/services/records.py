import datetime

import app.settings as settings


def star_record():
    return {
        "service": "*",
        "username": "USERNAME",
        "hashed_password": "PASSWORD",
        "phone_number": "PHONE_NUMBER",
        "verified": False,
        "email": None,
        "email_verified": False,
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


def follows_term():
    """Canonical owner-only term for the `follows` service.

    Every new account gets this term provisioned at signup so the social
    app can write follow records without requiring an interactive contract handshake
    from the client. No whitelist — owner-only (the app acts under the
    owner's own token; is_permitted allows it).
    """
    return {
        "service": "follows",
        "whitelist": [],
        "blacklist": [],
    }


def inbox_term():
    """Canonical term for the `inbox` service — fan-out delivery.

    Any user may deliver into your inbox (the inbox pattern: follower
    fan-out writes a record into the follower's collection). The
    whitelist grants create to all so public-post delivery works
    without per-follower terms negotiation.
    """
    return {
        "service": "inbox",
        "whitelist": [
            {"username": ".*", "provider": ".*", "create": True},
        ],
        "blacklist": [],
    }


def reactions_term():
    """Canonical owner-only term for the `reactions` service."""
    return {
        "service": "reactions",
        "whitelist": [],
        "blacklist": [],
    }


def comments_term():
    """Canonical owner-only term for the `comments` service."""
    return {
        "service": "comments",
        "whitelist": [],
        "blacklist": [],
    }


def dms_term():
    """Canonical owner-only term for the `dms` service."""
    return {
        "service": "dms",
        "whitelist": [],
        "blacklist": [],
    }


def profile_term():
    """Canonical anon-read term for the `profile` service.

    The friends feed + user profiles read another user's profile record
    DIRECTLY from their collection (D40 pull model) — every account needs
    this term or a friend's profile read 403s.
    """
    return {
        "service": "profile",
        "whitelist": [
            {"username": ".*", "provider": ".*", "read": True},
        ],
        "blacklist": [],
    }


def public_media_term():
    """Canonical anon-read term for `public_media` (D35).

    Public-post attachments and avatar/banner confirm into `public_media`
    so non-owners can presign reads. Matches the app's serviceTerms.ts.
    """
    return {
        "service": "public_media",
        "whitelist": [
            {"username": ".*", "provider": ".*", "read": True},
        ],
        "blacklist": [],
    }


def private_posts_term():
    """Canonical owner-only term for the `private_posts` service."""
    return {
        "service": "private_posts",
        "whitelist": [],
        "blacklist": [],
    }


def staging_posts_term():
    """Canonical owner-only term for the `staging_posts` service (D19)."""
    return {
        "service": "staging_posts",
        "whitelist": [],
        "blacklist": [],
    }


def media_term():
    """Canonical owner-only term for the `media` service."""
    return {
        "service": "media",
        "whitelist": [],
        "blacklist": [],
    }


def core_services_terms():
    """Return all core app service terms that must be provisioned at signup.

    This is the set of services the social app needs to operate on the
    owner's own collection. Without these, the app's contractOnReady consent
    is the only thing that creates terms — and the contract handshake only fires while the
    auth portal child window is open. A13 fixed public_posts; this
    fixes the rest (follows, inbox, reactions, comments, dms, profile,
    public_media, private_posts, staging_posts, media — the D40 pull
    model reads friends' profile/public_media DIRECTLY, so the anon-read
    pair is load-bearing for the feed, not just for discovery).
    """
    return [
        follows_term(),
        inbox_term(),
        reactions_term(),
        comments_term(),
        dms_term(),
        profile_term(),
        public_media_term(),
        private_posts_term(),
        staging_posts_term(),
        media_term(),
    ]


def public_posts_term():
    """Canonical anon-read term for public_posts — discovery-indexed by default.

    Every new account gets this term provisioned at signup so public posts
    are discoverable without requiring an interactive contract handshake from the client.
    The whitelist uses `.*` regex (matching `get_approved` and
    `service_allows_anon`) so any user — including anon — may read.
    """
    return {
        "service": "public_posts",
        "whitelist": [
            {"username": ".*", "provider": ".*", "read": True},
        ],
        "blacklist": [],
    }
