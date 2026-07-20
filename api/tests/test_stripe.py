"""Tests for stripe pure logic (dev_pay helpers only — user billing stripped per D21)."""

from unittest.mock import patch

from app.models.payment import PayData
from app.services import stripe


class TestGetSubscriptionPriceIds:
    def test_single_sub(self):
        subs = [{"items": {"data": [{"price": {"id": "price_1"}}]}}]
        result = stripe.get_subscription_price_ids(subs)
        assert result == ["price_1"]

    def test_multiple_subs(self):
        subs = [
            {"items": {"data": [{"price": {"id": "price_1"}}]}},
            {"items": {"data": [{"price": {"id": "price_2"}}]}},
        ]
        result = stripe.get_subscription_price_ids(subs)
        assert result == ["price_1", "price_2"]


class TestGetDevPaySubscription:
    def test_finds_matching_subscription(self):
        mock_subs = [
            {
                "metadata": {"title": "Pro", "seller": "alice", "price": "100"},
                "id": "sub_1",
            },
            {
                "metadata": {"title": "Basic", "seller": "bob", "price": "50"},
                "id": "sub_2",
            },
        ]
        pay_data = PayData(token="t", seller="alice", title="Pro", price=100)
        with patch.object(stripe, "get_active_subscriptions", return_value=mock_subs):
            result = stripe.get_dev_pay_subscription("cus_123", pay_data)
            assert result["id"] == "sub_1"

    def test_returns_none_when_no_match(self):
        mock_subs = [
            {
                "metadata": {"title": "Basic", "seller": "bob", "price": "50"},
                "id": "sub_2",
            },
        ]
        pay_data = PayData(token="t", seller="alice", title="Pro", price=100)
        with patch.object(stripe, "get_active_subscriptions", return_value=mock_subs):
            result = stripe.get_dev_pay_subscription("cus_123", pay_data)
            assert result is None

    def test_returns_none_when_missing_metadata(self):
        mock_subs = [
            {"metadata": {}, "id": "sub_1"},
        ]
        pay_data = PayData(token="t", seller="alice", title="Pro", price=100)
        with patch.object(stripe, "get_active_subscriptions", return_value=mock_subs):
            result = stripe.get_dev_pay_subscription("cus_123", pay_data)
            assert result is None


class TestGetDevPayMetadata:
    def test_returns_metadata(self):
        mock_sub = {
            "metadata": {"title": "Pro", "seller": "alice", "price": "100"},
            "id": "sub_1",
        }
        pay_data = PayData(token="t", seller="alice", title="Pro", price=100)
        with patch.object(stripe, "get_dev_pay_subscription", return_value=mock_sub):
            result = stripe.get_dev_pay_metadata("cus_123", pay_data)
            assert result["title"] == "Pro"
            assert result["seller"] == "alice"

    def test_returns_none_when_no_sub(self):
        pay_data = PayData(token="t", seller="alice", title="Pro", price=100)
        with patch.object(stripe, "get_dev_pay_subscription", return_value=None):
            result = stripe.get_dev_pay_metadata("cus_123", pay_data)
            assert result is None
