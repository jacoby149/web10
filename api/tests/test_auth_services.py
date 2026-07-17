"""Tests for auth service gaps: authenticate_user, certify_with_remote_provider, check_admin."""

from unittest.mock import MagicMock, patch

import pytest

from app.models.auth import Token, TokenData
from app.services.auth import (
    authenticate_user,
    certify_with_remote_provider,
    check_admin,
    get_password_hash,
    verify_password,
    pwd_context,
)
import app.settings as settings


class TestAuthenticateUser:

    def test_valid_user(self):
        mock_user = MagicMock()
        mock_user.hashed_password = "__hashed__"
        with patch("app.services.auth.get_user", return_value=mock_user):
            with patch.object(pwd_context, "verify", return_value=True):
                result = authenticate_user("alice", "secret")
                assert result is mock_user

    def test_user_not_found_raises(self):
        with patch("app.services.auth.get_user", return_value=None):
            with pytest.raises(Exception):
                authenticate_user("nobody", "pass")

    def test_wrong_password_raises(self):
        mock_user = MagicMock()
        mock_user.hashed_password = "__hashed__"
        with patch("app.services.auth.get_user", return_value=mock_user):
            with patch.object(pwd_context, "verify", return_value=False):
                with pytest.raises(Exception):
                    authenticate_user("alice", "wrong")


class TestCertifyWithRemoteProvider:

    def test_remote_certifies(self):
        token = Token(token="remote_token")
        mock_response = MagicMock()
        mock_response.status_code = 200
        with patch("app.services.auth.decode_token") as mock_decode:
            mock_decode.return_value = TokenData(provider="https://remote.provider")
            with patch("app.services.auth.requests.post", return_value=mock_response):
                result = certify_with_remote_provider(token)
                assert result is True

    def test_remote_fails(self):
        token = Token(token="remote_token")
        mock_response = MagicMock()
        mock_response.status_code = 401
        with patch("app.services.auth.decode_token") as mock_decode:
            mock_decode.return_value = TokenData(provider="https://remote.provider")
            with patch("app.services.auth.requests.post", return_value=mock_response):
                result = certify_with_remote_provider(token)
                assert result is False

    def test_remote_request_exception(self):
        token = Token(token="remote_token")
        with patch("app.services.auth.decode_token") as mock_decode:
            mock_decode.return_value = TokenData(provider="https://remote.provider")
            with patch("app.services.auth.requests.post", side_effect=Exception("timeout")):
                with pytest.raises(Exception):
                    certify_with_remote_provider(token)


class TestCheckAdmin:

    def test_admin_permitted(self):
        token = Token(token="admin_token")
        with patch("app.services.auth.decode_token") as mock_decode:
            mock_decode.return_value = TokenData(username="alice")
            with patch("app.services.auth.is_permitted", return_value=True):
                check_admin(token)  # returns None on success, no exception raised

    def test_non_admin_raises(self):
        token = Token(token="user_token")
        with patch("app.services.auth.decode_token") as mock_decode:
            mock_decode.return_value = TokenData(username="bob")
            with patch("app.services.auth.is_permitted", return_value=False):
                with pytest.raises(Exception):
                    check_admin(token)


class TestPasswordHash:

    def test_hash_produces_string(self, mocker):
        mocker.patch.object(pwd_context, "hash", return_value="hashed_value")
        h = get_password_hash("mysecret")
        assert h == "hashed_value"

    def test_hash_differs_for_different_passwords(self, mocker):
        mocker.patch.object(pwd_context, "hash", side_effect=["hash1", "hash2"])
        h1 = get_password_hash("pass1")
        h2 = get_password_hash("pass2")
        assert h1 != h2

    def test_verify_matches_hash(self, mocker):
        mocker.patch.object(pwd_context, "verify", return_value=True)
        assert verify_password("mysecret", "hashed") is True

    def test_verify_fails_wrong_password(self, mocker):
        mocker.patch.object(pwd_context, "verify", return_value=False)
        assert verify_password("wrong", "hashed") is False