#!/usr/bin/env python3
"""Offline design audit and proposed schedule. No execution/provisioning mode."""
import argparse
import hashlib
import json
from pathlib import Path
import random

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCES = {"feed": "marketing/web10-social/src/data/feed.ts", "sdk": "sdk/src/v3.ts",
           "posts": "marketing/web10-social/src/data/posts.ts", "types": "marketing/web10-social/src/data/types.ts"}
LEVELS = [1000, 3000, 5000, 10000, 20000]


def sha(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def wire_errors(wire):
    errors = []
    if wire.get("capture_kind") != "OFFLINE_BUILDERS_FAKE_TRANSPORT":
        errors.append("wire capture kind is missing or falsely implies a live test")
    for key, path in SOURCES.items():
        if wire.get("sources", {}).get(key) != {"path": path, "sha256": sha(ROOT / path)}:
            errors.append(f"stale or unrecognized source: {key}")
    if wire.get("capture_sha256") != sha(HERE / "capture-feed.ts"):
        errors.append("capture implementation changed; recapture and review")
    requests = wire.get("requests", [])
    if [r.get("path") for r in requests] != ["/v3/query"] * 3 + ["/v3/contentViews"]:
        return errors + ["not the captured nonempty three-query-plus-contentViews core"]
    main = requests[0]["payload"]
    if any(fragment not in main.get("sql", "") for fragment in
           ("FROM posts p", "FROM reactions", "FROM comments", "FROM profile", "LIMIT 21")):
        errors.append("main query lost real feed joins/limit; simplified SQL is not the core workload")
    if not (main.get("surface") == "feed" and main.get("content_service") == "posts"
            and main.get("prepare", {}).get("media") and main.get("prepare", {}).get("ads")
            and main.get("prepare", {}).get("face", {}).get("bodyField") == "profile_body"):
        errors.append("real preparation/delivery flags were lost")
    if wire.get("returned_rows_before_slice") != 21 or wire.get("displayed_rows") != 20:
        errors.append("21 fetched versus 20 displayed rows were conflated")
    if any(r["payload"].get("token") != "__TOKEN__" for r in requests):
        errors.append("capture must contain only the synthetic token placeholder")
    if any("__POST_IDS__" not in r["payload"].get("sql", "") for r in requests[1:3]):
        errors.append("follow-up IDs are not derived from returned main rows")
    return errors


def matrix(interval=60, seed=42):
    """Proposed independent point order, NOT a virtual-user implementation."""
    points = []
    for trial in range(1, 4):
        block = [{"locality": locality, "virtual_users": users, "trial": trial,
                  "candidate_groups": 1000,
                  "required_fixture": f"reviewed_{locality}_relational_v2",
                  "dataset_id": None,
                  "feed_interval_seconds": interval, "warmup_seconds": 60,
                  "observation_seconds": 180, "drain_recovery_budget_seconds": 60,
                  "target_feed_loads_per_second": users / interval,
                  "target_query_calls_per_second": 3 * users / interval,
                  "target_content_views_calls_per_second": users / interval}
                 for locality in ("hot_shared", "dispersed") for users in LEVELS]
        random.Random(seed + trial).shuffle(block)
        points.extend(block)
    return points


def artifact_integrity(directory, pin):
    if directory is None or not (directory / "manifest.json").exists():
        return {"present": False, "hashes_match": False, "scope": "repo receipt alone, blob not checked here"}
    try:
        if sha(directory / "manifest.json") != pin["manifest_sha256"]:
            return {"present": True, "hashes_match": False}
        for info in pin["files"].values():
            # Ignore artifact-provided paths: only the trusted five table names.
            if info["name"] not in {f"{table}.jsonl.gz" for table in ("users", "documents", "doc_groups", "group_contracts", "group_members")}:
                return {"present": True, "hashes_match": False}
            path = directory / info["name"]
            if path.is_symlink() or path.stat().st_size != info["bytes"] or sha(path) != info["sha256"]:
                return {"present": True, "hashes_match": False}
    except OSError:
        return {"present": True, "hashes_match": False}
    return {"present": True, "hashes_match": True,
            "scope": "byte integrity; prior all-row validation is separately recorded, no DB import"}


def audit(wire=None, pin=None, artifact_dir=None):
    wire = wire if wire is not None else json.loads((HERE / "evidence/core-feed-wire-v2.json").read_bytes())
    pin = pin if pin is not None else json.loads((HERE / "evidence/frozen-1m-v1.json").read_bytes())
    recipe = pin["recipe"]
    points = matrix()
    failures = wire_errors(wire)
    blockers = [
        {"id": "operator_pause", "reason": "Latest instruction is setup/design validation only; new execution approval is required."},
        {"id": "working_set", "reason": "V1 readers all follow the same first K authors; dispersed million-author coverage fixture is missing."},
        {"id": "relational_mix", "reason": "V1 has no profiles/reactions/comments, tied timestamps, and only public text. Review/version richer inputs."},
        {"id": "app_gate", "reason": "Current microbench omits Origin; capture does not validate browser app-grant enforcement."},
        {"id": "matched_baseline", "reason": "Fixed-plan paired resolver comparator is not implemented; old A/B is noncausal."},
        {"id": "concurrent_metrics", "reason": "Client/server phase correlation, queueing, generator headroom and warm-up boundaries lack concurrent acceptance."},
        {"id": "live_core_runner", "reason": "Four-call core is source-captured only; concurrent runner and nonempty/denied live preflight are not implemented."},
        {"id": "protocol_approval", "reason": "Approve workload mix, locality, cadence, stop/SLO criteria, trial/reset policy and budget lifecycle before timing."},
    ]
    if failures:
        blockers.append({"id": "wire_capture", "reason": "; ".join(failures)})
    phase_seconds = sum(p["warmup_seconds"] + p["observation_seconds"] + p["drain_recovery_budget_seconds"] for p in points)
    return {
        "status": "DESIGN_REVIEW_REQUIRED", "execution_authorized": False,
        "ready_to_run": False, "submission_ready": False,
        "scope": "Offline audit/proposed schedule; no network, DB, workload or cloud execution.",
        "wire_capture_valid": not failures, "wire_capture_errors": failures,
        "wire_validation_scope": "source hashes and shape; Bun tests additionally compare fresh builder output with the snapshot; not live API behavior",
        "wire_kind": wire.get("capture_kind"),
        "setup_evidence": {"small_v1_restore_microbench_floor": "passed previously; not core-feed or concurrency evidence",
                           "core_feed_wire": "offline source builders only",
                           "core_feed_live_preflight": "not run",
                           "paired_resolver_comparator": "not implemented",
                           "concurrent_generator_acceptance": "not implemented"},
        "fixture": {"dataset_id": pin["dataset_id"], "pool_authors": recipe["creators"],
                    "reader_accounts": recipe["readers"], "followed_per_reader": recipe["follow"],
                    "audited_v1_layout": "all readers follow the same first K creators",
                    "following_candidate_author_span": recipe["follow"],
                    "following_author_pool_coverage": recipe["follow"] / recipe["creators"],
                    "authors_outside_followed_set": recipe["creators"] - recipe["follow"],
                    "physical_rows_scanned": "unmeasured; cannot infer from followed-author coverage",
                    "returned_author_span": "unmeasured; not the same as candidate coverage",
                    "profiles_reactions_comments_media": "absent in the audited V1 generator",
                    "generator_matches_pin": sha(HERE / "dataset.py") == pin["generator_sha256"],
                    "artifact_integrity": artifact_integrity(artifact_dir, pin)},
        "primary_points": points,
        "optional_sensitivity": {"feed_interval_seconds": 30, "points": len(matrix(30)),
                                 "gate": "separate approval after primary/budget review"},
        "budget": {"initial_compute_cap_usd": 10, "quoted_total_hourly_usd": 0.75,
                   "primary_phase_hours_lower_bound": phase_seconds / 3600,
                   "primary_compute_usd_lower_bound": phase_seconds / 3600 * 0.75,
                   "excludes": "provisioning, all prep/import/session work, mechanism/paired studies, recovery overruns, network/storage/tax/teardown"},
        "blockers": blockers,
        "venue": {"cfp": "https://2027.sigmod.org/calls_industrial_track_papers.shtml",
                  "checked": "2026-11-07", "deadline": "2026-11-24 23:59 AoE",
                  "body_page_limit": 12, "references_extra": True,
                  "scope": "Formal requirements, not an acceptance prediction or official evaluation rubric."},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-dir", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--require-ready", action="store_true")
    args = parser.parse_args()
    result = audit(artifact_dir=args.artifact_dir)
    text = json.dumps(result, indent=2) + "\n"
    if args.out:
        with args.out.open("x") as output:
            output.write(text)
    else:
        print(text, end="")
    if args.require_ready and not result["ready_to_run"]:
        raise SystemExit(2)
