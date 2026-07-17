"""Tests for stripe pure logic (credit_space, get_subscription_price_ids, dev_pay helpers)."""

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


class TestCreditSpace:

    def test_no_subscriptions_returns_free(self):
        with patch.object(stripe, "get_active_subscriptions", return_value=[]):
            c, s = stripe.credit_space("cus_123")
            assert c == stripe.settings.FREE_CREDITS
            assert s == stripe.settings.FREE_SPACE

    def test_with_credit_subscription(self):
        mock_subs = [
            {
                "items": {
                    "data": [
                        {"price": {"id": stripe.CREDIT_SUB_ID}, "quantity": 5}
                    ]
                }
            }
        ]
        with patch.object(stripe, "get_active_subscriptions", return_value=mock_subs):
            c, s = stripe.credit_space("cus_123")
            assert c == 5 + stripe.settings.FREE_CREDITS
            assert s == stripe.settings.FREE_SPACE

    def test_with_space_subscription(self):
        mock_subs = [
            {
                "items": {
                    "data": [
                        {"price": {"id": stripe.SPACE_SUB_ID}, "quantity": 2}
                    ]
                }
            }
        ]
        with patch.object(stripe, "get_active_subscriptions", return_value=mock_subs):
            c, s = stripe.credit_space("cus_123")
            assert c == stripe.settings.FREE_CREDITS
            assert s == 2 * 1024 + stripe.settings.FREE_SPACE


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


class TestManageSubscription:

    def test_existing_subscription_returns_portal(self):
        mock_subs = [
            {
                "items": {
                    "data": [
                        {"price": {"id": stripe.CREDIT_SUB_ID}}
                    ]
                }
            }
        ]
        with patch.object(stripe, "get_active_subscriptions", return_value=mock_subs):
            with patch.object(stripe, "create_portal_session", return_value="https://portal.url") as mock_portal:
                result = stripe.manage_subscription("cus_123", stripe.CREDIT_SUB_ID)
                assert result == "https://portal.url"
                mock_portal.assert_called_once_with("cus_123")

    def test_new_subscription_returns_checkout(self):
        with patch.object(stripe, "get_active_subscriptions", return_value=[]):
            with patch.object(stripe, "create_checkout_session", return_value="https://checkout.url") as mock_checkout:
                result = stripe.manage_subscription("cus_123", stripe.CREDIT_SUB_ID)
                assert result == "https://checkout.url"
                mock_checkout.assert_called_once()