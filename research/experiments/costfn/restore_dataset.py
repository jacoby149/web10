#!/usr/bin/env python3
"""Restore verified synthetic inputs into the fixed disposable costfn compose stack.

No arbitrary database URL, SQL/DDL from artifacts, deletion, or live-node export.
Creation/import/login/correctness checks are preparation, never measured samples.
"""
import argparse
import gzip
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

import dataset

HERE = Path(__file__).resolve().parent


class ChRestartError(RuntimeError):
    """A ClickHouse process restart (exit 210 / connection refused) hit the
    import at connect time: zero rows were written for that table, the on-disk
    volume is intact, and a settle + re-wait + retry is safe. Distinct from a
    fatal partial import (rows were written, counts no longer reconcile)."""


def compose_command(project, port, research=False):
    if not re.fullmatch(r"web10-costfn-frozen-[a-z0-9-]{1,32}", project):
        raise ValueError("project must be a dedicated web10-costfn-frozen-* name")
    if not 1024 <= port <= 65535:
        raise ValueError("use an unprivileged localhost port")
    command = ["docker", "compose", "-f", str(HERE / "compose.yml")]
    if research:
        command += ["-f", str(HERE / "research.compose.yml")]
    return command + ["-p", project]


def run(command, env, data=None):
    print(f"[restore] command start: {command[0]} ({len(command)} arguments)", flush=True)
    try:
        result = subprocess.run(command, env=env, input=data, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, check=True, timeout=900).stdout
    except subprocess.CalledProcessError as exc:
        # Only fixed compose/schema/count operations run here, never HTTP bodies
        # or arbitrary node data. Preserve useful bounded build/startup diagnostics.
        print(f"[restore] command failed: exit={exc.returncode}", file=sys.stderr)
        print(exc.stderr.decode(errors="replace")[-8000:], file=sys.stderr)
        raise
    print("[restore] command complete", flush=True)
    return result


def ch(compose, env, query):
    return run(compose + ["exec", "-T", "clickhouse", "clickhouse-client", "--user", "web10",
                          "--password", "web10", "--database", "web10", "--query", query], env)


def wait_for(probe, label):
    for _ in range(90):
        try:
            if probe():
                return
        except (subprocess.CalledProcessError, OSError, urllib.error.URLError):
            pass
        time.sleep(2)
    raise RuntimeError(f"{label} did not become ready within 180 seconds")


def container_state(project, service):
    """The compose container's State.Status ('running'/'exited'/...); '' if gone."""
    name = f"{project}-{service}-1"
    out = subprocess.run(["docker", "inspect", "-f", "{{.State.Status}}", name],
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout.decode().strip()
    return out


def wait_api_ready(compose, env, base, project, seconds=120):
    """Poll the API /docs until 200. The app's startup CH probe does not retry:
    if its first cross-container clickhouse:8123 attempt lands before the compose
    network/DNS settles, the API exits(3) and /docs never comes up. CH is already
    confirmed up by the caller (native + HTTP 8123), so on a startup crash restart
    the API once — by then the network is settled and it comes up. Recorded."""
    deadline = time.monotonic() + seconds
    restarted = False
    while time.monotonic() < deadline:
        try:
            if urllib.request.urlopen(base + "/docs", timeout=5).status == 200:
                return
        except (OSError, urllib.error.URLError):
            pass
        if not restarted:
            state = container_state(project, "api")
            if state == "exited":
                print("[restore] api exited on its startup CH probe; restarting once (CH confirmed up)", flush=True)
                run(compose + ["start", "api"], env)
                restarted = True
        time.sleep(3)
    raise RuntimeError(f"API did not become ready within {seconds} seconds")


def api_json(base, path, payload):
    request = urllib.request.Request(base + path, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def counts(compose, env, tables=dataset.TABLES):
    if not set(tables) <= {*dataset.TABLES, "app_contracts"}:
        raise ValueError("unknown fixture tables")
    return {table: int(ch(compose, env, f"SELECT count() FROM {table}")) for table in tables}


def check_empty_target(compose, env):
    baseline = counts(compose, env)
    if any(baseline[table] for table in ("users", "documents", "doc_groups")):
        raise ValueError("target contains account/document data; refusing to merge or overwrite")
    discover = f"{dataset.PROVIDER}/groups/web10/discover"
    for table in ("group_contracts", "group_members"):
        if int(ch(compose, env, f"SELECT count() FROM {table} WHERE group_id != '{discover}'")):
            raise ValueError("target contains non-boot groups; use a fresh disposable project")
    return baseline


def import_table(compose, env, directory, table):
    if table not in (*dataset.TABLES, "app_contracts"):
        raise ValueError("table is not in the fixed import allowlist")
    command = compose + ["exec", "-T", "clickhouse", "clickhouse-client", "--user", "web10",
                         "--password", "web10", "--database", "web10", "--query",
                         f"INSERT INTO {table} FORMAT JSONEachRow"]
    # Stream decompression through stdin; paths/tables/DDL are not artifact-controlled.
    with gzip.open(directory / f"{table}.jsonl.gz", "rb") as source, tempfile.TemporaryFile() as errors:
        with subprocess.Popen(command, env=env, stdin=subprocess.PIPE,
                              stdout=subprocess.DEVNULL, stderr=errors) as process:
            try:
                shutil.copyfileobj(source, process.stdin)
            except BrokenPipeError:
                pass
            finally:
                process.stdin.close()
            rc = process.wait()
    if rc != 0:
        errors.seek(0)
        err = errors.read().decode(errors="replace")
        # Connection refused at connect time: CH restarted under the pinned
        # allocation, ZERO rows written for this table, volume intact -> the
        # caller settles, re-waits for CH, and retries once (safe + recorded).
        if "Connection refused" in err or "Code: 210" in err:
            raise ChRestartError(f"import {table} hit a CH restart (0 rows, recoverable): {err[-240:]}")
        raise RuntimeError(f"import failed for {table}; disposable target is partial (exit={rc}, {len(err)} stderr bytes)")


def correctness(base, manifest):
    token = api_json(base, "/v3/login", {"username": manifest["reader"], "password": dataset.PASSWORD, "site": "costfn"})["token"]
    users = manifest["followed"][:10]
    groups = [manifest["creator_groups"][user] for user in users]
    result = api_json(base, "/v3/query", {"token": token, "sql": "SELECT doc_id, body FROM posts ORDER BY created_at DESC, doc_id LIMIT 20", "groups": groups})
    expected = sorted((next(dataset.post_rows(user, manifest["creator_groups"][user], f"post 0 by {user}"))[1]
                       for user in users), key=lambda row: row["doc_id"])
    # The query endpoint deliberately parses its body column back to JSON.
    wanted = [{"doc_id": row["doc_id"], "body": json.loads(row["body"])} for row in expected]
    if result["rows"] != wanted:
        raise ValueError("authorized query returned different rows/fields/order from the fixed fixture")
    return {"login": True, "ordered_public_query_rows": len(wanted), "scope": "Public microbenchmark fixture only; no private/Origin/full-feed/concurrency assurance."}


def restore(directory, project, port, receipt, expected_id=None, fixture=dataset, checker=correctness, research=False):
    start = time.monotonic()
    compose = compose_command(project, port, research=research)
    receipt = Path(receipt)
    if receipt.exists():
        raise FileExistsError("refusing to overwrite a restore receipt")
    verified = fixture.validate(directory)  # all hashes/relationships BEFORE Docker writes
    if expected_id is not None and verified["dataset_id"] != expected_id:
        raise ValueError("dataset differs from the independently approved/pinned identity")
    manifest = json.loads((directory / "manifest.json").read_bytes())
    env = {**os.environ, "API_PORT": str(port), "QUERY_EVAL_NO_POLICY": "0", "QUERY_EVAL_STUB_EXECUTE": "0", "QUERY_EVAL_READABLE_MODE": "per-group"}
    base = f"http://127.0.0.1:{port}"
    print(f"[restore] verified dataset={verified['dataset_id']} project={project}", flush=True)
    # Refuse before building/recreating/stopping anything. A disposable-looking
    # name alone does not establish ownership of an existing stack or volume.
    for kind in ("volume", "container", "network"):
        resource = "ps" if kind == "container" else "ls"
        command = ["docker", "ps", "-aq"] if kind == "container" else ["docker", kind, resource, "-q"]
        if run(command + ["--filter", f"label=com.docker.compose.project={project}"], env).strip():
            raise ValueError("project already has resources; select a fresh disposable project")
    run(compose + ["up", "-d", "clickhouse", "minio"], env)
    wait_for(lambda: ch(compose, env, "SELECT 1").strip() == b"1", "ClickHouse")
    for template in sorted((HERE.parents[2] / "clickhouse-init").glob("*.sql.template")):
        wait_for(lambda p=template: run(compose + ["exec", "-T", "clickhouse", "clickhouse-client", "--user", "web10", "--password", "web10", "--database", "web10", "--multiquery"], env, p.read_bytes()) == b"", "schema")
    # The API's startup probes CH over HTTP (8123), which binds slightly after
    # the native port (9000) that `ch("SELECT 1")` above confirms. Confirm the
    # HTTP endpoint is answering before launching the API, or the app exits(3)
    # on a connection-refused CH probe and the /docs readiness then times out.
    wait_for(lambda: b"Ok" in run(compose + ["exec", "-T", "clickhouse", "wget", "-q", "-O-", "http://localhost:8123/ping"], env), "ClickHouse HTTP 8123")
    run(compose + ["up", "-d", "--no-deps", "--build", "api"], env)
    wait_api_ready(compose, env, base, project)
    provider = run(compose + ["exec", "-T", "api", "uv", "run", "python", "-c", "from app import settings; print(settings.PROVIDER)"], env).decode().strip()
    if provider != manifest["provider"]:
        raise ValueError("node provider differs from frozen group identifiers")
    run(compose + ["stop", "api"], env)
    baseline = check_empty_target(compose, env)
    if fixture.TABLES != dataset.TABLES:
        for table in set(fixture.TABLES) - set(dataset.TABLES):
            baseline[table] = int(ch(compose, env, f"SELECT count() FROM {table}"))
            if baseline[table]:
                raise ValueError("target contains existing app contracts")
    # Defensive: re-confirm CH is answering right before the (large) import
    # loop, so a slow/ restarting CH is caught here, not mid-stream.
    wait_for(lambda: ch(compose, env, "SELECT 1").strip() == b"1", "ClickHouse pre-import")
    for table in fixture.TABLES:
        print(f"[restore] importing {table}", flush=True)
        try:
            import_table(compose, env, directory, table)
        except ChRestartError as restart:
            print(f"[restore] {table}: {restart}; settling 30 s, re-waiting for CH, retrying once", flush=True)
            time.sleep(30)
            wait_for(lambda: ch(compose, env, "SELECT 1").strip() == b"1", "ClickHouse post-restart")
            import_table(compose, env, directory, table)
    after = counts(compose, env, fixture.TABLES)
    if after != {table: baseline[table] + verified["rows"][table] for table in fixture.TABLES}:
        raise ValueError("restored row counts differ; target is partial, not a valid trial input")
    run(compose + ["start", "api"], env)
    wait_for(lambda: urllib.request.urlopen(base + "/docs", timeout=5).status == 200, "restored API")
    check = checker(base, manifest)
    receipt.parent.mkdir(parents=True, exist_ok=True)
    result = {**verified, "complete": True, "project": project, "api": base, "api_port": port,
              "research_observer": research,
              "counts_before": baseline, "counts_after": after, "correctness": check,
              "preparation_seconds": round(time.monotonic() - start, 3),
              "clickhouse_version": ch(compose, env, "SELECT version()").decode().strip()}
    receipt.write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--project", required=True)
    parser.add_argument("--port", type=int, default=6090)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--expected-id", required=True, help="approved dataset ID from a trusted receipt, not just the download")
    args = parser.parse_args()
    print(json.dumps(restore(args.directory, args.project, args.port, args.receipt, args.expected_id), indent=2))
