"""Offline algebra/AST controls; native memory and T1 need separate receipts."""
from collections import Counter
import json
import hashlib
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
import zlib

import sqlglot
from sqlglot import exp

import arm_satellite_batch as batch
import arm_satellite_batch_fixture as fixture
import arm_satellite_batch_run as runner
import arm_satellite_counts as counts
import arm_satellite_sql as typed


class BatchTests(unittest.TestCase):
    def test_retry_approval_binds_failed_attempt_host_and_original_deadline(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "counts").mkdir()
            (root / "evidence").mkdir()
            previous = root / "counts/result.json"
            previous.write_text('{"outcome":"STOP"}')
            session = SimpleNamespace(host_id=123, operation={"deadline_utc": "2026-11-15T15:38:32+00:00"})
            approval = {"kind": "SATELLITE_BATCH_SETUP_RETRY", "approved_by": "Jacob", "attempt": "p2",
                        "droplet_id": 123, "deadline_utc": session.operation["deadline_utc"],
                        "previous_result_sha256": hashlib.sha256(previous.read_bytes()).hexdigest(),
                        "batches": 8, "fanout": False, "higher_limits": False}
            path = root / "evidence/batch-approval.json"
            path.write_text(json.dumps(approval))
            self.assertEqual(runner.approved(session, root), approval)
            for key, value in (("droplet_id", 456), ("deadline_utc", "later"), ("fanout", True),
                               ("higher_limits", True), ("previous_result_sha256", "wrong"), ("batches", True)):
                path.write_text(json.dumps({**approval, key: value}))
                with self.subTest(key=key), self.assertRaises(ValueError):
                    runner.approved(session, root)

    def test_partition_is_inside_both_history_windows_and_retains_policies(self):
        original = counts.canonical_boundary("reactions", ["a", "b"], "reader")
        tree = sqlglot.parse_one(batch.boundary(original, 2, 8), read="clickhouse")
        for table in tree.find_all(exp.Table):
            if table.name in ("documents", "doc_groups"):
                select = table.find_ancestor(exp.Select)
                self.assertIn("cityHash64(doc_id)", select.args["where"].sql(dialect="clickhouse"))
                self.assertTrue(list(select.find_all(exp.Window)))
        for name in ("user_blacklist", "group_blacklist", "user_group_sharing", "group_hidden_docs", "banned_users"):
            self.assertIn(name, tree.sql())
        self.assertEqual(len(list(tree.find_all(exp.Window))), len(list(sqlglot.parse_one(original, read="clickhouse").find_all(exp.Window))))

    def test_bad_batch_or_unrecognized_sources_refuse(self):
        for index, total in ((0, 0), (-1, 8), (8, 8), (True, 8), (0, 1.5)):
            with self.assertRaises(ValueError):
                batch.boundary("SELECT * FROM documents", index, total)
        with self.assertRaises(ValueError):
            batch.boundary("SELECT * FROM unknown", 0, 2)

    def test_families_share_a_boundary_but_not_reference_semantics(self):
        families = batch.families(counts.RECIPES)
        self.assertEqual(sorted(len(family) for family in families), [1, 1, 2])
        reactions = next(family for family in families if len(family) == 2)
        query = batch.partial_sql(counts.canonical_boundary("reactions", ["a"], "r"), "a" * 64,
                                  reactions, 0, 8, "new_parts")
        tree = sqlglot.parse_one(query, read="clickhouse")
        self.assertEqual(sum(table.name == "documents" for table in tree.find_all(exp.Table)), 1)
        self.assertEqual(tree.this.this.name, "new_parts")
        self.assertNotIn("INSERT INTO counting_numbers ", query)
        self.assertIn("arrayJoin", query)

    def test_distinct_and_row_counts_sum_only_over_disjoint_document_ids(self):
        # Same doc across two groups AND authors must stay in one batch.
        rows = [("shared", "author-a", "g1"), ("shared", "author-a", "g2"),
                ("shared", "author-b", "g1"), ("other", "author-c", "g1")]
        for total in (1, 2, 8, 17):
            pieces = [[row for row in rows if zlib.crc32(row[0].encode()) % total == index] for index in range(total)]
            self.assertEqual(sum(len(piece) for piece in pieces), len(rows))
            self.assertEqual(sum(len({row[0] for row in piece}) for piece in pieces), 2)
            self.assertEqual(Counter(row for piece in pieces for row in piece), Counter(rows))

    def test_distinct_recipe_uses_exact_batch_aggregate_and_consolidates_sum(self):
        recipe = typed.Counter("distinct", "reactions", distinct=True)
        query = batch.partial_sql(counts.canonical_boundary("reactions", ["g"], "r"), "b" * 64,
                                  [recipe], 0, 3, "parts")
        self.assertIn("uniqExactIf", query)
        final = batch.final_sql("b" * 64, "parts", "final_counts")
        self.assertIn("sum(value)", final)
        self.assertEqual(sqlglot.parse_one(final, read="clickhouse").this.name, "final_counts")

    def test_missing_or_repeated_batches_cannot_finalize(self):
        for completed in ([0], [0, 0], [0, 2]):
            with self.assertRaises(ValueError):
                batch.require_complete(completed, 2)
        batch.require_complete([1, 0], 2)

    def test_changed_types_refs_and_tombstones_survive_disjoint_history_batches(self):
        documents, links = fixture.rows()
        for total in (1, 2, 8, 17):
            values = Counter()
            for index in range(total):
                selected = [row for row in documents if zlib.crc32(row[0].encode()) % total == index]
                latest = {}
                for row in selected:
                    key = row[0], row[1]
                    if key not in latest or latest[key][5] < row[5]:
                        latest[key] = row
                current_links = {}
                for row in links:
                    key = row[:2]
                    if key not in current_links or current_links[key][2] < row[2]:
                        current_links[key] = row
                distinct = set()
                for doc, author, service, body, target, version, deleted in latest.values():
                    if deleted:
                        continue
                    for (linked_doc, group), link in current_links.items():
                        if linked_doc != doc or link[3] or group not in ("allowed", "second"):
                            continue
                        if service == "comments":
                            values[target, "comments"] += 1
                        elif service == "reactions":
                            kind = json.loads(body)["type"]
                            values[target, "reactions:" + kind] += 1
                            if kind == "like":
                                distinct.add((target, doc))
                for target, doc in distinct:
                    values[target, "fixture:distinct"] += 1
            self.assertEqual(dict(values), fixture.expected())


if __name__ == "__main__":
    unittest.main()
