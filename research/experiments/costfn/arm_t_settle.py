"""Physical part-consolidation setup for one admitted isolated Arm T diagnostic.

Never use on production, frozen source storage or a different project. Native
execution remains DO-only. Every step is setup, not a feed measurement. The
caller owns the existing independent deadline/stop watchdog and finally-stop.
"""
from datetime import UTC, datetime
import json
from pathlib import Path
import re
import time
import uuid

import arm_t
import restore_realism as restore

TABLES = ("documents", "doc_groups", "doc_groups_t")


def consolidate(build_path, admission_path, compose, env, output, status):
    output = Path(output)
    if output.exists():
        raise FileExistsError("retain every consolidation attempt")
    host = arm_t.digitalocean_id()
    built = arm_t.read_build(build_path)
    gate = arm_t.runtime_admission(built, admission_path, host)
    if not built["project"].startswith("web10-costfn-frozen-armt-"):
        raise ValueError("isolated Arm T project required")
    if built["project"] not in compose:
        raise ValueError("compose project differs from verified layout")
    deadline = arm_t._utc(gate["deadline_utc"])
    receipt = {"kind": "ARM_T_PHYSICAL_CONSOLIDATION", "outcome": "IN_PROGRESS",
               "source_sha256": arm_t.digest(__file__), "droplet_id": host,
               "parent_build_receipt_sha256": built["receipt_sha256"],
               "deadline_utc": gate["deadline_utc"], "tables": list(TABLES), "steps": [],
               "setup_not_feed_cost": True,
               "fingerprint_limit": "count plus order-independent sum/xor of row hashes, not exact equality proof"}

    def save():
        output.write_text(json.dumps(receipt, indent=2) + "\n")

    def query(label, sql):
        arm_t.runtime_admission(built, admission_path, host)
        remaining = int((deadline - datetime.now(UTC)).total_seconds()) - 900
        if remaining < 120:
            raise ValueError("insufficient original lease for setup and probe; stop")
        budget = min(600, remaining)
        step = {"label": label, "query_id": "arm-t-consolidate-" + uuid.uuid4().hex,
                "started_utc": datetime.now(UTC).isoformat()}
        receipt["steps"].append(step)
        save()
        status("consolidation_setup", step=label)
        started = time.monotonic()
        try:
            return restore.command(compose, env, "exec", "-T", "clickhouse", "clickhouse-client",
                "--user", "web10", "--password", "web10", "--database", "web10",
                "--query_id", step["query_id"], "--max_execution_time", str(budget),
                "--max_memory_usage", str(22 * 1024**3), "--max_threads", "4",
                "--query", sql, timeout=budget + 15).decode().strip()
        finally:
            step["elapsed_seconds"] = round(time.monotonic() - started, 3)
            save()

    def census():
        return json.loads(query("part_census", "SELECT table,partition_id,count() AS parts,"
            "sum(rows) AS rows,sum(marks) AS marks,sum(bytes_on_disk) AS bytes_on_disk "
            "FROM system.parts WHERE database='web10' AND active AND table IN "
            "('documents','doc_groups','doc_groups_t') GROUP BY table,partition_id ORDER BY table,partition_id FORMAT JSON"))["data"]

    def fingerprints():
        result = {}
        for table in TABLES:
            columns = json.loads(query("columns_" + table,
                "SELECT name FROM system.columns WHERE database='web10' AND table='" + table
                + "' ORDER BY position FORMAT JSON"))["data"]
            names = [row["name"] for row in columns]
            if not names or any(not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", name) for name in names):
                raise ValueError("unexpected column identifier; refuse setup")
            row = "tuple(" + ",".join("`" + name + "`" for name in names) + ")"
            result[table] = json.loads(query("multiset_" + table,
                "SELECT count() AS rows,sum(cityHash64(" + row + ")) AS hash_sum,"
                "groupBitXor(cityHash64(" + row + ")) AS hash_xor FROM " + table + " FORMAT JSON"))["data"]
        return result

    try:
        receipt["table_identities_before"] = json.loads(query("table_identities_before",
            "SELECT name,toString(uuid) AS uuid,engine,sorting_key FROM system.tables WHERE database='web10' "
            "AND name IN ('documents','doc_groups','doc_groups_t') ORDER BY name FORMAT JSON"))["data"]
        if [{"name": row["name"], "uuid": row["uuid"]} for row in receipt["table_identities_before"]] != built["tables"]:
            raise ValueError("table generation differs from verified layout")
        receipt["before_parts"] = census()
        receipt["before_fingerprints"] = fingerprints()
        save()
        for table in TABLES:
            query("optimize_" + table, "OPTIMIZE TABLE " + table + " FINAL SETTINGS optimize_skip_merged_partitions=1")
        receipt["after_parts"] = census()
        if {row["table"] for row in receipt["after_parts"]} != set(TABLES) or any(int(row["parts"]) != 1 for row in receipt["after_parts"]):
            raise ValueError("consolidation did not yield one active part per partition")
        receipt["after_fingerprints"] = fingerprints()
        if receipt["before_fingerprints"] != receipt["after_fingerprints"]:
            raise ValueError("logical row/multiset fingerprint changed; stop INVALID")
        receipt["table_identities_after"] = json.loads(query("table_identities_after",
            "SELECT name,toString(uuid) AS uuid,engine,sorting_key FROM system.tables WHERE database='web10' "
            "AND name IN ('documents','doc_groups','doc_groups_t') ORDER BY name FORMAT JSON"))["data"]
        if receipt["table_identities_before"] != receipt["table_identities_after"]:
            raise ValueError("table identities/schema changed; stop")
        receipt["outcome"] = "CONSOLIDATION_VERIFIED_BY_COUNTS_AND_HASHES"
    except Exception as error:
        receipt.update(outcome="FAILED_STOP", failure_class=type(error).__name__)
        raise
    finally:
        receipt["completed_utc"] = datetime.now(UTC).isoformat()
        save()
    return receipt
