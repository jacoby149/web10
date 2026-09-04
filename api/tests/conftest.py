"""Shared fixtures for the API test suite."""

import datetime
import sys
import types
from unittest.mock import MagicMock, patch

sys.modules["pymongo"] = MagicMock()
sys.modules["bson"] = MagicMock()
sys.modules["bson.objectid"] = MagicMock()
sys.modules["boto3"] = MagicMock()
sys.modules["botocore"] = MagicMock()
sys.modules["botocore.config"] = MagicMock()
sys.modules["clickhouse_connect"] = MagicMock()


# clickhouse_connect.driver.exceptions — a REAL exception class, so
# `except _ch_exceptions.Error` clauses stay valid under the mock (a bare
# MagicMock is not a catchable class).
class _ClickHouseError(Exception):
    pass


_ch_exceptions_mod = types.ModuleType("clickhouse_connect.driver.exceptions")
_ch_exceptions_mod.Error = _ClickHouseError
_ch_driver_mod = types.ModuleType("clickhouse_connect.driver")
_ch_driver_mod.exceptions = _ch_exceptions_mod
sys.modules["clickhouse_connect.driver"] = _ch_driver_mod
sys.modules["clickhouse_connect.driver.exceptions"] = _ch_exceptions_mod

import jwt
import pytest

import app.settings as settings


def _make_token(payload: dict) -> str:
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


def _future_iso(minutes_from_now: int = 60) -> str:
    return (datetime.datetime.utcnow() + datetime.timedelta(minutes=minutes_from_now)).isoformat()


def _past_iso(minutes_ago: int = 60) -> str:
    return (datetime.datetime.utcnow() - datetime.timedelta(minutes=minutes_ago)).isoformat()


@pytest.fixture
def valid_token_payload():
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


@pytest.fixture
def mock_star_record():
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
    return {
        "service": "myapi",
        "whitelist": [
            {"username": "testuser", "provider": settings.PROVIDER, "read": True, "create": True},
            {"username": ".*", "provider": ".*", "read": True},
        ],
        "blacklist": [
            {"username": "banneduser", "provider": settings.PROVIDER, "read": True},
        ],
        "cross_origins": ["auth.localhost", "myapp.example.com"],
    }


@pytest.fixture
def mock_db_with_star(mock_star_record):
    with patch("app.services.documentdb.get_star", return_value=mock_star_record) as m:
        yield m


@pytest.fixture
def mock_db_with_term(mock_term_record):
    with patch("app.services.documentdb.get_term_record", return_value=mock_term_record) as m:
        yield m


@pytest.fixture
def mock_db_star_none():
    with patch("app.services.documentdb.get_star", return_value=None):
        yield


@pytest.fixture
def mock_db_term_none():
    with patch("app.services.documentdb.get_term_record", return_value=None):
        yield


@pytest.fixture
def mock_stripe():
    with patch("app.services.stripe.stripe") as m:
        yield m


@pytest.fixture
def mock_twilio():
    with patch("app.services.twilio.Client") as m:
        yield m


@pytest.fixture
def mock_requests_post():
    with patch("app.services.auth.requests.post") as m:
        m.return_value.status_code = 200
        yield m


@pytest.fixture
def mock_requests_get():
    with patch("app.endpoints.system.requests.get") as m:
        yield m
