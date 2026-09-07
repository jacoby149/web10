"""Tests for the feed endpoint (D69) — the single-round-trip feed read.

The feed is one query per page (ranked in SQL, keyset-cursor paged) + the
read-time passes (ads, media, HLS, author profiles). These tests pin the
envelope shape, the ad preservation (D55/D57 — the read-time join must
survive the rewrite), the has_more/next_cursor contract, and the anon /
not-a-member forks.
"""

from datetime import datetime
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

import app.settings as settings
from app.main import app as fastapi_app


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


def _row(doc_id, author, created_at, likes=0, comments=0, score=0.0, ad_mode="none", ad_target=""):
    """A read_feed row (the shape the query returns)."""
    return {
        "doc_id": doc_id,
        "author_key": author,
        "body": {"text": f"post {doc_id}"},
        "tags": [],
        "created_at": created_at,
        "ref_value": "",
        "ad_mode": ad_mode,
        "ad_target": ad_target,
        "likes": likes,
        "comments": comments,
        "score": score,
        "service": "posts",
    }


class TestFeed:
    def test_feed_returns_posts_with_engagement(self, client, token):
        rows = [
            _row("p1", "api.localhost/alice", "2026-09-07T10:00:00.000", likes=5, comments=2, score=0.9),
            _row("p2", "api.localhost/bob", "2026-09-07T09:00:00.000", likes=1, comments=0, score=0.4),
        ]
        with (
            patch("app.v3.services.clickhouse.readable_groups", side_effect=lambda p, s, a, c: c),
            patch("app.v3.services.clickhouse.read_feed", return_value=rows),
            patch("app.v3.services.clickhouse.attach_pinned_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.attach_node_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.resolve_media_urls_in_docs", side_effect=lambda docs: docs),
            patch("app.v3.services.clickhouse.get_author_profiles", return_value={}),
        ):
            resp = client.post(
                "/v3/feed",
                json={"token": token, "groups": ["g1"], "limit": 20},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_more"] is False
        assert data["next_cursor"] is None
        posts = data["posts"]
        assert len(posts) == 2
        # Exact engagement counts ride in the payload (no client re-fetch).
        assert posts[0]["likes"] == 5
        assert posts[0]["comments"] == 2
        assert posts[1]["likes"] == 1

    def test_feed_has_more_and_cursor(self, client, token):
        # A full page (limit + 1 rows) → has_more True + next_cursor set.
        rows = [
            _row(f"p{i}", "api.localhost/u", f"2026-09-07T10:0{i}:00.000", score=1.0 - i * 0.1)
            for i in range(3)
        ]
        with (
            patch("app.v3.services.clickhouse.readable_groups", side_effect=lambda p, s, a, c: c),
            patch("app.v3.services.clickhouse.read_feed", return_value=rows),
            patch("app.v3.services.clickhouse.attach_pinned_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.attach_node_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.resolve_media_urls_in_docs", side_effect=lambda docs: docs),
            patch("app.v3.services.clickhouse.get_author_profiles", return_value={}),
        ):
            resp = client.post(
                "/v3/feed",
                json={"token": token, "groups": ["g1"], "limit": 2},
            )
        data = resp.json()
        assert data["has_more"] is True
        assert len(data["posts"]) == 2  # the +1 row is dropped
        # Newest preset (no sort) → the cursor is on created_at.
        assert data["next_cursor"] == {"created_at": "2026-09-07T10:01:00.000"}

    def test_feed_tuned_cursor_on_score(self, client, token):
        # A tuned preset (likes weight) → the cursor rides on the score.
        rows = [
            _row("p1", "api.localhost/u", "2026-09-07T10:00:00.000", likes=9, score=0.8),
            _row("p2", "api.localhost/u", "2026-09-07T09:00:00.000", likes=3, score=0.5),
            _row("p3", "api.localhost/u", "2026-09-07T08:00:00.000", likes=1, score=0.2),
        ]
        with (
            patch("app.v3.services.clickhouse.readable_groups", side_effect=lambda p, s, a, c: c),
            patch("app.v3.services.clickhouse.read_feed", return_value=rows),
            patch("app.v3.services.clickhouse.attach_pinned_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.attach_node_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.resolve_media_urls_in_docs", side_effect=lambda docs: docs),
            patch("app.v3.services.clickhouse.get_author_profiles", return_value={}),
        ):
            resp = client.post(
                "/v3/feed",
                json={
                    "token": token,
                    "groups": ["g1"],
                    "limit": 2,
                    "sort": {"likes": 1.0, "recency": 0.0, "comments": 0.0, "half_life_ms": 0, "character": -1.0},
                },
            )
        data = resp.json()
        assert data["has_more"] is True
        assert data["next_cursor"] == {"score": 0.5}

    def test_feed_cursor_passed_to_query(self, client, token):
        captured = {}

        def fake_read_feed(**kwargs):
            captured.update(kwargs)
            return []

        with (
            patch("app.v3.services.clickhouse.readable_groups", side_effect=lambda p, s, a, c: c),
            patch("app.v3.services.clickhouse.read_feed", side_effect=fake_read_feed),
            patch("app.v3.services.clickhouse.attach_pinned_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.attach_node_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.resolve_media_urls_in_docs", side_effect=lambda docs: docs),
            patch("app.v3.services.clickhouse.get_author_profiles", return_value={}),
        ):
            resp = client.post(
                "/v3/feed",
                json={
                    "token": token,
                    "groups": ["g1"],
                    "limit": 20,
                    "cursor": {"created_at": "2026-09-07T09:00:00.000"},
                },
            )
        assert resp.status_code == 200
        assert captured["cursor"] == {"created_at": "2026-09-07T09:00:00.000"}
        assert captured["limit"] == 20

    def test_feed_preserves_pinned_ad(self, client, token):
        # A pinned post must come back with its ad inline (D55 — the read-time
        # join the rewrite must preserve).
        rows = [_row("p1", "api.localhost/alice", "2026-09-07T10:00:00.000", ad_mode="pinned", ad_target="ad-1")]

        def fake_attach_pinned(docs, reader):
            for d in docs:
                if d.get("ad_mode") == "pinned":
                    d["ad"] = {"doc_id": d["ad_target"], "body": {"text": "the ad"}, "tags": ["ad"]}
            return docs

        with (
            patch("app.v3.services.clickhouse.readable_groups", side_effect=lambda p, s, a, c: c),
            patch("app.v3.services.clickhouse.read_feed", return_value=rows),
            patch("app.v3.services.clickhouse.attach_pinned_ads", side_effect=fake_attach_pinned),
            patch("app.v3.services.clickhouse.attach_node_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.resolve_media_urls_in_docs", side_effect=lambda docs: docs),
            patch("app.v3.services.clickhouse.get_author_profiles", return_value={}),
        ):
            resp = client.post("/v3/feed", json={"token": token, "groups": ["g1"], "limit": 20})
        data = resp.json()
        assert data["posts"][0]["ad"]["doc_id"] == "ad-1"

    def test_feed_preserves_node_ad(self, client, token):
        # A node-ad-eligible post must come back with node_ad (D57 — the
        # third join, must coexist with the creator's ad).
        rows = [_row("p1", "api.localhost/alice", "2026-09-07T10:00:00.000")]

        def fake_attach_node(docs, reader):
            for d in docs:
                d["node_ad"] = {"doc_id": "node-ad-1", "body": {"text": "node ad"}, "tags": ["ad", "node_ad"]}
            return docs

        with (
            patch("app.v3.services.clickhouse.readable_groups", side_effect=lambda p, s, a, c: c),
            patch("app.v3.services.clickhouse.read_feed", return_value=rows),
            patch("app.v3.services.clickhouse.attach_pinned_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.attach_node_ads", side_effect=fake_attach_node),
            patch("app.v3.services.clickhouse.resolve_media_urls_in_docs", side_effect=lambda docs: docs),
            patch("app.v3.services.clickhouse.get_author_profiles", return_value={}),
        ):
            resp = client.post("/v3/feed", json={"token": token, "groups": ["g1"], "limit": 20})
        data = resp.json()
        assert data["posts"][0]["node_ad"]["doc_id"] == "node-ad-1"

    def test_feed_author_profile(self, client, token):
        rows = [_row("p1", "api.localhost/alice", "2026-09-07T10:00:00.000")]
        profiles = {
            "api.localhost/alice": {
                "profile": {"display_name": "Alice", "avatar_ref": "av-1"},
                "avatar_ref": "av-1",
            }
        }
        with (
            patch("app.v3.services.clickhouse.readable_groups", side_effect=lambda p, s, a, c: c),
            patch("app.v3.services.clickhouse.read_feed", return_value=rows),
            patch("app.v3.services.clickhouse.attach_pinned_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.attach_node_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.resolve_media_urls_in_docs", side_effect=lambda docs: docs),
            patch("app.v3.services.clickhouse.get_author_profiles", return_value=profiles),
            patch("app.v3.endpoints.feed._resolve_avatar_url", return_value="https://cdn/av-1.png"),
        ):
            resp = client.post("/v3/feed", json={"token": token, "groups": ["g1"], "limit": 20})
        data = resp.json()
        assert data["posts"][0]["profile"]["display_name"] == "Alice"
        assert data["posts"][0]["avatar_url"] == "https://cdn/av-1.png"

    def test_feed_anon(self, client):
        # No token → reads as anon (the public board, D41).
        rows = [_row("p1", "api.localhost/alice", "2026-09-07T10:00:00.000")]
        with (
            patch("app.v3.services.clickhouse.readable_groups", side_effect=lambda p, s, a, c: c),
            patch("app.v3.services.clickhouse.read_feed", return_value=rows) as mock_feed,
            patch("app.v3.services.clickhouse.attach_pinned_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.attach_node_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.resolve_media_urls_in_docs", side_effect=lambda docs: docs),
            patch("app.v3.services.clickhouse.get_author_profiles", return_value={}),
        ):
            resp = client.post("/v3/feed", json={"groups": ["g1"], "limit": 20})
        assert resp.status_code == 200
        # Anon reads as the 'anon' member.
        assert mock_feed.call_args.kwargs["member_key"] == "anon"

    def test_feed_not_a_member(self, client, token):
        # A real user with no readable groups → 403 (the D42 read-gate rule).
        with patch("app.v3.services.clickhouse.readable_groups", return_value=[]):
            resp = client.post("/v3/feed", json={"token": token, "groups": ["g1"], "limit": 20})
        assert resp.status_code == 403

    def test_feed_empty(self, client, token):
        # No posts → empty feed, has_more False, no cursor.
        with (
            patch("app.v3.services.clickhouse.readable_groups", side_effect=lambda p, s, a, c: c),
            patch("app.v3.services.clickhouse.read_feed", return_value=[]),
            patch("app.v3.services.clickhouse.attach_pinned_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.attach_node_ads", side_effect=lambda docs, r: docs),
            patch("app.v3.services.clickhouse.resolve_media_urls_in_docs", side_effect=lambda docs: docs),
            patch("app.v3.services.clickhouse.get_author_profiles", return_value={}),
        ):
            resp = client.post("/v3/feed", json={"token": token, "groups": ["g1"], "limit": 20})
        data = resp.json()
        assert data == {"posts": [], "has_more": False, "next_cursor": None}
