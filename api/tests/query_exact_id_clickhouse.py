"""Opt-in disposable ClickHouse parity/work probe: python -m tests.query_exact_id_clickhouse."""

import datetime
import json
import secrets
import subprocess
import time
from pathlib import Path
from unittest.mock import patch

import clickhouse_connect

from app.v3.endpoints.query import _canonical_prepare_docs
from app.v3.services import clickhouse as ch
from app.v3.services import safe_query as sq
from tests.test_query_exact_id_pruning import compile_ids
from tests.test_query_partition_pruning import history_db


def connected():
    name = "web10-exact-id-" + secrets.token_hex(4)

    def docker(*args):
        return subprocess.run(["docker", *args], check=True, capture_output=True, text=True, timeout=60).stdout.strip()

    fixture = history_db.__wrapped__()
    db = next(fixture)
    started = False
    try:
        docker(
            "run",
            "-d",
            "--name",
            name,
            "-p",
            "127.0.0.1::8123",
            "-e",
            "CLICKHOUSE_SKIP_USER_SETUP=1",
            "--tmpfs",
            "/var/lib/clickhouse:size=512m",
            "--tmpfs",
            "/var/log/clickhouse-server:size=64m",
            "ghcr.io/jacoby149/base-clickhouse:24.8",
        )
        started = True
        port = int(docker("port", name, "8123/tcp").rsplit(":", 1)[1])
        for attempt in range(90):
            try:
                real = clickhouse_connect.get_client(host="127.0.0.1", port=port)
                real.command("SELECT 1")
                break
            except Exception:
                if attempt == 89:
                    print(docker("logs", name))
                    raise
                time.sleep(0.2)
        schema = Path(__file__).parents[2] / "clickhouse-init/001-init-v3-schema.sql.template"
        statements = schema.read_text().split(";")[:2]
        for statement in statements:
            real.command(statement)
        real.command("SYSTEM STOP MERGES")
        for table in (r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")):
            columns = [r[1] for r in db.execute(f"PRAGMA table_info({table})")]
            if table not in {"documents", "doc_groups"}:
                types = ["UInt64" if c in {"updated_at", "deleted", "sharing_enabled"} else "String" for c in columns]
                real.command(
                    f"CREATE TABLE {table} ({','.join(f'{c} {t}' for c, t in zip(columns, types))}) ENGINE=Memory"
                )
            values = [list(row) for row in db.execute(f"SELECT * FROM {table}")]
            for row in values:
                for i, column in enumerate(columns):
                    if table in {"documents", "doc_groups"} and column in {"created_at", "updated_at"}:
                        row[i] = datetime.datetime.fromtimestamp(row[i], datetime.UTC)
                    elif column == "tags":
                        row[i] = []
            if values:
                real.insert(table, values, column_names=columns)
        # Irrelevant identities share the requested service/group, not an easy
        # service-only exclusion. Use production table engines and sort keys.
        real.command("""INSERT INTO documents (doc_id,author_key,collection_name,body,tags,created_at,updated_at)
          SELECT concat('noise-',toString(number)),concat('owner-',toString(number)),
          'posts',repeat('x',256),[],toDateTime64(1,3),toDateTime64(1,3) FROM numbers(100000)""")
        real.command("""INSERT INTO doc_groups (doc_id,group_id,created_at,updated_at)
          SELECT concat('noise-',toString(number)),'allowed',toDateTime64(1,3),toDateTime64(1,3) FROM numbers(100000)""")
        cases = 0
        for ids, expected in [
            (["active"], [("active", "alice", "allowed", "current")]),
            (["removed", "deleted", "foreign", "missing"], []),
            (
                ["multiple", "multiple"],
                [("multiple", "alice", "allowed", "old"), ("multiple", "alice", "second", "old")],
            ),
        ]:
            for hint in (False, True):
                assert real.query(compile_ids(ids, hint=hint)).result_rows == expected
            cases += 1
        for table, values in [
            ("user_blacklist", ["alice", "anon", 4, 0]),
            ("group_blacklist", ["alice", "allowed", "anon", 4, 0]),
            ("group_hidden_docs", ["allowed", "active", 4, 0]),
            ("banned_users", ["alice", 4, 0]),
            ("user_group_sharing", ["alice", "allowed", 0, 4, 0]),
        ]:
            real.insert(table, [values])
            for hint in (False, True):
                assert real.query(compile_ids(["active"], hint=hint)).result_rows == []
            real.command(f"TRUNCATE TABLE {table}")
            cases += 1
        # Check native escaping, not just parser round trips.
        for doc_id in ["quote'key", "back\\slash", "雪", "x'); SELECT * FROM documents; --"]:
            real.insert(
                "documents",
                [[doc_id, "alice", "posts", "opaque", []]],
                column_names=["doc_id", "author_key", "collection_name", "body", "tags"],
            )
            real.insert("doc_groups", [[doc_id, "allowed"]], column_names=["doc_id", "group_id"])
            for hint in (False, True):
                assert real.query(compile_ids([doc_id], hint=hint)).result_rows == [
                    (doc_id, "alice", "allowed", "opaque")
                ]
            cases += 1
        observations = []
        for repetition in range(4):
            for hint in [False, True] if repetition % 2 else [True, False]:
                result = real.query(compile_ids(["active"], hint=hint))
                assert result.result_rows == [("active", "alice", "allowed", "current")]
                real.command("SYSTEM FLUSH LOGS")
                metrics = real.query(
                    "SELECT read_rows,read_bytes,query_duration_ms,memory_usage FROM system.query_log WHERE query_id={id:String} AND type='QueryFinish'",
                    parameters={"id": result.query_id},
                ).result_rows
                assert len(metrics) == 1
                observations.append(
                    {
                        "hint": hint,
                        "warmup": repetition == 0,
                        "read_rows": metrics[0][0],
                        "read_bytes": metrics[0][1],
                        "duration_ms": metrics[0][2],
                        "memory_bytes": metrics[0][3],
                    }
                )
        # Real canonical helper regression: a once-valid 3,000-UUID lookup must
        # not fail the default 256-KiB query parser limit after list duplication.
        ids = [f"{i:08x}-0000-4000-8000-000000000000" for i in range(3000)]
        real.insert(
            "documents",
            [[i, "alice", "posts", "{}", []] for i in ids],
            column_names=["doc_id", "author_key", "collection_name", "body", "tags"],
        )
        real.insert("doc_groups", [[i, "allowed"] for i in ids], column_names=["doc_id", "group_id"])
        sql_bytes = []

        def execute(sql, settings):
            sql_bytes.append(len(sql.encode()))
            result = real.query(sql, settings={**settings, "max_query_size": 262144})
            return result.column_names, result.result_rows

        compiler = sq.build_safe_query

        def reference(*args, **kwargs):
            kwargs.pop("document_ids_by_service", None)
            return compiler(*args, **kwargs)

        requested = [{"doc_id": i} for i in ids]
        with patch.object(ch, "execute_query", side_effect=execute):
            with patch.object(sq, "build_safe_query", side_effect=reference):
                baseline = _canonical_prepare_docs(requested, "reader", {"posts": ["allowed"]})
            candidate = _canonical_prepare_docs(requested, "reader", {"posts": ["allowed"]})
        assert candidate == baseline and len(candidate) == 3000
        assert len(sql_bytes) == 2 and sql_bytes[0] == sql_bytes[1] < 262144
        print(
            json.dumps(
                {
                    "clickhouse": real.command("SELECT version()"),
                    "parity_cases": cases,
                    "observations": observations,
                    "large_canonical_rows": len(candidate),
                    "large_canonical_sql_bytes_reference_candidate": sql_bytes,
                    "scope": "Local synthetic exact-ID diagnostic, 100k irrelevant identities; stopped merges retain histories. Not million-author/concurrency/production/capacity proof.",
                }
            )
        )
    finally:
        fixture.close()
        if started:
            docker("rm", "-f", name)
            assert not docker("ps", "-aq", "--filter", f"name=^{name}$")
            print("[query-exact-id] owned disposable container cleanup verified")


if __name__ == "__main__":
    connected()
