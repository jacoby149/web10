"""Tests for content moderation (D59) — sensitive-language detection + discover
suppression.

The detection is a pure whole-word, case-insensitive blocklist check. The
write-path hook auto-hides a matching post from the discover group (the
existing group_hidden_docs mechanism) and records a flag for the operator's
review queue. I3: the hide is scoped to the discover group — the author's copy
and their followers-group posts are untouched.
"""

from datetime import datetime
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.v3.services import moderation
from app.v3.services.clickhouse import DISCOVER_GROUP_ID

FOLLOWERS_GROUP = "web10.app/groups/users/testuser/followers"


def _make_token(username="testuser", **extra):
    payload = {
        "username": username,
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": (datetime.utcnow() + __import__("datetime").timedelta(minutes=60)).isoformat(),
        **extra,
    }
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app)


@pytest.fixture
def token():
    return _make_token()


def _admin_token(username="admin"):
    return _make_token(username=username)


# ---------------------------------------------------------------------------
# check_text — pure detection
# ---------------------------------------------------------------------------


class TestCheckText:
    def test_exact_match(self):
        assert moderation.check_text("you are a nigger", ["nigger"]) == ["nigger"]

    def test_case_insensitive(self):
        assert moderation.check_text("NIGGER", ["nigger"]) == ["nigger"]
        assert moderation.check_text("Nigger", ["nigger"]) == ["nigger"]

    def test_whole_word_no_substring(self):
        # "ass" must not match "assassin"
        assert moderation.check_text("the assassin", ["ass"]) == []
        assert moderation.check_text("be an ass", ["ass"]) == ["ass"]

    def test_empty_text(self):
        assert moderation.check_text("", ["nigger"]) == []
        assert moderation.check_text(None, ["nigger"]) == []

    def test_empty_blocklist(self):
        assert moderation.check_text("nigger", []) == []

    def test_multiple_matches(self):
        text = "a nigger and a kike"
        assert sorted(moderation.check_text(text, ["nigger", "kike", "spic"])) == ["kike", "nigger"]

    def test_leetspeak_variant(self):
        assert moderation.check_text("you n1gger", ["n1gger", "nigger"]) == ["n1gger"]

    def test_deduped_stable_order(self):
        # blocklist order is preserved, not text order
        assert moderation.check_text("kike nigger", ["nigger", "kike"]) == ["nigger", "kike"]


# ---------------------------------------------------------------------------
# should_auto_hide — the decision
# ---------------------------------------------------------------------------


class TestShouldAutoHide:
    def _cfg(self, **over):
        base = {
            "sensitive_words": ["nigger", "kike"],
            "auto_moderate": True,
            "moderation_enabled": True,
            "auto_hide_users": [],
        }
        base.update(over)
        return base

    def test_disabled_returns_empty(self):
        assert moderation.should_auto_hide("u", "a nigger", self._cfg(moderation_enabled=False)) == []

    def test_listed_user_always_flagged(self):
        # A listed user is flagged even with clean text (no blocklist match).
        assert moderation.should_auto_hide("bad", "hello", self._cfg(auto_hide_users=["bad"])) == ["auto_hide_users"]

    def test_text_match(self):
        assert moderation.should_auto_hide("u", "a nigger", self._cfg()) == ["nigger"]

    def test_no_match(self):
        assert moderation.should_auto_hide("u", "hello world", self._cfg()) == []

    def test_listed_user_short_circuits_blocklist(self):
        # Listed user: the reason is the list, not the (also-matching) text.
        assert moderation.should_auto_hide("bad", "a nigger", self._cfg(auto_hide_users=["bad"])) == ["auto_hide_users"]


# ---------------------------------------------------------------------------
# Write-path hook — via the create endpoint
# ---------------------------------------------------------------------------


class TestCreateModeration:
    def _post(self, client, token, text, groups):
        with (
            patch("app.v3.services.clickhouse._gen_doc_id", return_value="doc-1"),
            patch("app.v3.services.clickhouse.insert_moderation_flag") as mock_flag,
            patch("app.v3.services.clickhouse.hide_doc_from_group") as mock_hide,
        ):
            resp = client.post(
                "/v3/create",
                json={"token": token, "service": "posts", "body": {"text": text}, "groups": groups},
            )
        return resp, mock_flag, mock_hide

    def test_slur_on_discover_auto_hidden(self, client, token):
        cfg = {
            "sensitive_words": ["nigger"],
            "auto_moderate": True,
            "moderation_enabled": True,
            "auto_hide_users": [],
        }
        with patch("app.v3.services.moderation.moderation_config", return_value=cfg):
            resp, mock_flag, mock_hide = self._post(client, token, "you are a nigger", [DISCOVER_GROUP_ID])
        assert resp.status_code == 200
        assert resp.json()["doc_id"] == "doc-1"  # the doc is created, not rejected
        # Hidden from the DISCOVER group specifically (I3: scoped to the board).
        mock_hide.assert_called_once_with(DISCOVER_GROUP_ID, "doc-1", moderation.NODE_MODERATOR)
        mock_flag.assert_called_once_with("testuser", "doc-1", ["nigger"])

    def test_slur_off_discover_not_hidden(self, client, token):
        cfg = {
            "sensitive_words": ["nigger"],
            "auto_moderate": True,
            "moderation_enabled": True,
            "auto_hide_users": [],
        }
        with patch("app.v3.services.moderation.moderation_config", return_value=cfg):
            resp, mock_flag, mock_hide = self._post(client, token, "you are a nigger", [FOLLOWERS_GROUP])
        assert resp.status_code == 200
        mock_hide.assert_not_called()  # not on the board → not hidden
        mock_flag.assert_not_called()  # and not flagged (moderation is board-scoped)

    def test_listed_user_auto_hidden_no_match(self, client, token):
        cfg = {
            "sensitive_words": ["nigger"],
            "auto_moderate": True,
            "moderation_enabled": True,
            "auto_hide_users": ["testuser"],
        }
        with patch("app.v3.services.moderation.moderation_config", return_value=cfg):
            resp, mock_flag, mock_hide = self._post(client, token, "clean post", [DISCOVER_GROUP_ID])
        assert resp.status_code == 200
        # Listed user: hidden even though the text is clean.
        mock_hide.assert_called_once_with(DISCOVER_GROUP_ID, "doc-1", moderation.NODE_MODERATOR)
        mock_flag.assert_called_once_with("testuser", "doc-1", ["auto_hide_users"])

    def test_auto_moderate_off_flags_only(self, client, token):
        cfg = {
            "sensitive_words": ["nigger"],
            "auto_moderate": False,
            "moderation_enabled": True,
            "auto_hide_users": [],
        }
        with patch("app.v3.services.moderation.moderation_config", return_value=cfg):
            resp, mock_flag, mock_hide = self._post(client, token, "a nigger", [DISCOVER_GROUP_ID])
        assert resp.status_code == 200
        mock_hide.assert_not_called()  # auto_moderate off → not hidden
        mock_flag.assert_called_once_with("testuser", "doc-1", ["nigger"])  # but flagged

    def test_moderation_disabled_noop(self, client, token):
        cfg = {
            "sensitive_words": ["nigger"],
            "auto_moderate": True,
            "moderation_enabled": False,
            "auto_hide_users": [],
        }
        with patch("app.v3.services.moderation.moderation_config", return_value=cfg):
            resp, mock_flag, mock_hide = self._post(client, token, "a nigger", [DISCOVER_GROUP_ID])
        assert resp.status_code == 200
        mock_hide.assert_not_called()
        mock_flag.assert_not_called()

    def test_non_post_service_noop(self, client, token):
        cfg = {
            "sensitive_words": ["nigger"],
            "auto_moderate": True,
            "moderation_enabled": True,
            "auto_hide_users": [],
        }
        with (
            patch("app.v3.services.moderation.moderation_config", return_value=cfg),
            patch("app.v3.services.clickhouse.insert_moderation_flag") as mock_flag,
            patch("app.v3.services.clickhouse.hide_doc_from_group") as mock_hide,
        ):
            resp = client.post(
                "/v3/create",
                json={"token": token, "service": "notes", "body": {"text": "a nigger"}, "groups": [DISCOVER_GROUP_ID]},
            )
        assert resp.status_code == 200
        mock_hide.assert_not_called()
        mock_flag.assert_not_called()

    def test_clean_post_noop(self, client, token):
        cfg = {
            "sensitive_words": ["nigger"],
            "auto_moderate": True,
            "moderation_enabled": True,
            "auto_hide_users": [],
        }
        with patch("app.v3.services.moderation.moderation_config", return_value=cfg):
            resp, mock_flag, mock_hide = self._post(client, token, "hello world", [DISCOVER_GROUP_ID])
        assert resp.status_code == 200
        mock_hide.assert_not_called()
        mock_flag.assert_not_called()


# ---------------------------------------------------------------------------
# I3 — the hide is scoped to the discover group
# ---------------------------------------------------------------------------


class TestI3:
    def test_hide_targets_discover_group_only(self, client, token):
        """The auto-hide writes a group_hidden_docs row for the DISCOVER group
        only. The author's followers group is untouched — a follower can still
        read the post there (the read anti-join is per-group)."""
        cfg = {
            "sensitive_words": ["nigger"],
            "auto_moderate": True,
            "moderation_enabled": True,
            "auto_hide_users": [],
        }
        with (
            patch("app.v3.services.clickhouse._gen_doc_id", return_value="doc-1"),
            patch("app.v3.services.clickhouse.insert_moderation_flag"),
            patch("app.v3.services.clickhouse.hide_doc_from_group") as mock_hide,
            patch("app.v3.services.moderation.moderation_config", return_value=cfg),
        ):
            # Post to BOTH the discover board and the followers group.
            resp = client.post(
                "/v3/create",
                json={
                    "token": token,
                    "service": "posts",
                    "body": {"text": "a nigger"},
                    "groups": [DISCOVER_GROUP_ID, FOLLOWERS_GROUP],
                },
            )
        assert resp.status_code == 200
        # Exactly one hide, and it's for the discover group — never the followers group.
        mock_hide.assert_called_once()
        args = mock_hide.call_args.args
        assert args[0] == DISCOVER_GROUP_ID
        assert FOLLOWERS_GROUP not in args


# ---------------------------------------------------------------------------
# Review queue + auto-hide endpoints
# ---------------------------------------------------------------------------


class TestModerationEndpoints:
    def test_flags_admin(self, client):
        with (
            patch("app.services.config.is_admin", return_value=True),
            patch("app.v3.services.moderation.get_flags", return_value=[{"username": "bad", "flag_count": 2}]),
        ):
            resp = client.post("/v3/moderation/flags", json={"token": _admin_token()})
        assert resp.status_code == 200
        assert resp.json()["flags"] == [{"username": "bad", "flag_count": 2}]

    def test_flags_non_admin_rejected(self):
        # raise_server_exceptions=False so the bare Exception("NOT_ADMIN")
        # runs through the production handler (→ 403) instead of re-raising.
        with TestClient(fastapi_app, raise_server_exceptions=False) as tc:
            with patch("app.services.config.is_admin", return_value=False):
                resp = tc.post("/v3/moderation/flags", json={"token": _make_token("rando")})
        assert resp.status_code == 403

    def test_auto_hide_add(self, client):
        saved = {"auto_hide_users": ["existing"]}
        with (
            patch("app.services.config.is_admin", return_value=True),
            patch("app.services.config.get_config", return_value=saved),
            patch("app.services.config.save_config") as mock_save,
        ):
            resp = client.post(
                "/v3/moderation/auto-hide", json={"token": _admin_token(), "username": "newuser", "hide": True}
            )
        assert resp.status_code == 200
        assert resp.json()["auto_hide_users"] == ["existing", "newuser"]
        mock_save.assert_called_once()
        assert mock_save.call_args.args[0]["auto_hide_users"] == ["existing", "newuser"]

    def test_auto_hide_remove(self, client):
        saved = {"auto_hide_users": ["existing", "newuser"]}
        with (
            patch("app.services.config.is_admin", return_value=True),
            patch("app.services.config.get_config", return_value=saved),
            patch("app.services.config.save_config") as mock_save,
        ):
            resp = client.post(
                "/v3/moderation/auto-hide", json={"token": _admin_token(), "username": "newuser", "hide": False}
            )
        assert resp.status_code == 200
        assert resp.json()["auto_hide_users"] == ["existing"]
        mock_save.assert_called_once()
        assert mock_save.call_args.args[0]["auto_hide_users"] == ["existing"]

    def test_auto_hide_add_absent_user(self, client):
        saved = {"auto_hide_users": ["existing"]}
        with (
            patch("app.services.config.is_admin", return_value=True),
            patch("app.services.config.get_config", return_value=saved),
            patch("app.services.config.save_config") as mock_save,
        ):
            resp = client.post(
                "/v3/moderation/auto-hide", json={"token": _admin_token(), "username": "ghost", "hide": True}
            )
        assert resp.status_code == 200
        assert resp.json()["auto_hide_users"] == ["existing", "ghost"]
        mock_save.assert_called_once()

    def test_auto_hide_non_admin_rejected(self):
        with TestClient(fastapi_app, raise_server_exceptions=False) as tc:
            with patch("app.services.config.is_admin", return_value=False):
                resp = tc.post(
                    "/v3/moderation/auto-hide", json={"token": _make_token("rando"), "username": "x", "hide": True}
                )
        assert resp.status_code == 403
