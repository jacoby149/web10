"""Tests for Pydantic models."""

from app.models.auth import Token, TokenData


class TestDotdict:
    def test_dot_get(self):
        from app.models.core import dotdict

        d = dotdict({"a": 1, "b": 2})
        assert d.a == 1
        assert d.b == 2

    def test_dot_set(self):
        from app.models.core import dotdict

        d = dotdict()
        d.key = "value"
        assert d["key"] == "value"

    def test_dot_delete(self):
        from app.models.core import dotdict

        d = dotdict({"x": 1})
        del d.x
        assert "x" not in d

    def test_missing_key_returns_none(self):
        from app.models.core import dotdict

        d = dotdict({"a": 1})
        assert d.missing is None

    def test_dict_operations(self):
        from app.models.core import dotdict

        d = dotdict({"a": 1})
        assert "a" in d
        assert len(d) == 1


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
