#!/usr/bin/env python3
"""Local A/B/C diagnostic: one restored database, balanced query treatments."""
import argparse
import asyncio
from datetime import datetime, timedelta
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

import httpx

import acceptance
import core_feed
import date_case
import lifecycle
import load_core
import observe
import provenance
import restore_dataset as restore

ORDERS = (("A", "B", "C"), ("B", "C", "A"), ("C", "A", "B"))


def active_compose_hashes(paths):
    return {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}


def source_snapshot():
    names = ["compose.yml", "research.compose.yml"]
    if os.environ.get("COSTFN_LOCAL_TMPFS") == "1":
        names.append("memory.compose.yml")
    return {**date_case.sources(), "active_compose_sha256": active_compose_hashes([restore.HERE / name for name in names])}


def api_ready(base):
    try:
        return httpx.get(base + "/docs", timeout=5, trust_env=False).status_code == 200
    except httpx.HTTPError:
        return False


def capture(arm):
    if arm not in ("A", "B", "C"):
        raise ValueError("unknown matched date arm")
    return core_feed.wire() if arm == "A" else date_case.capture()


class ValidatedInput:
    """Reuse all-row validation only while every admitted input byte is unchanged."""
    def __init__(self, directory, verified):
        self.directory, self.verified = directory.resolve(), verified
        self.manifest_hash = hashlib.sha256((directory / "manifest.json").read_bytes()).hexdigest()
        self.manifest = json.loads((directory / "manifest.json").read_bytes())
        if (not verified.get("complete") or verified["dataset_id"] != self.manifest["dataset_id"]
                or date_case.v1.identity(self.manifest) != verified["dataset_id"]):
            raise ValueError("completed all-row-validated restore required")

    def validate(self, directory):
        directory = directory.resolve()
        names = {"manifest.json", *(f"{table}.jsonl.gz" for table in date_case.TABLES)}
        if directory != self.directory or {p.name for p in directory.iterdir()} != names:
            raise ValueError("admitted input location/files changed")
        for name in names:
            path = directory / name
            expected = self.manifest_hash if name == "manifest.json" else self.manifest["files"][name.removesuffix(".jsonl.gz")]["sha256"]
            if path.is_symlink():
                raise ValueError("admitted input bytes changed")
            with path.open("rb") as source:
                if hashlib.file_digest(source, "sha256").hexdigest() != expected:
                    raise ValueError("admitted input bytes changed")
        return {key: self.verified[key] for key in ("dataset_id", "rows")}


async def serial(base, manifest, wire, out, stable_hashes):
    out.mkdir()
    with (out / "requests.jsonl").open("x") as requests, (out / "feeds.jsonl").open("x") as feeds:
        records = load_core.Records(requests)
        async with httpx.AsyncClient(base_url=base, timeout=60, trust_env=False) as client:
            sessions = await core_feed.prepare(client, manifest, 2)
            for number, reader in enumerate((0, 0, 1)):
                phase = "warmup" if number == 0 else "measured"
                row = {"phase": phase, "reader_index": reader, "success": False}
                started = time.perf_counter()
                try:
                    rows, followups = await core_feed.feed(client, wire, *sessions[reader], records, phase, reader,
                        main_checker=lambda actor, values: check_main(manifest, actor, values, stable_hashes))
                    date_case.check_result(manifest, reader, rows, followups)
                    digest = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
                    if reader in stable_hashes and stable_hashes[reader] != digest:
                        raise ValueError("ordered main rows differ between treatments")
                    stable_hashes[reader] = digest
                    row.update(success=True, ordered_rows_sha256=digest)
                except (httpx.HTTPError, core_feed.CoreRequestFailure):
                    row["failure"] = "http_failure"
                except (ValueError, KeyError, TypeError):
                    row["failure"] = "semantic_failure"
                    raise
                finally:
                    row["completion_ms"] = (time.perf_counter() - started) * 1000
                    feeds.write(json.dumps(row) + "\n")
    return {"http_requests_after_drain": records.in_flight, "peak_http_requests": records.peak_in_flight}


def check_main(manifest, reader, rows, stable_hashes):
    wanted = date_case.indices(manifest, reader)
    expected = [date_case.v2.doc_id(date_case.v2.creator(manifest["recipe"], i), "posts") for i in wanted]
    if len(wanted) != 21 or [row.get("doc_id") for row in rows] != expected:
        raise ValueError("wrong main rows before follow-up requests")
    for index, row in zip(wanted, rows):
        profile = json.loads(row["profile_body"]) if isinstance(row.get("profile_body"), str) else row.get("profile_body")
        stamp = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        if (row["author_key"] != date_case.v2.creator(manifest["recipe"], index)
                or not profile or profile.get("display_name") != f"Creator {index}"
                or stamp != date_case.CLOCK - timedelta(seconds=manifest["recipe"]["creators"] - index)):
            raise ValueError("wrong main author/profile/date before follow-ups")
    digest = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
    if reader in stable_hashes and stable_hashes[reader] != digest:
        raise ValueError("main row equivalence changed between treatments")
    stable_hashes[reader] = digest


def native_attribution(correlation, terminal_rows, arm):
    if any(correlation.get(key) for key in ("missing_ids", "duplicate_client_ids", "duplicate_server_ids", "source_mismatches", "successful_queries_without_phases")):
        raise ValueError("HTTP correlation incomplete, including failed requests")
    if correlation.get("client_requests", len(correlation["observations"])) != len(correlation["observations"]):
        raise ValueError("HTTP observations do not cover every request")
    by_id = {}
    for row in terminal_rows:
        if row["query_id"] in by_id:
            raise ValueError("duplicate native terminal query ID")
        by_id[row["query_id"]] = row
    result = []
    mains = 0
    for request in correlation["observations"]:
        server = request["server"]
        if server.get("native_query_id_mismatch") or server.get("native_query_observation_skipped"):
            raise ValueError("native SELECT instrumentation incomplete")
        queries = server.get("native_queries", [])
        if not queries or any(q["query_id"] not in by_id for q in queries):
            raise ValueError("native SELECT IDs missing from query log")
        record = {key: request[key] for key in ("request_id", "kind", "phase", "reader_index", "status", "client_ms")}
        record["native_selects"] = [by_id[q["query_id"]] for q in queries]
        if request["status"] in (401, 403, 404):
            raise ValueError("unexpected authorization/route failure, not a performance sample")
        compiled = server.get("compiled_query_sha256s", [])
        matching = [q for q in queries if compiled and q["sql_sha256"] == compiled[0]]
        if request["kind"] != "views":
            if len(matching) != 1:
                raise ValueError("compiled request SELECT attribution ambiguous")
            terminal = by_id[matching[0]["query_id"]]
            if int(terminal["exception_code"]) not in (0, 159, 241):
                raise ValueError("unexpected native error, not a timeout/memory sample")
            record["compiled_request_select"] = terminal
        if request["kind"] == "main":
            mains += 1
            if bool(server.get("date_plan_applied")) != (arm == "C") or server.get("date_pruning_enabled") != (arm == "C"):
                raise ValueError("actual main query arm mismatch")
            if len(matching) != 1:
                raise ValueError("native compiled main query attribution ambiguous")
            record["compiled_main"] = by_id[matching[0]["query_id"]]
        result.append(record)
    if not mains:
        raise ValueError("no correlated main requests")
    return {"arm": arm, "main_requests": mains, "requests": result,
            "scope": "Exact tagged client.query SELECT IDs; connection setup and command/insert work excluded"}


def run(directory, out, project, port, expected_id, blocks=3):
    if blocks not in (1, 3):
        raise ValueError("one-block floor or three balanced blocks required")
    out.mkdir(parents=True, exist_ok=False)
    os.environ.update(COSTFN_QUERY_IDS="1", QUERY_EVAL_DATE_PRUNING="0")
    command = restore.compose_command(project, port, research=True)
    env = {**os.environ, "API_PORT": str(port)}
    base = f"http://127.0.0.1:{port}"
    sources = source_snapshot()
    report = {"status": "PREPARING", "sources": sources, "expected_id": expected_id,
              "orders": ORDERS[:blocks], "started_epoch": time.time(), "runs": [], "cloud": False,
              "sql_limit_seconds": 10, "projection_available_all_arms": True}
    owned = False

    def write(path, value):
        path.write_text(json.dumps(value, indent=2) + "\n")

    def created():
        nonlocal owned
        owned = True

    def db(sql):
        return restore.ch(command, env, sql).decode()

    def quiet():
        for attempt in range(30):
            # 24.8 includes this inspection SELECT itself in system.processes.
            count = int(db("SELECT count() FROM system.processes"))
            if count == 1:
                return
            time.sleep(2)
        raise ValueError("previous native work did not drain")

    def logs():
        value = subprocess.run(command + ["logs", "--no-log-prefix", "api"], check=True, capture_output=True, text=True, env=env, timeout=60)
        return value.stdout + value.stderr

    def collect_native(correlation):
        ids = sorted({q["query_id"] for r in correlation["observations"] for q in r["server"].get("native_queries", [])})
        if not ids or any(not re.fullmatch(r"[a-f0-9]{32}", value) for value in ids):
            raise ValueError("invalid native query IDs")
        quoted = ",".join(f"'{identifier}'" for identifier in ids)
        db("SYSTEM FLUSH LOGS")
        data = db("SELECT query_id,type,query_duration_ms,read_rows,read_bytes,memory_usage,exception_code,"
                  "projections,ProfileEvents['SelectedMarks'] AS selected_marks FROM system.query_log "
                  f"WHERE query_id IN ({quoted}) AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing') "
                  "ORDER BY event_time_microseconds FORMAT JSONEachRow")
        return [json.loads(line) for line in data.splitlines()]

    def checker(origin, manifest):
        for sql in (
            "ALTER TABLE documents MODIFY SETTING deduplicate_merge_projection_mode='rebuild'",
            "ALTER TABLE documents ADD PROJECTION date_candidates (SELECT collection_name,created_at,author_key,doc_id ORDER BY (collection_name,created_at,author_key,doc_id))",
            "ALTER TABLE documents MATERIALIZE PROJECTION date_candidates SETTINGS mutations_sync=2",
        ):
            db(sql)
        # Do not require a full baseline feed to beat the latency deadline before
        # admitting its performance test. All successful main responses are
        # checked immediately in the actual serial/concurrent arms below.
        async def structural():
            records = []
            async with httpx.AsyncClient(base_url=origin, timeout=120, trust_env=False) as client:
                sessions = await core_feed.prepare(client, manifest, 2)
                for reader, (token, groups) in enumerate(sessions):
                    index = date_case.indices(manifest, reader)[0]
                    identifier = date_case.v2.doc_id(date_case.v2.creator(manifest["recipe"], index), "posts")
                    body = {"token": token, "groups": groups, "sql": f"SELECT p.doc_id AS doc_id FROM posts p WHERE p.doc_id = '{identifier}' LIMIT 1"}
                    result = await core_feed.request(client, "/v3/query", body, date_case.v2.ORIGIN, records, "exact-document", "preparation", reader)
                    if result.get("rows") != [{"doc_id": identifier}]:
                        raise ValueError("structural exact-document read mismatch")
                    denied = await client.post("/v3/query", json=body, headers={"Origin": "https://ungranted.research.invalid"})
                    if denied.status_code != 403:
                        raise ValueError("structural Origin denial failed")
            write(out / "preparation-requests.json", records)
            return {"real_login_and_discovery": True, "exact_document_reads": 2, "origin_denial": True,
                    "full_feed_latency_not_a_precondition": True, "scope": "Structural admission; actual main/counter correctness checked in every treatment"}
        return asyncio.run(structural())

    write(out / "comparison.json", report)
    try:
        receipt = restore.restore(directory, project, port, out / "restore.json", expected_id,
                                  fixture=date_case, checker=checker, research=True, on_created=created)
        guard = ValidatedInput(directory, receipt)
        manifest, stable_hashes = guard.manifest, {}
        report.update(status="COMPARISON_RUNNING", runtime=provenance.runtime(command, command, env),
                      dataset_id=receipt["dataset_id"], storage_profile={"kind": "local-tmpfs-cached-api-image",
                          "data_limit": os.environ.get("COSTFN_LOCAL_TMPFS_SIZE", "1g"), "clickhouse_memory_limit": "5g"})
        for block, order in enumerate(ORDERS[:blocks], 1):
            for arm in order:
                guard.validate(directory)
                if source_snapshot() != sources:
                    raise ValueError("source drift before arm")
                quiet()
                env["QUERY_EVAL_DATE_PRUNING"] = "1" if arm == "C" else "0"
                restore.run(command + ["up", "-d", "--no-deps", "--force-recreate", "api"], env)
                restore.wait_for(lambda: api_ready(base), "matched API restart")
                cell = out / f"block-{block}-{arm}"
                cell.mkdir()
                entry = {"block": block, "arm": arm, "status": "RUNNING"}
                report["runs"].append(entry)
                write(out / "comparison.json", report)
                before = asyncio.run(lifecycle.controls(base, manifest))
                write(cell / "serial-lifecycle-before.json", before)
                quiet()
                write(cell / "serial-summary.json", asyncio.run(serial(base, manifest, capture(arm), cell / "serial", stable_hashes)))
                correlated = observe.reconcile(cell / "serial", logs())
                if correlated["missing_ids"] or correlated["source_mismatches"] or correlated["successful_queries_without_phases"]:
                    raise ValueError("serial correlation invalid")
                write(cell / "serial/correlation.json", correlated)
                native = collect_native(correlated)
                write(cell / "serial/native-attribution.json", native_attribution(correlated, native, arm))
                plan = subprocess.run(command + ["exec", "-T", "api", "uv", "run", "python", "/research/matched_date_plan.py"],
                    input=json.dumps({"manifest": manifest, "arm": arm}), capture_output=True, text=True, env=env, timeout=180)
                (cell / "plan-tool.log").write_text(plan.stdout + plan.stderr)
                if plan.returncode:
                    raise ValueError("full plan diagnostic failed; see retained plan-tool.log")
                full_plan = json.loads(next(line.split("=", 1)[1] for line in plan.stdout.splitlines() if line.startswith("COSTFN_DATE_PLAN=")))
                write(cell / "full-plan.json", full_plan)
                quiet()
                try:
                    asyncio.run(acceptance.accept(directory, receipt, cell / "concurrent", pairs=0, fixture=guard,
                        capture=capture(arm), result_checker=date_case.check_result,
                        main_checker=lambda actor, values: check_main(manifest, actor, values, stable_hashes)))
                except ValueError:
                    if not (cell / "concurrent/acceptance.json").exists():
                        raise
                accepted = json.loads((cell / "concurrent/acceptance.json").read_bytes())
                if not accepted["measurement_valid"]:
                    raise ValueError("concurrent measurement invalid, not a performance failure")
                correlated = json.loads((cell / "concurrent/correlation.json").read_bytes())
                native = collect_native(correlated)
                write(cell / "concurrent/native-attribution.json", native_attribution(correlated, native, arm))
                entry.update(status="VALID", strict_acceptance=accepted["local_acceptance"],
                             counts=json.loads((cell / "concurrent/summary.json").read_bytes())["counts"])
                write(out / "comparison.json", report)
        guard.validate(directory)
        if source_snapshot() != sources:
            raise ValueError("source drift after comparison")
        report["status"] = "COMPARISON_COMPLETE"
    except Exception as error:
        report.update(status="COMPARISON_INVALID_OR_PREPARATION_FAILED", error_class=type(error).__name__)
        raise
    finally:
        report["finished_epoch"] = time.time()
        report["cleanup"] = "not-owned-no-access"
        if owned:
            try:
                db("SYSTEM FLUSH LOGS")
                (out / "all-native-query-metrics.jsonl").write_text(db("SELECT query_id,type,query_duration_ms,read_rows,read_bytes,memory_usage,exception_code,projections "
                    "FROM system.query_log ORDER BY event_time_microseconds FORMAT JSONEachRow"))
            except Exception:
                report["native_log_collection_failed"] = True
            try:
                (out / "api-containers.log").write_text(logs())
            except Exception:
                report["log_collection_failed"] = True
            closed = subprocess.run(command + ["down", "-v"], env=env, capture_output=True, timeout=90)
            remaining = []
            for args in (["ps", "-aq"], ["volume", "ls", "-q"], ["network", "ls", "-q"]):
                value = subprocess.run(["docker", *args, "--filter", f"label=com.docker.compose.project={project}"], check=True, capture_output=True, timeout=30)
                remaining.extend(value.stdout.decode().split())
            report["cleanup"] = "verified-empty" if closed.returncode == 0 and not remaining else "external-cleanup-required"
        write(out / "comparison.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--project", required=True)
    parser.add_argument("--expected-id", required=True)
    parser.add_argument("--port", type=int, default=6098)
    parser.add_argument("--blocks", type=int, choices=(1, 3), default=3)
    options = parser.parse_args()
    result = run(options.directory, options.out, options.project, options.port, options.expected_id, options.blocks)
    if result["cleanup"] != "verified-empty":
        raise SystemExit("matched local cleanup incomplete")
