"""Read-gate parity on actual SQL; run this file directly for disposable ClickHouse."""

import json
import math
import re
import secrets
import sqlite3
import statistics
import subprocess
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app import settings
from app.v3.services import clickhouse as ch


def fixture():
    db = sqlite3.connect(":memory:")
    db.executescript("""
      CREATE TABLE group_contracts (group_id TEXT, roles TEXT, join_policy TEXT DEFAULT 'closed',
        discoverable INTEGER DEFAULT 0, tags TEXT DEFAULT '[]', membership_visibility TEXT DEFAULT 'hidden',
        created_at INTEGER DEFAULT 1, updated_at INTEGER, deleted INTEGER DEFAULT 0);
      CREATE TABLE group_members (group_id TEXT, member_key TEXT, role TEXT, joined_at INTEGER DEFAULT 1,
        updated_at INTEGER, deleted INTEGER DEFAULT 0);
    """)

    def role(service):
        return [{"name": "reader", "permissions": {service: ["readAll"]}}]

    contracts = {
        "member": role("posts"),
        "public": role("posts"),
        "auth": role("profile"),
        "legacy": [{"name": "reader", "services": ["*"], "permissions": ["readAll"]}],
        "anon": role("posts"),
        "removed": [],
        "restored": [],
        "tie": [],
        "gone": role("posts"),
        "changed": role("posts"),
        "missing-role": [],
        "foreign": [],
        "undefined-member": [],
        "revoked-public": role("posts"),
        "restored-public": role("posts"),
        "tie-public": role("posts"),
        "tie-reverse": [],
        "contract-tie": role("posts"),
        "contract-tie-reverse": role("posts"),
    }
    for gid, roles in contracts.items():
        db.execute("INSERT INTO group_contracts(group_id,roles,updated_at) VALUES (?,?,1)", (gid, json.dumps(roles)))
    db.execute("INSERT INTO group_contracts(group_id,roles,updated_at,deleted) VALUES ('gone','[]',2,1)")
    db.execute(
        "INSERT INTO group_contracts(group_id,roles,updated_at) VALUES ('changed',?,2)", (json.dumps(role("profile")),)
    )
    members = [
        ("member", "alice", "reader", 1, 0),
        ("public", "anyone", "reader", 1, 0),
        ("auth", "authenticated", "reader", 1, 0),
        ("legacy", "anyone", "reader", 1, 0),
        ("anon", "anon", "reader", 1, 0),
        ("gone", "anyone", "reader", 1, 0),
        ("changed", "anyone", "reader", 1, 0),
        ("missing-role", "anyone", "unknown", 1, 0),
        ("foreign", "home.example/users/alice", "reader", 1, 0),
        ("orphan", "alice", "reader", 1, 0),
        ("undefined-member", "alice", "unknown", 1, 0),
    ]
    for gid in ("removed", "restored", "tie"):
        members += [(gid, "alice", "reader", 1, 0), (gid, "alice", "reader", 2, 1)]
    members += [("restored", "alice", "reader", 3, 0), ("tie", "alice", "reader", 2, 0)]
    for gid in ("revoked-public", "restored-public", "tie-public"):
        members += [(gid, "anyone", "reader", 1, 0), (gid, "anyone", "reader", 2, 1)]
    members += [
        ("restored-public", "anyone", "reader", 3, 0),
        ("tie-public", "anyone", "reader", 2, 0),
        ("tie-reverse", "alice", "reader", 2, 0),
        ("tie-reverse", "alice", "reader", 2, 1),
    ]
    for gid, order in (("contract-tie", (0, 1)), ("contract-tie-reverse", (1, 0))):
        members.append((gid, "anyone", "reader", 1, 0))
        for deleted in order:
            db.execute(
                "INSERT INTO group_contracts(group_id,roles,updated_at,deleted) VALUES (?,?,2,?)",
                (gid, json.dumps(role("posts")), deleted),
            )
    db.executemany("INSERT INTO group_members(group_id,member_key,role,updated_at,deleted) VALUES (?,?,?,?,?)", members)
    return db, [*contracts, "orphan", "unknown", "public"]


class SQLClient:
    def __init__(self, db):
        self.db, self.calls = db, 0

    def query(self, sql, parameters):
        self.calls += 1
        return SimpleNamespace(result_rows=self.db.execute(re.sub(r"%\((\w+)\)s", r":\1", sql), parameters).fetchall())


def expected(principal, service, authenticated, candidates):
    allowed = {"legacy"}
    if service == "posts":
        allowed |= {"public", "anon", "restored-public"}
    if service == "profile":
        allowed.add("changed")
        if authenticated:
            allowed.add("auth")
    if principal == "anon":
        allowed.add("anon")  # Existing explicit anon membership grants reads, even outside its role map.
    if principal == "alice":
        allowed |= {"member", "restored", "orphan", "undefined-member"}
    if principal == "home.example/users/alice":
        allowed.add("foreign")
    return [g for g in candidates if g in allowed]


def parity(client, candidates):
    count = 0
    for principal, authenticated in (
        ("anon", False),
        ("alice", True),
        ("bob", True),
        ("home.example/users/alice", True),
    ):
        for service in ("posts", "profile", "other"):
            args = principal, service, authenticated, candidates
            with patch.object(ch, "client", client):
                reference = ch.readable_groups_per_group(*args)
                before = client.calls
                actual = ch.readable_groups_batched(*args)
            assert reference == actual == expected(*args)
            assert client.calls - before <= 3
            count += 1
    return count


def test_sql_parity_and_explicit_permissions():
    db, candidates = fixture()
    try:
        assert parity(SQLClient(db), candidates) == 12
    finally:
        db.close()


def test_production_helper_bounds_member_fanout(monkeypatch):
    db, _ = fixture()
    groups = [f"g{i}" for i in range(1000)]
    db.executemany(
        "INSERT INTO group_members(group_id,member_key,role,updated_at) VALUES (?,'alice','reader',1)",
        [(g,) for g in groups],
    )
    client = SQLClient(db)
    monkeypatch.setattr(settings, "READABLE_RESOLUTION_MODE", "batched", raising=False)
    try:
        with patch.object(ch, "client", client):
            assert ch.readable_groups("alice", "posts", True, groups) == groups
        assert client.calls == 1
    finally:
        db.close()


def large_candidates(client):
    gids = [f"denied-{i}-" + "é\\'🚀" * 10 + "x" * 60 for i in range(3000)]
    per_chunk = (96 * 1024) // max(2 * len(g.encode("utf-8")) + 32 for g in gids)
    max_queries = 3 * math.ceil(len(gids) / per_chunk)
    with patch.object(ch, "client", client):
        before = client.calls
        assert ch.readable_groups_batched("bob", "posts", True, gids) == []
        assert 3 < client.calls - before <= max_queries  # Reject both oversized SQL and per-candidate queries.
        assert ch.readable_groups_batched("bob", "posts", True, ["public", *gids, "public"]) == ["public", "public"]
        assert ch.readable_groups_batched("bob", "posts", True, ["x" * 60000]) == []


def test_large_denied_and_mixed_inputs_preserve_order():
    db, _ = fixture()
    try:
        large_candidates(SQLClient(db))
    finally:
        db.close()


@pytest.mark.parametrize("mode", ["batched", "per-group"])
def test_production_dispatch_and_empty_input(monkeypatch, mode):
    monkeypatch.setattr(settings, "READABLE_RESOLUTION_MODE", mode, raising=False)
    target = "readable_groups_batched" if mode == "batched" else "readable_groups_per_group"
    with patch.object(ch, target, return_value=["g"], create=True) as selected:
        assert ch.readable_groups("alice", "posts", True, ["g"]) == ["g"]
        selected.assert_called_once_with("alice", "posts", True, ["g"])


@pytest.mark.parametrize(
    "env,prod,evaluation",
    [
        ({}, "batched", ""),
        ({"READABLE_RESOLUTION_MODE": " PER-GROUP "}, "per-group", ""),
        ({"READABLE_RESOLUTION_MODE": "BATCHED", "QUERY_EVAL_READABLE_MODE": "per-group"}, "batched", "per-group"),
    ],
)
def test_parsed_modes(env, prod, evaluation):
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from app import settings as s; "
            f"assert s.READABLE_RESOLUTION_MODE == {prod!r}; assert s.QUERY_EVAL_READABLE_MODE == {evaluation!r}; "
            "assert s.QUERY_EVAL_NO_POLICY is False and s.QUERY_EVAL_STUB_EXECUTE is False",
        ],
        cwd=Path(__file__).parents[1],
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("key", ["READABLE_RESOLUTION_MODE", "QUERY_EVAL_READABLE_MODE"])
def test_invalid_mode_refuses_without_echoing_configuration(key):
    marker = "SYNTHETIC_PRIVATE_CONFIG_VALUE"
    result = subprocess.run(
        [sys.executable, "-c", "import app.settings"],
        cwd=Path(__file__).parents[1],
        env={key: marker},
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode != 0
    assert marker not in result.stdout + result.stderr


def connected():
    """Actual ClickHouse SQL over retained Memory histories, not merge lifecycle assurance."""
    import clickhouse_connect

    name = "web10-readable-parity-" + secrets.token_hex(4)

    def docker(*args):
        return subprocess.run(["docker", *args], check=True, capture_output=True, text=True, timeout=30).stdout.strip()

    started = False
    db, candidates = fixture()
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
                    raise
                time.sleep(0.2)
        real.command(
            "CREATE TABLE group_contracts (group_id String, roles String, join_policy String, discoverable UInt8, tags Array(String), membership_visibility String, created_at UInt64, updated_at UInt64, deleted UInt8) ENGINE=Memory"
        )
        real.command(
            "CREATE TABLE group_members (group_id String, member_key String, role String, joined_at UInt64, updated_at UInt64, deleted UInt8) ENGINE=Memory"
        )
        for table in ("group_contracts", "group_members"):
            rows = [list(row) for row in db.execute(f"SELECT * FROM {table}")]
            if table == "group_contracts":
                for row in rows:
                    row[4] = []
            real.insert(table, rows)
        adapter = SimpleNamespace(calls=0)

        def query(sql, parameters):
            adapter.calls += 1
            return real.query(sql, parameters)

        adapter.query = query
        cases = parity(adapter, candidates)
        large_candidates(adapter)
        groups = [f"member-fast-{i}" for i in range(1000)]
        real.insert("group_members", [[g, "alice", "member", 1, 1, 0] for g in groups])
        costs = []
        with patch.object(ch, "client", adapter):
            for k in (0, 1, 10, 100, 1000):
                samples = {"per-group": [], "batched": []}
                for repetition in range(4):
                    arms = [("per-group", ch.readable_groups_per_group), ("batched", ch.readable_groups)]
                    for mode, resolve in arms[:: 1 if repetition % 2 else -1]:
                        before, started_at = adapter.calls, time.perf_counter()
                        assert resolve("alice", "posts", True, groups[:k]) == groups[:k]
                        elapsed = (time.perf_counter() - started_at) * 1000
                        queries = adapter.calls - before
                        assert queries == (k if mode == "per-group" else int(k > 0))
                        if repetition:
                            samples[mode].append(elapsed)
                costs.append(
                    {
                        "k": k,
                        "median_ms": {mode: statistics.median(values) for mode, values in samples.items()},
                        "queries_per_group": k,
                        "queries_batched": int(k > 0),
                    }
                )
        print(
            json.dumps(
                {
                    "parity_cases": cases,
                    "clickhouse": real.command("SELECT version()"),
                    "member_costs": costs,
                    "timing_scope": "three direct-resolver samples after warm-up; Memory tables, not HTTP/capacity/paper results",
                    "scope": "actual read-gate SQL, retained synthetic histories; no production/merge/browser assurance",
                }
            )
        )
    finally:
        db.close()
        if started:
            docker("rm", "-f", name)
            assert not docker("ps", "-aq", "--filter", f"name=^{name}$")
            print("[readable-parity] owned disposable container cleanup verified")


if __name__ == "__main__":
    connected()
