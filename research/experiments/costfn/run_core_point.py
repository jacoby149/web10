#!/usr/bin/env python3
"""One explicitly approved primary point; no provisioning or input mutation.

The caller must supply a fresh restore and an independently running resource
lifetime watchdog. This process bounds its own work; it cannot cap a cloud bill
after a host/network failure. Local functional acceptance needs no such file.
"""
import argparse
import asyncio
import json
from pathlib import Path
import time

import acceptance
import provenance


def check_approval(approval, receipt, now=None):
    now = time.time() if now is None else now
    if approval.get("purpose") != "synthetic-core-feed-study" or approval.get("execution_authorized") is not True:
        raise ValueError("explicit study execution approval required")
    if approval.get("cleanup_watchdog_verified") is not True or approval.get("project") != receipt.get("project"):
        raise ValueError("exact project and independent cleanup watchdog required")
    if approval.get("api_origin") != receipt.get("api"):
        raise ValueError("approved API must be the exact restored API")
    if approval.get("sources") != provenance.sources() or receipt.get("correctness", {}).get("sources") != provenance.sources():
        raise ValueError("approval/restore must name current exact sources")
    hosts = approval.get("hosts", [])
    if {h.get("role") for h in hosts} != {"api", "db", "generator"} or len(hosts) != 3:
        raise ValueError("record the actual three-host topology")
    if len({h.get("identity") for h in hosts}) != 3:
        raise ValueError("three distinct host identities required")
    for host in hosts:
        if not all(host.get(k) for k in ("identity", "region", "cpu", "ram_gb", "software")) or host.get("hourly_usd", 0) <= 0:
            raise ValueError("actual host specs/software/price are missing")
    cap = approval.get("max_usd", 0)
    started = approval.get("resource_started_epoch", 0)
    deadline = approval.get("hard_stop_epoch", 0)
    hourly = sum(h["hourly_usd"] for h in hosts)
    reserve = approval.get("cleanup_reserve_seconds", 300)
    if not 0 < cap <= 10 or not 0 < started <= now < deadline or reserve < 60:
        raise ValueError("invalid budget/resource clock/deadline/reserve")
    safe_end = min(deadline, started + cap / hourly * 3600) - reserve
    if safe_end - now < 300:
        raise ValueError("insufficient budget/lifetime for even primary phases; preparation is extra")
    return safe_end - now


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--approval", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--users", type=int, choices=[1000, 3000, 5000, 10000, 20000], required=True)
    parser.add_argument("--trial", type=int, choices=[1, 2, 3], required=True)
    args = parser.parse_args()
    receipt = json.loads(args.receipt.read_bytes())
    approval = json.loads(args.approval.read_bytes())
    remaining = check_approval(approval, receipt)
    # A new output alone is not a fresh trial: consume this host-side receipt
    # once. A failed/aborted point requires inspection and a fresh restore.
    with args.receipt.with_suffix(".consumed").open("x") as marker:
        json.dump({"trial": args.trial, "users": args.users, "started_epoch": time.time()}, marker)

    async def point():
        return await asyncio.wait_for(acceptance.accept(args.directory, receipt, args.out,
            users=args.users, interval=60, warmup=60, duration=180, drain=60, pairs=0,
            api_origin=approval["api_origin"], strict=False), timeout=remaining)

    try:
        result = asyncio.run(point())
    except BaseException:
        if args.out.exists():
            (args.out / "point-outcome.json").write_text(json.dumps({"complete": False, "trial": args.trial,
                "reason": "failed_or_cancelled; inspect retained raw evidence; no valid capacity result"}, indent=2))
        raise
    else:
        (args.out / "point-outcome.json").write_text(json.dumps({"complete": True, "trial": args.trial,
            "users": args.users, "approval_sources": approval["sources"],
            "scope": "One specified primary point, not universal capacity or completed independent trials."}, indent=2))
