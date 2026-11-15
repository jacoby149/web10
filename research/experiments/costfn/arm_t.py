"""Receipt-gated standalone transpose build, on Arm T's own DigitalOcean host.

No provisioning, restore, promotion, automatic retries, table exchange or cleanup.
Setup limits are separate from the unchanged ten-second measured SQL deadline.
"""
import argparse
import hashlib
import json
import platform
import shutil
import time
import urllib.request
import uuid
from datetime import UTC, datetime
from pathlib import Path

DATASET = "2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd"
VALIDATION = "5d7dabb6e4e322d5a76bed630d053b2340d34e5e5016682ad8bdb175c6afdd94"
BASELINE_QUERY = "a9319fcfbe2591a4d427b7adc01489970e3df59714352058fbf8f3dd2d2d07f4"
HERE = Path(__file__).resolve().parent
DDL = """CREATE TABLE doc_groups_t (
    group_id String, created_at DateTime64(3), doc_id String, author_key String,
    link_created_at DateTime64(3), updated_at DateTime64(3), deleted UInt8,
    collection_name LowCardinality(String), tags Array(String), ref_value String,
    comment_post_id String, repost_of String
) ENGINE = MergeTree ORDER BY (group_id, created_at, doc_id)"""
BUILD = """INSERT INTO doc_groups_t
SELECT g.group_id,d.created_at,g.doc_id,d.author_key,g.created_at,g.updated_at,g.deleted,
       d.collection_name,d.tags,d.ref_value,
       JSONExtractString(d.body,'post_id'),JSONExtractString(d.body,'repost_of')
FROM doc_groups AS g INNER JOIN documents AS d ON g.doc_id=d.doc_id"""
RECONCILE = """SELECT count() AS matched,
countIf(tuple(t.author_key,t.created_at,t.link_created_at,t.updated_at,t.deleted,
              t.collection_name,t.tags,t.ref_value,t.comment_post_id,t.repost_of)
     != tuple(d.author_key,d.created_at,g.created_at,g.updated_at,g.deleted,
              d.collection_name,d.tags,d.ref_value,
              JSONExtractString(d.body,'post_id'),JSONExtractString(d.body,'repost_of'))) AS mismatched
FROM doc_groups_t AS t INNER JOIN doc_groups AS g ON t.doc_id=g.doc_id AND t.group_id=g.group_id
INNER JOIN documents AS d ON t.doc_id=d.doc_id"""


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def seal(value):
    return hashlib.sha256(json.dumps({k: v for k, v in value.items() if k != "receipt_sha256"},
                                     sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def read_build(path):
    receipt = json.loads(Path(path).read_bytes())
    if (receipt.get("receipt_sha256") != seal(receipt)
            or receipt.get("outcome") != "ARM_T_BUILD_VERIFIED"
            or receipt.get("dataset_id") != DATASET
            or receipt.get("rewrite_sha256") != digest(HERE / "arm_t_rewrite.py")
            or receipt.get("builder_sha256") != digest(__file__)
            or type(receipt.get("droplet_id")) is not int
            or receipt["droplet_id"] <= 0 or receipt["droplet_id"] == 618505005
            or not receipt.get("deadline_utc") or _utc(receipt["deadline_utc"]) <= datetime.now(UTC)):
        raise ValueError("Arm T build receipt integrity/input/source mismatch")
    return receipt


def _utc(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("explicit UTC/offset required")
    return parsed


def admission(path, droplet_id, now=None):
    """Owner-supplied approval plus digest-bound evidence, never invented gates."""
    now = now or datetime.now(UTC)
    path = Path(path)
    gate = json.loads(path.read_bytes())
    if (gate.get("kind") != "ARM_T_ADMISSION" or gate.get("approved_by") != "Jacob"
            or gate.get("dataset_id") != DATASET or gate.get("droplet_id") != droplet_id
            or gate.get("input_reviewed") is not True or gate.get("storage_admitted") is not True
            or not 0 < gate.get("budget_usd", 0) or _utc(gate["deadline_utc"]) <= now):
        raise ValueError("Arm T needs current isolated operational admission, not the expired smoke lease")

    def evidence(name):
        ref = gate[name]
        source = path.parent / ref["path"]
        if digest(source) != ref["sha256"]:
            raise ValueError("Arm T evidence digest mismatch: " + name)
        return json.loads(source.read_bytes())

    diagnosis, cleanup = (evidence(k) for k in ("diagnosis", "cleanup"))
    if (diagnosis.get("outcome") != "BASELINE_BOUNDARY_SCANS_CONFIRMED"
            or diagnosis.get("dataset_id") != DATASET
            or diagnosis.get("baseline_query_sha256") != BASELINE_QUERY
            or diagnosis.get("read_rows") != 360801800
            or diagnosis.get("unexpected_attribution") is not False):
        raise ValueError("Arm T diagnosis absent or surprising; STOP and report before building")
    # The conclusion alone (even with the right 361M arithmetic) is not a gate.
    # Bind the actual retained SQL/plan and executing sources/query IDs.
    baseline_path = HERE / "evidence/REALISM-SMOKE-20261113.json"
    baseline = json.loads(baseline_path.read_bytes())
    expected_ids = sorted(a["native_query_id"] for a in baseline["attempts"] if a.get("native_query_id"))
    if (diagnosis.get("baseline_receipt_sha256") != digest(baseline_path)
            or diagnosis.get("sources") != baseline["sources"]
            or sorted(diagnosis.get("native_query_ids", [])) != expected_ids
            or diagnosis.get("scan_rows_by_table") != {"documents": 176400600, "doc_groups": 184401200}):
        raise ValueError("source/query-ID-bound native scan attribution required; arithmetic alone is not diagnosis")
    for name in ("retained_query", "scan_evidence"):
        ref = diagnosis.get(name, {})
        artifact = path.parent / ref.get("path", "")
        if (not artifact.is_file() or not artifact.stat().st_size
                or digest(artifact) != ref.get("sha256")
                or (name == "retained_query" and ref["sha256"] != BASELINE_QUERY)):
            raise ValueError("retained exact query and native plan/scan evidence required: " + name)
    exception = gate.get("operator_pilot_first_exception")
    pilot_host = None
    if exception is not None:
        approved = _utc(exception["approved_utc"])
        if (exception.get("kind") != "ARM_T_K20_DIAGNOSTIC_ONLY"
                or exception.get("approved_by") != "Jacob"
                or exception.get("pilot_gate_status") != "operator-waived-not-passed"
                or not approved <= now < _utc(gate["deadline_utc"])
                or not 0 < (_utc(gate["deadline_utc"]) - approved).total_seconds() <= 4 * 3600
                or gate["budget_usd"] > 2):
            raise ValueError("invalid explicit four-hour/$2 Arm T diagnostic-only sequencing exception")
    else:
        pilot = evidence("pilot")
        if (pilot.get("study") != "B" or pilot.get("dataset_id") != DATASET
                or pilot.get("accounts") != 1000000 or pilot.get("trials") != 3
                or not pilot.get("launched_utc") or _utc(pilot["launched_utc"]) > now
                or type(pilot.get("droplet_id")) is not int):
            raise ValueError("Study B 1M three-trial pilot launch evidence required; serial smoke is not a pilot")
        pilot_host = pilot["droplet_id"]
    if droplet_id in (618505005, pilot_host):
        raise ValueError("Arm T must use its own droplet/store, not the baseline or pilot")
    if (cleanup.get("droplet_id") != droplet_id or cleanup.get("verified") is not True
            or cleanup.get("deadline_utc") != gate["deadline_utc"]):
        raise ValueError("independent matching cleanup receipt required")
    return gate


def runtime_admission(receipt, path, host):
    if (receipt.get("droplet_id") != host or receipt.get("admission_sha256") != digest(path)):
        raise ValueError("Arm T runtime host/admission differs from the build")
    gate = admission(path, host)
    if receipt.get("deadline_utc") != gate["deadline_utc"]:
        raise ValueError("Arm T build/runtime deadlines differ")
    return gate


def digitalocean_id():
    if platform.system() != "Linux" or "DigitalOcean" not in Path("/sys/class/dmi/id/sys_vendor").read_text():
        raise ValueError("Arm T engine work is DigitalOcean-only; no local engine runs")
    # Only after the host check. Do not use a proxy or send credentials.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open("http://169.254.169.254/metadata/v1/id", timeout=3) as response:
        return int(response.read(32))


def host_resources():
    import os

    memory = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
    free = shutil.disk_usage("/var/lib/docker").free
    if not 30 * 1024**3 <= memory <= 33 * 1024**3 or free < 140 * 1024**3:
        raise ValueError("Arm T needs the 32-GiB host and 140-GiB free Docker-store setup headroom")
    return {"host_memory_bytes": memory, "docker_store_free_bytes": free,
            "setup_query_spill_cap_bytes": 100 * 1024**3}


def build(directory, validation, restore_path, gate_path, output):
    import os

    import restore_realism as restore

    output = Path(output)
    if output.exists():
        raise FileExistsError("Arm T preserves every iteration; use a fresh receipt path")
    host = digitalocean_id()
    gate = admission(gate_path, host)
    resources = host_resources()
    restored = json.loads(Path(restore_path).read_bytes())
    project = restored.get("project", "")
    if (not project.startswith("web10-costfn-frozen-armt-") or not restored.get("node_import_complete")
            or restored.get("dataset_id") != DATASET or restored.get("validation_sha256") != VALIDATION
            or restored.get("envelope") != {"container_bytes": 28 * 1024**3,
                                            "clickhouse_server_bytes": 22 * 1024**3, "sensitivity": False}):
        raise ValueError("fresh isolated Arm T realism restore/envelope required")
    manifest = restore.verified_input(directory, validation, DATASET, VALIDATION)
    compose = restore.commands(project, restored["api_port"], restored["overlay"])
    env = {**os.environ, "API_PORT": str(restored["api_port"]),
           "COSTFN_RESEARCH_DIR": str(HERE), "COSTFN_REPO_DIR": str(HERE.parents[2])}
    result = {"kind": "ADDITIVE_ARM_T", "directive": "Jacob 2026-11-14 post-freeze amendment",
              "outcome": "ARM_T_BUILD_IN_PROGRESS", "dataset_id": DATASET, "project": project,
              "droplet_id": host, "admission_sha256": digest(gate_path),
              "deadline_utc": gate["deadline_utc"],
              "pilot_gate_status": "operator-waived-not-passed" if gate.get("operator_pilot_first_exception") else "launch-evidenced",
              "resources_before": resources,
              "restore_sha256": digest(restore_path), "validation_sha256": VALIDATION,
              "rewrite_sha256": digest(HERE / "arm_t_rewrite.py"), "builder_sha256": digest(__file__),
              "ddl_sha256": hashlib.sha256(DDL.encode()).hexdigest(),
              "build_sql_sha256": hashlib.sha256(BUILD.encode()).hexdigest(),
              "steps": [], "build_is_setup_not_feed_cost": True, "parity": "NOT_RUN"}
    result["setup_settings"] = {"max_memory_usage": 22 * 1024**3, "max_bytes_in_join": 1024**3,
                                "grace_hash_join_initial_buckets": 64,
                                "max_bytes_before_external_sort": 2 * 1024**3,
                                "max_temporary_data_on_disk_size_for_query": 100 * 1024**3}
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x") as stream:
        json.dump(result, stream, indent=2)

    def save():
        result["receipt_sha256"] = seal(result)
        with output.open("w") as stream:
            json.dump(result, stream, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())

    def query(name, sql):
        remaining = int((_utc(gate["deadline_utc"]) - datetime.now(UTC)).total_seconds()) - 30
        if remaining <= 0:
            raise ValueError("Arm T operational deadline exhausted")
        query_id = "arm-t-build-" + uuid.uuid4().hex
        started = time.monotonic()
        print(f"[arm-t] setup start {name} query_id={query_id}", flush=True)
        step = {"name": name, "query_id": query_id, "sql_sha256": hashlib.sha256(sql.encode()).hexdigest()}
        result["steps"].append(step)
        save()
        raw = restore.command(compose, env, "exec", "-T", "clickhouse", "clickhouse-client",
            "--user", "web10", "--password", "web10", "--database", "web10",
            "--query_id", query_id, "--max_execution_time", str(min(1800, remaining)),
            "--max_memory_usage", str(22 * 1024**3), "--max_threads", "4",
            "--join_algorithm", "grace_hash", "--max_bytes_before_external_group_by", str(2 * 1024**3),
            "--max_bytes_in_join", str(1024**3), "--grace_hash_join_initial_buckets", "64",
            "--max_bytes_before_external_sort", str(2 * 1024**3),
            "--max_temporary_data_on_disk_size_for_query", str(100 * 1024**3),
            "--query", sql, timeout=min(1800, remaining) + 10).decode().strip()
        step.update(seconds=round(time.monotonic() - started, 3), complete=True)
        save()
        print(f"[arm-t] setup complete {name} seconds={step['seconds']}", flush=True)
        return raw

    try:
        container = restore.command(compose, env, "ps", "-q", "clickhouse").decode().strip()
        if not container or "\n" in container:
            raise ValueError("exactly one owned ClickHouse container required")
        cap = int(restore.command(["docker"], env, "inspect", "--format", "{{.HostConfig.Memory}}", container))
        if cap != 28 * 1024**3:
            raise ValueError("live ClickHouse container is not capped at 28 GiB")
        if query("engine", "SELECT version()") != "24.8.14.39":
            raise ValueError("Arm T engine pin mismatch")
        if int(query("server_memory", "SELECT value FROM system.server_settings WHERE name='max_server_memory_usage'")) != 22 * 1024**3:
            raise ValueError("live ClickHouse server memory is not 22 GiB")
        for table, key in (("documents", "(author_key, doc_id)"), ("doc_groups", "(doc_id, group_id)")):
            if "ORDER BY " + key not in query("source_key_" + table, "SHOW CREATE TABLE " + table):
                raise ValueError("original source layout changed")
        if query("variant_absent", "SELECT count() FROM system.tables WHERE database='web10' AND name='doc_groups_t'") != "0":
            raise ValueError("Arm T variant already exists; retain it and use a fresh restore")
        source_counts = {}
        for table, key in (("documents", "doc_id"), ("doc_groups", "doc_id,group_id")):
            count = int(query("rows_" + table, "SELECT count() FROM " + table))
            if count != manifest["files"][table]["rows"]:
                raise ValueError("source count differs from frozen input")
            source_counts[table] = count
            if int(query("history_" + table, "SELECT count() FROM (SELECT " + key + " FROM " + table
                         + " GROUP BY " + key + " HAVING count()!=1)")):
                raise ValueError("Arm T snapshot refuses ambiguous document IDs or source history")
            if query("tombstones_" + table, "SELECT count() FROM " + table + " WHERE deleted!=0") != "0":
                raise ValueError("Arm T snapshot refuses tombstones")
        result["source_counts"] = source_counts
        query("create_variant", DDL)
        query("build_variant", BUILD)
        count = int(query("variant_rows", "SELECT count() FROM doc_groups_t"))
        if count != source_counts["doc_groups"]:
            raise ValueError("transpose count mismatch or missing document join")
        matched, mismatched = map(int, query("exact_metadata_reconciliation", RECONCILE).split())
        if matched != count or mismatched:
            raise ValueError("transpose exact source/metadata reconciliation failed")
        result["variant_rows"] = count
        result["tables"] = json.loads(query("table_identity", "SELECT name,toString(uuid) AS uuid FROM system.tables "
            "WHERE database='web10' AND name IN ('documents','doc_groups','doc_groups_t') ORDER BY name FORMAT JSON"))["data"]
        result["outcome"] = "ARM_T_BUILD_VERIFIED"
    except Exception as error:
        result["outcome"] = "ARM_T_BUILD_FAILED"
        result["failure_class"] = type(error).__name__
        save()
        raise
    save()
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--validation", type=Path, required=True)
    parser.add_argument("--restore", type=Path, required=True)
    parser.add_argument("--admission", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    build(args.directory, args.validation, args.restore, args.admission, args.out)
