#!/usr/bin/env python3
"""Frozen-fixture tests; not a connected import, policy proof or load test."""
import gzip
import json
from pathlib import Path
import tempfile
import unittest

import dataset


class DatasetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.recipe = {"creators": 2, "follow": 2, "readers": 3, "seed": 42}
        self.path = self.root / "fixture"
        self.manifest = dataset.build(self.path, self.recipe)

    def rewrite_manifest(self, manifest):
        manifest["dataset_id"] = dataset.identity(manifest)
        (self.path / "manifest.json").write_bytes(dataset.encoded(manifest))

    def test_roundtrip_counts(self):
        result = dataset.validate(self.path)
        self.assertEqual(result["rows"], {"users": 5, "documents": 4, "doc_groups": 4,
                                        "group_contracts": 3, "group_members": 19})
        self.assertEqual(result["registered_accounts"], 5)
        self.assertEqual(self.manifest["k"], 2)
        self.assertEqual(len(self.manifest["readers"]), 3)

    def test_byte_identical_regeneration(self):
        other = self.root / "again"
        dataset.build(other, self.recipe)
        for path in self.path.iterdir():
            self.assertEqual(path.read_bytes(), (other / path.name).read_bytes())

    def test_recipe_changes_identity(self):
        other = dataset.build(self.root / "other", {**self.recipe, "seed": 43})
        self.assertNotEqual(other["dataset_id"], self.manifest["dataset_id"])

    def test_no_overwrite(self):
        before = (self.path / "manifest.json").read_bytes()
        with self.assertRaises(FileExistsError):
            dataset.build(self.path, self.recipe)
        self.assertEqual(before, (self.path / "manifest.json").read_bytes())

    def test_recipe_bounds(self):
        for patch in [{"creators": 0}, {"creators": 1000001}, {"follow": 3},
                      {"readers": 20001}, {"seed": -1}, {"seed": True}]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                dataset.build(self.root / "invalid", {**self.recipe, **patch})
        self.assertFalse((self.root / "invalid").exists())

    def test_corruption_rejected(self):
        with (self.path / "users.jsonl.gz").open("ab") as stream:
            stream.write(b"bad")
        with self.assertRaisesRegex(ValueError, "integrity"):
            dataset.validate(self.path)

    def test_rehashed_permission_tamper_rejected(self):
        path = self.path / "group_members.jsonl.gz"
        lines = gzip.decompress(path.read_bytes()).splitlines()
        first = json.loads(lines[0])
        first["role"] = "owner"
        lines[0] = dataset.encoded(first).strip()
        path.write_bytes(gzip.compress(b"\n".join(lines) + b"\n", mtime=0))
        info = self.manifest["files"]["group_members"]
        info.update(bytes=path.stat().st_size, sha256=dataset.digest(path))
        self.rewrite_manifest(self.manifest)
        with self.assertRaisesRegex(ValueError, "row/relationship"):
            dataset.validate(self.path)

    def test_path_and_symlink_rejected(self):
        self.manifest["files"]["users"]["name"] = "../outside.jsonl.gz"
        self.rewrite_manifest(self.manifest)
        with self.assertRaisesRegex(ValueError, "integrity"):
            dataset.validate(self.path)
        self.manifest["files"]["users"]["name"] = "users.jsonl.gz"
        self.rewrite_manifest(self.manifest)
        original = self.path / "users.jsonl.gz"
        outside = self.root / "outside"
        original.rename(outside)
        original.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "integrity"):
            dataset.validate(self.path)

    def test_unexpected_file_and_manifest_edit_rejected(self):
        (self.path / "secret.txt").write_text("not a fixture file")
        with self.assertRaisesRegex(ValueError, "directory"):
            dataset.validate(self.path)
        (self.path / "secret.txt").unlink()
        self.manifest["reader"] = "someone-else"
        self.rewrite_manifest(self.manifest)
        with self.assertRaisesRegex(ValueError, "generator and recipe"):
            dataset.validate(self.path)

    def test_public_fixture_login_hash(self):
        import bcrypt  # available with the API dependencies, never a live credential
        self.assertTrue(bcrypt.checkpw(dataset.PASSWORD.encode(), dataset.PASSWORD_HASH.encode()))


if __name__ == "__main__":
    unittest.main()
