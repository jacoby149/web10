"""Anonymous manifest proxy destination and readiness disclosure regressions."""

import socket
from unittest.mock import MagicMock, patch

import pytest
import urllib3
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.endpoints import system


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(system.router)
    return TestClient(app)


def dns(ip):
    return [(socket.AF_INET6 if ":" in ip else socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))]


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com",
        "gopher://example.com",
        "http://user:secret@example.com",
        "http://@example.com",
        "http://localhost",
        "http://localhost.",
        "http://foo.localhost",
        "http://foo.local",
        "http://foo.internal",
        "http://127.0.0.1",
        "http://10.0.0.1",
        "http://172.16.0.1",
        "http://192.168.1.1",
        "http://169.254.169.254",
        "http://0.0.0.0",
        "http://100.64.0.1",
        "http://224.0.0.1",
        "http://2130706433",
        "http://0x7f000001",
        "http://0177.0.0.1",
        "http://127.1",
        "http://[::1]",
        "http://[fc00::1]",
        "http://[fe80::1]",
        "http://[::ffff:127.0.0.1]",
        "http://[::ffff:8.8.8.8]",
        "http://[fe80::1%25eth0]",
        "http://%31%32%37.0.0.1",
        "http://example.com\\@127.0.0.1",
        " https://example.com",
        "https://example.com\n",
        "https://example.com:bad",
        "https://example.com:99999",
        "https://example.com?x=1",
        "https://example.com#fragment",
    ],
)
def test_malicious_url_never_resolves_or_connects(client, url):
    with (
        patch.object(system.ch, "get_app") as registration,
        patch.object(system.socket, "getaddrinfo") as resolve,
        patch.object(system.urllib3.HTTPConnectionPool, "urlopen") as fetch,
    ):
        response = client.get("/pwa_listing", params={"url": url})
    assert response.status_code == 401
    registration.assert_not_called()
    resolve.assert_not_called()
    fetch.assert_not_called()


@pytest.mark.parametrize("record", [None, {"approved": False}, {}])
def test_requires_authoritative_approved_record(client, record):
    with (
        patch.object(system.ch, "get_app", return_value=record) as registration,
        patch.object(system.socket, "getaddrinfo") as resolve,
    ):
        response = client.get("/pwa_listing", params={"url": "https://example.com/notes/"})
    assert response.status_code == 401
    registration.assert_called_once_with("https://example.com/notes/")
    resolve.assert_not_called()


@pytest.mark.parametrize(
    "addresses",
    [
        [],
        dns("127.0.0.1"),
        dns("10.0.0.1"),
        dns("169.254.169.254"),
        dns("::1"),
        dns("fc00::1"),
        dns("fe80::1"),
        dns("::ffff:8.8.8.8"),
        dns("93.184.216.34") + dns("192.168.1.1"),
    ],
)
def test_all_dns_answers_must_be_public(client, addresses):
    with (
        patch.object(system.ch, "get_app", return_value={"approved": True}),
        patch.object(system.socket, "getaddrinfo", return_value=addresses),
        patch.object(system.urllib3.HTTPConnectionPool, "urlopen") as fetch,
    ):
        response = client.get("/pwa_listing", params={"url": "https://example.com/"})
    assert response.status_code == 401
    fetch.assert_not_called()


@pytest.mark.parametrize("failure", [socket.gaierror("DNS secret"), OSError("DNS failed")])
def test_dns_failure_is_closed(client, failure):
    with (
        patch.object(system.ch, "get_app", return_value={"approved": True}),
        patch.object(system.socket, "getaddrinfo", side_effect=failure),
    ):
        response = client.get("/pwa_listing", params={"url": "https://example.com"})
    assert response.status_code == 401
    assert "secret" not in response.text


@pytest.mark.parametrize("scheme,ip", [("https", "93.184.216.34"), ("http", "2606:4700:4700::1111")])
def test_connection_pins_ip_preserving_host_and_tls(client, scheme, ip):
    pool_type = urllib3.HTTPSConnectionPool if scheme == "https" else urllib3.HTTPConnectionPool
    captured = []
    response = MagicMock(status=200)
    response.read.return_value = b'{"name":"Public Notes","icons":[]}'

    def fetch(pool, method, path, **kwargs):
        captured.append((pool, method, path, kwargs))
        # Drive the real urllib3 connection creation, not just the URL builder.
        connection = pool._new_conn()
        with patch("urllib3.util.connection.create_connection") as connect:
            connection._new_conn()
        assert connect.call_args.args[0] == (ip, 8443)
        if scheme == "https":
            assert connection.server_hostname == "example.com"
            assert connection.assert_hostname == "example.com"
            assert connection.cert_reqs == "CERT_REQUIRED"
        return response

    with (
        patch.object(system.ch, "get_app", return_value={"approved": True}),
        # A second hostname resolution would rebind to loopback.
        patch.object(system.socket, "getaddrinfo", side_effect=[dns(ip), dns("127.0.0.1")]) as resolve,
        patch.object(pool_type, "urlopen", autospec=True, side_effect=fetch),
        patch.dict("os.environ", {"HTTPS_PROXY": "http://127.0.0.1:9999"}),
    ):
        result = client.get("/pwa_listing", params={"url": f"{scheme}://example.com:8443/notes/"})
    assert result.status_code == 200
    assert result.json()["name"] == "Public Notes"
    resolve.assert_called_once_with("example.com", 8443, type=socket.SOCK_STREAM)
    pool, method, path, kwargs = captured[0]
    assert pool.host == ip
    assert method == "GET" and path == "/notes/manifest.json"
    assert kwargs["headers"]["Host"] == "example.com:8443"
    assert kwargs["redirect"] is False and kwargs["retries"] is False
    response.read.assert_called_once_with(256 * 1024 + 1, decode_content=True)
    response.close.assert_called_once()


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308, 404, 500])
def test_redirects_and_errors_never_followed(client, status):
    response = MagicMock(status=status, headers={"Location": "http://169.254.169.254/latest/meta-data/"})
    with (
        patch.object(system.ch, "get_app", return_value={"approved": True}),
        patch.object(system.socket, "getaddrinfo", return_value=dns("93.184.216.34")),
        patch.object(urllib3.HTTPSConnectionPool, "urlopen", return_value=response) as fetch,
    ):
        result = client.get("/pwa_listing", params={"url": "https://example.com"})
    assert result.status_code == 401
    assert fetch.call_count == 1
    assert fetch.call_args.kwargs["redirect"] is False
    response.read.assert_not_called()
    response.close.assert_called_once()


def test_ready_does_not_disclose_exception(client):
    with patch.object(system.ch, "client") as database:
        database.command.side_effect = RuntimeError("password=SUPERSECRET host=internal-db")
        result = client.get("/ready")
    assert result.status_code == 503
    assert result.json() == {"detail": "DB unreachable"}
