"""L1-G-01: real query compilation must not duplicate caller content in logs."""

import logging
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import app.v3.endpoints.query as endpoint
from app.main import app
from app.v3.services import clickhouse as ch

CANARY = "SYNTHETIC_QUERY_CONTENT_93817"
NUMBER = "9381793817"


@pytest.fixture
def query_client(caplog):
    caplog.set_level(logging.INFO)
    result = MagicMock(column_names=["value"], result_rows=[("unchanged",)])
    with (
        patch.object(ch, "client") as database,
        patch.object(ch, "get_user_groups", return_value=[{"group_id": "readable-group"}]),
        patch.object(ch, "readable_groups", return_value=["readable-group"]),
        TestClient(app) as client,
    ):
        database.query.return_value = result
        database.reset_mock()
        yield client, database


def assert_no_content(caplog):
    # Check original arguments and exception/extra fields, not just formatted text.
    assert not any(value in repr(record.__dict__) for record in caplog.records for value in (CANARY, NUMBER))


@pytest.mark.parametrize(
    "sql",
    [
        f"SELECT '{CANARY}' AS value",
        f"SELECT {NUMBER} AS value",
        f"SELECT 1 AS value /* {CANARY} */",
        f'SELECT "{CANARY}" FROM posts',
        f"SELECT {CANARY}(body) FROM posts",
        f'SELECT * FROM "{CANARY}"',
        f'SELECT 1 AS "{CANARY}"',
    ],
    ids=["literal", "number", "comment", "identifier", "function", "service", "alias"],
)
def test_success_logs_omit_content_and_execute_original_sql(query_client, caplog, sql):
    client, database = query_client
    response = client.post("/v3/query", json={"sql": sql})
    assert response.status_code == 200
    assert response.json() == {"rows": [{"value": "unchanged"}], "count": 1}
    compiled = database.query.call_args.args[0]
    assert any(value in compiled for value in (CANARY, NUMBER))
    assert database.query.call_args.kwargs["settings"] == {"max_execution_time": 10}
    assert_no_content(caplog)


def test_result_column_alias_is_returned_but_not_logged(query_client, caplog):
    client, database = query_client
    database.query.return_value.column_names = [CANARY]
    response = client.post("/v3/query", json={"sql": f'SELECT 1 AS "{CANARY}"'})
    assert response.json() == {"rows": [{CANARY: "unchanged"}], "count": 1}
    assert_no_content(caplog)


def test_execution_error_keeps_response_but_not_exception_in_logs(query_client, caplog):
    client, database = query_client
    database.query.side_effect = ch._ch_exceptions.Error(CANARY)
    response = client.post("/v3/query", json={"sql": "SELECT 1"})
    assert response.status_code == 400
    assert response.json()["detail"] == f"query execution failed: {CANARY}"
    assert_no_content(caplog)


def test_shape_has_only_topology_and_literal_metadata():
    shape = endpoint._query_shape(f"SELECT '{CANARY}', {NUMBER}, TRUE, NULL")
    assert shape == {
        "status": "ok",
        "nodes": [(None, "Select"), (0, "Literal"), (0, "Literal"), (0, "Boolean"), (0, "Null")],
        "literals": [(1, "string", len(CANARY)), (2, "number", len(NUMBER)), (3, "boolean", None), (4, "null", None)],
    }
    assert endpoint._query_shape("SELECT x FROM a WHERE x = 7") == endpoint._query_shape(
        'SELECT "y" FROM b WHERE "y" = 8 /* ignored */'
    )
    assert endpoint._query_shape("SELECT x FROM a JOIN b ON a.x = b.x") != endpoint._query_shape("SELECT x FROM a")


@pytest.mark.parametrize("side", ["submitted", "compiled"])
def test_normalization_failure_does_not_change_execution_or_echo_error(query_client, caplog, side):
    client, database = query_client
    parse = endpoint.parse_one

    def fail_one(sql, **kwargs):
        if ("LIMIT 1000" in sql) == (side == "compiled"):
            raise ValueError(CANARY)
        return parse(sql, **kwargs)

    with patch.object(endpoint, "parse_one", side_effect=fail_one):
        response = client.post("/v3/query", json={"sql": "SELECT 1"})
    assert response.status_code == 200
    assert database.query.call_args.args[0] == "SELECT 1 LIMIT 1000"
    assert "unavailable" in caplog.text
    assert_no_content(caplog)


@pytest.mark.parametrize("sql", ["SELECT '", f"SHOW {CANARY}"])
def test_diagnostic_parser_failure_and_fallback_warnings_do_not_echo(sql, caplog):
    caplog.set_level(logging.INFO)
    assert endpoint._query_shape(sql) == {"status": "unavailable"}
    assert_no_content(caplog)


def test_large_shape_is_bounded_and_marked_truncated():
    shape = endpoint._query_shape("SELECT " + ", ".join(["1"] * 200))
    assert shape["status"] == "truncated"
    assert len(shape["nodes"]) == 128


def test_execution_records_share_server_generated_id_and_keep_useful_signal(query_client, caplog):
    client, _ = query_client
    client.post("/v3/query", json={"sql": "SELECT 1"})
    records = [record for record in caplog.records if record.name == endpoint.__name__]
    assert len(records) == 2
    diagnostic_id = records[0].args[0]
    assert len(diagnostic_id) == 32
    assert int(diagnostic_id, 16) >= 0
    assert records[1].args[0] == diagnostic_id
    assert records[0].args[-2]["nodes"][0] == (None, "Select")
    assert records[0].args[-1]["nodes"][0] == (None, "Select")
    assert records[1].args[1:3] == (1, 1)
    assert records[1].args[3] >= 0


def test_unsafe_query_still_rejected_before_execution(query_client, caplog):
    client, database = query_client
    response = client.post("/v3/query", json={"sql": f"SELECT '{CANARY}' FROM documents"})
    assert response.status_code == 403
    database.query.assert_not_called()
    assert_no_content(caplog)


@pytest.mark.parametrize("sql", [f"SHOW {CANARY}", f"SELECT 1; SHOW {CANARY}"])
def test_rejected_parser_commands_do_not_log_raw_input(query_client, caplog, sql):
    client, database = query_client
    response = client.post("/v3/query", json={"sql": sql})
    assert response.status_code == 403
    database.query.assert_not_called()
    assert_no_content(caplog)


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT doc_id FROM posts ORDER BY created_at ASC, doc_id ASC",
        "SELECT doc_id FROM posts ORDER BY created_at DESC NULLS FIRST",
        "SELECT toDateTime64('2026-01-01', 3), body.text FROM posts LIMIT 2",
        "SELECT 1 UNION ALL SELECT 2",
        "SELECT FROM WHERE",
    ],
)
def test_warning_override_preserves_clickhouse_parsing_and_error_details(sql):
    try:
        original = endpoint.sq.sqlglot.parse(sql, dialect=endpoint.sq.DIALECT)
    except endpoint.sq.sqlglot.errors.ParseError as error:
        with pytest.raises(type(error)) as current:
            endpoint.sq._parse_sql(sql)
        assert str(current.value) == str(error)
    else:
        assert [tree.sql(dialect=endpoint.sq.DIALECT) for tree in endpoint.sq._parse_sql(sql)] == [
            tree.sql(dialect=endpoint.sq.DIALECT) for tree in original
        ]
