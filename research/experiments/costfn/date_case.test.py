import copy
from datetime import datetime
import json
from pathlib import Path
import tempfile
import unittest

import date_case as date
import dataset_v2 as v2


class DateCaseTests(unittest.TestCase):
    def test_derive_validate_and_parent_is_unchanged(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, target = Path(temporary) / "original", Path(temporary) / "dated"
            original = v2.build(source, {"creators": 1000, "follow": 1000, "readers": 2, "seed": 42, "locality": "dispersed"})
            manifest = date.derive(source, target)
            self.assertNotEqual(manifest["dataset_id"], original["dataset_id"])
            self.assertEqual(date.validate(target)["rows"], v2.validate(source)["rows"])
            self.assertEqual(json.loads((source / "manifest.json").read_bytes()), original)
            self.assertEqual(len(date.indices(manifest, 0)), 21)
            self.assertEqual(len(date.indices(manifest, 0, 20)), 21)
            bad = copy.deepcopy(manifest)
            bad["date_contract"]["recent_percent"] = 100
            (target / "manifest.json").write_text(json.dumps(bad))
            with self.assertRaises(ValueError):
                date.validate(target)

    def test_independent_window_and_recent_selection(self):
        recent = {"created_at": v2.stamp(4), "updated_at": v2.stamp(4)}
        old = {"created_at": v2.stamp(5), "updated_at": v2.stamp(5)}
        self.assertEqual(date.transform("documents", old, 1000), old)
        stamp = date.transform("documents", recent, 1000)["created_at"]
        self.assertGreater(datetime.fromisoformat(stamp).timestamp() * 1000, date.CUTOFF_MS)
        self.assertEqual(date.capture()["displayed_rows"], 20)


if __name__ == "__main__":
    unittest.main()
