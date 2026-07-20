"""Tests for record factory functions in services/records.py."""

import datetime

import app.settings as settings
from app.services import records


class TestStarRecord:
    def test_returns_dict(self):
        r = records.star_record()
        assert isinstance(r, dict)

    def test_has_service_star(self):
        r = records.star_record()
        assert r["service"] == "*"

    def test_has_username_placeholder(self):
        r = records.star_record()
        assert r["username"] == "USERNAME"

    def test_has_password_placeholder(self):
        r = records.star_record()
        assert r["hashed_password"] == "PASSWORD"

    def test_has_phone_placeholder(self):
        r = records.star_record()
        assert r["phone_number"] == "PHONE_NUMBER"

    def test_verified_false(self):
        r = records.star_record()
        assert r["verified"] is False

    def test_customer_id_none(self):
        r = records.star_record()
        assert r["customer_id"] is None

    def test_business_id_none(self):
        r = records.star_record()
        assert r["business_id"] is None

    def test_credit_limit_is_free(self):
        r = records.star_record()
        assert r["credit_limit"] == settings.FREE_CREDITS

    def test_space_limit_is_free(self):
        r = records.star_record()
        assert r["space_limit"] == settings.FREE_SPACE

    def test_credits_spent_zero(self):
        r = records.star_record()
        assert r["credits_spent"] == 0

    def test_last_replenish_is_datetime(self):
        r = records.star_record()
        assert isinstance(r["last_replenish"], datetime.datetime)


class TestServicesRecord:
    def test_returns_dict(self):
        r = records.services_record()
        assert isinstance(r, dict)

    def test_service_is_services(self):
        r = records.services_record()
        assert r["service"] == "services"

    def test_empty_whitelist(self):
        r = records.services_record()
        assert r["whitelist"] == []

    def test_empty_blacklist(self):
        r = records.services_record()
        assert r["blacklist"] == []
