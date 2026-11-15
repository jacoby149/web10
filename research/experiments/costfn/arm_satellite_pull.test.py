"""Offline algorithm controls; native feed parity and budget remain separate."""
import unittest

from arm_satellite_pull import identity, pull_page


def pointer(group, number):
    return {"group_id": group, "author_key": "author-" + str(number), "doc_id": str(number), "rank": number}


def key(row):
    return row["rank"], row["doc_id"], row["author_key"], row["group_id"]


def fetcher(sources):
    def fetch(group, after, limit):
        rows = sources[group]
        return [row for row in rows if after is None or key(row) > key(after)][:limit]
    return fetch


class PullTests(unittest.TestCase):
    def test_page_parameter_changes_without_correctness_constant(self):
        sources = {"a": [pointer("a", i) for i in range(0, 1000, 2)],
                   "b": [pointer("b", i) for i in range(1, 1000, 2)]}
        for size in (1, 20, 21, 39, 75, 250):
            rows, stats = pull_page(list(sources), size, fetcher(sources), lambda rows: rows, key)
            self.assertEqual([row["rank"] for row in rows], list(range(size)))
            self.assertEqual(stats["resolved_pointers"], size)

    def test_deleted_revoked_or_stale_winners_refill_past_initial_slice(self):
        sources = {"a": [pointer("a", i) for i in range(100)]}
        # More exclusions than any first-page guard: correctness cannot depend
        # on one extra row or a fixed 22-row slice.
        def resolve(rows):
            return [row for row in rows if row["rank"] >= 70]
        rows, stats = pull_page(["a"], 20, fetcher(sources), resolve, key)
        self.assertEqual([row["rank"] for row in rows], list(range(70, 90)))
        self.assertEqual(stats["rejected_pointers"], 70)
        self.assertGreater(stats["slice_reads"], 1)

    def test_shared_attachment_multiplicity_is_not_collapsed_by_doc_id(self):
        rows, _ = pull_page(["a", "b"], 2, fetcher({"a": [pointer("a", 1)], "b": [pointer("b", 1)]}),
                            lambda rows: rows, key)
        self.assertEqual([row["doc_id"] for row in rows], ["1", "1"])
        self.assertEqual(len({identity(row) for row in rows}), 2)

    def test_exhaustion_after_denial_returns_short_page_not_false_refill(self):
        rows, _ = pull_page(["a"], 20, fetcher({"a": [pointer("a", 1)]}), lambda rows: [], key)
        self.assertEqual(rows, [])

    def test_wrong_source_repeated_cursor_and_unrequested_resolution_stop(self):
        def bad_fetch(group, after, limit):
            return [pointer("wrong", 1)]
        with self.assertRaises(ValueError):
            pull_page(["a"], 1, bad_fetch, lambda rows: rows, key)
        with self.assertRaises(ValueError):
            pull_page(["a"], 1, fetcher({"a": [pointer("a", 1)]}), lambda rows: [pointer("a", 2)], key)
        def repeated(group, after, limit):
            return [pointer(group, i) for i in range(limit)]
        with self.assertRaises(ValueError):
            pull_page(["a"], 2, repeated, lambda rows: [], key)

    def test_changed_canonical_version_body_is_used_but_order_drift_stops(self):
        sources = {"a": [pointer("a", 1)]}
        rows, _ = pull_page(["a"], 1, fetcher(sources), lambda rows: [{**rows[0], "body": "new version"}], key)
        self.assertEqual(rows[0]["body"], "new version")
        with self.assertRaises(ValueError):
            pull_page(["a"], 1, fetcher(sources), lambda rows: [{**rows[0], "rank": -1}], key)


if __name__ == "__main__":
    unittest.main()
