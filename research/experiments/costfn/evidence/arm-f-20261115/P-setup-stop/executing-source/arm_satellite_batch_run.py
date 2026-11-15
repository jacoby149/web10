"""Separately approved batched count attempt, preserving the first failed build."""
import argparse
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path

import arm_satellite_batch as batch
import arm_satellite_counts as original
import arm_satellite_runtime as runtime
import arm_satellite_sql as typed

PARTS = "counting_numbers_p2_parts"
FINAL = "counting_numbers_p2"


class ParityMismatch(ValueError):
    """An independently established wrong count, not an incomplete setup."""


def approved(session, root):
    approval = json.loads((root / "evidence/batch-approval.json").read_bytes())
    old = root / "counts/result.json"
    if (approval.get("kind") != "SATELLITE_BATCH_SETUP_RETRY" or approval.get("approved_by") != "Jacob"
            or approval.get("droplet_id") != session.host_id or approval.get("attempt") != "p2"
            or approval.get("deadline_utc") != session.operation["deadline_utc"]
            or approval.get("previous_result_sha256") != hashlib.sha256(old.read_bytes()).hexdigest()
            or json.loads(old.read_bytes()).get("outcome") != "STOP"
            or type(approval.get("batches")) is not int or not 1 <= approval["batches"] <= 256
            or approval.get("fanout") is not False or approval.get("higher_limits") is not False):
        raise ValueError("matching separately approved same-host/deadline batched retry required")
    return approval


def save(output, result):
    with (output / "result.json").open("w") as stream:
        json.dump(result, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def execute(session, output, result, label, sql):
    (output / (label + ".sql")).write_text(sql + "\n")
    _, query_id = session.query(label, sql, setup_seconds=900)
    result["build_queries"].append({"label": label, "query_id": query_id, "native": session.native(query_id)})
    save(output, result)


def build_scope(session, output, result, label, scope, boundaries, recipes, total, **sources):
    info = {"label": label, "scope_key": scope, "families": [], "complete": False}
    result["scopes"].append(info)
    for family_index, family in enumerate(batch.families(recipes)):
        completed = []
        info["families"].append({"counters": [counter.name for counter in family], "completed_batches": completed})
        for index in range(total):
            sql = batch.partial_sql(boundaries[family[0].service], scope, family, index, total, PARTS, **sources)
            execute(session, output, result, label + "_family" + str(family_index) + "_batch" + str(index), sql)
            completed.append(index)
            save(output, result)
        batch.require_complete(completed, total)
    duplicates, _ = session.rows("batch_duplicate_check_" + label, "SELECT count() AS n FROM (SELECT doc_id,"
        "counter_name,batch,count() AS n FROM " + PARTS + " WHERE scope_key=" + typed.literal(scope)
        + " GROUP BY doc_id,counter_name,batch HAVING n>1)")
    if int(duplicates[0]["n"]):
        raise ValueError("duplicate partial batch keys; do not consolidate")
    execute(session, output, result, label + "_consolidate", batch.final_sql(scope, PARTS, FINAL))
    info["consolidated"] = True
    save(output, result)
    return info


def compare(session, scope, ids, recipes, generation, mapping, reader):
    comparisons = []
    for counter in recipes:
        target = ("JSONExtractString(body," + typed.literal(counter.target_body_key) + ")"
                  if counter.target_body_key is not None else counter.target_column)
        predicate = ("JSONExtractString(body," + typed.literal(counter.match_body_key) + ")="
                     + typed.literal(counter.match_value) if counter.match_body_key is not None else "1")
        aggregate = "uniqExactIf(doc_id," + predicate + ")" if counter.distinct else "countIf(" + predicate + ")"
        expected, _ = session.rows("batch_oracle_" + counter.name,
            "SELECT " + target + " AS doc_id," + aggregate + " AS value FROM ("
            + original.oracle_boundary(counter.service, mapping[counter.service], reader) + ") WHERE "
            + target + " IN (" + ",".join(typed.literal(doc) for doc in ids) + ") GROUP BY doc_id", setup_seconds=900)
        actual, _ = session.rows("batch_stored_" + counter.name,
            batch.read_counts(FINAL, scope, ids, [counter.name], generation))
        want = {row["doc_id"]: int(row["value"]) for row in expected}
        got = {row["doc_id"]: int(row["value"]) for row in actual}
        if len(got) != len(actual) or any(got.get(doc, 0) != want.get(doc, 0) for doc in ids):
            raise ParityMismatch("T1 INVALID: independent canonical counter mismatch")
        comparisons.append({"counter": counter.name, "canonical": want, "stored": got, "parity": "PASS"})
    return comparisons


def build(root):
    root = Path(root)
    session = runtime.Session(root)
    approval = approved(session, root)
    envelope = session.verify_envelope()
    output = root / "counts-batch-p2"
    output.mkdir(exist_ok=False)
    profile = json.loads((root / "profile/inventory.json").read_bytes())
    previous = json.loads((root / "counts/result.json").read_bytes())
    result = {"kind": "SATELLITE_BATCH_COUNT_BUILD_T1", "outcome": "BUILDING", "T1": "NOT_RUN",
              "droplet_id": session.host_id, "dataset_id": profile["dataset_id"], "envelope": envelope,
              "approval": approval, "started_utc": datetime.now(UTC).isoformat(), "scopes": [], "build_queries": [],
              "final_table": FINAL, "partial_table": PARTS, "fanout": False, "feed_adapter_activated": False}
    result["source_sha256"] = {name: hashlib.sha256((Path(__file__).parent / name).read_bytes()).hexdigest()
        for name in ("arm_satellite_batch.py", "arm_satellite_batch_run.py", "arm_satellite_batch_fixture.py",
                     "arm_satellite_counts.py", "arm_satellite_sql.py", "arm_satellite_runtime.py")}
    save(output, result)
    try:
        source_generation, parts = original.generation(session)
        if source_generation != previous["canonical_generation"]:
            raise ValueError("canonical source changed since failed setup; stop before batching")
        result.update(canonical_generation=source_generation, canonical_parts=parts)
        session.query("batch_create_parts", batch.partial_ddl(PARTS))
        session.query("batch_create_final", batch.count_ddl(FINAL))
        from arm_satellite_batch_fixture import verify
        verify(session, output, result, approval["batches"])
        ids = previous["stratified_targets"]["all_ids"]
        result["stratified_targets"] = previous["stratified_targets"]
        for label in ("main", "reactions", "comments"):
            readable = profile["actual_readable_by_kind"][label]
            recipes = [counter for counter in original.RECIPES if counter.service in readable]
            mapping = {counter.service: readable[counter.service] for counter in recipes}
            scope = typed.scope_key(profile["reader"], mapping, source_generation, recipes)
            boundaries = {service: original.canonical_boundary(service, groups, profile["reader"])
                          for service, groups in mapping.items()}
            info = build_scope(session, output, result, label, scope, boundaries, recipes, approval["batches"])
            info["groups_by_service"] = mapping
            info["comparisons"] = compare(session, scope, ids, recipes, source_generation, mapping, profile["reader"])
            info["complete"] = True
            save(output, result)
        current, _ = original.generation(session)
        if current != source_generation:
            raise ValueError("canonical generation changed during batched setup")
        result.update(outcome="BATCH_COUNTS_BUILT_T1_PASS", T1="PASS")
    except Exception as error:
        result.update(outcome="STOP", failure_class=type(error).__name__)
        if isinstance(error, ParityMismatch):
            result["T1"] = "FAIL"
        raise
    finally:
        result["completed_utc"] = datetime.now(UTC).isoformat()
        save(output, result)
    print("[satellite-p] batched count T1 complete; T2 and whole-response budget remain open", flush=True)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    build(parser.parse_args().root)
