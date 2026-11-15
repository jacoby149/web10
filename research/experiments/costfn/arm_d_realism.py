"""Additive, DO-only Arm D main probe; frozen treatments/oracle are unchanged."""
import argparse
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
import re
import time
import uuid

import arm_d_rewrite
import arm_t
import arm_t_oracle
import restore_dataset
import restore_realism as restore
import smoke_realism

SPILL = {"max_bytes_before_external_sort": 2 * 1024**3,
         "max_bytes_before_external_group_by": 2 * 1024**3,
         "max_temporary_data_on_disk_size_for_query": 100 * 1024**3,
         "max_memory_usage": 22 * 1024**3, "max_threads": 4,
         "join_algorithm": "full_sorting_merge"}


def treated_main(reader, groups):
    """Instantiate the base-series pin, then change only the physical table."""
    owners = [arm_d_rewrite.owner_of_group(g) for g in groups]
    compiled = (arm_d_rewrite._template()
                .replace("group_id IN ({GROUPS}))", f"group_id IN ({arm_d_rewrite.quoted(groups)}))")
                .replace("'{READER}'", f"'{reader}'"))
    treated = arm_d_rewrite.transform(compiled, reader, groups, owners)
    return compiled, re.sub(r"\bFROM documents\b", "FROM documents_d", treated), owners


def target_pass(trials):
    return len(trials) == 3 and all(int(t["read_rows"]) <= 10_000_000
        and int(t["read_bytes"]) < 25_000_000 and int(t["query_duration_ms"]) < 500
        and int(t["exception_code"]) == 0 for t in trials)


def copy_ddl(ddl):
    if "ORDER BY (author_key, doc_id)" not in ddl:
        raise ValueError("unexpected source key")
    ddl = re.sub(r"CREATE TABLE web10\.documents\b", "CREATE TABLE web10.documents_d", ddl)
    ddl = re.sub(r" UUID '[^']+'", "", ddl)
    return ddl.replace("ORDER BY (author_key, doc_id)", "ORDER BY (author_key, created_at, doc_id, updated_at)")


def run(root, approval_path, output_name="arm-d-realism"):
    root = Path(root)
    approval = json.loads(Path(approval_path).read_bytes())
    host = arm_t.digitalocean_id()
    deadline = arm_t._utc(approval["deadline_utc"])
    if (approval.get("kind") != "ARM_D_REALISM_APPROVAL" or approval.get("approved_by") != "Jacob"
            or approval.get("droplet_id") != host or host != 619371600
            or approval.get("dataset_id") != arm_t.DATASET
            or deadline > arm_t._utc("2026-11-15T05:17:51Z")):
        raise ValueError("matching bounded Arm D operational approval required")
    if not re.fullmatch(r"arm-d-realism(?:-r[0-9]+)?", output_name):
        raise ValueError("dedicated additive output directory required")
    output = root / output_name
    output.mkdir(exist_ok=False)
    result = {"kind": "ARM_D_REALISM_MAIN_ONLY", "outcome": "IN_PROGRESS", "parity": "NOT_RUN",
              "dataset_id": arm_t.DATASET, "droplet_id": host, "deadline_utc": approval["deadline_utc"],
              "setup_settings": SPILL, "steps": [], "trials": [], "K1000": "NOT_RUN",
              "full_sequence": "NOT_ATTEMPTED", "scope": "native main, not HTTP/p95/full-sequence",
              "source_sha256": {n: arm_t.digest(Path(__file__).parent / n) for n in
                  ("arm_d_realism.py", "arm_d_rewrite.py", "smoke_realism.py", "arm_t_oracle.py")}}
    restored = json.loads((root / "restore.json").read_bytes())
    manifest = json.loads((root / "input/manifest.json").read_bytes())
    if (not restored.get("node_import_complete") or restored["dataset_id"] != arm_t.DATASET
            or manifest["dataset_id"] != arm_t.DATASET or restored["validation_sha256"] != arm_t.VALIDATION
            or arm_t.digest(root / "input/validation.json") != arm_t.VALIDATION
            or restored["project"] != "web10-costfn-frozen-armt-d1"):
        raise ValueError("matching retained isolated realism restore required")
    compose = restore.commands(restored["project"], restored["api_port"], restored["overlay"])
    env = {**os.environ, "API_PORT": str(restored["api_port"]),
           "COSTFN_RESEARCH_DIR": str(Path(__file__).parent),
           "COSTFN_REPO_DIR": str(Path(__file__).resolve().parents[3])}

    def save():
        with (output / "result.json").open("w") as stream:
            json.dump(result, stream, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())

    def query(label, sql, measured=False):
        remaining = int((deadline - datetime.now(UTC)).total_seconds()) - 90
        if remaining < 30:
            raise ValueError("original cleanup lease nearly exhausted; stop")
        budget = 10 if measured else min(600, remaining)
        qid = "arm-d-realism-" + uuid.uuid4().hex
        step = {"label": label, "query_id": qid, "sql_sha256": hashlib.sha256(sql.encode()).hexdigest(),
                "setup": not measured}
        result["steps"].append(step)
        save()
        print("[arm-d-realism] start", label, qid, flush=True)
        started = time.monotonic()
        settings = {"max_memory_usage": 22 * 1024**3} if measured else SPILL
        args = ["--" + k + "=" + str(v) for k, v in settings.items()]
        try:
            return restore.command(compose, env, "exec", "-T", "clickhouse", "clickhouse-client",
                "--user", "web10", "--password", "web10", "--database", "web10",
                "--query_id", qid, "--max_execution_time", str(budget), *args,
                "--query", sql, timeout=budget + 15).decode().strip(), qid
        finally:
            step["elapsed_seconds"] = round(time.monotonic() - started, 3)
            save()
            print("[arm-d-realism] end", label, step["elapsed_seconds"], flush=True)

    def scalar(label, sql):
        return query(label, sql)[0]

    def rows(label, sql):
        return json.loads(scalar(label, sql + " FORMAT JSON"))["data"]

    def census():
        return rows("part_census", "SELECT table,partition_id,count() AS parts,sum(rows) AS rows,"
            "sum(marks) AS marks FROM system.parts WHERE database='web10' AND active "
            "AND table IN ('documents','documents_d','doc_groups','doc_groups_t') "
            "GROUP BY table,partition_id ORDER BY table,partition_id")

    def native(qid):
        scalar("flush_native", "SYSTEM FLUSH LOGS")
        found = rows("native_receipt", "SELECT query_id,query_duration_ms,read_rows,read_bytes,memory_usage,exception_code "
            "FROM system.query_log WHERE query_id='" + qid + "' AND type IN "
            "('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
        if len(found) != 1:
            raise ValueError("native attribution missing or ambiguous")
        return found[0]

    def oracle(sql):
        bounded = arm_t_oracle.bounded(sql + " SETTINGS max_execution_time=120, max_threads=4 FORMAT JSON")
        return json.loads(scalar("independent_oracle", bounded))["data"]

    save()
    try:
        result["host_resources"] = arm_t.host_resources()
        restore.command(compose, env, "up", "-d", "--no-deps", "clickhouse", timeout=120)
        restore_dataset.wait_for(lambda: scalar("ready", "SELECT 1") == "1", "retained own ClickHouse")
        container = restore.command(compose, env, "ps", "-q", "clickhouse").decode().strip()
        cap = int(restore.command(["docker"], env, "inspect", "--format", "{{.HostConfig.Memory}}", container))
        if cap != 28 * 1024**3 or scalar("engine", "SELECT version()") != "24.8.14.39":
            raise ValueError("engine/container envelope mismatch")
        if int(scalar("server_cap", "SELECT value FROM system.server_settings WHERE name='max_server_memory_usage'")) != 22 * 1024**3:
            raise ValueError("server cap mismatch")
        result["original_identities_before"] = rows("original_identities", "SELECT name,toString(uuid) AS uuid,sorting_key "
            "FROM system.tables WHERE database='web10' AND name IN ('documents','doc_groups','doc_groups_t') ORDER BY name")
        if scalar("variant_absent", "EXISTS TABLE documents_d") != "0":
            raise ValueError("documents_d exists; preserve it, refuse overwrite")
        ddl = copy_ddl(rows("source_ddl", "SHOW CREATE TABLE documents")[0]["statement"])
        (output / "ddl.sql").write_text(ddl + "\n")
        scalar("create_own_copy", ddl)
        scalar("spill_sorted_copy", "INSERT INTO documents_d SELECT * FROM documents")
        result["source_rows"] = int(scalar("source_rows", "SELECT count() FROM documents"))
        result["copy_rows"] = int(scalar("copy_rows", "SELECT count() FROM documents_d"))
        if result["source_rows"] != result["copy_rows"] or result["source_rows"] != manifest["files"]["documents"]["rows"]:
            raise ValueError("copy count mismatch")
        result["row_count_verified"] = True
        result["before_parts"] = census()
        scalar("consolidate_own_copy", "OPTIMIZE TABLE documents_d FINAL SETTINGS optimize_skip_merged_partitions=1")
        snapshots = []
        for _ in range(3):
            snapshots.append(census())
            if rows("active_merges", "SELECT table FROM system.merges WHERE database='web10'"):
                raise ValueError("unsettled store; stop before measurement")
            time.sleep(2)
        if snapshots[0] != snapshots[1] or snapshots[1] != snapshots[2]:
            raise ValueError("part census unstable")
        result["after_parts"] = snapshots[-1]
        own = [r for r in snapshots[-1] if r["table"] == "documents_d"]
        if len(own) != 1 or int(own[0]["parts"]) != 1 or int(own[0]["rows"]) != result["source_rows"]:
            raise ValueError("copy not consolidated to one part")
        reader = manifest["readers"][1]
        lit = smoke_realism.literals
        members = rows("reader_fixture", "SELECT group_id,role FROM group_members FINAL WHERE member_key=" + lit([reader])
            + " AND deleted=0 AND endsWith(group_id,'/followers') ORDER BY group_id")
        groups = [r["group_id"] for r in members]
        if sum(r["role"] == "member" for r in members) != 20 or len(groups) != 21:
            raise ValueError("not the baseline K20-plus-self fixture")
        result.update(reader_index=1, reader=reader, follow_count=20, groups_including_self=groups, page_size=21)
        compiled, treated, owners = treated_main(reader, groups)
        (output / "compiled.sql").write_text(compiled + "\n")
        (output / "treated.sql").write_text(treated + "\n")
        scope = lit(groups)
        attached = rows("actual_group_author_sets", "SELECT group_id,groupUniqArray(author_key) AS authors FROM "
            "(SELECT doc_id,author_key FROM documents FINAL WHERE deleted=0) d INNER JOIN "
            "(SELECT doc_id,group_id FROM doc_groups FINAL WHERE deleted=0 AND group_id IN (" + scope
            + ")) g USING(doc_id) GROUP BY group_id ORDER BY group_id")
        actual = {r["group_id"]: sorted(r["authors"]) for r in attached}
        result["author_sets"] = [{"group_id": g, "role": m["role"], "shortcut_authors": [a],
            "shortcut_size": 1, "actual_attached_authors": actual.get(g, []),
            "actual_size": len(actual.get(g, []))} for m, g, a in zip(members, groups, owners)]
        result["followed_author_set_total"] = sum(r["actual_size"] for r in result["author_sets"] if r["role"] == "member")
        result["shortcut_followed_enumeration_total"] = 20
        expected = oracle("SELECT doc_id,author_key,posted_by,body,tags,ref_value,ad_mode,ad_target,"
            "toUnixTimestamp64Milli(created_at) AS created_ms FROM documents FINAL WHERE deleted=0 "
            "AND collection_name='posts' AND NOT has(tags,'ad') AND NOT has(tags,'product') "
            f"AND doc_id IN (SELECT doc_id FROM doc_groups FINAL WHERE deleted=0 AND group_id IN ({scope})) "
            "ORDER BY created_at DESC,doc_id LIMIT 21")
        if len(expected) != 21:
            raise ValueError("oracle page floor mismatch")
        selected = lit([r["doc_id"] for r in expected])
        author_scope = lit(sorted({r["author_key"] for r in expected}))
        profiles = {r["author_key"]: json.loads(r["body"]) for r in oracle(
            f"SELECT author_key,body FROM documents FINAL WHERE author_key IN ({author_scope}) "
            "AND collection_name='profile' AND deleted=0")}
        attachments = {r["doc_id"]: r["groups"] for r in oracle(
            f"SELECT doc_id,groupArray(group_id) AS groups FROM doc_groups FINAL WHERE doc_id IN ({selected}) "
            f"AND group_id IN ({scope}) AND deleted=0 GROUP BY doc_id")}
        counts = {r["ref_value"]: {k: int(r[k]) for k in ("likes", "dislikes", "comments")} for r in oracle(
            arm_t_oracle.PREFIX + f"WHERE ref_value IN ({selected}) AND collection_name IN ('reactions','comments') AND deleted=0 "
            f"AND doc_id IN (SELECT doc_id FROM doc_groups FINAL WHERE group_id IN ({scope}) AND deleted=0) GROUP BY ref_value")}
        (output / "oracle.json").write_text(json.dumps({"expected": expected, "profiles": profiles,
            "attachments": attachments, "counts": counts}, indent=2))
        save()
        for index in range(4):
            phase = "warmup" if index == 0 else "measured"
            verification_ids = []
            for sql, want in arm_d_rewrite.verify_sql(reader, groups, owners):
                value, qid = query(phase + "_owner_policy_verification", sql, measured=True)
                verification_ids.append(qid)
                if int(value) != want:
                    raise ValueError("base-series owner/policy precondition failed")
            raw, qid = query(phase + "_main", treated + " FORMAT JSON", measured=True)
            returned = json.loads(raw)["data"]
            metrics = native(qid)
            observation = {"phase": phase, "index": index, **metrics,
                "verification_native": [native(q) for q in verification_ids]}
            result.setdefault("observations", []).append(observation)
            (output / (phase + "-" + str(index) + "-rows.json")).write_text(json.dumps(returned, indent=2))
            try:
                smoke_realism.validate_rows(returned, expected, profiles, attachments, counts)
            except ValueError as error:
                result.update(parity="FAIL", outcome="INVALID_STOP", parity_error=str(error),
                              expected_ids=[r["doc_id"] for r in expected], actual_ids=[r["doc_id"] for r in returned])
                save()
                return result
            observation["exact_projected_parity"] = True
            if index == 0:
                result["parity"] = "PASS"
            else:
                result["trials"].append(observation)
            save()
            if int(metrics["read_rows"]) > 10_000_000:
                result["outcome"] = "STRUCTURAL_ANOMALY_STOP"
                return result
        result["outcome"] = "PHASE0_MAIN_PASS" if target_pass(result["trials"]) else "PHASE0_MAIN_TARGETS_MISSED"
        result["K1000"] = "GATE_PASSED_NOT_YET_RUN" if target_pass(result["trials"]) else "GATED_OFF"
        return result
    except Exception as error:
        result.update(outcome="FAILED_STOP", error_class=type(error).__name__)
        raise
    finally:
        if result["parity"] == "FAIL":
            result["K1000"] = "GATED_OFF"
        try:
            result["original_identities_after"] = rows("original_identities_after", "SELECT name,toString(uuid) AS uuid,sorting_key "
                "FROM system.tables WHERE database='web10' AND name IN ('documents','doc_groups','doc_groups_t') ORDER BY name")
            result["original_identities_unchanged"] = result.get("original_identities_before") == result["original_identities_after"]
        finally:
            restore.command(compose, env, "stop", "--timeout", "30", "clickhouse", timeout=90)
            result["completed_utc"] = datetime.now(UTC).isoformat()
            save()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("--approval", required=True, type=Path)
    parser.add_argument("--output-name", default="arm-d-realism")
    args = parser.parse_args()
    run(args.root, args.approval, args.output_name)
