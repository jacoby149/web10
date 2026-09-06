"""Tests for the /v3/query endpoint — the flexible read (query engine).

The endpoint is the wiring for the safe-query engine (safe-query.md): the
caller's SELECT is compiled to boundary-CTE-enforced SQL and run. These
tests pin the endpoint's contract — auth (anon-capable), the app-contract
gate, group scoping, row serialization, and the error surface (403 unsafe,
400 caller-SQL failure). The engine's own boundary is pinned in
test_safe_query.py; the end-to-end boundary on a live node is the e2e
gauntlet (e2e/tests/query-engine.spec.ts).
"""

from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import app.settings as settings
import app.v3.endpoints.query as query_ep
from app.main import app as fastapi_app
from app.v3.services.clickhouse import QueryExecutionError


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
def token():
    return _make_token()


def _mock_result(column_names, rows):
    """A clickhouse-connect-shaped result."""
    result = MagicMock()
    result.column_names = column_names
    result.result_rows = rows
    return result


class TestHappyPath:
    def test_select_over_service_returns_rows(self, client, token):
        with (
            patch("app.v3.services.clickhouse.get_user_groups", return_value=[{"group_id": "g1"}]),
            patch("app.v3.services.clickhouse.readable_groups", return_value=["g1"]),
            patch(
                "app.v3.services.clickhouse.execute_query",
                return_value=(["doc_id", "author_key"], [("d1", "alice")]),
            ),
        ):
            resp = client.post("/v3/query", json={"token": token, "sql": "SELECT doc_id, author_key FROM posts"})
        assert resp.status_code == 200
        data = resp.json()
        assert data == {"rows": [{"doc_id": "d1", "author_key": "alice"}], "count": 1}

    def test_anon_query_without_token(self, client):
        # Anon-capable (D41): a missing token reads as the node's anon member
        # (the public board) — the same rule as the group read.
        with (
            patch("app.v3.services.clickhouse.get_user_groups", return_value=[{"group_id": "board"}]),
            patch("app.v3.services.clickhouse.readable_groups", return_value=["board"]),
            patch(
                "app.v3.services.clickhouse.execute_query",
                return_value=(["doc_id"], [("d1",)]),
            ),
        ):
            resp = client.post("/v3/query", json={"sql": "SELECT doc_id FROM posts"})
        assert resp.status_code == 200
        assert resp.json()["count"] == 1

    def test_explicit_groups_scope_the_read(self, client, token):
        with (
            patch("app.v3.services.clickhouse.get_user_groups") as mock_groups,
            patch("app.v3.services.clickhouse.readable_groups", return_value=["g1"]) as mock_readable,
            patch("app.v3.services.clickhouse.execute_query", return_value=([], [])),
        ):
            resp = client.post(
                "/v3/query",
                json={"token": token, "sql": "SELECT doc_id FROM posts", "groups": ["g1"]},
            )
        assert resp.status_code == 200
        # Explicit groups: the reader's group list is never consulted.
        mock_groups.assert_not_called()
        mock_readable.assert_called_once_with("testuser", "posts", True, ["g1"])

    def test_no_groups_means_the_readers_own_groups(self, client, token):
        with (
            patch(
                "app.v3.services.clickhouse.get_user_groups", return_value=[{"group_id": "g1"}, {"group_id": "g2"}]
            ) as mock_groups,
            patch("app.v3.services.clickhouse.readable_groups", return_value=["g1"]) as mock_readable,
            patch("app.v3.services.clickhouse.execute_query", return_value=([], [])),
        ):
            resp = client.post("/v3/query", json={"token": token, "sql": "SELECT doc_id FROM posts"})
        assert resp.status_code == 200
        mock_groups.assert_called_once_with("testuser")
        mock_readable.assert_called_once_with("testuser", "posts", True, ["g1", "g2"])

    def test_explicit_group_with_no_access_is_403_not_empty(self, client, token):
        # D42 (the read endpoint's rule): an explicit group the reader can't
        # read is an access failure, not an empty result.
        with (
            patch("app.v3.services.clickhouse.get_user_groups"),
            patch("app.v3.services.clickhouse.readable_groups", return_value=[]),
            patch("app.v3.services.clickhouse.execute_query") as mock_exec,
        ):
            resp = client.post(
                "/v3/query",
                json={"token": token, "sql": "SELECT doc_id FROM posts", "groups": ["g1"]},
            )
        assert resp.status_code == 403
        assert "not a member" in resp.json()["detail"]
        mock_exec.assert_not_called()

    def test_service_free_query_is_exempt_from_the_member_check(self, client, token):
        # `SELECT 1` touches no service — explicit groups are irrelevant and
        # the D42 member check doesn't apply.
        with (
            patch("app.v3.services.clickhouse.get_user_groups"),
            patch("app.v3.services.clickhouse.execute_query", return_value=(["one"], [(1,)])),
        ):
            resp = client.post(
                "/v3/query",
                json={"token": token, "sql": "SELECT 1", "groups": ["g1"]},
            )
        assert resp.status_code == 200
        assert resp.json()["rows"] == [{"one": 1}]

    def test_cross_service_query_computes_readable_groups_per_service(self, client, token):
        with (
            patch("app.v3.services.clickhouse.get_user_groups", return_value=[{"group_id": "g1"}]),
            patch("app.v3.services.clickhouse.readable_groups", return_value=["g1"]) as mock_readable,
            patch("app.v3.services.clickhouse.execute_query", return_value=([], [])),
        ):
            resp = client.post(
                "/v3/query",
                json={
                    "token": token,
                    "sql": "SELECT p.doc_id FROM posts p JOIN comments c ON c.ref_value = p.doc_id",
                },
            )
        assert resp.status_code == 200
        # The D58 read gate runs once per service the query actually uses.
        services = {c.args[1] for c in mock_readable.call_args_list}
        assert services == {"posts", "comments"}

    def test_body_column_is_parsed_and_datetimes_serialized(self, client, token):
        now = datetime(2026, 9, 3, 12, 0, 0)
        with (
            patch("app.v3.services.clickhouse.get_user_groups", return_value=[{"group_id": "g1"}]),
            patch("app.v3.services.clickhouse.readable_groups", return_value=["g1"]),
            patch(
                "app.v3.services.clickhouse.execute_query",
                return_value=(["doc_id", "body", "created_at"], [("d1", '{"text": "hi"}', now)]),
            ),
        ):
            resp = client.post("/v3/query", json={"token": token, "sql": "SELECT doc_id, body, created_at FROM posts"})
        assert resp.status_code == 200
        row = resp.json()["rows"][0]
        assert row["body"] == {"text": "hi"}  # parsed, like the read path
        assert row["created_at"] == "2026-09-03T12:00:00Z"  # ISO-8601 UTC


class TestAppContractGate:
    def test_ungranted_service_is_403(self, client, token):
        # The app's contract grants readAll on `posts` only; the query
        # touches `comments` → rejected before any group work.
        with (
            patch("app.v3.services.clickhouse.get_app_permissions", return_value={"posts": ["readAll"]}),
            patch("app.v3.services.clickhouse.get_user_groups") as mock_groups,
        ):
            resp = client.post(
                "/v3/query",
                json={"token": token, "sql": "SELECT doc_id FROM comments"},
                headers={"origin": "http://app.example"},
            )
        assert resp.status_code == 403
        assert "comments" in resp.json()["detail"]
        mock_groups.assert_not_called()

    def test_no_contract_for_origin_is_403(self, client, token):
        with patch("app.v3.services.clickhouse.get_app_permissions", return_value={}):
            resp = client.post(
                "/v3/query",
                json={"token": token, "sql": "SELECT doc_id FROM posts"},
                headers={"origin": "http://app.example"},
            )
        assert resp.status_code == 403

    def test_no_origin_header_skips_the_contract_check(self, client, token):
        # The read path's skip rule: no Origin = same-origin / direct call →
        # no contract gate (the boundary CTE is still the wall).
        with (
            patch("app.v3.services.clickhouse.get_user_groups", return_value=[{"group_id": "g1"}]),
            patch("app.v3.services.clickhouse.readable_groups", return_value=["g1"]),
            patch("app.v3.services.clickhouse.execute_query", return_value=([], [])),
        ):
            resp = client.post("/v3/query", json={"token": token, "sql": "SELECT doc_id FROM posts"})
        assert resp.status_code == 200


class TestUnsafeQueries:
    @pytest.mark.parametrize(
        "sql",
        [
            "SELECT * FROM documents",  # raw table
            "SELECT * FROM doc_groups",  # raw bridge table
            "SELECT * FROM file('/etc/passwd')",  # table function
            "SELECT * FROM posts; DROP TABLE documents",  # stacked
            "INSERT INTO posts VALUES (1)",  # DML
            "DROP TABLE documents",  # DDL
            "SELECT FROM WHERE",  # unparseable
        ],
    )
    def test_rejected_with_403(self, client, token, sql):
        with patch("app.v3.services.clickhouse.execute_query") as mock_exec:
            resp = client.post("/v3/query", json={"token": token, "sql": sql})
        assert resp.status_code == 403
        mock_exec.assert_not_called()


class TestExecution:
    def test_caller_sql_error_is_400(self, client, token):
        # The compiled query is safe; a ClickHouse failure is the caller's
        # SQL (e.g. a column the boundary CTE doesn't expose) → 400.
        with (
            patch("app.v3.services.clickhouse.get_user_groups", return_value=[{"group_id": "g1"}]),
            patch("app.v3.services.clickhouse.readable_groups", return_value=["g1"]),
            patch(
                "app.v3.services.clickhouse.execute_query",
                side_effect=QueryExecutionError("Unknown column 'nope'"),
            ),
        ):
            resp = client.post("/v3/query", json={"token": token, "sql": "SELECT nope FROM posts"})
        assert resp.status_code == 400
        assert "nope" in resp.json()["detail"]

    def test_limit_is_injected_for_unbounded_queries(self, client, token):
        with (
            patch("app.v3.services.clickhouse.get_user_groups", return_value=[{"group_id": "g1"}]),
            patch("app.v3.services.clickhouse.readable_groups", return_value=["g1"]),
            patch("app.v3.services.clickhouse.execute_query", return_value=([], [])) as mock_exec,
        ):
            resp = client.post("/v3/query", json={"token": token, "sql": "SELECT * FROM posts"})
        assert resp.status_code == 200
        compiled = mock_exec.call_args[0][0]
        assert compiled.rstrip().endswith("LIMIT 1000")

    def test_caller_limit_is_honored(self, client, token):
        with (
            patch("app.v3.services.clickhouse.get_user_groups", return_value=[{"group_id": "g1"}]),
            patch("app.v3.services.clickhouse.readable_groups", return_value=["g1"]),
            patch("app.v3.services.clickhouse.execute_query", return_value=([], [])) as mock_exec,
        ):
            resp = client.post("/v3/query", json={"token": token, "sql": "SELECT * FROM posts LIMIT 3"})
        assert resp.status_code == 200
        compiled = mock_exec.call_args[0][0]
        assert "LIMIT 1000" not in compiled
        assert "LIMIT 3" in compiled

    def test_execution_time_setting_is_passed(self, client, token):
        with (
            patch("app.v3.services.clickhouse.get_user_groups", return_value=[{"group_id": "g1"}]),
            patch("app.v3.services.clickhouse.readable_groups", return_value=["g1"]),
            patch("app.v3.services.clickhouse.execute_query", return_value=([], [])) as mock_exec,
        ):
            resp = client.post("/v3/query", json={"token": token, "sql": "SELECT * FROM posts"})
        assert resp.status_code == 200
        assert mock_exec.call_args[1]["settings"] == {"max_execution_time": 10}


class TestRateLimit:
    """Per-user rate limiting (D65): keyed on the verified user_key, in-memory
    per-worker, 429 when the budget is exceeded. Anon is not per-user-limited
    (no verified user_key — the honest key)."""

    def setup_method(self):
        # The rate-limit log is module-level (per-worker) — reset it so tests
        # don't contaminate each other.
        query_ep._query_log.clear()

    def test_exceeding_budget_raises_rate_limit(self):
        # Patch the budget to 3 so the test doesn't need 60 iterations.
        with patch.object(query_ep, "_MAX_QUERIES_PER_WINDOW", 3):
            for _ in range(3):
                query_ep._check_query_rate_limit("user")  # under budget
            with pytest.raises(HTTPException) as exc:
                query_ep._check_query_rate_limit("user")  # over budget
        assert exc.value.status_code == 429

    def test_anon_is_not_rate_limited(self):
        # Anon has no verified user_key — not per-user-limited (D65).
        with patch.object(query_ep, "_MAX_QUERIES_PER_WINDOW", 1):
            for _ in range(5):
                query_ep._check_query_rate_limit("anon")  # never raises

    def test_users_have_independent_budgets(self):
        with patch.object(query_ep, "_MAX_QUERIES_PER_WINDOW", 2):
            query_ep._check_query_rate_limit("a")
            query_ep._check_query_rate_limit("a")
            with pytest.raises(HTTPException):
                query_ep._check_query_rate_limit("a")  # a is over budget
            query_ep._check_query_rate_limit("b")  # b is unaffected

    def test_user_over_budget_gets_429_from_endpoint(self, client):
        # Integration: the endpoint returns 429 once the user's budget is spent.
        with (
            patch.object(query_ep, "_MAX_QUERIES_PER_WINDOW", 3),
            patch("app.v3.services.clickhouse.get_user_groups"),
            patch("app.v3.services.clickhouse.execute_query", return_value=(["one"], [(1,)])),
        ):
            token = _make_token("ratelimit-user")
            for _ in range(3):
                assert client.post("/v3/query", json={"token": token, "sql": "SELECT 1"}).status_code == 200
            resp = client.post("/v3/query", json={"token": token, "sql": "SELECT 1"})
        assert resp.status_code == 429
