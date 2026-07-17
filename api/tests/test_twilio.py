"""Tests for twilio pure logic (recovery_response, actionless_response)."""

from app.services import twilio


class TestRecoveryResponse:

    def test_contains_password(self):
        resp = twilio.recovery_response("temp123")
        assert "temp123" in resp
        assert "Your password has been reset to" in resp

    def test_returns_string(self):
        resp = twilio.recovery_response("abc")
        assert isinstance(resp, str)

    def test_contains_twiml(self):
        resp = twilio.recovery_response("x")
        assert "<" in resp


class TestActionlessResponse:

    def test_contains_reset_instruction(self):
        resp = twilio.actionless_response()
        assert "RESET" in resp

    def test_returns_string(self):
        resp = twilio.actionless_response()
        assert isinstance(resp, str)

    def test_contains_no_action(self):
        resp = twilio.actionless_response()
        assert "No action was taken" in resp