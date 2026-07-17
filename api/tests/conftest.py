"""Shared fixtures for the API test suite."""

import datetime
import sys
from unittest.mock import MagicMock, patch

# Mock pymongo before anything else imports it, so mongo.py doesn't try to
# connect to a real database at module-load time.
sys.modules["pymongo"] = MagicMock()
sys.modules["bson"] = MagicMock()
sys.modules["bson.objectid"] = MagicMock()

import jwt
import pytest

import app.settings as settings


# ---------------------------------------------------------------------------
# JWT helpers – we use the configured PRIVATE_KEY (HS256) so tokens decode
# correctly inside the code under test.
# ---------------------------------------------------------------------------

def _make_token(payload: dict) -> str:
    """Create a signed JWT using the project's PRIVATE_KEY / ALGORITHM."""
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


def _future_iso(minutes_from_now: int = 60) -> str:
    return (datetime.datetime.utcnow() + datetime.timedelta(minutes=minutes_from_now)).isoformat()


def _past_iso(minutes_ago: int = 60) -> str:
    return (datetime.datetime.utcnow() - datetime.timedelta(minutes=minutes_ago)).isoformat()


@pytest.fixture
def valid_token_payload():
    """A standard, non-expired token payload targeting the local provider."""
    return {
        "username": "testuser",
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": _future_iso(),
    }


@pytest.fixture
def valid_token(valid_token_payload):
    return _make_token(valid_token_payload)


@pytest.fixture
def expired_token_payload():
    return {
        "username": "testuser",
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": _past_iso(),
    }


@pytest.fixture
def expired_token(expired_token_payload):
    return _make_token(expired_token_payload)


@pytest.fixture
def anon_payload():
    return {
        "username": "anon",
        "site": None,
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": None,
    }


@pytest.fixture
def anon_token(anon_payload):
    return _make_token(anon_payload)


@pytest.fixture
def cross_origin_token_payload():
    """Token from a different site."""
    return {
        "username": "otheruser",
        "site": "myapp.example.com",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": _future_iso(),
    }


@pytest.fixture
def cross_origin_token(cross_origin_token_payload):
    return _make_token(cross_origin_token_payload)


@pytest.fixture
def service_manager_token_payload():
    """Token from a CORS service manager (allowed to mint)."""
    return {
        "username": "testuser",
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": _future_iso(),
    }


@pytest.fixture
def service_manager_token(service_manager_token_payload):
    return _make_token(service_manager_token_payload)


# ---------------------------------------------------------------------------
# Mock DB fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_star_record():
    """A realistic star record for a test user."""
    return {
        "service": "*",
        "username": "testuser",
        "hashed_password": "__hashed__",
        "phone_number": "+1234567890",
        "verified": True,
        "customer_id": None,
        "business_id": None,
        "credit_limit": 1000000,
        "space_limit": 1000000,
        "credits_spent": 0,
        "last_replenish": datetime.datetime(1997, 12, 28),
    }


@pytest.fixture
def mock_term_record():
    """A realistic services term record."""
    return {
        "service": "myapi",
        "whitelist": [
            {
                "username": "testuser",
                "provider": settings.PROVIDER,
                "read": True,
                "create": True,
            },
            {
                "username": ".*",
                "provider": ".*",
                "read": True,
            },
        ],
        "blacklist": [
            {
                "username": "banneduser",
                "provider": settings.PROVIDER,
                "read": True,
            },
        ],
        "cross_origins": ["auth.localhost", "myapp.example.com"],
    }


@pytest.fixture
def mock_db_with_star(mock_star_record):
    """Patch app.mongo.get_star to return mock_star_record."""
    with patch("app.mongo.get_star", return_value=mock_star_record) as m:
        yield m


@pytest.fixture
def mock_db_with_term(mock_term_record):
    """Patch app.mongo.get_term_record to return mock_term_record."""
    with patch("app.mongo.get_term_record", return_value=mock_term_record) as m:
        yield m


@pytest.fixture
def mock_db_star_none():
    """Patch app.mongo.get_star to return None."""
    with patch("app.mongo.get_star", return_value=None):
        yield


@pytest.fixture
def mock_db_term_none():
    """Patch app.mongo.get_term_record to return None."""
    with patch("app.mongo.get_term_record", return_value=None):
        yield


# ---------------------------------------------------------------------------
# Mock external services
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_stripe():
    with patch("app.stripe.stripe") as m:
        yield m


@pytest.fixture
def mock_twilio():
    with patch("app.twilio.Client") as m:
        yield m


@pytest.fixture
def mock_requests_post():
    with patch("app.main.requests.post") as m:
        m.return_value.status_code = 200
        yield m


@pytest.fixture
def mock_requests_get():
    with patch("app.main.requests.get") as m:
        yield m
