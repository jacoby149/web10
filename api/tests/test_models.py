"""Tests for Pydantic models."""

from app.models.auth import Token, TokenData


class TestToken:
    def test_minimal(self):
        t = Token()
        assert t.token is None
        assert t.query is None

    def test_with_token(self):
        t = Token(token="abc123")
        assert t.token == "abc123"

    def test_extra_fields_allowed(self):
        t = Token(token="x", query={"a": 1}, update={"b": 2}, custom="extra")
        assert t.token == "x"
        assert t.query == {"a": 1}


class TestTokenData:
    def test_defaults(self):
        td = TokenData()
        assert td.username is None
        assert td.site is None

    def test_populate_from_payload(self):
        td = TokenData()
        td.populate_from_payload(
            {
                "username": "alice",
                "site": "app.com",
                "target": "api.localhost",
                "provider": "api.localhost",
                "expires": "2099-01-01T00:00:00",
            }
        )
        assert td.username == "alice"
        assert td.site == "app.com"
        assert td.provider == "api.localhost"

    def test_populate_from_payload_missing(self):
        td = TokenData()
        td.populate_from_payload({})
        assert td.username is None
