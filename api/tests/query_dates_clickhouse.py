"""Disposable native date-path parity and physical-work experiment (not cloud capacity)."""

import json
import secrets
import subprocess
import time
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

import clickhouse_connect

from app.v3.services.safe_query import build_safe_query


@contextmanager
def database():
    name = "web10-date-" + secrets.token_hex(5)

    def docker(*args):
        return subprocess.run(["docker", *args], check=True, capture_output=True, text=True, timeout=90).stdout.strip()

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
            "/var/lib/clickhouse:size=1536m",
            "--tmpfs",
            "/var/log/clickhouse-server:size=64m",
            "ghcr.io/jacoby149/base-clickhouse:24.8",
        )
        port = int(docker("port", name, "8123/tcp").rsplit(":", 1)[1])
        for attempt in range(120):
            try:
                client = clickhouse_connect.get_client(host="127.0.0.1", port=port)
                client.command("SELECT 1")
                break
            except Exception:
                if attempt == 119:
                    raise
                time.sleep(0.2)
        template = Path(__file__).parents[2] / "clickhouse-init/001-init-v3-schema.sql.template"
        for statement in template.read_text().split(";")[:2]:
            client.command(statement)
        for table, columns in {
            "user_blacklist": "user_key String,blocked_key String",
            "group_blacklist": "user_key String,group_id String,blocked_key String",
            "group_hidden_docs": "group_id String,doc_id String",
            "user_group_sharing": "user_key String,group_id String,sharing_enabled UInt8",
            "banned_users": "username String",
        }.items():
            client.command(f"CREATE TABLE {table} ({columns},updated_at UInt64,deleted UInt8) ENGINE=Memory")
        yield client
    finally:
        docker("rm", "-f", name)
        assert not docker("ps", "-aq", "--filter", f"name=^{name}$")
        print("[query-date] owned disposable container cleanup verified", flush=True)


def query(optimize, cutoff=1000000):
    return build_safe_query(
        "SELECT p.doc_id,p.author_key,p.group_id,p.body FROM posts p "
        f"WHERE p.created_at >= fromUnixTimestamp64Milli({cutoff}) "
        "ORDER BY p.created_at DESC,p.author_key DESC,p.doc_id DESC LIMIT 21",
        {"posts": ["allowed"]},
        optimize_dates=optimize,
    )


def measure(client, sql):
    result = client.query(sql, settings={"max_execution_time": 10, "log_queries": 1})
    client.command("SYSTEM FLUSH LOGS")
    metrics = client.query(
        "SELECT read_rows,read_bytes,query_duration_ms,memory_usage FROM system.query_log "
        "WHERE query_id={id:String} AND type='QueryFinish'",
        parameters={"id": result.query_id},
    ).first_row
    return result.result_rows, dict(zip(("rows", "bytes", "ms", "memory"), metrics))


def experiment():
    observations = []
    with database() as client:
        version = client.command("SELECT version()")
        for layout in ("clustered", "mixed"):
            client.command("TRUNCATE TABLE documents")
            client.command("TRUNCATE TABLE doc_groups")
            recent = "number >= 990000" if layout == "clustered" else "number % 100 = 0"
            client.command(
                "INSERT INTO documents (doc_id,author_key,collection_name,body,tags,created_at,updated_at) "
                "SELECT concat('doc-',leftPad(toString(number),7,'0')),concat('owner-',leftPad(toString(number),7,'0')),"
                f"'posts',repeat('x',256),[],fromUnixTimestamp64Milli(if({recent},1000000+number,number % 1000)),"
                "fromUnixTimestamp64Milli(3000000) FROM numbers(1000000)"
            )
            client.command(
                "INSERT INTO doc_groups (doc_id,group_id,created_at,updated_at) "
                "SELECT doc_id,'allowed',created_at,updated_at FROM documents"
            )
            for projection in (False, True):
                if projection:
                    client.command("ALTER TABLE documents MODIFY SETTING deduplicate_merge_projection_mode='rebuild'")
                    client.command(
                        "ALTER TABLE documents ADD PROJECTION IF NOT EXISTS date_candidates "
                        "(SELECT collection_name,created_at,author_key,doc_id ORDER BY (collection_name,created_at,author_key,doc_id))"
                    )
                    client.command(
                        "ALTER TABLE documents MATERIALIZE PROJECTION date_candidates SETTINGS mutations_sync=2"
                    )
                elif layout == "mixed":
                    client.command("ALTER TABLE documents DROP PROJECTION IF EXISTS date_candidates")
                for cutoff, density in ((1000000, "one-percent-recent"), (0, "all-recent")):
                    expected = None
                    for repetition in range(3):
                        for optimize in (True, False) if repetition % 2 else (False, True):
                            rows, metrics = measure(client, query(optimize, cutoff))
                            if expected is None:
                                expected = rows
                            assert rows == expected and len(rows) == 21
                            observations.append(
                                {
                                    "layout": layout,
                                    "projection": projection,
                                    "density": density,
                                    "optimized": optimize,
                                    "warmup": repetition == 0,
                                    **metrics,
                                }
                            )
                            print(json.dumps(observations[-1]), flush=True)
                if projection:
                    explain = client.query(
                        "EXPLAIN indexes=1 SELECT author_key,doc_id FROM documents WHERE "
                        "collection_name='posts' AND created_at>=fromUnixTimestamp64Milli(1000000)"
                    ).result_rows
                    observations.append({"layout": layout, "candidate_explain": explain})
        # Version histories go in separate physical parts; no insert-time replacement.
        client.command("SYSTEM STOP MERGES documents")
        client.command(
            "INSERT INTO documents (doc_id,author_key,collection_name,body,tags,created_at,updated_at,deleted) "
            "VALUES ('history','alice','posts','old',[],fromUnixTimestamp64Milli(1000001),fromUnixTimestamp64Milli(3000001),0)"
        )
        client.command("INSERT INTO doc_groups (doc_id,group_id) VALUES ('history','allowed')")
        for index, (created, deleted) in enumerate(((0, 0), (1000001, 1), (1000001, 0))):
            updated = 4000000 + index
            # Increasing version independent of the creation-time test.
            client.command(
                "INSERT INTO documents (doc_id,author_key,collection_name,body,tags,created_at,updated_at,deleted) "
                f"VALUES ('history','alice','posts','new',[],fromUnixTimestamp64Milli({created}),"
                f"fromUnixTimestamp64Milli({updated}),{deleted})"
            )

            def history_sql(optimize):
                return query(optimize).replace("ORDER BY p.created_at", "AND p.doc_id='history' ORDER BY p.created_at")

            baseline = client.query(history_sql(False)).result_rows
            assert client.query(history_sql(True)).result_rows == baseline
            assert [r[3] for r in baseline] == (["new"] if created and not deleted else [])
        cutoff = 1791633600000
        for name, stamp in (
            ("edge-low", cutoff - 1),
            ("edge-equal", cutoff),
            ("edge-high", cutoff + 1),
            ("pre-epoch", -1),
        ):
            client.insert(
                "documents",
                [
                    [
                        name,
                        "edge-owner",
                        "posts",
                        "{}",
                        [],
                        datetime.fromtimestamp(stamp / 1000, UTC),
                        datetime.fromtimestamp(1800000000, UTC),
                    ]
                ],
                column_names=["doc_id", "author_key", "collection_name", "body", "tags", "created_at", "updated_at"],
            )
            client.insert("doc_groups", [[name, "allowed"]], column_names=["doc_id", "group_id"])
        for optimize in (False, True):
            sql = build_safe_query(
                "SELECT p.doc_id FROM posts p WHERE p.created_at >= "
                f"fromUnixTimestamp64Milli({cutoff}) AND p.doc_id IN ('edge-low','edge-equal','edge-high') ORDER BY p.doc_id",
                {"posts": ["allowed"]},
                optimize_dates=optimize,
            )
            assert client.query(sql).result_rows == [("edge-equal",), ("edge-high",)]
            for join in ("RIGHT", "FULL"):
                sql = (
                    f"SELECT p.doc_id,q.doc_id FROM posts p {join} JOIN posts q ON p.doc_id=q.doc_id "
                    "WHERE p.created_at >= fromUnixTimestamp64Milli(0) AND q.doc_id IN ('pre-epoch','edge-equal') ORDER BY q.doc_id"
                )
                compiled = build_safe_query(sql, {"posts": ["allowed"]}, optimize_dates=optimize)
                reference = build_safe_query(sql, {"posts": ["allowed"]})
                assert client.query(compiled).result_rows == client.query(reference).result_rows
        repeated = " UNION ALL ".join(
            "SELECT p.doc_id FROM posts p WHERE p.created_at >= fromUnixTimestamp64Milli(0) AND p.doc_id='edge-equal'"
            for _ in range(80)
        )
        groups = ["allowed"] + [f"{i:08x}-0000-4000-8000-000000000000" for i in range(999)]
        compiled = build_safe_query(repeated, {"posts": groups}, optimize_dates=True)
        assert len(compiled.encode()) < 262144
        assert client.query(compiled).result_rows == [("edge-equal",)] * 80
        print(
            json.dumps(
                {
                    "engine": version,
                    "identities": 1000000,
                    "observations": observations,
                    "boundary_controls": [
                        "cutoff-1ms denied",
                        "cutoff included",
                        "cutoff+1ms included",
                        "default-filled RIGHT/FULL parity",
                    ],
                    "scope": "Native synthetic date query diagnostic; not API/full-feed/cloud acceptance.",
                }
            ),
            flush=True,
        )


if __name__ == "__main__":
    experiment()
