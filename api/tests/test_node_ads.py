"""Unit tests for the node-ad query (D57) — `get_active_node_ads`.

The node ad is a `posts` doc tagged `ad` + `node_ad` on the discover group,
`status = 'active'`. The read attaches active node ads to posts at the
operator's percentage. This pins the query's shape + the active-only filter +
the defensive return.

The load-bearing regression: the outer `ORDER BY updated_at` requires
`updated_at` to be selected in the inner (dedup) subquery — otherwise
ClickHouse rejects it with `Unknown expression identifier 'updated_at'` and
the try/except swallows it, so node ads silently never attach.
"""

from unittest.mock import MagicMock, patch

from app.v3.services import clickhouse as ch


def _mock_result_rows(rows):
    mock = MagicMock()
    mock.result_rows = rows
    return mock


def _patch_client():
    mock_client = MagicMock()
    return patch.object(ch, "client", mock_client)


def _body(status="active"):
    return f'{{"status": "{status}"}}'


class TestGetActiveNodeAds:
    def test_returns_active_node_ads_from_discover_group(self):
        with (
            _patch_client() as mock_client,
            patch("app.services.config.get_config_field", return_value="api.localhost"),
        ):
            mock_client.query.return_value = _mock_result_rows(
                [
                    ("doc-1", "nodeops@web10", _body("active"), ["ad", "node_ad"]),
                ]
            )
            ads = ch.get_active_node_ads()
            assert len(ads) == 1
            assert ads[0]["doc_id"] == "doc-1"
            assert ads[0]["body"] == {"status": "active"}
            # The query targets node_ad-tagged posts on the discover group.
            query = mock_client.query.call_args[0][0]
            assert "has(tags, 'node_ad')" in query
            assert mock_client.query.call_args[0][1]["discover"] == "api.localhost/groups/web10/discover"

    def test_excludes_paused_ads(self):
        with (
            _patch_client() as mock_client,
            patch("app.services.config.get_config_field", return_value="api.localhost"),
        ):
            mock_client.query.return_value = _mock_result_rows(
                [
                    ("doc-1", "nodeops@web10", _body("active"), ["ad", "node_ad"]),
                    ("doc-2", "nodeops@web10", _body("paused"), ["ad", "node_ad"]),
                ]
            )
            ads = ch.get_active_node_ads()
            assert [a["doc_id"] for a in ads] == ["doc-1"]

    def test_bounded_at_20(self):
        with (
            _patch_client() as mock_client,
            patch("app.services.config.get_config_field", return_value="api.localhost"),
        ):
            mock_client.query.return_value = _mock_result_rows([])
            ch.get_active_node_ads()
            query = mock_client.query.call_args[0][0]
            assert "LIMIT 20" in query

    def test_outer_order_by_updated_at_is_in_scope(self):
        # The regression: the outer `ORDER BY updated_at` is only valid if the
        # inner (dedup) subquery SELECTS `updated_at` as a column — not merely
        # references it inside the `row_number() OVER (... ORDER BY updated_at)`
        # window. Before the fix it was only in the window, so ClickHouse threw
        # `Unknown expression identifier 'updated_at'` and the try/except
        # returned [] — node ads silently never attached.
        with (
            _patch_client() as mock_client,
            patch("app.services.config.get_config_field", return_value="api.localhost"),
        ):
            mock_client.query.return_value = _mock_result_rows([])
            ch.get_active_node_ads()
            query = mock_client.query.call_args[0][0]
            # The inner subquery's SELECT list = between "SELECT" and the
            # `row_number()` window (where `updated_at` legitimately appears in
            # the window's own ORDER BY, but that is NOT in scope for the outer).
            select_start = query.index("SELECT") + len("SELECT")
            window_start = query.index("row_number()")
            inner_select_list = query[select_start:window_start]
            assert "updated_at" in inner_select_list, (
                "outer ORDER BY updated_at needs updated_at in the inner SELECT list"
            )

    def test_returns_empty_on_error(self):
        with (
            _patch_client() as mock_client,
            patch("app.services.config.get_config_field", return_value="api.localhost"),
        ):
            mock_client.query.side_effect = Exception("boom")
            assert ch.get_active_node_ads() == []


# ---------------------------------------------------------------------------
# Read-time attachment (the third join — doc.ad + doc.node_ad)
# ---------------------------------------------------------------------------


class TestAttachNodeAds:
    """`attach_node_ads` — the read-time enrichment (D57).

    For each doc, if the deterministic hash of (doc_id, reader) is below the
    configured `node_ad_percentage`, attach a node ad as `doc['node_ad']`
    (round-robin through active node ads). The creator's `ad_mode` column is
    never modified, and a pinned post keeps its `doc['ad']` — both ads can be
    present on the same post (the non-steal principle).
    """

    def _docs(self, n=1, prefix="doc"):
        return [
            {
                "doc_id": f"{prefix}-{i}",
                "author_key": "alice",
                "body": {"text": f"post {i}"},
                "ad_mode": "none",
                "ad_target": "",
            }
            for i in range(n)
        ]

    def _node_ad(self, doc_id="node-ad-1"):
        return {
            "doc_id": doc_id,
            "author_key": "nodeops",
            "body": {"text": "node ad", "status": "active"},
            "tags": ["ad", "node_ad"],
        }

    def test_percentage_zero_no_node_ads(self):
        with patch("app.services.config.get_config_field", return_value=0):
            result = ch.attach_node_ads(self._docs(5), "reader-1")
        assert all("node_ad" not in d for d in result)

    def test_percentage_100_all_docs_get_node_ad(self):
        with (
            patch("app.services.config.get_config_field", return_value=100),
            patch.object(ch, "get_active_node_ads", return_value=[self._node_ad()]),
        ):
            result = ch.attach_node_ads(self._docs(5), "reader-1")
        assert all("node_ad" in d for d in result)
        assert all(d["node_ad"]["doc_id"] == "node-ad-1" for d in result)

    def test_percentage_10_about_ten_percent(self):
        # The hash is a uniform pseudo-random over [0, 100), so ~10% of a large
        # feed gets a node ad. Generous tolerance (the hash is deterministic, so
        # this is stable, not flaky).
        with (
            patch("app.services.config.get_config_field", return_value=10),
            patch.object(ch, "get_active_node_ads", return_value=[self._node_ad()]),
        ):
            result = ch.attach_node_ads(self._docs(1000), "reader-1")
        pct = sum(1 for d in result if "node_ad" in d) / len(result) * 100
        assert 4 <= pct <= 16, f"expected ~10%, got {pct}%"

    def test_deterministic_per_doc_reader(self):
        # Same (doc, reader) → the same selection on every read (no "I refreshed
        # and the ad moved").
        with (
            patch("app.services.config.get_config_field", return_value=50),
            patch.object(ch, "get_active_node_ads", return_value=[self._node_ad()]),
        ):
            first = ch.attach_node_ads(self._docs(100), "reader-1")
            second = ch.attach_node_ads(self._docs(100), "reader-1")
        assert [d.get("node_ad") for d in first] == [d.get("node_ad") for d in second]

    def test_different_readers_select_different_posts(self):
        # Different users see different posts with node ads (the hash keys on the
        # reader). At 50% over a large feed the two readers' selections differ.
        with (
            patch("app.services.config.get_config_field", return_value=50),
            patch.object(ch, "get_active_node_ads", return_value=[self._node_ad()]),
        ):
            r1 = ch.attach_node_ads(self._docs(200), "reader-1")
            r2 = ch.attach_node_ads(self._docs(200), "reader-2")
        sel1 = {i for i, d in enumerate(r1) if "node_ad" in d}
        sel2 = {i for i, d in enumerate(r2) if "node_ad" in d}
        assert sel1 != sel2

    def test_round_robin_cycles_through_node_ads(self):
        # At 100%, doc i gets node_ads[i % len] — the operator's inventory
        # rotates so each ad gets equal exposure.
        node_ads = [self._node_ad(f"node-ad-{i}") for i in range(2)]
        with (
            patch("app.services.config.get_config_field", return_value=100),
            patch.object(ch, "get_active_node_ads", return_value=node_ads),
        ):
            result = ch.attach_node_ads(self._docs(4), "reader-1")
        assert [d["node_ad"]["doc_id"] for d in result] == [
            "node-ad-0",
            "node-ad-1",
            "node-ad-0",
            "node-ad-1",
        ]

    def test_third_join_pinned_post_gets_both_ads(self):
        # The non-steal principle: a pinned post (doc['ad'] already resolved by
        # attach_pinned_ads) STILL gets doc['node_ad']. The node ad never
        # suppresses the creator's ad.
        doc = {
            "doc_id": "post-1",
            "author_key": "alice",
            "body": {"text": "a post"},
            "ad_mode": "pinned",
            "ad_target": "creator-ad-1",
            "ad": {
                "doc_id": "creator-ad-1",
                "author_key": "alice",
                "body": {"text": "creator ad"},
                "tags": ["ad"],
            },
        }
        with (
            patch("app.services.config.get_config_field", return_value=100),
            patch.object(ch, "get_active_node_ads", return_value=[self._node_ad()]),
        ):
            result = ch.attach_node_ads([doc], "reader-1")
        assert result[0]["ad"]["doc_id"] == "creator-ad-1"  # creator's ad intact
        assert result[0]["node_ad"]["doc_id"] == "node-ad-1"  # node ad attached

    def test_no_active_node_ads_no_attachment(self):
        with (
            patch("app.services.config.get_config_field", return_value=100),
            patch.object(ch, "get_active_node_ads", return_value=[]),
        ):
            result = ch.attach_node_ads(self._docs(5), "reader-1")
        assert all("node_ad" not in d for d in result)

    def test_i3_node_ad_visible_to_any_reader_including_anon(self):
        # Node ads live on the discover group (every user + anon is a member),
        # so the attachment does not gate on the reader's membership — anon gets
        # node ads at the percentage, the same as any user.
        with (
            patch("app.services.config.get_config_field", return_value=100),
            patch.object(ch, "get_active_node_ads", return_value=[self._node_ad()]),
        ):
            for reader in ["alice", "bob", "anon"]:
                result = ch.attach_node_ads(self._docs(5), reader)
                assert all("node_ad" in d for d in result), reader
