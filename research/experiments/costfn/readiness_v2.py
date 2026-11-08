#!/usr/bin/env python3
"""Receipt-driven preparation audit; never provisions or runs an experiment."""
import argparse
import json
from pathlib import Path

import core_feed
import dataset
import provenance
import study_plan


def audit(acceptance, publications):
    blockers = []
    if not acceptance.get("local_acceptance") or acceptance.get("sources") != provenance.sources():
        blockers.append("current-source local core/lifecycle/paired/concurrent/resource acceptance")
    inputs = {}
    for receipt in publications:
        recipe = receipt.get("recipe", {})
        locality = recipe.get("locality")
        if locality not in ("hot", "dispersed"):
            continue
        if not (receipt.get("complete") and receipt.get("download_verified", {}).get("dataset_id") == receipt.get("dataset_id")
                and recipe.get("creators") == 1000000 and recipe.get("readers") == 20000 and recipe.get("follow") == 1000
                and receipt.get("generator_sha256") == dataset.digest(Path(__file__).with_name("dataset_v2.py"))):
            blockers.append(f"pinned published/download-verified million-author {locality} fixture")
        else:
            inputs[locality] = receipt["dataset_id"]
    for locality in ("hot", "dispersed"):
        if locality not in inputs:
            blockers.append(f"missing approved {locality} input")
    try:
        core_feed.wire()  # current app/SDK source pin, not a live-result assertion
    except ValueError as error:
        blockers.append(str(error))
    points = study_plan.matrix()
    for point in points:
        locality = "hot" if point["locality"] == "hot_shared" else "dispersed"
        point["dataset_id"] = inputs.get(locality)
        point["required_fixture"] = f"published_{locality}_relational_v2"
        point["trial_reset"] = "fresh restore/project before each point; session setup before warm-up"
    return {"status": "PREPARED_FOR_HOST_PREFLIGHT" if not blockers else "PREPARATION_INCOMPLETE",
        "software_and_inputs_ready": not blockers, "preparation_blockers": blockers,
        "sources": provenance.sources(), "inputs": inputs, "primary_points": points,
        "ready_to_run_on_unchecked_hosts": False, "cloud_execution_authorized": False, "submission_ready": False,
        "host_preflight": ["explicit run approval and actual host topology/specs/price/source/image identities",
            "download pinned input, fresh large restore/counts/nonempty correctness on those hosts",
            "generator calibration/headroom, API/DB resource collection and correlation on actual topology",
            "independent resource-lifetime cleanup/budget watchdog; $10 is a ceiling, not an assurance"],
        "scope": "Preparation readiness is not a completed large restore, hardware acceptance, paid-run approval or paper result."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--acceptance", type=Path, required=True)
    parser.add_argument("--publication", type=Path, action="append", required=True)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--require-prepared", action="store_true")
    args = parser.parse_args()
    result = audit(json.loads(args.acceptance.read_bytes()), [json.loads(p.read_bytes()) for p in args.publication])
    text = json.dumps(result, indent=2) + "\n"
    if args.out:
        with args.out.open("x") as output:
            output.write(text)
    else:
        print(text, end="")
    if args.require_prepared and not result["software_and_inputs_ready"]:
        raise SystemExit(2)
