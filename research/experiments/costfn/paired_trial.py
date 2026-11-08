#!/usr/bin/env python3
"""Host-side guarded launcher for one retained paired resolver trial."""
import argparse
import json
import os
from pathlib import Path
import subprocess

import bench
import dataset_v2
import provenance
import topology


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--pairs", type=int, default=20)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--mode", choices=["batched", "per-group"], default="batched")
    args = parser.parse_args()
    verified = dataset_v2.validate(args.directory)
    receipt = json.loads(args.receipt.read_bytes())
    if not receipt.get("complete") or not receipt.get("research_observer") or receipt["dataset_id"] != verified["dataset_id"]:
        raise ValueError("matching disposable research restore required")
    args.out.mkdir(parents=True, exist_ok=False)
    compose = topology.commands(receipt)
    env = topology.environment(receipt, os.environ) if receipt.get("docker_contexts") else os.environ.copy()
    result = subprocess.run(compose + ["exec", "-T", "api", "uv", "run", "python", "/research/paired_resolver.py"],
        input=json.dumps({"manifest": json.loads((args.directory / "manifest.json").read_bytes()),
            "pairs": args.pairs, "seed": args.seed, "mode": args.mode}),
        capture_output=True, text=True, timeout=max(300, args.pairs * 120), env=env)
    (args.out / "tool.log").write_text(result.stdout + result.stderr)
    result.check_returncode()
    data = json.loads(next(line.split("=", 1)[1] for line in result.stdout.splitlines() if line.startswith("COSTFN_PAIRS=")))
    deltas = sorted(p["delta_handler_ms"] for p in data["pairs"] if not p["warmup"])
    (args.out / "trial.json").write_text(json.dumps({**data, "sources": provenance.sources(),
        "within_trial_delta_ms": {str(p): bench.percentile(deltas, p) for p in (5, 50, 95)},
        "uncertainty_scope": "Within-trial paired observations, not confidence intervals or independent-trial uncertainty. Repeat independently; do not pool unlike trials."}, indent=2))
