#!/usr/bin/env python3
"""Run one labelled date sensitivity on existing disposable hosts; never provisions."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import subprocess
import time

import acceptance
import date_case
import provenance
import restore_dataset
import restore_distributed
import topology


def run(directory, out, arm, project=None, port=6098, config=None):
    out.mkdir(parents=True, exist_ok=False)
    identity = date_case.validate(directory)
    os.environ["QUERY_EVAL_DATE_PRUNING"] = "1" if arm == "candidate" else "0"
    report = {"arm": arm, "dataset": identity, "sources": date_case.sources(),
              "storage_profile": "local-tmpfs-cached-image" if os.environ.get("COSTFN_LOCAL_TMPFS") == "1" else "volume-backed",
              "local_tmpfs_limit": os.environ.get("COSTFN_LOCAL_TMPFS_SIZE", "1g") if os.environ.get("COSTFN_LOCAL_TMPFS") == "1" else None,
              "started_epoch": time.time(), "status": "PREPARING", "primary_study": False}

    def write():
        (out / "stage.json").write_text(json.dumps(report, indent=2))

    owned = False

    def created():
        nonlocal owned
        owned = True

    def checker(base, manifest):
        if arm == "candidate":
            db = topology.commands(config, "db") if config else restore_dataset.compose_command(project, port, research=True)
            env = topology.environment(config, os.environ) if config else {**os.environ, "API_PORT": str(port)}
            for sql in [
                "ALTER TABLE documents MODIFY SETTING deduplicate_merge_projection_mode='rebuild'",
                "ALTER TABLE documents ADD PROJECTION date_candidates (SELECT collection_name,created_at,author_key,doc_id ORDER BY (collection_name,created_at,author_key,doc_id))",
                "ALTER TABLE documents MATERIALIZE PROJECTION date_candidates SETTINGS mutations_sync=2",
            ]:
                restore_dataset.ch(db, env, sql)
            explain = restore_dataset.ch(db, env, "EXPLAIN indexes=1 SELECT author_key,doc_id FROM documents "
                f"WHERE collection_name='posts' AND created_at>=fromUnixTimestamp64Milli({date_case.CUTOFF_MS})")
            (out / "candidate-explain.txt").write_bytes(explain)
        return date_case.correctness(base, manifest)

    write()
    receipt = None
    try:
        if config:
            receipt = restore_distributed.prepare(directory, config, out / "restore.json", identity["dataset_id"],
                                                  fixture=date_case, checker=checker, on_created=created)
        else:
            receipt = restore_dataset.restore(directory, project, port, out / "restore.json", identity["dataset_id"],
                                               fixture=date_case, checker=checker, research=True, on_created=created)
        report["status"] = "STRICT_ACCEPTANCE_RUNNING"
        write()
        result = asyncio.run(acceptance.accept(directory, receipt, out / "acceptance", pairs=0,
            fixture=date_case, capture=date_case.capture(), result_checker=date_case.check_result))
        correlated = json.loads((out / "acceptance/correlation.json").read_bytes())["observations"]
        mains = [row for row in correlated if row["kind"] == "main"]
        report["date_plan_witness"] = bool(mains) and all(
            bool(row["server"].get("date_plan_applied")) == (arm == "candidate") for row in mains)
        if not report["date_plan_witness"]:
            raise ValueError("requested date arm was not witnessed in actual compiled main queries")
        report["status"] = "STRICT_ACCEPTANCE_PASSED"
        report["acceptance"] = result
    except Exception as error:
        report["status"] = "STRICT_ACCEPTANCE_FAILED" if receipt else "PREPARATION_FAILED"
        report["error_class"] = type(error).__name__
        raise
    finally:
        report["finished_epoch"] = time.time()
        report["restore_complete"] = receipt is not None
        report["paired_resolver"] = "Not run: this is a date-plan sensitivity, not a resolver comparison"
        write()
        env = topology.environment(config, os.environ) if config else {**os.environ, "API_PORT": str(port)}
        report["owned_target_admitted"] = owned
        report["diagnostic_errors"] = []
        report["cleanup"] = "not-owned-no-access" if not owned else "pending"
        if owned:
            command = topology.commands(config, "db") if config else restore_dataset.compose_command(project, port, research=True)
            try:
                metrics = subprocess.run(command + ["exec", "-T", "clickhouse", "clickhouse-client", "--user", "web10", "--password", "web10", "--multiquery", "--query",
                    "SYSTEM FLUSH LOGS; SELECT event_time_microseconds,type,query_id,query_duration_ms,read_rows,read_bytes,memory_usage,exception_code FROM system.query_log ORDER BY event_time_microseconds FORMAT JSONEachRow"],
                    env=env, capture_output=True, timeout=60)
                (out / "database-query-metrics.jsonl").write_bytes(metrics.stdout)
                report["database_metrics_collected"] = metrics.returncode == 0
            except Exception as error:
                report["diagnostic_errors"].append(type(error).__name__)
            commands = [topology.commands(config, role) for role in ("api", "db")] if config else [command]
            cleaned = True
            for index, command in enumerate(commands):
                try:
                    logs = subprocess.run(command + ["logs", "--no-log-prefix"], env=env, capture_output=True, timeout=60)
                    (out / f"containers-{index}.log").write_bytes(logs.stdout + logs.stderr)
                except Exception as error:
                    report["diagnostic_errors"].append(type(error).__name__)
                try:
                    subprocess.run(command + ["down", "-v"], env=env, check=True, capture_output=True, timeout=90)
                    prefix = topology.docker_prefix(command)
                    name = config["project"] if config else project
                    for args in (["ps", "-aq"], ["volume", "ls", "-q"], ["network", "ls", "-q"]):
                        remaining = subprocess.run(prefix + args + ["--filter", f"label=com.docker.compose.project={name}"], env=env, check=True, capture_output=True, timeout=30)
                        if remaining.stdout.strip():
                            cleaned = False
                except Exception as error:
                    report["diagnostic_errors"].append(type(error).__name__)
                    cleaned = False
            report["cleanup"] = "verified-empty" if cleaned else "external-cleanup-required"
        if date_case.sources() != report["sources"]:
            report["status"] = "INVALID_SOURCE_DRIFT"
        write()
    if report["status"] != "STRICT_ACCEPTANCE_PASSED" or report["cleanup"] != "verified-empty":
        raise ValueError("date run or cleanup not complete; retain stage receipt")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--arm", choices=("baseline", "candidate"), required=True)
    parser.add_argument("--project")
    parser.add_argument("--port", type=int, default=6098)
    parser.add_argument("--topology", type=Path)
    args = parser.parse_args()
    if bool(args.project) == bool(args.topology):
        raise ValueError("choose exactly one local project or existing-host topology")
    config = json.loads(args.topology.read_bytes()) if args.topology else None
    print(json.dumps(run(args.directory, args.out, args.arm, args.project, args.port, config), indent=2))
