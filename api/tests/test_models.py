"""Tests for Pydantic models."""

from app.models.core import dotdict
from app.models.auth import Token, TokenData, SignUpForm, TokenForm, PhoneForm
from app.models.payment import PayData


class TestDotdict:

    def test_dot_get(self):
        d = dotdict({"a": 1, "b": 2})
        assert d.a == 1
        assert d.b == 2

    def test_dot_set(self):
        d = dotdict()
        d.key = "value"
        assert d["key"] == "value"

    def test_dot_delete(self):
        d = dotdict({"x": 1})
        del d.x
        assert "x" not in d

    def test_missing_key_returns_none(self):
        d = dotdict({"a": 1})
        assert d.missing is None

    def test_dict_operations(self):
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
        td.populate_from_payload({
            "username": "alice",
            "site": "app.com",
            "target": "api.localhost",
            "provider": "api.localhost",
            "expires": "2099-01-01T00:00:00",
        })
        assert td.username == "alice"
        assert td.site == "app.com"
        assert td.provider == "api.localhost"

    def test_populate_from_payload_missing(self):
        td = TokenData()
        td.populate_from_payload({})
        assert td.username is None

    def test_populate_from_token_form(self):
        td = TokenData()
        form = TokenForm(username="bob", site="x.com", target="t")
        td.populate_from_token_form(form)
        assert td.username == "bob"
        assert td.site == "x.com"
        assert td.target == "t"
        assert td.provider is None


class TestSignUpForm:

    def test_valid(self):
        form = SignUpForm(username="alice", password="pass123", phone="+1234567890")
        assert form.username == "alice"

    def test_optional_fields(self):
        form = SignUpForm(username="alice", password="pass123")
        assert form.phone is None
        assert form.betacode is None

    def test_with_betacode(self):
        form = SignUpForm(username="alice", password="pass123", betacode="abc")
        assert form.betacode == "abc"

    def test_missing_username_raises(self):
        import pytest
        with pytest.raises(Exception):
            SignUpForm(password="x")


class TestTokenForm:

    def test_password_auth(self):
        form = TokenForm(username="u", password="p")
        assert form.password == "p"
        assert form.token is None

    def test_token_auth(self):
        form = TokenForm(username="u", token="jwtabc")
        assert form.token == "jwtabc"
        assert form.password is None

    def test_with_site_target(self):
        form = TokenForm(username="u", password="p", site="s.com", target="t")
        assert form.site == "s.com"
        assert form.target == "t"


class TestPhoneForm:

    def test_valid(self):
        form = PhoneForm(phone_number="+1234567890")
        assert form.phone_number == "+1234567890"

    def test_missing_raises(self):
        import pytest
        with pytest.raises(Exception):
            PhoneForm()


class TestPayData:

    def test_valid(self):
        pd = PayData(token="t", seller="s", title="Sub", price=100, success_url="https://ok", cancel_url="https://no")
        assert pd.price == 100

    def test_optional_price(self):
        pd = PayData(token="t", seller="s", title="Free")
        assert pd.price is None

    def test_missing_token_raises(self):
        import pytest
        with pytest.raises(Exception):
            PayData(seller="s", title="t")