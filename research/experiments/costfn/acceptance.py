#!/usr/bin/env python3
"""Local functional acceptance on an existing restored project, not the study.

Runs lifecycle controls before/after a small concurrent core sequence, records
resources and correlated raw phases, and checks paired resolver equivalence.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import subprocess
import time

import httpx

import dataset_v2
import lifecycle
import load_core
import observe
import provenance
import topology


async def accept(directory, receipt, out, users=2, interval=5, warmup=5, duration=10, drain=60, pairs=3, api_origin=None, strict=True):
    manifest = json.loads((directory / "manifest.json").read_bytes())
    identity = dataset_v2.validate(directory)
    if not (receipt.get("complete") and receipt.get("research_observer") and receipt["dataset_id"] == identity["dataset_id"]):
        raise ValueError("matching local research restore required")
    out.mkdir(parents=True, exist_ok=False)
    sources = provenance.sources()
    compose, db_compose = topology.commands(receipt), topology.commands(receipt, "db")
    env = topology.environment(receipt, os.environ) if receipt.get("docker_contexts") else os.environ.copy()
    base = load_core.validate_target(api_origin or receipt["api"])
    async with httpx.AsyncClient(base_url=base, timeout=5, trust_env=False) as health:
        for attempt in range(90):
            try:
                if (await health.get("/docs")).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            await asyncio.sleep(2)
        else:
            raise ValueError("research API did not become ready")
    runtime = await asyncio.to_thread(provenance.runtime, compose, db_compose, env)
    before = await lifecycle.controls(base, manifest)
    (out / "lifecycle-before.json").write_text(json.dumps(before, indent=2))
    # Local smoke needs two independently authenticated readers, not a one-token fanout.
    if len(manifest["readers"]) < max(2, users):
        raise ValueError("acceptance requires at least two readers")
    resources = []
    sampling_errors = []
    stop = asyncio.Event()

    async def sampler():
        while not stop.is_set():
            try:
                resources.append(await asyncio.to_thread(observe.sample, compose, db_compose, env))
            except (subprocess.SubprocessError, ValueError):
                sampling_errors.append("resource_sample_failed")
            try:
                await asyncio.wait_for(stop.wait(), timeout=2)
            except TimeoutError:
                pass

    sampling = asyncio.create_task(sampler())
    try:
        # 12 requests/minute/reader, each with 3 queries: below normal 60/min limiter.
        result = await load_core.run_point(base, manifest, users, interval, warmup, duration, drain, out)
    finally:
        stop.set()
        await sampling
    (out / "summary.json").write_text(json.dumps(result, indent=2))
    (out / "resources.jsonl").write_text("".join(json.dumps(row) + "\n" for row in resources))
    after = await lifecycle.controls(base, manifest)
    (out / "lifecycle-after.json").write_text(json.dumps(after, indent=2))
    paired = {"pairs": []}
    if pairs:
        pair = await asyncio.to_thread(subprocess.run,
            compose + ["exec", "-T", "api", "uv", "run", "python", "/research/paired_resolver.py"],
            input=json.dumps({"manifest": manifest, "pairs": pairs}), text=True, capture_output=True, timeout=300, env=env)
        # The paired tool contains no HTTP bodies/tokens in logs; retain failure diagnostics.
        (out / "paired-tool.log").write_text(pair.stdout + pair.stderr)
        if pair.returncode:
            raise ValueError("paired comparator failed; see retained paired-tool.log")
        paired = json.loads(next(line.split("=", 1)[1] for line in pair.stdout.splitlines() if line.startswith("COSTFN_PAIRS=")))
        (out / "paired.json").write_text(json.dumps(paired, indent=2))
    logs = await asyncio.to_thread(subprocess.run, compose + ["logs", "--no-log-prefix", "api"],
        check=True, capture_output=True, text=True, timeout=60, env=env)
    correlation = observe.reconcile(out, logs.stdout + logs.stderr)
    (out / "correlation.json").write_text(json.dumps(correlation, indent=2))
    counts = result["counts"]
    measurement_valid = (before["complete"] and after["complete"] and result["valid_offered_load"]
        and counts.get("measured:started", 0) == counts.get("measured:scheduled", 0) > 0
        and not correlation["missing_successful_ids"]
        and not correlation["duplicate_server_ids"] and not correlation["successful_queries_without_phases"]
        and not correlation["source_mismatches"] and not correlation["delivery_failures"]
        and resources and not sampling_errors and provenance.sources() == sources)
    accepted = measurement_valid and (not strict or (
        not counts.get("measured:failed", 0) and not counts.get("warmup:failed", 0) and not correlation["missing_ids"]))
    report = {"local_acceptance": bool(accepted) if strict else False, "measurement_valid": bool(measurement_valid),
        "dataset_id": manifest["dataset_id"], "sources": sources,
        "users": users, "interval": interval, "warmup": warmup, "duration": duration, "drain": drain,
        "api_origin": base, "recipe": manifest["recipe"], "generator_sha256": manifest["generator_sha256"],
        "runtime": runtime,
        "epoch": time.time(), "lifecycle_before": before["passed"], "lifecycle_after": after["passed"],
        "paired_measured_pairs": len([p for p in paired["pairs"] if not p["warmup"]]),
        "correlated_requests": correlation["matched"], "resource_samples": len(resources),
        "resource_errors": sampling_errors,
        "scope": "Functional receipt for specified readers/durations. Two-reader defaults are not statistical performance or cloud generator headroom. Interpret large points only with raw failures/resources and independent trials.",
        "cloud_execution_authorized": False, "submission_ready": False}
    (out / "acceptance.json").write_text(json.dumps(report, indent=2))
    if not accepted:
        raise ValueError("functional acceptance failed; retain evidence and repair before study execution")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(asyncio.run(accept(args.directory, json.loads(args.receipt.read_bytes()), args.out)), indent=2))
