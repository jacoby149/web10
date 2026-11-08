#!/usr/bin/env python3
"""Measure an already-restored frozen fixture; never seed, import, or provision."""
import argparse
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

import dataset
from restore_dataset import compose_command


def measure(directory, receipt_path, out, k, runs, warmup, order_seed):
    verified = dataset.validate(directory)
    receipt = json.loads(receipt_path.read_bytes())
    if receipt.get("complete") is not True or receipt.get("dataset_id") != verified["dataset_id"]:
        raise ValueError("complete restore receipt must match this exact dataset")
    project, port = receipt["project"], receipt["api_port"]
    compose = compose_command(project, port)
    api = f"http://127.0.0.1:{port}"
    if receipt.get("api") != api or receipt.get("rows") != verified["rows"]:
        raise ValueError("restore receipt shape/endpoint mismatch")
    out.mkdir(parents=True, exist_ok=False)
    (out / "frozen-input.json").write_text(json.dumps({
        **verified, "restore_receipt_sha256": dataset.digest(receipt_path),
        "manifest_sha256": dataset.digest(directory / "manifest.json"),
        "preparation_seconds": receipt["preparation_seconds"],
        "scope": "Preparation/import/validation excluded; simplified query microbenchmark, not a full-feed load test."
    }, indent=2))
    command = [sys.executable, str(Path(__file__).with_name("bench.py")),
               "--manifest", str(directory / "manifest.json"), "--api", api,
               "--compose", shlex.join(compose), "--out", str(out),
               "--runs", str(runs), "--warmup", str(warmup), "--order-seed", str(order_seed),
               "--k", *map(str, k)]
    print(f"[measure] dataset={verified['dataset_id']}; preparation is complete, starting measured harness", flush=True)
    subprocess.run(command, env={**os.environ, "API_PORT": str(port)}, check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--k", type=int, nargs="+", default=[10, 100, 1000])
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument("--warmup", type=int, default=3)
    parser.add_argument("--order-seed", type=int, default=42)
    args = parser.parse_args()
    measure(args.directory, args.receipt, args.out, args.k, args.runs, args.warmup, args.order_seed)
