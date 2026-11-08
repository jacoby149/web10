#!/usr/bin/env python3
"""Independent fixture expectations and real request orchestration controls."""
import asyncio
import base64
import gzip
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx

import core_feed
import dataset
import dataset_v2 as fixture
import load_core
import observe


class FixtureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.recipe = {"creators": 40, "follow": 25, "readers": 2, "seed": 42, "locality": "dispersed"}

    def test_independent_cardinalities_and_canonical_groups(self):
        manifest = fixture.build(self.root / "data", self.recipe)
        self.assertEqual(fixture.validate(self.root / "data")["rows"], {
            "users": 42, "documents": 124, "doc_groups": 164,
            "group_contracts": 40, "group_members": 172, "app_contracts": 2})
        groups = [json.loads(line) for line in gzip.decompress((self.root / "data/group_contracts.jsonl.gz").read_bytes()).splitlines()]
        self.assertTrue(all(g["group_id"].endswith("/followers") for g in groups))
        self.assertEqual(manifest["candidate_author_coverage"], 40)

    def test_hot_and_dispersed_same_cardinalities_not_same_graph(self):
        hot = fixture.build(self.root / "hot", {**self.recipe, "locality": "hot"})
        dispersed = fixture.build(self.root / "dispersed", self.recipe)
        self.assertEqual({t: v["rows"] for t, v in hot["files"].items()}, {t: v["rows"] for t, v in dispersed["files"].items()})
        self.assertNotEqual(hot["dataset_id"], dispersed["dataset_id"])
        self.assertEqual(hot["candidate_author_coverage"], 25)
        self.assertEqual(fixture.followed_indices(self.recipe, 1), [*range(25, 40), *range(10)])

    def test_exact_repeat_and_tamper_refusal(self):
        fixture.build(self.root / "a", self.recipe)
        fixture.build(self.root / "b", self.recipe)
        self.assertEqual((self.root / "a/manifest.json").read_bytes(), (self.root / "b/manifest.json").read_bytes())
        with self.assertRaises(FileExistsError):
            fixture.build(self.root / "a", self.recipe)
        (self.root / "a/documents.jsonl.gz").write_bytes(b"corrupt")
        with self.assertRaises(ValueError):
            fixture.validate(self.root / "a")

    def test_public_discover_links_profiles_and_distinct_times(self):
        rows = list(fixture.rows(self.recipe))
        docs = [r for t, r in rows if t == "documents"]
        posts = [r for r in docs if r["collection_name"] == "posts"]
        self.assertEqual(len({p["created_at"] for p in posts}), 40)
        self.assertEqual(len([r for r in docs if r["collection_name"] == "profile"]), 40)
        attachments = {(r["doc_id"], r["group_id"]) for t, r in rows if t == "doc_groups"}
        for post in posts:
            self.assertIn((post["doc_id"], fixture.DISCOVER), attachments)
            self.assertIn((post["doc_id"], fixture.followers(post["author_key"])), attachments)

    def test_bad_recipe(self):
        for change in ({"locality": "random"}, {"follow": 41}, {"readers": 0}, {"extra": 1}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                fixture.build(self.root / "bad", {**self.recipe, **change})

    def test_v1_generator_stays_pinned(self):
        pin = json.loads((Path(__file__).parent / "evidence/frozen-1m-v1.json").read_bytes())
        self.assertEqual(dataset.digest(dataset.__file__), pin["generator_sha256"])


class CoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_open_arrivals_overlap_and_drain_is_censored(self):
        claims = base64.urlsafe_b64encode(json.dumps({"expires": "2040-01-01T00:00:00Z"}).encode()).decode().rstrip("=")
        token = "synthetic." + claims + ".not-a-signature"
        manifest = {"recipe": {"follow": 25}, "readers": ["a", "b"]}

        async def prepared(*args):
            return [(token, ["g"]), (token + "x", ["g"])]

        async def slow(*args):
            await asyncio.sleep(1)
            return [], []

        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(core_feed, "prepare", prepared), patch.object(core_feed, "feed", slow):
                result = await load_core.run_point("http://127.0.0.1:6091", manifest, 2, .02, 0, .05, .01, Path(temporary))
            self.assertEqual(result["counts"]["measured:scheduled"], 5)
            self.assertEqual(result["counts"]["measured:started"], 5)
            self.assertEqual(result["counts"]["measured:failed"], 5)
            self.assertGreater(result["counts"]["all:peak_feed_in_flight"], 1)
            feeds = [json.loads(s) for s in (Path(temporary) / "feeds.jsonl").read_text().splitlines()]
            self.assertTrue(all(r["censored"] for r in feeds))

    async def test_main_precedes_concurrent_followups_and_exact_ids(self):
        requests, observations = [], []
        active = peak = 0
        ids = [str(__import__("uuid").uuid5(__import__("uuid").NAMESPACE_URL, str(i))) for i in range(21)]

        async def transport(request):
            nonlocal active, peak
            body = json.loads(request.content)
            requests.append((request.url.path, body))
            self.assertEqual(request.headers["origin"], fixture.ORIGIN)
            if len(requests) == 1:
                result = {"rows": [{"doc_id": i} for i in ids]}
            else:
                active += 1
                peak = max(peak, active)
                await asyncio.sleep(.005)
                active -= 1
                result = {"rows": []} if request.url.path == "/v3/query" else {}
            return httpx.Response(200, json=result, headers={"x-research-id": request.headers["x-research-id"]})

        async with httpx.AsyncClient(base_url="http://test", transport=httpx.MockTransport(transport)) as client:
            await core_feed.feed(client, core_feed.wire(), "not-a-real-token", ["followers"], observations, "measured", 0)
        self.assertEqual(peak, 3)
        self.assertEqual(len(observations), 4)
        self.assertTrue(all(o["correlated"] for o in observations))
        self.assertEqual(requests[-1][1]["doc_ids"], ids)
        self.assertNotIn("not-a-real-token", json.dumps(observations))

    async def test_empty_feed_is_failure_not_four_successes(self):
        records = []
        async with httpx.AsyncClient(base_url="http://test", transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"rows": []}))) as client:
            with self.assertRaisesRegex(ValueError, "empty main"):
                await core_feed.feed(client, core_feed.wire(), "token", ["g"], records, "measured", 0)
        self.assertEqual(len(records), 1)

    async def test_failure_kept_without_http_body(self):
        records = []
        async with httpx.AsyncClient(base_url="http://test", transport=httpx.MockTransport(lambda r: httpx.Response(429, text="private-body"))) as client:
            with self.assertRaises(httpx.HTTPStatusError):
                await core_feed.feed(client, core_feed.wire(), "token", ["g"], records, "warmup", 1)
        self.assertEqual(records[0]["status"], 429)
        self.assertNotIn("private-body", json.dumps(records))

    async def test_untrusted_id_cannot_enter_followup_sql(self):
        with self.assertRaises(ValueError):
            core_feed.payload({"sql": "SELECT __POST_IDS__"}, "t", ["g"], ["x' OR 1=1"])


class ScheduleTests(unittest.TestCase):
    def test_actual_http_inflight_is_not_feed_task_count(self):
        records = load_core.Records(io.StringIO())
        for _ in range(3):
            records.begin()
        for kind in ("reactions", "comments", "views"):
            records.append({"phase": "measured", "kind": kind, "status": 200, "error": None})
        self.assertEqual(records.peak_in_flight, 3)
        self.assertEqual(records.in_flight, 0)

    def test_no_production_target_or_embedded_credentials(self):
        for value in ("https://api.web10.app", "http://8.8.8.8", "http://u:p@127.0.0.1", "http://127.0.0.1/token?secret=x", "http://169.254.169.254"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                load_core.validate_target(value)
        self.assertEqual(load_core.validate_target("http://10.20.0.2:6091"), "http://10.20.0.2:6091")

    def test_offered_schedule_has_no_completion_dependency(self):
        points = list(load_core.schedule(20000, 60, 180))
        self.assertEqual(len(points), 60000)
        self.assertEqual(points[:2], [(0, 0), (.003, 1)])
        self.assertEqual(points[20000], (60, 0))
        self.assertEqual(len({r for _, r in points}), 20000)

    def test_invalid_schedule(self):
        for args in ((0, 60, 180), (1, 0, 180), (1, 60, 0)):
            with self.assertRaises(ValueError):
                list(load_core.schedule(*args))

    def test_correlation_missing_duplicate_and_success_percentiles(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            requests = [{"request_id": "a", "kind": "main", "phase": "measured", "status": 200, "error": None, "client_ms": 10},
                        {"request_id": "b", "kind": "views", "phase": "measured", "status": 500, "error": "failed", "client_ms": 20}]
            (root / "requests.jsonl").write_text("\n".join(json.dumps(r) for r in requests))
            (root / "feeds.jsonl").write_text(json.dumps({"phase": "measured", "success": False}))
            server = {"request_id": "a", "status": 200, "phases_ms": {"total": 8}}
            text = "COSTFN_REQUEST=" + json.dumps(server) + "\n"
            result = observe.reconcile(root, text + text)
            self.assertEqual(result["missing_ids"], ["b"])
            self.assertEqual(result["duplicate_server_ids"], ["a"])
            self.assertEqual(result["summary"]["measured:main"]["handler_success_ms"]["50"], 8)


if __name__ == "__main__":
    unittest.main()
