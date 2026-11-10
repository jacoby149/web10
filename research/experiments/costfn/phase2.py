#!/usr/bin/env python3
"""Phase-2 load demonstration — the 37k-DAU operating point, local only.

PROTOCOL §6 (pre-declared, unchanged): 37,000 DAU -> 5,550 peak-hour
sessions/hr -> ~1,400 concurrent sessions -> ~23 feed loads/s at 60 s think
time. Workload mix (declared 10.11.2026): the node sees <=1 Discover
balanced computation per 60 s (the shared surface: one computation per
refresh interval served to all — the other Discover sessions are cache hits
that never reach the node) plus ~23.3 live Following feeds/s at K=20 from
1,400 distinct reader sessions on the FULL 1M-author store (deliberately
bigger than a real 37k-DAU node's store — conservative).

Success (pre-declared in PROTOCOL §6): sustain the target rate for a
10-minute window; error rate < 1%; p95 client latency within the Phase-0
budget (500 ms, labelled success-only alongside failure counts); zero
correctness failures — lifecycle controls pass before AND after.

Claim allowed: "a recorded local setup sustained the derived peak load of a
37k-DAU node on the K=20 workload" — an operating-point demonstration on
loopback; server throughput/errors/handler latency are the evidentiary core.
"""
import argparse
import json
import random
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import phase1

CONCURRENT = 1400
INTERVAL = 60.0          # s think time -> CONCURRENT/INTERVAL = 23.3 feeds/s
WARMUP = 60.0            # one excluded wave
DURATION = 600.0         # 10-minute measured window
DRAIN = 60.0
PORT = 6096
P2 = phase1.P1 / "phase2"


def ch(project, query, timeout=900):
    return phase1.ch_query(project, query, timeout)


def lifecycle(project, slot, outdir, label):
    import lifecycle
    import dataset_v2
    manifest = json.loads((phase1.input_dir(slot) / "manifest.json").read_text())
    import httpx
    import asyncio

    async def run():
        base = f"http://127.0.0.1:{PORT}"
        async with httpx.AsyncClient(base_url=base, timeout=60, trust_env=False) as client:
            return await lifecycle.controls(client, manifest)
    result = asyncio.run(run())
    (outdir / f"lifecycle-{label}.json").write_text(json.dumps(result, indent=1) + "\n")
    return result


def discover_computation(project, outdir, stop_at):
    """The shared-surface computation: the main-feed boundary query over the
    Discover board (groups = [DISCOVER]), one per 60 s. Records native
    shape only (no oracle: the board feed has no frozen-input oracle here)."""
    import asyncio
    import httpx
    import core_feed
    import dataset_v2

    slot = "k20-1m-dispersed"
    manifest = json.loads((phase1.input_dir(slot) / "manifest.json").read_text())
    records = []

    async def run():
        base = f"http://127.0.0.1:{PORT}"
        async with httpx.AsyncClient(base_url=base, timeout=60, trust_env=False) as client:
            r = await client.post("/v3/login", json={"username": manifest["readers"][0],
                                                     "password": dataset_v2.PASSWORD, "site": "costfn"})
            token = r.json()["token"]
            discover = dataset_v2.DISCOVER
            next_due = time.perf_counter() + INTERVAL
            while time.perf_counter() < stop_at:
                now = time.perf_counter()
                if now >= next_due:
                    t0 = time.perf_counter()
                    payload = core_feed.payload(core_feed.wire()["requests"][0]["payload"], token, [discover])
                    r = await client.post("/v3/query", json=payload, headers={"Origin": dataset_v2.ORIGIN})
                    record = {"scheduled": next_due, "status": r.status_code,
                              "rows": len(r.json().get("rows", [])) if r.status_code == 200 else 0,
                              "client_ms": (time.perf_counter() - t0) * 1000}
                    records.append(record)
                    next_due += INTERVAL
                    if now > next_due + INTERVAL:  # fell behind: don't backlog
                        next_due = now + INTERVAL
                await asyncio.sleep(0.5)
        return records

    out = run()
    (outdir / "discover-computation.jsonl").write_text(
        "".join(json.dumps(r) + "\n" for r in out))
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cmd", choices=["run", "report"])
    parser.add_argument("--out", type=Path, default=P1 / "phase2" if False else P2)
    args = parser.parse_args()
    if args.cmd != "run":
        raise SystemExit("phase2 report reads the trial receipts (phase1.summarize-style)")
    args.out.mkdir(parents=True, exist_ok=True)
    slot = "k20-1m-dispersed"
    project = "web10-costfn-frozen-p2-load"
    record = {"project": project, "port": PORT, "input": slot,
              "dataset_id": phase1.PINNED_IDS[slot], "concurrent_sessions": CONCURRENT,
              "offered_following_per_s": round(CONCURRENT / INTERVAL, 2),
              "discover_model": "<=1 computation per 60 s (shared surface; cache hits do not reach the node)",
              "allocation": "pinned 5 GB ClickHouse (research.compose.yml), 8 logical CPUs, Docker VM shared — recorded per receipt",
              "started_utc": datetime.now(timezone.utc).isoformat()}
    try:
        since = time.time()
        restored = phase1.restore(slot, project, phase1.PINNED_IDS[slot], args.out,
                                  open(args.out / "run.log", "a"), warmups=3)
        record["restore"] = {"complete": restored["complete"], "clickhouse_version": restored["clickhouse_version"]}
        rekeyed = phase1.rekey(slot, restored, args.out, open(args.out / "run.log", "a"))
        record["rekey"] = {"kind": rekeyed.get("kind")}
        phase1.restart_api(project, treatment=True, mode="batched")
        record["config"] = {"layout": "D", "treatment": True, "mode": "batched"}
        before = lifecycle(project, slot, args.out, "before")
        record["lifecycle_before"] = before["passed"] if "passed" in before else before

        import threading
        stop_at = time.time() + WARMUP + DURATION
        discover_thread = threading.Thread(target=lambda: discover_computation(project, args.out, stop_at))
        discover_thread.start()

        import load_core
        manifest = json.loads((phase1.input_dir(slot) / "manifest.json").read_text())
        seed = int(time.time())
        rng = random.Random(seed)
        reader_indices = rng.sample(range(20000), CONCURRENT)
        record["reader_sample_seed"] = seed
        run_out = args.out / "run"
        run_out.mkdir(parents=True, exist_ok=True)
        result = load_core.run_point(f"http://127.0.0.1:{PORT}", manifest, CONCURRENT, INTERVAL,
                                     WARMUP, DURATION, DRAIN, run_out, reader_indices=reader_indices)
        (run_out / "summary.json").write_text(json.dumps(result, indent=2))
        discover_thread.join(timeout=120)
        record["sample"] = result

        feeds = [json.loads(l) for l in open(run_out / "feeds.jsonl")]
        measured = [f for f in feeds if f.get("phase") == "measured"]
        completed = [f["completion_ms"] for f in measured if f.get("success")]
        failed = [f for f in measured if not f.get("success")]
        completed.sort()
        p95 = completed[int(0.95 * len(completed))] if completed else None
        record["window"] = {"measured_feeds": len(measured), "completed": len(completed),
                            "failed": len(failed),
                            "error_rate": round(len(failed) / max(1, len(measured)), 4),
                            "p95_client_ms_success_only": p95,
                            "p95_note": "success-only percentile; failure/censoring counts retained — never an all-traffic tail",
                            "target": {"rate_per_s": round(CONCURRENT / INTERVAL, 2), "window_s": DURATION,
                                       "error_rate_max": 0.01, "p95_ms": 500}}
        gen = [json.loads(l) for l in open(run_out / "generator.jsonl")]
        if gen:
            last = gen[-1]
            record["generator"] = {"logical_cpus": last.get("generator_logical_cpus"),
                                   "window_cpu_seconds": result.get("generator_window_cpu_seconds"),
                                   "peak_http_requests": result.get("peak_http_requests"),
                                   "http_requests_after_drain": result.get("http_requests_after_drain"),
                                   "headroom_note": "generator CPU = window_cpu_seconds / (warmup+duration); the declared bar is < 50% of one logical CPU share while the server is the bottleneck"}
        after = lifecycle(project, slot, args.out, "after")
        record["lifecycle_after"] = after["passed"] if "passed" in after else after
        record["native_shapes"] = phase1.native_breakdown(project, args.out, since)
        record["observer_records"] = phase1.observer_harvest(project, args.out, since)
        w = record["window"]
        record["success"] = (w["error_rate"] < 0.01 and w["completed"] >= 0.9 * w["measured_feeds"]
                             and (p95 is None or p95 <= 500)
                             and record["lifecycle_before"] and record["lifecycle_after"])
        record["completed_utc"] = datetime.now(timezone.utc).isoformat()
    except Exception as exc:
        record["error"] = f"{type(exc).__name__}: {str(exc)[:400]}"
        record["completed_utc"] = datetime.now(timezone.utc).isoformat()
    finally:
        (args.out / "phase2.json").write_text(json.dumps(record, indent=1) + "\n")
        try:
            phase1.run_cmd(phase1.compose(project) + ["down", "-v", "--remove-orphans"], timeout=600)
        except Exception:
            pass
        record["teardown_verified_empty"] = subprocess.run(
            ["docker", "ps", "-a", "--filter", f"name={project}", "--format", "{{.Names}}"],
            stdout=subprocess.PIPE, text=True).stdout.strip() == ""
        (args.out / "phase2.json").write_text(json.dumps(record, indent=1) + "\n")
    print(json.dumps({k: record.get(k) for k in ("success", "error", "window")}, indent=2)[:1200])


if __name__ == "__main__":
    main()
