"""Satellite-arm inventory and Config P gate; stdlib only, no engine execution."""
import argparse
import ast
import hashlib
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DATASET = "2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd"
EVIDENCE = HERE / "evidence/arm-t-20261115/consolidated"
AUDITED = (
    "arm_d_rewrite.py", "arm_d_realism.py", "arm_d_attachment_repair.py",
    "arm_t_rewrite.py", "arm_t_merge_first.py", "arm_t_api.py",
    "research_api.py", "satellite.py", "gate15.py",
)
PRODUCTION = ROOT / "api/app/v3/services/safe_query.py"

# Required S stages stay visible even when historical native timing is absent.
STAGES = (
    ("group_time_selection", "S", "doc_groups_t; parameterized slices with refill"),
    ("standalone_verification", "C", "remove separate stage; live winner resolution owns checks"),
    ("winner_document", "C", "current full-key body/version/tombstone"),
    ("winner_access", "C", "current attachment, grants and reader policy"),
    ("engagement_main_and_followups", "S", "scope-qualified exact counters; overlap/policy unresolved"),
    ("repost_metadata", "S", "derived reference-to-full-identity lookup"),
    ("profile_resolution", "S", "derived author-to-profile identity lookup"),
    ("ad_inventory", "S", "shared nonempty lifecycle-aware inventory"),
    ("ad_selection_and_media", "C", "live eligibility, access and signing provenance"),
    ("views", "S", "exploratory snapshots only; Phase 1.6 treatment conflict OPEN; no feed activation"),
    ("shared_time_and_ranking", "S", "shared time/ranking inputs, not universal reader authorization"),
    ("existing_full_key_reads", "P", "retain bounded lookups; native cost unmeasured here"),
    ("authentication_and_app_grants", "C", "current credentials and authority"),
)

# Anchors fail closed on source drift; line locations are generated, not guessed.
FINDINGS = (
    ("arm_t_rewrite.py", "PAGE = 21", "fixed fetched page size", "RETIRED"),
    ("arm_t_rewrite.py", "len(groups) > 1001", "fixed readable-group ceiling", "RETIRED"),
    ("arm_t_rewrite.py", "len(found) != 4", "four boundaries, golden text and reader pin", "RETIRED"),
    ("arm_t_rewrite.py", "ambiguous captured Newest", "no tie support; fails closed", "RETIRED"),
    ("arm_t_rewrite.py", "A-Za-z0-9_./:@-", "synthetic identifier grammar", "RETIRED"),
    ("arm_t_rewrite.py", "SERVICES =", "four service/selector shapes", "RETIRED"),
    ("arm_t_rewrite.py", "LIMIT 22", "fixed slice/global guard bound", "RETIRED"),
    ("arm_t_merge_first.py", "LIMIT 22", "fixed per-group and merged guard bound", "RETIRED"),
    ("arm_t_merge_first.py", "LIMIT 23", "fixed verification overflow guard", "RETIRED"),
    ("arm_t_rewrite.py", "selectors =", "four service-specific metadata selectors", "RETIRED"),
    ("arm_d_rewrite.py", "def owner_of_group", "followers-path owner collapse", "RETIRED"),
    ("arm_d_rewrite.py", "!= 12", "twelve reader literal occurrences", "RETIRED"),
    ("arm_d_rewrite.py", "!= 4", "four lists/joins/projections/gate segments", "RETIRED"),
    ("arm_d_rewrite.py", "CASE d.author_key", "synthetic owner/group projection", "RETIRED"),
    ("arm_d_rewrite.py", "gate-table rows", "empty policy-store admission", "RETIRED"),
    ("arm_d_rewrite.py", "Completeness posture", "fixture engagement-attachment assumption", "RETIRED"),
    ("arm_d_rewrite.py", "len(discover) != 1", "exactly one non-followers group means Discover", "RETIRED"),
    ("arm_d_rewrite.py", "!= 3", "three follow-up reader literal occurrences", "RETIRED"),
    ("arm_d_attachment_repair.py", "rewritten != 4", "four-boundary author-hint repair", "RETIRED"),
    ("arm_d_attachment_repair.py", "set(group_authors) != set(groups)", "external complete author inventory", "RETIRED"),
    ("research_api.py", '"ttl_s": 60.0', "real inventory read then TTL cache; not empty bypass", "CORRECTED"),
    ("arm_t_api.py", '"COSTFN_ARM_D",', "Arm T refuses Arm D, so has no Arm D inventory cache", "CONFIRMED"),
    ("arm_d_realism.py", "host != 619371600", "old host/deadline/project resource pins", "HISTORICAL_ONLY"),
    ("satellite.py", "GROUP BY ref_value", "global counters omit attachment/scope", "NOT_REUSABLE_AS_IS"),
    ("arm_d_rewrite.py", "arrayElement(ids, number)",
     "zero-based numbers(n) used as one-based array index; native check required", "NOT_REUSABLE_AS_IS"),
    ("gate15.py", "PROJECT =", "old V2 project/port/readers/5GB driver, not realism admission", "HISTORICAL_ONLY"),
)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def literal_census(path):
    """Every Python literal, including SQL-string locations; not a defect count."""
    source = path.read_text()
    rows = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Constant):
            text = ast.get_source_segment(source, node)
            rows.append({"line": node.lineno, "end_line": node.end_lineno,
                         "type": type(node.value).__name__, "preview": text[:100],
                         "literal_sha256": hashlib.sha256(text.encode()).hexdigest()})
    return sorted(rows, key=lambda row: (row["line"], row["end_line"]))


def inventory():
    sources = [Path(__file__), *(HERE / name for name in AUDITED), PRODUCTION,
               ROOT / "clickhouse-init/001-init-v3-schema.sql.template"]
    paths = [EVIDENCE / name for name in (
        "native-breakdown.json", "request-metadata.json", "main-request-observations.json")]
    findings = []
    for filename, anchor, reason, disposition in FINDINGS:
        lines = (HERE / filename).read_text().splitlines()
        locations = [i for i, line in enumerate(lines, 1) if anchor in line]
        if not locations:
            raise ValueError("audit anchor drift: " + filename + ": " + anchor)
        findings.append({"file": str((HERE / filename).relative_to(ROOT)), "lines": locations,
                         "finding": reason, "disposition_for_new_arm": disposition})
    native, requests, observations = [json.loads(path.read_bytes()) for path in paths]
    return {
        "kind": "SATELLITE_ARM_RETAINED_INVENTORY", "directive": "2026-11-15-amended-pull-first",
        "dataset_id": DATASET, "configuration": "P", "engine_executed": False,
        "fresh_realism_profile": False, "builds_started": False, "fanout": "GATED_OFF",
        "stages": [{"stage": stage, "classification": kind, "decision": decision}
                   for stage, kind, decision in STAGES],
        "preserved_native_main_split": native,
        "preserved_http_sequence": requests,
        "preserved_main_phases": [{"request_id": row["request_id"], "phases_ms": row["phases_ms"]}
                                  for row in observations],
        "unmeasured_substages": ["comments", "views", "profile", "repost", "shared_feeds"],
        "blockers": ["fresh DO budget/lifetime/cleanup admission",
                     "T5 documents-only cannot rebuild links, membership, policy or events",
                     "global doc/counter scalar cannot represent distinct reader scopes"],
        "reviewed_findings": findings,
        "source_sha256": {str(path.relative_to(ROOT)): sha(path) for path in sources},
        "evidence_sha256": {str(path.relative_to(ROOT)): sha(path) for path in paths},
        "literal_census": {str(path.relative_to(ROOT)): literal_census(path)
                           for path in sources if path.suffix == ".py"},
    }


def _number(value, integer=False):
    if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
        raise ValueError("nonnegative finite numeric evidence required")
    if integer and type(value) is not int:
        raise ValueError("native rows/bytes must be integers")
    return value


def fanout_gate(receipt):
    """Evidence evaluator only; NEVER grants operational/build authorization."""
    verdict = {"fanout_build_authorized": False, "configuration": "P"}
    if (not isinstance(receipt, dict) or receipt.get("kind") != "SATELLITE_ARM_CONFIG_P_BUDGET"
            or receipt.get("dataset_id") != DATASET or receipt.get("configuration") != "P"
            or type(receipt.get("k")) is not int or receipt.get("k") not in (20, 1000)):
        return {**verdict, "verdict": "HOLD", "reason": "matching Config P budget receipt required"}
    if any(receipt.get(gate) == "FAIL" for gate in ("t1_count_parity", "t2_complete_response_parity")):
        return {**verdict, "verdict": "INVALID_STOP", "reason": "T1/T2 parity failed"}
    if any(receipt.get(gate) != "PASS" for gate in ("t1_count_parity", "t2_complete_response_parity")):
        return {**verdict, "verdict": "HOLD", "reason": "T1 and complete T2 must pass first"}
    durations, byte_totals = [], []
    trials = receipt.get("trials")
    if not isinstance(trials, list) or len(trials) != 3:
        return {**verdict, "verdict": "HOLD", "reason": "three complete trials required"}
    try:
        trial_ids, query_ids = set(), set()
        for trial in trials:
            trial_id = trial["trial_id"]
            if not isinstance(trial_id, str) or not trial_id or trial_id in trial_ids:
                raise ValueError("distinct trial identities required")
            trial_ids.add(trial_id)
            if not isinstance(trial["samples"], list):
                raise ValueError("sample list required")
            if not trial["samples"]:
                raise ValueError("empty trial")
            for sample in trial["samples"]:
                if sample["parity"] is False:
                    return {**verdict, "verdict": "INVALID_STOP", "reason": "exact parity mismatch"}
                if sample["parity"] is not True or sample["complete_response"] is not True:
                    raise ValueError("complete response and exact parity required")
                durations.append(_number(sample["elapsed_ms"]))
                stages = sample["native_reads"]
                if not isinstance(stages, list) or not stages or sample["all_native_reads_attributed"] is not True:
                    raise ValueError("all native reads must be attributed")
                total = 0
                for stage in stages:
                    query_id = stage["query_id"]
                    if not isinstance(query_id, str) or not query_id or query_id in query_ids:
                        raise ValueError("distinct native query identities required")
                    query_ids.add(query_id)
                    rows = _number(stage["read_rows"], integer=True)
                    total += _number(stage["read_bytes"], integer=True)
                    if rows > 10_000_000:
                        return {**verdict, "verdict": "STOP", "reason": "single read exceeds 10M rows"}
                    if type(stage["exception_code"]) is not int or stage["exception_code"] != 0:
                        raise ValueError("native exception; no completed budget result")
                byte_totals.append(total)
    except (KeyError, TypeError, ValueError, OverflowError) as error:
        return {**verdict, "verdict": "HOLD", "reason": str(error)}
    p95 = sorted(durations)[math.ceil(len(durations) * .95) - 1]
    passed = p95 < 500 and max(byte_totals) < 25_000_000
    decision = "DEFER_FANOUT" if passed else "COST_GATE_FIRED"
    if not passed and receipt["k"] == 1000:
        decision = "ASK_JACOB_K1000"
    return {**verdict, "verdict": decision, "sample_count": len(durations),
            "p95_ms": p95, "p95_method": "nearest-rank over supplied complete-response samples",
            "max_total_read_bytes": max(byte_totals),
            "claim_scope": "supplied observations only; not independent native verification"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inventory")
    inspect.add_argument("--out", required=True, type=Path)
    gate = commands.add_parser("gate")
    gate.add_argument("receipt", type=Path)
    args = parser.parse_args()
    if args.command == "gate":
        print(json.dumps(fanout_gate(json.loads(args.receipt.read_bytes())), indent=2))
        return
    if args.out.exists():
        raise FileExistsError("inventory receipts are append-only; choose a fresh path")
    print("[satellite-arm] retained-evidence inventory start; no engine/network", flush=True)
    result = inventory()
    with args.out.open("x") as stream:
        json.dump(result, stream, indent=2)
        stream.write("\n")
    print("[satellite-arm] inventory saved; fresh profile/builds BLOCKED; fanout GATED_OFF", flush=True)


if __name__ == "__main__":
    main()
