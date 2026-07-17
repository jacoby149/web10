"""Tests for Pydantic models in models.py."""

import app.models as models


# ---------------------------------------------------------------------------
# dotdict
# ---------------------------------------------------------------------------

class TestDotdict:

    def test_dot_get(self):
        d = models.dotdict({"a": 1, "b": 2})
        assert d.a == 1
        assert d.b == 2

    def test_dot_set(self):
        d = models.dotdict()
        d.key = "value"
        assert d["key"] == "value"

    def test_dot_delete(self):
        d = models.dotdict({"x": 1})
        del d.x
        assert "x" not in d

    def test_missing_key_returns_none(self):
        d = models.dotdict({"a": 1})
        assert d.missing is None

    def test_dict_operations(self):
        d = models.dotdict({"a": 1})
        assert "a" in d
        assert len(d) == 1


# ---------------------------------------------------------------------------
# Token
# ---------------------------------------------------------------------------

class TestToken:

    def test_minimal(self):
        t = models.Token()
        assert t.token is None
        assert t.query is None

    def test_with_token(self):
        t = models.Token(token="abc123")
        assert t.token == "abc123"

    def test_extra_fields_allowed(self):
        t = models.Token(token="x", query={"a": 1}, update={"b": 2}, custom="extra")
        assert t.token == "x"
        assert t.query == {"a": 1}


# ---------------------------------------------------------------------------
# TokenData
# ---------------------------------------------------------------------------

class TestTokenData:

    def test_defaults(self):
        td = models.TokenData()
        assert td.username is None
        assert td.site is None

    def test_populate_from_payload(self):
        td = models.TokenData()
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
        td = models.TokenData()
        td.populate_from_payload({})
        assert td.username is None

    def test_populate_from_token_form(self):
        td = models.TokenData()
        form = models.TokenForm(username="bob", site="x.com", target="t")
        td.populate_from_token_form(form)
        assert td.username == "bob"
        assert td.site == "x.com"
        assert td.target == "t"
        assert td.provider is None  # set later by create_web10_token


# ---------------------------------------------------------------------------
# SignUpForm
# ---------------------------------------------------------------------------

class TestSignUpForm:

    def test_valid(self):
        form = models.SignUpForm(username="alice", password="pass123", phone="+1234567890")
        assert form.username == "alice"

    def test_optional_fields(self):
        form = models.SignUpForm(username="alice", password="pass123")
        assert form.phone is None
        assert form.betacode is None

    def test_with_betacode(self):
        form = models.SignUpForm(username="alice", password="pass123", betacode="abc")
        assert form.betacode == "abc"

    def test_missing_username_raises(self):
        import pytest
        with pytest.raises(Exception):
            models.SignUpForm(password="x")


# ---------------------------------------------------------------------------
# TokenForm
# ---------------------------------------------------------------------------

class TestTokenForm:

    def test_password_auth(self):
        form = models.TokenForm(username="u", password="p")
        assert form.password == "p"
        assert form.token is None

    def test_token_auth(self):
        form = models.TokenForm(username="u", token="jwtabc")
        assert form.token == "jwtabc"
        assert form.password is None

    def test_with_site_target(self):
        form = models.TokenForm(username="u", password="p", site="s.com", target="t")
        assert form.site == "s.com"
        assert form.target == "t"


# ---------------------------------------------------------------------------
# PhoneForm
# ---------------------------------------------------------------------------

class TestPhoneForm:

    def test_valid(self):
        form = models.PhoneForm(phone_number="+1234567890")
        assert form.phone_number == "+1234567890"

    def test_missing_raises(self):
        import pytest
        with pytest.raises(Exception):
            models.PhoneForm()


# ---------------------------------------------------------------------------
# PayData
# ---------------------------------------------------------------------------

class TestPayData:

    def test_valid(self):
        pd = models.PayData(token="t", seller="s", title="Sub", price=100, success_url="https://ok", cancel_url="https://no")
        assert pd.price == 100

    def test_optional_price(self):
        pd = models.PayData(token="t", seller="s", title="Free")
        assert pd.price is None

    def test_missing_token_raises(self):
        import pytest
        with pytest.raises(Exception):
            models.PayData(seller="s", title="t")
