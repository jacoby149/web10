"""Receipt-gated query ledger for Config P's own DigitalOcean research store."""
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
import time
import uuid

import arm_t
import restore_realism as restore


def admitted(operation, host_id, now=None):
    now = now or datetime.now(UTC)
    start = datetime.fromisoformat(operation["approved_utc"])
    deadline = datetime.fromisoformat(operation["deadline_utc"])
    if (operation.get("kind") != "SATELLITE_CONFIG_P_OPERATION_APPROVAL"
            or operation.get("approved_by") != "Jacob" or operation.get("configuration") != "P"
            or operation.get("dataset_id") != arm_t.DATASET or operation.get("droplet_id") != host_id
            or type(host_id) is not int or host_id <= 0 or host_id in (618505005, 619371600)
            or operation.get("canonical_sources_approved") is not True
            or operation.get("scope_qualified_counts_approved") is not True
            or operation.get("fanout") is not False or not (operation.get("watchdog_verified") is True or (
                operation.get('cleanup_model') == 'agent-supervised-self-kill'
                and operation.get('host_self_kill_verified') is True
                and operation.get('scope') in ('F_GATES_ONLY', 'F_DEPLOY_REHEARSAL')
                and operation.get('parent_admission_sha256')))
            or not 0 < operation.get("budget_usd", 0) <= 2
            or not 0 < (deadline - start).total_seconds() <= 4 * 3600
            or not start <= now < deadline):
        raise ValueError("current own-host Config P canonical-source approval required")
    return deadline


class Session:
    def __init__(self, root):
        self.root = Path(root)
        self.operation = json.loads((self.root / "evidence/operation.json").read_bytes())
        self.host_id = arm_t.digitalocean_id()  # Refuses Mac before any SQL/Docker.
        self.deadline = admitted(self.operation, self.host_id)
        restored = json.loads((self.root / "restore.json").read_bytes())
        if (not restored.get("node_import_complete") or restored.get("dataset_id") != arm_t.DATASET
                or restored.get("validation_sha256") != arm_t.VALIDATION
                or not restored.get("project", "").startswith("web10-costfn-frozen-satellite-")):
            raise ValueError("matching own satellite realism restore required")
        self.compose = restore.commands(restored["project"], restored["api_port"], restored["overlay"])
        self.env = {**os.environ, "API_PORT": str(restored["api_port"]),
                    "COSTFN_RESEARCH_DIR": str(Path(__file__).parent),
                    "COSTFN_REPO_DIR": str(Path(__file__).resolve().parents[3])}
        self.ledger = self.root / "evidence/query-ledger.jsonl"
        self.stopped = False

    def verify_envelope(self):
        container = restore.command(self.compose, self.env, "ps", "-q", "clickhouse").decode().strip()
        if not container or "\n" in container:
            raise ValueError("exactly one owned ClickHouse container required")
        memory = int(restore.command(["docker"], self.env, "inspect", "--format", "{{.HostConfig.Memory}}", container))
        if memory != 28 * 1024**3:
            raise ValueError("live container is not capped at 28 GiB")
        version, _ = self.query("verify_engine", "SELECT version()")
        server, _ = self.query("verify_memory", "SELECT value FROM system.server_settings WHERE name='max_server_memory_usage'")
        if version != "24.8.14.39" or int(server) != 22 * 1024**3:
            raise ValueError("actual ClickHouse engine/memory differs from approved envelope")
        return {"container_bytes": memory, "engine": version, "server_bytes": int(server)}

    def record(self, row):
        with self.ledger.open("a") as stream:
            stream.write(json.dumps(row) + "\n")
            stream.flush()
            os.fsync(stream.fileno())

    def query(self, label, sql, *, measured=False, setup_seconds=600):
        admitted(self.operation, self.host_id)
        if self.stopped:
            raise ValueError("stopped Config P session cannot execute another cell")
        remaining = int((self.deadline - datetime.now(UTC)).total_seconds()) - 180
        if remaining < 30:
            raise ValueError("cleanup margin exhausted")
        budget = min(10 if measured else setup_seconds, remaining)
        query_id = "satellite-p-" + uuid.uuid4().hex
        row = {"phase": "start", "label": label, "query_id": query_id, "measured": measured,
               "utc": datetime.now(UTC).isoformat(), "deadline_seconds": budget,
               "sql_sha256": hashlib.sha256(sql.encode()).hexdigest()}
        self.record(row)
        print("[satellite-p] start", label, query_id, flush=True)
        start = time.monotonic()
        args = ["--max_memory_usage=23622320128", "--max_threads=4"]
        if not measured:
            args += ["--max_bytes_before_external_sort=2147483648",
                     "--max_bytes_before_external_group_by=2147483648",
                     "--max_temporary_data_on_disk_size_for_query=107374182400",
                     "--join_algorithm=full_sorting_merge"]
        try:
            raw = restore.command(self.compose, self.env, "exec", "-T", "clickhouse", "clickhouse-client",
                "--user", "web10", "--password", "web10", "--database", "web10", "--query_id", query_id,
                "--max_execution_time", str(budget), *args, "--query", sql, timeout=budget + 20)
            self.record({"phase": "finish", "query_id": query_id, "label": label,
                         "elapsed_seconds": round(time.monotonic() - start, 6), "success": True})
            return raw.decode().strip(), query_id
        except Exception as error:
            self.record({"phase": "finish", "query_id": query_id, "label": label, "success": False,
                         "error_class": type(error).__name__, "elapsed_seconds": round(time.monotonic() - start, 6)})
            raise
        finally:
            print("[satellite-p] end", label, round(time.monotonic() - start, 3), flush=True)

    def rows(self, label, sql, **kwargs):
        raw, query_id = self.query(label, sql + " FORMAT JSON", **kwargs)
        return json.loads(raw)["data"], query_id

    def native(self, query_id, *, measured=False):
        if not query_id.startswith("satellite-p-") or not query_id[12:].isalnum():
            raise ValueError("owned query identity required")
        self.query("flush_native", "SYSTEM FLUSH LOGS")
        rows, _ = self.rows("read_native", "SELECT query_id,toString(type) AS type,query_duration_ms,read_rows,"
            "read_bytes,memory_usage,exception_code FROM system.query_log WHERE query_id='" + query_id
            + "' AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
        if len(rows) != 1:
            raise ValueError("missing or ambiguous native receipt")
        if measured and int(rows[0]["read_rows"]) > 10_000_000:
            self.stopped = True
            self.record({"phase": "STOP", "reason": "single read exceeds 10M rows", "native": rows[0]})
        return rows[0]
