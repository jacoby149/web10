"""Local authoritative TXT + DNS-JSON fixture. No production resolver or API."""

import hmac
import json
import os
import socketserver
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import dns.flags
import dns.message
import dns.rcode
import dns.rrset

CONFIG = Path("/domain-config.json")
ROOT = Path("/domain")
state = {}
lock = threading.Lock()


def configuration():
    return json.loads(CONFIG.read_text())


def records(name):
    name = name.lower().rstrip(".")
    config = configuration()
    for case in config["cases"]:
        if name == "web10." + case["domain"]:
            with lock:
                mode = state.get(case["domain"], "a")
            if mode == "none":
                return []
            targets = ["a", "b"] if mode == "ambiguous" else [mode]
            return [f"web10.v=1;provider=node-{n}.federation.test;user={case[n]}" for n in targets]
    return []


class DNS(socketserver.BaseRequestHandler):
    def handle(self):
        wire, sock = self.request
        try:
            query = dns.message.from_wire(wire)
            reply = dns.message.make_response(query)
            reply.flags |= dns.flags.AA
            q = query.question[0]
            values = records(str(q.name)) if q.rdtype == 16 else []
            if values:
                reply.answer.append(dns.rrset.from_text(str(q.name), 0, "IN", "TXT", *map(json.dumps, values)))
            else:
                reply.set_rcode(dns.rcode.NXDOMAIN)
            sock.sendto(reply.to_wire(), self.client_address)
        except Exception:
            print("[domain-dns] malformed query denied", flush=True)


class HTTP(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # No headers, credentials or request bodies in fixture logs.

    def send(self, code, data, kind="application/json"):
        body = data if isinstance(data, bytes) else json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == "/dns-query":
            query = parse_qs(url.query)
            name = query.get("name", [""])[0].lower().rstrip(".")
            values = records(name) if query.get("type") == ["TXT"] else []
            return self.send(
                200,
                {
                    "Status": 0 if values else 3,
                    "Answer": [{"name": name + ".", "type": 16, "TTL": 0, "data": json.dumps(v)} for v in values],
                },
            )
        if url.path == "/config.json":
            return self.send(200, configuration())
        files = {
            "/": ROOT / "index.html",
            "/client.mjs": ROOT / "client.mjs",
            "/view.mjs": ROOT / "view.mjs",
            "/demo.css": ROOT / "demo.css",
            "/style.css": Path("/assets/docs/interop/style.css"),
            "/logo.png": Path("/assets/brand/logo-lockup.png"),
        }
        if url.path not in files:
            return self.send(404, {"error": "not_found"})
        path = files[url.path]
        kind = (
            "text/javascript"
            if path.suffix == ".mjs"
            else "text/css"
            if path.suffix == ".css"
            else "image/png"
            if path.suffix == ".png"
            else "text/html"
        )
        self.send(200, path.read_bytes(), kind)

    def do_POST(self):
        if self.path != "/control" or not hmac.compare_digest(
            self.headers.get("Authorization", ""), "Bearer " + os.environ["DNS_CONTROL_TOKEN"]
        ):
            return self.send(403, {"error": "denied"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 4096:
                raise ValueError()
            data = json.loads(self.rfile.read(size))
            case = next(c for c in configuration()["cases"] if c["domain"] == data["domain"])
            mode = data.get("mode")
            if mode not in ("none", "ambiguous"):
                mode = next(
                    n
                    for n in ("a", "b")
                    if data["record"] == f"web10.v=1;provider=node-{n}.federation.test;user={case[n]}"
                )
            with lock:
                state[case["domain"]] = mode
            self.send(200, {"changed": True})
        except (ValueError, KeyError, StopIteration):
            self.send(400, {"error": "invalid_fixture_record"})


if __name__ == "__main__":
    udp = socketserver.ThreadingUDPServer(("0.0.0.0", 53), DNS)
    threading.Thread(target=udp.serve_forever, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", 8080), HTTP).serve_forever()
