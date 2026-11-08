#!/usr/bin/env python3
"""Safe project-only resource sampler and client/server receipt reconciliation."""
import argparse
import json
from pathlib import Path
import subprocess
import time

import bench
import provenance
import topology


def sample(compose, db_compose=None, env=None):
    db_compose = db_compose or compose
    containers = []
    for command in (compose,) if db_compose == compose else (compose, db_compose):
        ids = subprocess.run(command + ["ps", "-q"], check=True, capture_output=True, text=True, timeout=10, env=env).stdout.split()
        if not ids:
            raise ValueError("research project is not running")
        stats = subprocess.run(topology.docker_prefix(command) + ["stats", "--no-stream", "--format", "{{json .}}", *ids],
            check=True, capture_output=True, text=True, timeout=15, env=env).stdout
        containers.extend(json.loads(s) for s in stats.splitlines())
    query = "SELECT metric, value FROM system.metrics WHERE metric IN ('Query', 'Merge', 'BackgroundMergesAndMutationsPoolTask', 'MemoryTracking') FORMAT JSONEachRow"
    db = subprocess.run(db_compose + ["exec", "-T", "clickhouse", "clickhouse-client", "--user", "web10", "--password", "web10", "--query", query],
        check=True, capture_output=True, text=True, timeout=15, env=env).stdout
    reads = subprocess.run(db_compose + ["exec", "-T", "clickhouse", "clickhouse-client", "--user", "web10", "--password", "web10", "--query",
        "SELECT sum(read_rows) AS read_rows, sum(read_bytes) AS read_bytes, sum(written_rows) AS written_rows, count() AS finished FROM system.query_log WHERE type = 'QueryFinish' FORMAT JSONEachRow"],
        check=True, capture_output=True, text=True, timeout=15, env=env).stdout
    return {"epoch": time.time(), "containers": containers,
            "database": [json.loads(s) for s in db.splitlines()], "query_log_cumulative": json.loads(reads)}


def reconcile(directory, server_text):
    client = [json.loads(line) for line in (directory / "requests.jsonl").read_text().splitlines()]
    raw_server = [json.loads(line.split("COSTFN_REQUEST=", 1)[1]) for line in server_text.splitlines() if "COSTFN_REQUEST=" in line]
    by_id = {}
    duplicate_ids = set()
    for row in raw_server:
        key = row["request_id"]
        if key in by_id:
            duplicate_ids.add(key)
        by_id[key] = row
    observations = []
    missing, missing_successful, unphased = [], [], []
    source_mismatches = []
    expected_api = provenance.sources()["api_python_sha256"]
    import hashlib
    expected_observer = hashlib.sha256((Path(__file__).parent / "research_api.py").read_bytes()).hexdigest()
    for row in client:
        server = by_id.get(row["request_id"])
        if server is None:
            missing.append(row["request_id"])
            if row["status"] == 200 and not row["error"]:
                missing_successful.append(row["request_id"])
            continue
        if row["kind"] != "views" and row["status"] == 200 and "phases_ms" not in server:
            unphased.append(row["request_id"])
        if server.get("api_python_sha256") != expected_api or server.get("observer_sha256") != expected_observer:
            source_mismatches.append(row["request_id"])
        observations.append({**row, "server": server})
    feeds = [json.loads(line) for line in (directory / "feeds.jsonl").read_text().splitlines()]
    summary = {}
    for phase in ("warmup", "measured"):
        for kind in ("main", "reactions", "comments", "views"):
            rows = [r for r in observations if r["phase"] == phase and r["kind"] == kind]
            successful = [r for r in rows if r["status"] == 200 and not r["error"]]
            summary[f"{phase}:{kind}"] = {"requests": len(rows), "successful": len(successful),
                "client_success_ms": {str(p): bench.percentile(sorted(r["client_ms"] for r in successful), p) for p in (50, 95, 99)},
                "handler_success_ms": {str(p): bench.percentile(sorted(r["server"]["phases_ms"]["total"] for r in successful if "phases_ms" in r["server"]), p) for p in (50, 95, 99)}}
    good_feeds = [r for r in feeds if r.get("phase") == "measured" and r.get("success")]
    summary["measured_core_success_ms"] = {str(p): bench.percentile(sorted(r["completion_ms"] for r in good_feeds), p) for p in (50, 95, 99)}
    return {"client_requests": len(client), "matched": len(observations), "missing_ids": missing,
            "missing_successful_ids": missing_successful,
            "duplicate_client_ids": len(client) - len({r["request_id"] for r in client}),
            "duplicate_server_ids": sorted(duplicate_ids & {r["request_id"] for r in client}),
            "successful_queries_without_phases": unphased,
            "source_mismatches": source_mismatches,
            "delivery_failures": sum(r["server"].get("delivery_failures", 0) for r in observations),
            "summary": summary, "observations": observations,
            "scope": "Success-only percentiles explicitly exclude retained failures/censored feeds. outside_handler_ms is not pure queue delay."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--seconds", type=float, default=0, help="positive: resource sampling; zero: reconcile retained client files")
    args = parser.parse_args()
    receipt = json.loads(args.receipt.read_bytes())
    if not receipt.get("research_observer") or not receipt.get("complete"):
        raise ValueError("complete research restore required")
    import os
    compose, db_compose = topology.commands(receipt), topology.commands(receipt, "db")
    env = topology.environment(receipt, os.environ) if receipt.get("docker_contexts") else os.environ.copy()
    if args.seconds > 0:
        with (args.out / "resources.jsonl").open("x") as stream:
            end = time.monotonic() + args.seconds
            while time.monotonic() < end:
                stream.write(json.dumps(sample(compose, db_compose, env)) + "\n")
                stream.flush()
                time.sleep(2)
    else:
        logs = subprocess.run(compose + ["logs", "--no-log-prefix", "api"], check=True, capture_output=True, text=True, timeout=60, env=env)
        result = reconcile(args.out, logs.stdout + logs.stderr)
        with (args.out / "correlation.json").open("x") as stream:
            json.dump(result, stream, indent=2)
        if result["missing_ids"] or result["successful_queries_without_phases"] or result["duplicate_server_ids"] or result["source_mismatches"]:
            raise SystemExit("correlation incomplete; point is not accepted")
