"""Loopback fixture protocol/control tests; no Docker or external DNS."""

import importlib.util
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import dns.message
import dns.query


class DNSFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("tested_domain_dns", Path(__file__).with_name("dns_fixture.py"))
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)
        cls.private = tempfile.TemporaryDirectory(prefix="domain-dns-test-")
        cls.module.CONFIG = Path(cls.private.name) / "config.json"
        cls.module.CONFIG.write_text(json.dumps({"cases": [{"domain": "creator.example", "a": "old", "b": "new"}]}))
        cls.secret = patch.dict(os.environ, {"DNS_CONTROL_TOKEN": "synthetic-control-only"})
        cls.secret.start()
        cls.http = cls.module.ThreadingHTTPServer(("127.0.0.1", 0), cls.module.HTTP)
        cls.udp = cls.module.socketserver.ThreadingUDPServer(("127.0.0.1", 0), cls.module.DNS)
        cls.threads = [threading.Thread(target=s.serve_forever, daemon=True) for s in (cls.http, cls.udp)]
        for thread in cls.threads:
            thread.start()
        cls.origin = f"http://127.0.0.1:{cls.http.server_port}"

    @classmethod
    def tearDownClass(cls):
        for server in (cls.http, cls.udp):
            server.shutdown()
            server.server_close()
        for thread in cls.threads:
            thread.join()
        cls.secret.stop()
        cls.private.cleanup()

    def setUp(self):
        self.module.state.clear()

    def get(self, path):
        with urlopen(self.origin + path, timeout=2) as response:
            return json.load(response)

    def control(self, data, secret="synthetic-control-only"):
        request = Request(
            self.origin + "/control",
            json.dumps({"domain": "creator.example", **data}).encode(),
            {"Authorization": "Bearer " + secret, "Content-Type": "application/json"},
        )
        with urlopen(request, timeout=2) as response:
            return json.load(response)

    def assert_parity(self, expected_count):
        answer = dns.query.udp(
            dns.message.make_query("web10.creator.example.", "TXT"),
            "127.0.0.1",
            port=self.udp.server_address[1],
            timeout=2,
        )
        txt = [b"".join(record.strings).decode() for group in answer.answer for record in group]
        data = self.get("/dns-query?name=web10.creator.example&type=TXT")
        # DNS RRsets are unordered; parity is the exact multiset, not wire order.
        self.assertCountEqual(txt, [json.loads(row["data"]) for row in data["Answer"]])
        self.assertEqual(len(txt), expected_count)
        self.assertEqual(answer.rcode(), data["Status"])
        return txt

    def test_udp_and_json_share_live_txt_state_for_every_mode(self):
        self.assertIn("user=old", self.assert_parity(1)[0])
        self.control({"record": "web10.v=1;provider=node-b.federation.test;user=new"})
        self.assertIn("user=new", self.assert_parity(1)[0])
        self.control({"mode": "ambiguous"})
        self.assert_parity(2)
        self.control({"mode": "none"})
        self.assert_parity(0)

    def test_missing_wrong_control_secret_cannot_retarget(self):
        for secret in ("", "wrong"):
            with self.assertRaises(HTTPError) as error:
                self.control({"mode": "none"}, secret)
            self.assertEqual(error.exception.code, 403)
            self.assertIn("user=old", self.assert_parity(1)[0])

    def test_control_rejects_arbitrary_destination(self):
        with self.assertRaises(HTTPError) as error:
            self.control({"record": "web10.v=1;provider=127.0.0.1;user=attacker"})
        self.assertEqual(error.exception.code, 400)
        self.assertIn("user=old", self.assert_parity(1)[0])

    def test_private_paths_and_control_secret_are_not_served(self):
        for path in ("/domain-control", "/client-config.json", "/../config.json", "/dns_fixture.py"):
            with self.assertRaises(HTTPError) as error:
                self.get(path)
            self.assertEqual(error.exception.code, 404)
        self.assertNotIn("synthetic-control-only", json.dumps(self.get("/config.json")))


if __name__ == "__main__":
    unittest.main()
