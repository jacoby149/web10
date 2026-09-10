"""Tests for the bugbot (D70) — bug reports push to the node's admins as a DM.

The bot is a real node user; the DM is the standard 2-member group + a
`posts` doc. These tests pin: provisioning idempotency, the deterministic
DM group name (the app's shape), both creator-embedded group-id shapes, the
DM contract on create, the message body shape (the `sendDm` fields + the
`report_id` pointer), the D58 write gate applied to the bot, best-effort
delivery (a failure never propagates), and the I3 boundary (the doc lands
only in the bot's own DM group).

Uses the mocked clickhouse-connect client (no real ClickHouse), the
test_tombstone.py idiom.
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.v3.services import bugbot
from app.v3.services import clickhouse as ch


def _mock_result_rows(rows):
    mock = MagicMock()
    mock.result_rows = rows
    return mock


def _patch_client():
    mock_client = MagicMock()
    return patch.object(ch, "client", mock_client)


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app)


def _report(**over):
    base = {
        "report_id": "br-1",
        "username": "alice",
        "email": "alice@example.com",
        "description": "the feed is blank on mobile",
        "page_url": "https://social.web10.app/feed",
        "app_version": "3.78.0",
        "device_info": "iPhone 15",
        "browser_info": "Safari 17",
        "error_message": "TypeError: cannot read posts",
        "stack_trace": "TypeError: cannot read posts\n  at FeedScreen.tsx:42",
        "screenshots": ["data:image/png;base64,AAA", "data:image/png;base64,BBB"],
    }
    base.update(over)
    return base


# ---------------------------------------------------------------------------
# The deterministic DM group name
# ---------------------------------------------------------------------------


class TestDmGroupName:
    def test_sorted_bot_first(self):
        # 'bugbot' < 'jacoby149' — the bot sorts first.
        assert bugbot._dm_group_name("jacoby149", bugbot.BOT_USERNAME) == "dm-bugbot-jacoby149"

    def test_sorted_admin_first(self):
        # 'ada' < 'bugbot' — the admin sorts first; the name must match what
        # the social app derives (dm-${[a,b].sort().join('-')}).
        assert bugbot._dm_group_name("ada", bugbot.BOT_USERNAME) == "dm-ada-bugbot"

    def test_symmetric(self):
        assert bugbot._dm_group_name("ada", bugbot.BOT_USERNAME) == bugbot._dm_group_name(bugbot.BOT_USERNAME, "ada")


# ---------------------------------------------------------------------------
# Bot provisioning
# ---------------------------------------------------------------------------


class TestEnsureBugbotUser:
    def test_creates_when_absent(self):
        with _patch_client() as mock_client:
            # get_user → absent; create_user's count → 0; discover contract → present
            def fake_query(sql, params=None):
                if "count()" in sql:
                    return _mock_result_rows([(0,)])
                if "group_contracts" in sql:
                    return _mock_result_rows([("g", "[]", "open", 0, "t", "t")])
                return _mock_result_rows([])

            mock_client.query.side_effect = fake_query
            bugbot.ensure_bugbot_user()
            inserts = [c[0][0] for c in mock_client.insert.call_args_list]
            assert "users" in inserts
            user_row = next(c[0][1][0] for c in mock_client.insert.call_args_list if c[0][0] == "users")
            assert user_row[0] == "bugbot"
            # a real bcrypt hash, not a plaintext / empty password
            assert user_row[1].startswith("$2")

    def test_idempotent_when_present(self):
        with _patch_client() as mock_client:
            # get_user → a row (present)
            mock_client.query.return_value = _mock_result_rows(
                [("bugbot", "$2b$10$hash", "", 0, "", 0, "2026-01-01 00:00:00")]
            )
            bugbot.ensure_bugbot_user()
            mock_client.insert.assert_not_called()


# ---------------------------------------------------------------------------
# The DM group (both creator-embedded shapes)
# ---------------------------------------------------------------------------


class TestEnsureDmGroup:
    def test_finds_bot_created_group(self):
        with _patch_client() as mock_client:
            # get_group: first call (bot shape) → a row (exists)
            mock_client.query.return_value = _mock_result_rows(
                [("g-1", "[]", "invite_only", 0, "2026-01-01 00:00:00", "2026-01-01 00:00:00")]
            )
            group_id = bugbot._ensure_dm_group("jacoby149")
            assert group_id == f"{settings.PROVIDER}/groups/users/bugbot/dm-bugbot-jacoby149"
            # found, not created — no group_contracts insert
            inserted_tables = [c[0][0] for c in mock_client.insert.call_args_list]
            assert "group_contracts" not in inserted_tables

    def test_finds_admin_created_group(self):
        with _patch_client() as mock_client:
            # get_group: bot shape → absent; admin shape → present (the admin
            # DM'd the bot first, so the group is creator-embedded on them).
            mock_client.query.side_effect = [
                _mock_result_rows([]),
                _mock_result_rows([("g-2", "[]", "invite_only", 0, "2026-01-01 00:00:00", "2026-01-01 00:00:00")]),
            ]
            group_id = bugbot._ensure_dm_group("jacoby149")
            assert group_id == f"{settings.PROVIDER}/groups/users/jacoby149/dm-bugbot-jacoby149"
            inserted_tables = [c[0][0] for c in mock_client.insert.call_args_list]
            assert "group_contracts" not in inserted_tables

    def test_creates_with_dm_contract_when_absent(self):
        with _patch_client() as mock_client:
            # get_group: both shapes absent
            mock_client.query.return_value = _mock_result_rows([])
            group_id = bugbot._ensure_dm_group("jacoby149")
            assert group_id == f"{settings.PROVIDER}/groups/users/bugbot/dm-bugbot-jacoby149"

            contract_call = next(c for c in mock_client.insert.call_args_list if c[0][0] == "group_contracts")
            contract = contract_call[0][1][0]
            assert contract[0] == group_id
            assert '"posts"' in contract[1] and "readAll" in contract[1]
            assert contract[2] == "invite_only"
            # both parties are members (one insert call per member)
            members = [
                row[1] for c in mock_client.insert.call_args_list if c[0][0] == "group_members" for row in c[0][1]
            ]
            assert members == ["bugbot", "jacoby149"]


# ---------------------------------------------------------------------------
# The message
# ---------------------------------------------------------------------------


class TestReportMessage:
    def test_carries_the_pointer_and_summary(self):
        msg = bugbot._report_message(_report())
        assert "br-1" in msg
        assert "the feed is blank on mobile" in msg
        assert "alice@example.com" in msg
        assert "https://social.web10.app/feed" in msg
        assert "iPhone 15" in msg
        assert "TypeError: cannot read posts" in msg
        assert "screenshots: 2" in msg

    def test_description_is_capped(self):
        msg = bugbot._report_message(_report(description="x" * 5000))
        # the full 5000-char description must not land in a DM body
        assert "x" * 501 not in msg

    def test_anonymous_report_has_no_user_line(self):
        msg = bugbot._report_message(_report(username="", email=""))
        assert "user: " not in msg
        assert "email: " not in msg


# ---------------------------------------------------------------------------
# Delivery
# ---------------------------------------------------------------------------


class TestDeliverBugReport:
    def test_no_admins_is_a_noop(self):
        with _patch_client() as mock_client, patch.object(bugbot.config_svc, "list_admins", return_value=[]):
            delivered = bugbot.deliver_bug_report(_report())
            assert delivered == []
            mock_client.insert.assert_not_called()

    def test_delivers_to_every_admin(self):
        with (
            _patch_client() as mock_client,
            patch.object(bugbot.config_svc, "list_admins", return_value=["jacoby149", "ada"]),
        ):
            # get_user → bot present; get_group → groups absent (create both);
            # is_group_member → member row present (the write gate passes).
            mock_client.query.side_effect = [
                _mock_result_rows([("bugbot", "$2b$10$hash", "", 0, "", 0, "t")]),  # get_user
                _mock_result_rows([]),  # get_group (bot shape, jacoby149)
                _mock_result_rows([]),  # get_group (admin shape, jacoby149)
                _mock_result_rows([("bugbot", "member", "t")]),  # is_group_member (jacoby149)
                _mock_result_rows([]),  # get_group (bot shape, ada)
                _mock_result_rows([]),  # get_group (admin shape, ada)
                _mock_result_rows([("bugbot", "member", "t")]),  # is_group_member (ada)
            ]
            delivered = bugbot.deliver_bug_report(_report())
            assert len(delivered) == 2
            assert any(g.endswith("/dm-bugbot-jacoby149") for g in delivered)
            assert any(g.endswith("/dm-ada-bugbot") for g in delivered)

            doc_inserts = [c for c in mock_client.insert.call_args_list if c[0][0] == "documents"]
            assert len(doc_inserts) == 2
            for c in doc_inserts:
                row = c[0][1][0]
                assert row[1] == "bugbot"  # author_key
                assert row[2] == "posts"  # service
            # each doc is attached to a DM group (doc_groups inserts)
            dg = [c for c in mock_client.insert.call_args_list if c[0][0] == "doc_groups"]
            assert len(dg) == 2
            attached = {row[1] for c in dg for row in c[0][1]}
            assert attached == set(delivered)

    def test_body_shape_matches_senddm(self):
        with _patch_client() as mock_client, patch.object(bugbot.config_svc, "list_admins", return_value=["jacoby149"]):
            mock_client.query.side_effect = [
                _mock_result_rows([("bugbot", "$2b$10$hash", "", 0, "", 0, "t")]),  # get_user
                _mock_result_rows([]),  # get_group (bot shape)
                _mock_result_rows([]),  # get_group (admin shape)
                _mock_result_rows([("bugbot", "member", "t")]),  # is_group_member
            ]
            bugbot.deliver_bug_report(_report())
            doc_row = next(c[0][1][0] for c in mock_client.insert.call_args_list if c[0][0] == "documents")
            body = ch._parse_json(doc_row[3])
            assert body["subject"] == "Bug report br-1"
            assert body["sender_username"] == "bugbot"
            assert body["sender_provider"] == settings.PROVIDER
            assert body["recipient_username"] == "jacoby149"
            assert body["recipient_provider"] == settings.PROVIDER
            assert body["report_id"] == "br-1"
            assert body["screenshot_count"] == 2
            assert "br-1" in body["message"]

    def test_write_gate_blocks_a_non_member(self):
        # The D58 gate: if the bot is NOT a member (and no anyone/authenticated
        # create grant), the write is refused — no doc, logged, not raised.
        with _patch_client() as mock_client, patch.object(bugbot.config_svc, "list_admins", return_value=["jacoby149"]):
            mock_client.query.side_effect = [
                _mock_result_rows([("bugbot", "$2b$10$hash", "", 0, "", 0, "t")]),  # get_user
                _mock_result_rows([]),  # get_group (bot shape)
                _mock_result_rows([]),  # get_group (admin shape)
                _mock_result_rows([]),  # is_group_member → NOT a member
                # effective_role_perms → no grants (empty role rows)
                _mock_result_rows([]),
            ]
            delivered = bugbot.deliver_bug_report(_report())
            assert delivered == []
            assert not any(c[0][0] == "documents" for c in mock_client.insert.call_args_list)

    def test_delivery_failure_never_propagates(self):
        # Best-effort: a ClickHouse failure mid-delivery (inside the per-admin
        # loop) is swallowed — the report is already durable, the submit must
        # not 500.
        with _patch_client() as mock_client, patch.object(bugbot.config_svc, "list_admins", return_value=["jacoby149"]):
            mock_client.query.side_effect = [
                _mock_result_rows([("bugbot", "$2b$10$hash", "", 0, "", 0, "t")]),  # get_user (ok)
                RuntimeError("clickhouse down"),  # get_group (bot shape) — blows up
            ]
            # must not raise
            delivered = bugbot.deliver_bug_report(_report())
            assert delivered == []

    def test_admin_named_bugbot_is_skipped(self):
        # A pathological config (an admin literally named bugbot) must not DM
        # the bot to itself.
        with (
            _patch_client() as mock_client,
            patch.object(bugbot.config_svc, "list_admins", return_value=[bugbot.BOT_USERNAME]),
        ):
            delivered = bugbot.deliver_bug_report(_report())
            assert delivered == []
            mock_client.insert.assert_not_called()


# ---------------------------------------------------------------------------
# The endpoint hook (seam: submit → durable row → DM delivery)
# ---------------------------------------------------------------------------


class TestSubmitBugReportHook:
    def test_submit_delivers_and_still_returns_200(self, client):
        with (
            patch.object(ch, "submit_bug_report") as mock_submit,
            patch.object(bugbot, "deliver_bug_report") as mock_deliver,
        ):
            mock_submit.return_value = {"report_id": "br-9", "status": "submitted", "created_at": "t"}
            res = client.post(
                "/bug_report",
                json={"description": "it broke", "token": None},
            )
            assert res.status_code == 200
            assert res.json()["report_id"] == "br-9"
            mock_submit.assert_called_once()
            mock_deliver.assert_called_once()
            # the delivered report carries the pointer + the screenshots
            delivered = mock_deliver.call_args[0][0]
            assert delivered["report_id"] == "br-9"
            assert delivered["description"] == "it broke"

    def test_submit_succeeds_when_delivery_blows_up(self, client):
        # The hook's belt-and-suspenders: even a bug in the delivery path
        # must not fail the submitter's request.
        with (
            patch.object(ch, "submit_bug_report") as mock_submit,
            patch.object(bugbot, "deliver_bug_report", side_effect=RuntimeError("boom")),
        ):
            mock_submit.return_value = {"report_id": "br-10", "status": "submitted", "created_at": "t"}
            res = client.post("/bug_report", json={"description": "it broke"})
            assert res.status_code == 200
            assert res.json()["report_id"] == "br-10"
