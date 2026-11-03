"""Issuer transport repro gates: no private destinations or redirect trust."""

import socket
from unittest.mock import MagicMock, patch

import pytest

from app.models.auth import Token, TokenData
from app.services import auth


def answer(ip):
    return (socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))


@pytest.fixture
def transport():
    response = MagicMock(status=200)
    pool = MagicMock()
    pool.urlopen.return_value = response
    with (
        patch("socket.getaddrinfo", return_value=[answer("93.184.216.34")]) as dns,
        patch("urllib3.HTTPSConnectionPool", return_value=pool) as connection,
        patch("requests.post", return_value=MagicMock(status_code=200)) as legacy,
    ):
        yield dns, connection, pool, response, legacy


def certify(provider):
    with patch.object(auth, "decode_token", return_value=TokenData(provider=provider)):
        return auth.certify_with_remote_provider(Token(token="synthetic-credential"))


@pytest.mark.parametrize(
    "addresses",
    [["127.0.0.1"], ["10.0.0.1"], ["169.254.169.254"], ["93.184.216.34", "127.0.0.1"]],
)
def test_private_or_mixed_dns_is_denied_before_connection(transport, addresses):
    dns, connection, _, _, legacy = transport
    dns.return_value = [answer(ip) for ip in addresses]
    with pytest.raises(Exception):
        certify("https://issuer.example")
    connection.assert_not_called()
    legacy.assert_not_called()


def test_alternate_loopback_spelling_is_denied(transport):
    dns, connection, _, _, legacy = transport
    dns.return_value = [answer("127.0.0.1")]
    with pytest.raises(Exception):
        certify("https://2130706433")
    connection.assert_not_called()
    legacy.assert_not_called()


@pytest.mark.parametrize(
    "provider",
    [
        "http://issuer.example",
        "https://user:secret@issuer.example",
        "https://issuer.example?x=1",
        "https://issuer.example#x",
    ],
)
def test_unauthenticated_or_ambiguous_provider_is_denied(transport, provider):
    _, connection, _, _, legacy = transport
    with pytest.raises(Exception):
        certify(provider)
    connection.assert_not_called()
    legacy.assert_not_called()


@pytest.mark.parametrize("provider", ["api.web10.app", "api.dev.web10.app", "https://issuer.example"])
def test_https_pins_validated_ip_and_preserves_provider_identity(transport, provider):
    dns, connection, pool, response, legacy = transport
    assert certify(provider) is True
    host = provider.removeprefix("https://")
    dns.assert_called_once_with(host, 443, type=socket.SOCK_STREAM)
    assert connection.call_args.args == ("93.184.216.34",)
    assert connection.call_args.kwargs["server_hostname"] == host
    assert connection.call_args.kwargs["assert_hostname"] == host
    assert pool.urlopen.call_args.args == ("POST", "/certify")
    assert pool.urlopen.call_args.kwargs["redirect"] is False
    assert pool.urlopen.call_args.kwargs["headers"]["Host"] == host
    legacy.assert_not_called()
    response.close.assert_called_once()
    pool.close.assert_called_once()


def test_redirect_is_not_an_issuer_yes(transport):
    _, _, pool, response, _ = transport
    response.status = 302
    response.headers = {"Location": "http://127.0.0.1/private"}
    assert certify("https://issuer.example") is False
    assert pool.urlopen.call_count == 1
