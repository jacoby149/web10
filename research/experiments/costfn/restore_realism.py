"""Fresh research-node restore of validated derived Parquet; never V2 fallback.

Run only on the approved DO host. Input is read-only, receipt hashes are explicit,
and an existing project is refused. This is preparation, not pilot acceptance.
"""
import argparse
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

import provenance
import realism_runner
import restore_dataset
from realism_contract import FORMAT, identity, sha

TABLES = ("users", "group_contracts", "group_members", "app_contracts", "documents",
          "doc_groups", "content_events")


def verified_input(directory, validation, expected_id, expected_receipt_sha):
    directory = Path(directory).resolve()
    if sha(validation) != expected_receipt_sha:
        raise ValueError("validation receipt hash differs from approved receipt")
    manifest = json.loads((directory / "manifest.json").read_bytes())
    checked = json.loads(Path(validation).read_bytes())
    if (manifest.get("format") != FORMAT or identity(manifest) != expected_id
            or manifest.get("dataset_id") != expected_id
            or checked.get("dataset_id") != expected_id or checked.get("complete") is not True
            or not checked.get("checks") or not all(v is True for v in checked["checks"].values())):
        raise ValueError("matching independent all-pass derived receipt required")
    for table, info in manifest["files"].items():
        if table not in (*TABLES, "population", "cohorts") or info["name"] != table + ".parquet":
            raise ValueError("unexpected table/path in input manifest")
        path = directory / info["name"]
        print(f"[realism-restore] verify {table} ({info['bytes']} bytes)", flush=True)
        if path.is_symlink() or path.stat().st_size != info["bytes"] or sha(path) != info["sha256"]:
            raise ValueError("input size/digest mismatch: " + table)
    if set(manifest["files"]) != {*TABLES, "population", "cohorts"}:
        raise ValueError("incomplete derived input inventory")
    return manifest


def commands(project, port, overlay):
    config = realism_runner.compose(project, port)
    return config["command"][:-2] + ["-f", str(overlay), "-p", project]


def command(compose, env, *args, data=None, timeout=900):
    result = subprocess.run(compose + list(args), input=data, env=env,
                            capture_output=True, check=False, timeout=timeout)
    if result.returncode:
        print(f"[realism-restore] command {args[0]} failed ({result.returncode}): "
              + result.stderr.decode(errors="replace")[-3000:], flush=True)
        raise subprocess.CalledProcessError(result.returncode, compose + list(args),
                                            output=result.stdout, stderr=result.stderr)
    return result.stdout


def query(compose, env, sql, timeout=900):
    return command(compose, env, "exec", "-T", "clickhouse", "clickhouse-client",
                   "--user", "web10", "--password", "web10", "--database", "web10",
                   "--multiquery", "--query", sql, timeout=timeout).decode()


def server_ready(compose, env):
    # The official image temporarily serves queries during initialization, then
    # shuts that server down. Do not mistake that temporary SELECT 1 for ready.
    process = command(compose, env, "exec", "-T", "clickhouse", "cat", "/proc/1/comm").strip()
    return process.startswith(b"clickhouse") and query(compose, env, "SELECT 1").strip() == "1"


def restore(directory, validation, expected_id, expected_receipt_sha, project, port, receipt):
    started = time.monotonic()
    receipt = Path(receipt).resolve()
    if receipt.exists() or receipt.with_suffix(".overlay.json").exists():
        raise FileExistsError("fresh receipt/overlay paths required")
    manifest = verified_input(directory, validation, expected_id, expected_receipt_sha)
    directory = Path(directory).resolve()
    # Validate project/port before any Docker side effect.
    realism_runner.compose(project, port)
    for resource, args in (("container", ["ps", "-aq"]), ("volume", ["volume", "ls", "-q"]),
                           ("network", ["network", "ls", "-q"])):
        if subprocess.check_output(["docker", *args, "--filter", f"label=com.docker.compose.project={project}"]).strip():
            raise ValueError("existing project " + resource + "; refusing adoption")
    receipt.parent.mkdir(parents=True, exist_ok=True)
    overlay = receipt.with_suffix(".overlay.json")
    overlay.write_text(json.dumps({"services": {"clickhouse": {
        "image": "clickhouse/clickhouse-server:24.8.14.39@sha256:1ffa82edee000a42c09313bd9f1293d94c570aee74babc1b3ca9983a35fa597b",
        # Image-owned fresh volumes already belong to clickhouse. Skip the
        # entrypoint's recursive chown so the read-only Parquet bind is untouched;
        # keep the image's normal unprivileged server user.
        "environment": {"CLICKHOUSE_DO_NOT_CHOWN": "1"},
        "volumes": [{"type": "bind", "source": str(directory),
                     "target": "/var/lib/clickhouse/user_files/input", "read_only": True}]
    }, "api": {"mem_limit": "2g"}, "minio": {"mem_limit": "512m"}}}))
    compose = commands(project, port, overlay)
    env = {**os.environ, "API_PORT": str(port), "QUERY_EVAL_NO_POLICY": "0",
           "QUERY_EVAL_STUB_EXECUTE": "0", "COSTFN_RESOLVER": "batched",
           "COSTFN_ARM_D": "0", "COSTFN_SATELLITE": "0", "COSTFN_VIEWS_TREAT": "0",
           "COSTFN_RESEARCH_DIR": str(Path(__file__).resolve().parent),
           "COSTFN_REPO_DIR": str(Path(__file__).resolve().parents[3])}
    print("[realism-restore] start fresh pinned ClickHouse/MinIO", flush=True)
    command(compose, env, "up", "-d", "clickhouse", "minio")
    restore_dataset.wait_for(lambda: server_ready(compose, env), "initialized pinned ClickHouse")
    if query(compose, env, "SELECT version()").strip() != "24.8.14.39":
        raise ValueError("engine pin mismatch")
    for template in sorted((Path(__file__).resolve().parents[3] / "clickhouse-init").glob("*.sql.template")):
        command(compose, env, "exec", "-T", "clickhouse", "clickhouse-client", "--user", "web10",
                "--password", "web10", "--database", "web10", "--multiquery", data=template.read_bytes())
    print("[realism-restore] build/boot actual API for current schema migrations", flush=True)
    command(compose, env, "up", "-d", "--no-deps", "--build", "api")
    base = f"http://127.0.0.1:{port}"
    restore_dataset.wait_api_ready(compose, env, base, project)
    command(compose, env, "stop", "api")
    baseline = {}
    for table in TABLES:
        baseline[table] = int(query(compose, env, f"SELECT count() FROM {table}"))
        if baseline[table] and table not in ("group_contracts", "group_members"):
            raise ValueError("nonempty fresh target " + table)
        if table in ("group_contracts", "group_members") and int(query(compose, env,
                f"SELECT count() FROM {table} WHERE group_id!='api.localhost/groups/web10/discover'")):
            raise ValueError("unexpected non-boot group data")
    imported = {}
    for table in TABLES:
        then = time.monotonic()
        print(f"[realism-restore] import start {table}: {manifest['files'][table]['rows']:,} rows", flush=True)
        # Explicit source columns preserve Parquet field order independently of
        # migration-added/default target columns. Unknown/missing fields fail.
        description = json.loads(query(compose, env,
            f"DESCRIBE TABLE file('input/{table}.parquet', Parquet) FORMAT JSON"))["data"]
        columns = [r["name"] for r in description]
        if any(not name.replace("_", "").isalnum() for name in columns):
            raise ValueError("unexpected Parquet column")
        fields = ",".join("`" + name + "`" for name in columns)
        query(compose, env, f"INSERT INTO {table} ({fields}) SELECT {fields} "
              f"FROM file('input/{table}.parquet', Parquet) SETTINGS max_threads=4, max_insert_threads=4, "
              "max_memory_usage=23622320128, max_execution_time=3600", timeout=3700)
        count = int(query(compose, env, f"SELECT count() FROM {table}"))
        if count != baseline[table] + manifest["files"][table]["rows"]:
            raise ValueError("import count mismatch: " + table)
        imported[table] = {"rows": count, "seconds": round(time.monotonic() - then, 3)}
        print(f"[realism-restore] import complete {table}: {count:,} rows in {imported[table]['seconds']}s", flush=True)
    command(compose, env, "start", "api")
    restore_dataset.wait_for(lambda: urllib.request.urlopen(base + "/docs", timeout=5).status == 200, "restored API")
    result = {"dataset_id": expected_id, "validation_sha256": expected_receipt_sha,
              "complete": True, "node_import_complete": True, "connected_correctness": False,
              "pilot_ready": False, "project": project, "api": base, "api_port": port,
              "overlay": str(overlay), "counts_before": baseline, "imports": imported,
              "preparation_seconds": round(time.monotonic() - started, 3), "sources": provenance.sources(),
              "envelope": realism_runner.compose(project, port)["envelope"]}
    with receipt.open("x") as stream:
        json.dump(result, stream, indent=2)
    print("[realism-restore] node import complete; connected correctness is a separate gate", flush=True)
    return result


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("directory", type=Path)
    p.add_argument("--validation", type=Path, required=True)
    p.add_argument("--expected-id", required=True)
    p.add_argument("--validation-sha256", required=True)
    p.add_argument("--project", required=True)
    p.add_argument("--port", type=int, default=6095)
    p.add_argument("--receipt", type=Path, required=True)
    a = p.parse_args()
    restore(a.directory, a.validation, a.expected_id, a.validation_sha256, a.project, a.port, a.receipt)
