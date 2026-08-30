"""Tests for the Phase 1/3 v2→v3 account migration: the migrate_user service
function (app.v3.services.clickhouse) and the migrate_accounts.py CLI.

The ClickHouse client is mocked (conftest stubs clickhouse_connect). The
load-bearing guarantees: the bcrypt hash is carried over verbatim (no re-hash),
the verified flags are carried over (not hardcoded 0), and the operation is
idempotent (re-run is a no-op for an existing account).
"""

import json
from unittest.mock import patch

from app.v3.services import clickhouse as ch
from tools import migrate_accounts as ma

# ── migrate_user (the service function) ──────────────────────────────────────


class TestMigrateUser:
    def _patch(self, existing=None, members=None):
        return (
            patch.object(ch, "get_user", return_value=existing),
            patch.object(ch, "client"),
            patch.object(ch, "_ensure_discover_group_contract"),
            patch.object(ch, "get_group_member_keys", return_value=members or []),
            patch.object(ch, "add_group_member"),
        )

    def test_creates_row_and_enrolls(self):
        p_user, p_client, p_ensure, p_members, p_add = self._patch(existing=None)
        with p_user, p_client as client, p_ensure, p_members, p_add as add:
            result = ch.migrate_user("alice", "$2b$12$hash", "+1555", True, "a@x.com", False)
        assert result == {"username": "alice", "created": True, "enrolled": True}
        # The users row: hash verbatim, verified flags carried over.
        args = client.insert.call_args[0]
        assert args[0] == "users"
        row = args[1][0]
        assert row[0] == "alice"
        assert row[1] == "$2b$12$hash"  # bcrypt carried verbatim
        assert row[2] == "+1555"
        assert row[3] == 1  # phone_verified True -> 1
        assert row[4] == "a@x.com"
        assert row[5] == 0  # email_verified False -> 0
        assert row[8] == 0  # not deleted
        add.assert_called_once_with(ch.DISCOVER_GROUP_ID, "alice", "member")

    def test_existing_user_no_insert_but_still_enrolls(self):
        p_user, p_client, p_ensure, p_members, p_add = self._patch(existing={"username": "alice"})
        with p_user, p_client as client, p_ensure, p_members, p_add as add:
            result = ch.migrate_user("alice", "$2b$12$hash", "+1555", True, "a@x.com", False)
        assert result == {"username": "alice", "created": False, "enrolled": True}
        client.insert.assert_not_called()  # idempotent — no re-insert
        add.assert_called_once_with(ch.DISCOVER_GROUP_ID, "alice", "member")

    def test_existing_member_no_enroll(self):
        p_user, p_client, p_ensure, p_members, p_add = self._patch(existing={"username": "alice"}, members=["alice"])
        with p_user, p_client as client, p_ensure, p_members, p_add as add:
            result = ch.migrate_user("alice", "$2b$12$hash", "+1555", True, "a@x.com", False)
        assert result == {"username": "alice", "created": False, "enrolled": False}
        client.insert.assert_not_called()
        add.assert_not_called()  # already a member

    def test_unverified_flags_carry_as_zero(self):
        p_user, p_client, p_ensure, p_members, p_add = self._patch(existing=None)
        with p_user, p_client as client, p_ensure, p_members, p_add:
            ch.migrate_user("bob", "$2b$12$hash", "", False, "", False)
        row = client.insert.call_args[0][1][0]
        assert row[3] == 0  # phone_verified False -> 0
        assert row[5] == 0  # email_verified False -> 0


# ── migrate_accounts.py (the CLI) ────────────────────────────────────────────


def _write_manifest(tmp_path, users):
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps({"users": users, "count": len(users)}))
    return str(path)


def _row(username="alice", **over):
    r = {
        "username": username,
        "password_hash": "$2b$12$hash",
        "phone": "+1555",
        "phone_verified": True,
        "email": "a@x.com",
        "email_verified": False,
    }
    r.update(over)
    return r


class TestMigrateAccountsCli:
    def test_dry_run_does_not_write(self, tmp_path, capsys):
        path = _write_manifest(tmp_path, [_row()])
        with patch.object(ma.ch, "migrate_user") as mock_migrate:
            rc = ma.main(["--manifest", path, "--user", "alice", "--dry-run"])
        assert rc == 0
        mock_migrate.assert_not_called()
        out = capsys.readouterr().out
        assert "alice" in out
        assert "$2b$12$..." in out  # hash is masked, not printed whole

    def test_user_not_in_manifest(self, tmp_path):
        path = _write_manifest(tmp_path, [_row()])
        rc = ma.main(["--manifest", path, "--user", "ghost"])
        assert rc == 2

    def test_requires_user_or_all(self, tmp_path):
        path = _write_manifest(tmp_path, [_row()])
        rc = ma.main(["--manifest", path])
        assert rc == 2

    def test_bad_manifest_path(self):
        rc = ma.main(["--manifest", "/nonexistent/manifest.json", "--all"])
        assert rc == 2

    def test_all_migrates_everyone(self, tmp_path):
        path = _write_manifest(tmp_path, [_row("a"), _row("b")])
        with patch.object(
            ma.ch, "migrate_user", return_value={"username": "x", "created": True, "enrolled": True}
        ) as mock_migrate:
            rc = ma.main(["--manifest", path, "--all"])
        assert rc == 0
        assert mock_migrate.call_count == 2

    def test_single_user_passes_row_fields(self, tmp_path):
        path = _write_manifest(tmp_path, [_row("alice", phone="+1999", phone_verified=False)])
        with patch.object(ma.ch, "migrate_user") as mock_migrate:
            ma.main(["--manifest", path, "--user", "alice"])
        mock_migrate.assert_called_once_with(
            username="alice",
            password_hash="$2b$12$hash",
            phone="+1999",
            phone_verified=False,
            email="a@x.com",
            email_verified=False,
        )
