"""API conformance: the tagged-post ad (D55).

An ad is a `posts` document tagged `ad` carrying a leaf-typed `offer` + a
`status`. It is not a service, not a collection, not a new endpoint — it is a
post, written by the standard CRUD, delivered by the standard group
architecture, and picked up by the standard feed read. The API has zero
ad-specific branches: the ad post is indistinguishable from a post except its
tag + body fields. This suite pins that.

KB: knowledge/knowledge-base/web10-v3/social/ads.md (D55) + ads-catalog.md.
"""

from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app
from app.v3.services import clickhouse as ch


def _make_token(username="testuser", **extra):
    payload = {
        "username": username,
        "site": "auth.localhost",
        "target": settings.PROVIDER,
        "provider": settings.PROVIDER,
        "expires": (datetime.utcnow() + timedelta(minutes=60)).isoformat(),
        **extra,
    }
    return jwt.encode(payload, settings.PRIVATE_KEY, algorithm=settings.ALGORITHM)


@pytest.fixture
def client():
    with patch("app.v3.services.clickhouse.client"):
        yield TestClient(fastapi_app)


@pytest.fixture
def creator_token():
    return _make_token("alice")


@pytest.fixture
def follower_token():
    return _make_token("bob")


@pytest.fixture
def stranger_token():
    return _make_token("eve")


FOLLOWERS = "web10.app/groups/alice/followers"


def _ad_body(status="active"):
    """The locked ad object (D55): the post's own fields + a leaf-typed
    `offer` (the link that pays) + a `status`."""
    return {
        "text": "Everything I use, linked.",
        "tags": ["ad"],
        "offer": {
            "kind": {"type": "text", "value": "affiliate"},
            "partner": {"type": "text", "value": "Amazon"},
            "link": {"type": "text", "value": "https://amzn.to/abc?tag=alice-20"},
            "cta": {"type": "text", "value": "Get it"},
            "disclosure": {"type": "text", "value": "I may earn a commission."},
        },
        "status": status,
    }


def _normal_body():
    return {"text": "just a post", "tags": []}


def _doc(doc_id, author, body, tags, created_at, ref_value=""):
    """A document in the shape the house read returns it."""
    return {
        "doc_id": doc_id,
        "author_key": author,
        "body": body,
        "tags": list(tags),
        "created_at": created_at,
        "ref_value": ref_value,
        "service": "posts",
    }


# ---------------------------------------------------------------------------
# (1) Create — the ad post through the existing posts CRUD
# ---------------------------------------------------------------------------


class TestAdCreate:
    def test_ad_post_created_through_posts_crud(self, client, creator_token):
        """The ad is written with the standard /v3/create on `posts` — no
        special endpoint, no `ads` service. The tag + body fields are the only
        thing that marks it as an ad, and it is attached to the creator's
        followers group (delivery by architecture)."""
        captured = {}

        def fake_insert(author_key, service, body, ref_value="", tags=None, doc_id=None):
            captured["author_key"] = author_key
            captured["service"] = service
            captured["body"] = body
            captured["tags"] = tags
            return {
                "doc_id": "ad-1",
                "author_key": author_key,
                "service": service,
                "body": body,
                "ref_value": ref_value,
                "tags": tags or [],
                "created_at": "2026-01-01T00:00:00",
                "updated_at": "2026-01-01T00:00:00",
            }

        with (
            patch("app.v3.services.clickhouse.insert_document", side_effect=fake_insert),
            patch("app.v3.services.clickhouse.attach_doc_to_groups") as mock_attach,
        ):
            resp = client.post(
                "/v3/create",
                json={
                    "token": creator_token,
                    "service": "posts",
                    "body": _ad_body(),
                    "groups": [FOLLOWERS],
                },
            )

        assert resp.status_code == 200
        assert resp.json()["doc_id"] == "ad-1"
        # it is a `posts` document owned by the creator, not an `ads` service
        assert captured["service"] == "posts"
        assert captured["author_key"] == "alice"
        # the tag is the marker
        assert captured["tags"] == ["ad"]
        # the offer + status ride in the body, leaf-typed
        assert captured["body"]["offer"]["kind"] == {"type": "text", "value": "affiliate"}
        assert captured["body"]["offer"]["link"] == {"type": "text", "value": "https://amzn.to/abc?tag=alice-20"}
        assert captured["body"]["status"] == "active"
        # attached to the followers group — the feed read is what delivers it
        mock_attach.assert_called_once_with("ad-1", [FOLLOWERS])


# ---------------------------------------------------------------------------
# (2) Feed read — the ad post interleaved with normal posts
# ---------------------------------------------------------------------------


class TestAdFeedRead:
    def test_feed_read_returns_ad_interleaved_with_posts(self, client, follower_token):
        """The feed read (read_documents_in_groups over the followers group)
        returns the ad post alongside normal posts. The ad is a post, so the
        same read returns it — the renderer (not the API) styles the ones
        tagged `ad`."""
        ad_doc = _doc("ad-1", "alice", _ad_body(), ["ad"], "2026-01-02 00:00:00")
        post_doc = _doc("post-1", "alice", _normal_body(), [], "2026-01-01 00:00:00")
        with (
            patch("app.v3.services.clickhouse.is_group_member", return_value=True),
            patch(
                "app.v3.services.clickhouse.read_documents_in_groups",
                return_value=[ad_doc, post_doc],
            ),
        ):
            resp = client.post(
                "/v3/read",
                json={"token": follower_token, "service": "posts", "groups": [FOLLOWERS]},
            )

        assert resp.status_code == 200
        docs = resp.json()
        # both the ad and the normal post come back, interleaved
        assert len(docs) == 2
        by_id = {d["doc_id"]: d for d in docs}
        assert set(by_id) == {"ad-1", "post-1"}
        # indistinguishable from a post to the API except tag + body fields:
        # the same shape, the same keys
        assert set(by_id["ad-1"].keys()) == set(by_id["post-1"].keys())
        assert by_id["ad-1"]["tags"] == ["ad"]
        assert by_id["post-1"]["tags"] == []
        # the offer + status survive the read, leaf-typed
        assert by_id["ad-1"]["body"]["offer"]["link"]["value"] == "https://amzn.to/abc?tag=alice-20"
        assert by_id["ad-1"]["body"]["status"] == "active"
        # the normal post has no offer / status — the ad fields are the delta
        assert "offer" not in by_id["post-1"]["body"]
        assert "status" not in by_id["post-1"]["body"]


# ---------------------------------------------------------------------------
# (3) I3 — a non-follower gets nothing
# ---------------------------------------------------------------------------


class TestAdI3:
    def test_non_follower_cannot_read_the_ad(self, client, stranger_token):
        """I3: a viewer who does not follow the creator never sees the ad.
        The read is group-scoped — a non-member of the followers group is an
        access failure (D42), and the document query is never run."""
        with (
            patch("app.v3.services.clickhouse.is_group_member", return_value=False),
            patch(
                "app.v3.services.clickhouse.read_documents_in_groups",
                return_value=[_doc("ad-1", "alice", _ad_body(), ["ad"], "2026-01-02 00:00:00")],
            ) as mock_read,
        ):
            resp = client.post(
                "/v3/read",
                json={"token": stranger_token, "service": "posts", "groups": [FOLLOWERS]},
            )

        assert resp.status_code == 403
        # the ad post is never returned to a non-follower
        mock_read.assert_not_called()


# ---------------------------------------------------------------------------
# (4) status — a plain body field the read does NOT filter
# ---------------------------------------------------------------------------


class TestAdStatus:
    def test_paused_ad_is_returned_by_the_read(self, client, follower_token):
        """`status` is a plain body field. The read does NOT filter on it —
        curation + the renderer do that client-side (D51). A paused ad comes
        back from the feed read exactly like an active one."""
        paused_doc = _doc("ad-2", "alice", _ad_body(status="paused"), ["ad"], "2026-01-03 00:00:00")
        with (
            patch("app.v3.services.clickhouse.is_group_member", return_value=True),
            patch(
                "app.v3.services.clickhouse.read_documents_in_groups",
                return_value=[paused_doc],
            ),
        ):
            resp = client.post(
                "/v3/read",
                json={"token": follower_token, "service": "posts", "groups": [FOLLOWERS]},
            )

        assert resp.status_code == 200
        docs = resp.json()
        assert len(docs) == 1
        # the paused ad is returned — the read does not filter on status
        assert docs[0]["doc_id"] == "ad-2"
        assert docs[0]["body"]["status"] == "paused"


# ---------------------------------------------------------------------------
# The architectural guarantee: the feed read query is tag- and status-agnostic
# ---------------------------------------------------------------------------


class TestFeedReadQueryIsAdAgnostic:
    def test_read_query_has_no_status_or_tag_filter(self):
        """The feed read (read_documents_in_groups) selects the tags column
        but filters on neither tags nor status — the ad post is returned
        because it is a `posts` document in the reader's group, not because of
        any ad-specific logic. `status` is a body field (not a column), so it
        cannot be filtered in SQL at all; the tag filter is the renderer's
        job (D51)."""
        rows = [
            ("ad-1", "alice", '{"text":"ad","tags":["ad"],"status":"active"}', ["ad"], datetime(2026, 1, 2), ""),
            ("post-1", "alice", '{"text":"post"}', [], datetime(2026, 1, 1), ""),
        ]
        with patch.object(ch, "client") as mock_ch:
            mock_ch.query.return_value = MagicMock(result_rows=rows)
            results = ch.read_documents_in_groups(group_ids=[FOLLOWERS], member_key="bob", service="posts")

        # both the ad and the normal post come back — no filtering on tag/status
        assert [d["doc_id"] for d in results] == ["ad-1", "post-1"]
        sql = mock_ch.query.call_args[0][0]
        # status is a body field, not a column — the query cannot (and does
        # not) filter on it
        assert "status" not in sql
        # the tags column is selected for the renderer, but never filtered
        assert "p.tags" in sql
        assert "has(tags" not in sql
        assert "tags =" not in sql
