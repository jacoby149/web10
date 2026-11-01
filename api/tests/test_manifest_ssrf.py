"""Manifest destination repro gate, through the actual handler."""

import gzip
import io
import json
import socket
import ssl
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import MagicMock, patch

import pytest
import urllib3

from app import exceptions
from app.endpoints import system


@pytest.mark.parametrize("approved", [None, {"approved": False}, {"approved": True}])
def test_loopback_receives_no_request(approved):
    hits = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"internal":"canary"}')

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with patch.object(system.ch, "get_app", return_value=approved):
            with pytest.raises(type(exceptions.NO_PWA)):
                system.pwa_listing(f"http://127.0.0.1:{server.server_port}/app")
        assert hits == []
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_mixed_dns_receives_no_request():
    fake = MagicMock()
    fake.__enter__.return_value = fake
    fake.iter_content.return_value = [b'{"internal":"canary"}']
    answers = [(2, 1, 6, "", (ip, 80)) for ip in ("8.8.8.8", "127.0.0.1")]
    with (
        patch.object(system.ch, "get_app", return_value={"approved": True}),
        patch("socket.getaddrinfo", return_value=answers),
        patch("requests.get", return_value=fake) as old_transport,
        patch.object(system.urllib3, "HTTPConnectionPool") as new_transport,
    ):
        with pytest.raises(type(exceptions.NO_PWA)):
            system.pwa_listing("http://public.example/app")
        old_transport.assert_not_called()
        new_transport.assert_not_called()


@pytest.fixture
def transport():
    response = urllib3.HTTPResponse(body=io.BytesIO(b'{"name":"Notes"}'), status=200, preload_content=False)
    with (
        patch.object(system.ch, "get_app", return_value={"approved": True}) as registry,
        patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("8.8.8.8", 443))]) as dns,
        patch.object(system.urllib3, "HTTPSConnectionPool") as https,
        patch.object(system.urllib3, "HTTPConnectionPool") as http,
    ):
        https.return_value.urlopen.return_value = response
        http.return_value.urlopen.return_value = response
        yield registry, dns, https, http, response


@pytest.mark.parametrize(
    "url",
    [
        "https://user:pass@public.example/",
        "https://public.example/?x=1",
        "https://public.example/#x",
        "https://public.example/?",
        "https://public.example/#",
        "https://public.example\\@127.0.0.1/",
        "https://public.example/\n",
        " https://public.example/",
        "file:///etc/",
        "ftp://public.example/",
        "https://[fe80::1%25eth0]/",
        "https://%31%32%37.0.0.1/",
        "https:///public.example/",
        "https://public.example:/",
        "https://public.example:0/",
        "https://public.example:99999/",
        "https://public..example/",
        "https://public.example./",
        "https://public.example\x7f/",
        "https://[2606:4700:4700::1111]ignored/",
        "HTTPS://public.example/",
        "https://public.example:0443/",
    ],
)
def test_ambiguous_input_denied_before_registry_or_network(transport, url):
    registry, dns, https, http, _ = transport
    with pytest.raises(type(exceptions.NO_PWA)) as error:
        system.pwa_listing(url)
    assert error.value is exceptions.NO_PWA
    registry.assert_not_called()
    dns.assert_not_called()
    https.assert_not_called()
    http.assert_not_called()


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "10.0.0.1",
        "169.254.169.254",
        "192.168.0.1",
        "100.64.0.1",
        "0.0.0.0",
        "224.0.0.1",
        "::1",
        "fc00::1",
        "fe80::1",
        "::ffff:8.8.8.8",
        "2002:0808:0808::1",
    ],
)
def test_nonpublic_dns_or_literal_denied(transport, ip):
    _, dns, https, http, _ = transport
    dns.return_value = [(socket.AF_INET6 if ":" in ip else socket.AF_INET, 1, 6, "", (ip, 443))]
    for url in ("https://public.example/app", f"https://[{ip}]/" if ":" in ip else f"https://{ip}/"):
        with pytest.raises(type(exceptions.NO_PWA)):
            system.pwa_listing(url)
    https.assert_not_called()
    http.assert_not_called()


@pytest.mark.parametrize("app", [None, {"approved": False}])
def test_unapproved_public_app_denied_without_dns(transport, app):
    registry, dns, https, _, _ = transport
    registry.return_value = app
    with pytest.raises(type(exceptions.NO_PWA)):
        system.pwa_listing("https://public.example/app")
    dns.assert_not_called()
    https.assert_not_called()


@pytest.mark.parametrize("scheme", ["http", "https"])
def test_numeric_pin_host_tls_and_normalized_app_path(transport, scheme, monkeypatch):
    registry, dns, https, http, response = transport
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:1")
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:1")
    assert system.pwa_listing(f"{scheme}://www.PUBLIC.example:8443/docs/notes/index.html") == {"name": "Notes"}
    registry.assert_called_once_with(f"{scheme}://www.PUBLIC.example:8443/docs/notes/index.html")
    dns.assert_called_once_with("public.example", 8443, type=socket.SOCK_STREAM)
    factory = https if scheme == "https" else http
    args, kwargs = factory.call_args
    assert args == ("8.8.8.8",)
    assert kwargs["port"] == 8443
    assert kwargs["timeout"].connect_timeout == kwargs["timeout"].read_timeout == 1
    if scheme == "https":
        assert kwargs["server_hostname"] == kwargs["assert_hostname"] == "public.example"
        assert kwargs["cert_reqs"] == ssl.CERT_REQUIRED
    factory.return_value.urlopen.assert_called_once_with(
        "GET",
        "/docs/notes/manifest.json",
        headers={"Host": "public.example:8443", "Accept": "application/json"},
        redirect=False,
        retries=False,
        preload_content=False,
    )
    assert response.closed
    factory.return_value.close.assert_called_once()


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308, 404, 500])
def test_redirect_and_failure_status_never_read_or_followed(transport, status):
    _, _, https, _, _ = transport
    response = MagicMock(status=status, headers={"Location": "http://127.0.0.1/internal"})
    https.return_value.urlopen.return_value = response
    with pytest.raises(type(exceptions.NO_PWA)):
        system.pwa_listing("https://public.example/app")
    response.read.assert_not_called()
    response.close.assert_called_once()
    assert https.return_value.urlopen.call_count == 1
    assert https.return_value.urlopen.call_args.kwargs["redirect"] is False
    https.return_value.close.assert_called_once()


@pytest.mark.parametrize("extra", [0, 1])
@pytest.mark.parametrize("compressed", [False, True])
def test_decoded_exact_cap_and_one_byte_over(transport, extra, compressed):
    _, _, https, _, _ = transport
    body = json.dumps({"pad": ""}).encode()
    body = json.dumps({"pad": "x" * (256 * 1024 - len(body) + extra)}).encode()
    response = urllib3.HTTPResponse(
        body=io.BytesIO(gzip.compress(body) if compressed else body),
        headers={"Content-Encoding": "gzip"} if compressed else {},
        status=200,
        preload_content=False,
    )
    https.return_value.urlopen.return_value = response
    if extra:
        with pytest.raises(type(exceptions.NO_PWA)):
            system.pwa_listing("https://public.example/app")
    else:
        assert system.pwa_listing("https://public.example/app") == json.loads(body)
    assert response.closed
    https.return_value.close.assert_called_once()


@pytest.mark.parametrize(
    "failure",
    [
        urllib3.exceptions.SSLError("certificate mismatch"),
        urllib3.exceptions.ReadTimeoutError(None, "/", "timeout"),
        urllib3.exceptions.DecodeError("bad gzip"),
        OSError("connection failed"),
    ],
)
def test_transport_failures_close_pool(transport, failure):
    _, _, https, _, _ = transport
    https.return_value.urlopen.side_effect = failure
    with pytest.raises(type(exceptions.NO_PWA)):
        system.pwa_listing("https://public.example/app")
    https.return_value.close.assert_called_once()


def test_decode_failure_closes_response_and_pool(transport):
    _, _, https, _, _ = transport
    response = urllib3.HTTPResponse(
        body=io.BytesIO(b"not gzip"), status=200, headers={"Content-Encoding": "gzip"}, preload_content=False
    )
    https.return_value.urlopen.return_value = response
    with pytest.raises(type(exceptions.NO_PWA)) as error:
        system.pwa_listing("https://public.example/app")
    assert error.value is exceptions.NO_PWA
    assert response.closed
    https.return_value.close.assert_called_once()


@pytest.mark.parametrize("answers", [[], socket.gaierror("DNS failure")])
def test_dns_failure_denied(transport, answers):
    _, dns, https, _, _ = transport
    if isinstance(answers, Exception):
        dns.side_effect = answers
    else:
        dns.return_value = answers
    with pytest.raises(type(exceptions.NO_PWA)):
        system.pwa_listing("https://public.example/app")
    https.assert_not_called()


@pytest.mark.parametrize("host", ["8.8.8.8", "[2606:4700:4700::1111]"])
def test_public_literal_needs_no_dns(transport, host):
    _, dns, https, _, _ = transport
    assert system.pwa_listing(f"https://{host}/app") == {"name": "Notes"}
    dns.assert_not_called()
    assert https.call_args.args == (host.strip("[]"),)
    assert https.return_value.urlopen.call_args.kwargs["headers"]["Host"] == host


@pytest.mark.parametrize("redirect", [False, True])
def test_actual_http_transport_pins_numeric_socket_and_never_follows(redirect):
    hits, connections = [], []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append((self.path, self.headers["Host"]))
            self.send_response(302 if redirect else 200)
            self.send_header("Location", "/internal")
            self.end_headers()
            self.wfile.write(b'{"name":"Notes"}')

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    create_connection = urllib3.util.connection.create_connection

    def connect(address, *args, **kwargs):
        connections.append(address)
        # Only the test's socket handoff maps the pinned public IP to a fixture.
        return create_connection(("127.0.0.1", server.server_port), *args, **kwargs)

    try:
        with (
            patch.object(system.ch, "get_app", return_value={"approved": True}),
            patch("urllib3.util.connection.create_connection", side_effect=connect),
        ):
            if redirect:
                with pytest.raises(type(exceptions.NO_PWA)):
                    system.pwa_listing("http://8.8.8.8/app")
            else:
                assert system.pwa_listing("http://8.8.8.8/app") == {"name": "Notes"}
        assert connections == [("8.8.8.8", 80)]
        assert hits == [("/app/manifest.json", "8.8.8.8")]
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
