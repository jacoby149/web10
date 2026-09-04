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
