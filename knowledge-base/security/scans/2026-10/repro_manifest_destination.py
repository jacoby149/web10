"""Replay L1-A-02 against disposable loopback fixtures, never external services."""

import ast
import json
import logging
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import requests


def main():
    source = "api/app/endpoints/system.py"
    pin = "0d2a5d3fcc8ca2f2e87330b387ef65cbfca3b20f"
    tree = ast.parse(subprocess.check_output(["git", "show", f"{pin}:{source}"], text=True))
    handler = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "pwa_listing")
    handler.decorator_list = []
    hits = []

    class Fixture(BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path)
            if self.path == "/redirect/manifest.json":
                self.send_response(302)
                self.send_header("Location", "/internal/manifest.json")
                self.end_headers()
                return
            bodies = {
                "/internal/manifest.json": b'{"synthetic_internal":"loopback-only"}',
                "/docs/notes/manifest.json": b'{"name":"Synthetic Notes"}',
            }
            body = bodies.get(self.path)
            self.send_response(200 if body is not None else 404)
            self.send_header("Content-Length", str(len(body or b"")))
            self.end_headers()
            try:
                self.wfile.write(body or b"")
            except (BrokenPipeError, ConnectionResetError):
                pass

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"
    try:
        with requests.Session() as session:
            # Ignore operator proxy/netrc settings; every request stays in this fixture.
            session.trust_env = False
            env = dict(requests=SimpleNamespace(get=session.get, exceptions=requests.exceptions),
                       json=json, exceptions=SimpleNamespace(NO_PWA=RuntimeError("NO_PWA")),
                       log=logging.getLogger("manifest-replay"))
            exec(compile(ast.Module(body=[handler], type_ignores=[]), str(source), "exec"), env)
            fetch = env["pwa_listing"]
            assert fetch(base + "/internal") == {"synthetic_internal": "loopback-only"}
            assert hits == ["/internal/manifest.json"]
            hits.clear()
            assert fetch(base + "/redirect") == {"synthetic_internal": "loopback-only"}
            assert hits == ["/redirect/manifest.json", "/internal/manifest.json"]
            for suffix in ("/docs/notes", "/docs/notes/"):
                assert fetch(base + suffix) == {"name": "Synthetic Notes"}
        print("4 historical controls passed: direct loopback, redirect, two path forms")
        print("Pinned vulnerable source only; current denial controls live in api/tests/test_manifest_ssrf.py")
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == "__main__":
    main()
