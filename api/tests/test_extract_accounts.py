"""Tests for tools/extract_accounts.py — the Phase 0 v2→v3 account extraction.

The mongo is mocked (conftest stubs pymongo at import). The star-record shapes
are the load-bearing detail: current (to_db convention, fields under body) and
legacy (pre-convention, fields at top level). A collection is a user iff it has
a star record in either shape.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from tools import extract_accounts as ea


def _current_star(username="alice", **over):
    body = {
        "service": "*",
        "username": username,
        "hashed_password": "$2b$12$hash",
        "phone_number": "+15551234567",
        "verified": True,
        "email": f"{username}@example.com",
        "email_verified": False,
    }
    body.update(over)
    return {"service": "services", "body": body}


def _legacy_star(username="bob", **over):
    doc = {
        "_id": "deadbeefdeadbeefdeadbeef",
        "service": "*",
        "username": username,
        "hashed_password": "$2b$12$hash",
        "phone_number": "+15559876543",
        "verified": False,
    }
    doc.update(over)
    return doc


def _col(current=None, legacy=None):
    col = MagicMock()

    def find_one(query):
        if query == ea._CURRENT_STAR_QUERY:
            return current
        if query == ea._LEGACY_STAR_QUERY:
            return legacy
        return None

    col.find_one.side_effect = find_one
    return col


def _db(collections):
    """collections: {name: (current_star, legacy_star)}."""
    db = MagicMock()
    db.list_collection_names.return_value = list(collections.keys())
    cols = {name: _col(cur, leg) for name, (cur, leg) in collections.items()}
    db.__getitem__.side_effect = lambda name: cols[name]
    return db


class TestReadStarRecord:
    def test_current_shape_reads_body(self):
        record, shape = ea.read_star_record(_col(current=_current_star()))
        assert shape == "current"
        assert record["username"] == "alice"
        assert record["hashed_password"] == "$2b$12$hash"

    def test_legacy_shape_reads_top_level_and_drops_id(self):
        record, shape = ea.read_star_record(_col(legacy=_legacy_star()))
        assert shape == "legacy"
        assert record["username"] == "bob"
        assert "_id" not in record

    def test_current_takes_precedence_over_legacy(self):
        col = _col(current=_current_star(username="cur"), legacy=_legacy_star(username="leg"))
        record, shape = ea.read_star_record(col)
        assert shape == "current"
        assert record["username"] == "cur"

    def test_no_star_record_is_not_a_user(self):
        record, shape = ea.read_star_record(_col())
        assert record is None
        assert shape is None


class TestExtractUser:
    def test_current(self):
        row = ea.extract_user(_col(current=_current_star()))
        assert row == {
            "username": "alice",
            "password_hash": "$2b$12$hash",
            "phone": "+15551234567",
            "phone_verified": True,
            "email": "alice@example.com",
            "email_verified": False,
            "star_shape": "current",
        }

    def test_legacy(self):
        row = ea.extract_user(_col(legacy=_legacy_star()))
        assert row["username"] == "bob"
        assert row["phone_verified"] is False
        assert row["email"] == ""
        assert row["star_shape"] == "legacy"

    def test_missing_phone_defaults_empty(self):
        row = ea.extract_user(_col(current=_current_star(phone_number=None)))
        assert row["phone"] == ""

    def test_not_a_user_returns_none(self):
        assert ea.extract_user(_col()) is None


class TestExtractAll:
    def test_mixed_shapes_and_filters(self):
        db = _db(
            {
                "alice": (_current_star("alice"), None),
                "bob": (None, _legacy_star("bob")),
                "web10": (_current_star("web10"), None),  # system — skipped
                "apps": (_current_star("apps"), None),  # system — skipped
                "orphan": (None, None),  # no star record — skipped
            }
        )
        rows, issues = ea.extract_all(db)
        assert [r["username"] for r in rows] == ["alice", "bob"]
        assert issues == []

    def test_missing_hash_is_an_issue_and_excluded(self):
        db = _db({"alice": (_current_star("alice", hashed_password=None), None)})
        rows, issues = ea.extract_all(db)
        assert rows == []
        assert len(issues) == 1
        assert "hashed_password" in issues[0]

    def test_missing_username_is_an_issue_and_excluded(self):
        db = _db({"?": (_current_star(username=None), None)})
        rows, issues = ea.extract_all(db)
        assert rows == []
        assert len(issues) == 1
        assert "username" in issues[0]

    def test_rows_sorted_by_username(self):
        db = _db({"zoe": (_current_star("zoe"), None), "amy": (_current_star("amy"), None)})
        rows, _ = ea.extract_all(db)
        assert [r["username"] for r in rows] == ["amy", "zoe"]


class TestBuildManifest:
    def test_count_and_fingerprint(self):
        rows = [
            {
                "username": "a",
                "password_hash": "h",
                "phone": "",
                "phone_verified": False,
                "email": "",
                "email_verified": False,
                "star_shape": "current",
            }
        ]
        m = ea.build_manifest(rows, "uri", "deploy")
        assert m["count"] == 1
        assert m["source"] == {"uri": "uri", "db": "deploy"}
        assert len(m["sha256"]) == 64

    def test_fingerprint_is_stable_and_order_sensitive(self):
        r1 = [{"username": "a"}, {"username": "b"}]
        r2 = [{"username": "a"}, {"username": "b"}]
        r3 = [{"username": "b"}, {"username": "a"}]
        assert ea._sha256_of_rows(r1) == ea._sha256_of_rows(r2)
        assert ea._sha256_of_rows(r1) != ea._sha256_of_rows(r3)


class TestRefuseRepoOutput:
    def test_refuses_inside_repo(self):
        with patch.object(ea, "_git_repo_root", return_value="/repo"):
            with pytest.raises(SystemExit) as exc:
                ea._refuse_repo_output("/repo/manifest.json")
        assert exc.value.code == 2

    def test_allows_outside_repo(self):
        with patch.object(ea, "_git_repo_root", return_value="/repo"):
            ea._refuse_repo_output("/encrypted/manifest.json")  # no raise

    def test_no_repo_warns_but_allows(self):
        with patch.object(ea, "_git_repo_root", return_value=None):
            ea._refuse_repo_output("/anywhere/manifest.json")  # no raise


class TestMain:
    def _patch_client(self, fake_db):
        client = MagicMock()
        client.admin.command.return_value = {}
        client.__getitem__.return_value = fake_db
        return patch.object(ea.pymongo, "MongoClient", return_value=client)

    def test_writes_manifest_and_returns_0(self, tmp_path):
        db = _db({"alice": (_current_star("alice"), None)})
        out = tmp_path / "manifest.json"
        with self._patch_client(db):
            with patch.object(ea, "_refuse_repo_output"):
                rc = ea.main(["--uri", "u", "--db", "deploy", "--out", str(out)])
        assert rc == 0
        data = json.loads(out.read_text())
        assert data["count"] == 1
        assert data["users"][0]["username"] == "alice"

    def test_refuses_on_missing_hash_and_writes_nothing(self, tmp_path):
        db = _db({"alice": (_current_star("alice", hashed_password=None), None)})
        out = tmp_path / "manifest.json"
        with self._patch_client(db):
            with patch.object(ea, "_refuse_repo_output"):
                rc = ea.main(["--uri", "u", "--db", "deploy", "--out", str(out)])
        assert rc == 1
        assert not out.exists()

    def test_prints_to_stdout_when_no_out(self, capsys):
        db = _db({"alice": (_current_star("alice"), None)})
        with self._patch_client(db):
            rc = ea.main(["--uri", "u", "--db", "deploy"])
        assert rc == 0
        out = capsys.readouterr().out
        data = json.loads(out)
        assert data["count"] == 1
