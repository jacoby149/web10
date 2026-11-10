#!/usr/bin/env python3
"""Open-scheduled core-feed load. Requires an already restored disposable fixture.

No provisioning, seeding, import, grant mutation, telemetry reset or saved JWTs.
"""
import argparse
import asyncio
import collections
import json
import ipaddress
import math
import os
from pathlib import Path
import platform
import resource
import time
from urllib.parse import urlsplit

import httpx

import core_feed
import dataset_v2
import provenance


def validate_target(base):
    url = urlsplit(base)
    if url.username or url.password or url.query or url.fragment or url.path not in ("", "/") or url.scheme not in ("http", "https"):
        raise ValueError("use a bare research API origin without credentials")
    if url.hostname == "localhost":
        return base
    try:
        address = ipaddress.ip_address(url.hostname)
    except ValueError:
        raise ValueError("research traffic requires an explicit loopback/private IP, never a production hostname") from None
    if not (address.is_private and not (address.is_link_local or address.is_multicast or address.is_unspecified or address.is_reserved)):
        raise ValueError("research traffic is restricted to explicit loopback/private addresses")
    return base


def schedule(users, interval, duration):
    """One deterministic stagger per user/interval, independent of completion."""
    if users < 1 or interval <= 0 or duration <= 0:
        raise ValueError("positive users, interval and duration required")
    for tick in range(math.ceil(duration * users / interval)):
        due = tick * interval / users
        if due < duration:
            yield due, tick % users


class Records:
    def __init__(self, stream):
        self.stream = stream
        self.counts = collections.Counter()
        self.failures = 0
        self.in_flight = 0
        self.peak_in_flight = 0

    def begin(self):
        self.in_flight += 1
        self.peak_in_flight = max(self.peak_in_flight, self.in_flight)

    def append(self, record):
        self.in_flight -= 1
        self.stream.write(json.dumps(record, separators=(",", ":")) + "\n")
        self.counts[(record["phase"], record["kind"], record["status"])] += 1
        self.failures += bool(record["error"])


async def run_point(base, manifest, users, interval, warmup, duration, drain, output, max_lag=1.0, reader_indices=None):
    validate_target(base)
    # Phase-1 randomized-reader cells: one (or a named set) of distinct
    # fixture readers per trial instead of always readers 0..n-1. The oracle
    # is index-arithmetic, so any indices are exact.
    if reader_indices is not None:
        users = len(reader_indices)
    if users > len(manifest["readers"]) or manifest["recipe"]["follow"] < 10:
        # Declared K (PROTOCOL): 10/20/100/1000. K >= 21 fetches 21 and
        # displays 20; K = 10/20 is the sub-21 page: K fetched / K displayed,
        # empty second page. check_result oracles both shapes exactly.
        raise ValueError("fixture needs distinct readers and a declared K >= 10")
    capture = core_feed.wire()
    counters = collections.Counter()
    in_flight = set()
    # No semaphore/admission cap: generator overload is retained, never hidden.
    limits = httpx.Limits(max_connections=None, max_keepalive_connections=users * 4, keepalive_expiry=75)
    async with httpx.AsyncClient(base_url=base, timeout=60, limits=limits, trust_env=False) as client:
        sessions = await core_feed.prepare(client, manifest, users, indices=reader_indices)
        # JWT metadata is only a preflight deadline check, never authorization.
        import base64
        from datetime import datetime, timezone
        for token, _ in sessions:
            claims = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=="))
            deadline = datetime.fromisoformat(claims["expires"].replace("Z", "+00:00"))
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)
            if deadline.timestamp() < time.time() + warmup + duration + drain + 60:
                raise ValueError("session expires before observation/drain; prepare fresh sessions")
        with (output / "requests.jsonl").open("x") as requests, (output / "feeds.jsonl").open("x") as feeds, (output / "generator.jsonl").open("x") as generator:
            records = Records(requests)
            start = time.perf_counter()
            baseline_cpu = time.process_time()

            async def monitor():
                due = time.perf_counter()
                while True:
                    usage = resource.getrusage(resource.RUSAGE_SELF)
                    generator.write(json.dumps({"elapsed_seconds": time.perf_counter() - start,
                        "cpu_seconds": time.process_time() - baseline_cpu, "maxrss_platform_units": usage.ru_maxrss,
                        "event_loop_lag_ms": max(0, time.perf_counter() - due) * 1000,
                        "open_fds": len(os.listdir("/proc/self/fd")) if Path("/proc/self/fd").exists() else None,
                        "live_feed_tasks": len(in_flight), "live_http_requests": records.in_flight,
                        "peak_http_requests": records.peak_in_flight}) + "\n")
                    generator.flush()
                    due += 1
                    await asyncio.sleep(max(0, due - time.perf_counter()))

            monitoring = asyncio.create_task(monitor())

            async def one(due, reader, phase, lag):
                began = time.perf_counter()
                record = {"scheduled_seconds": due, "reader_index": reader, "phase": phase,
                          "scheduler_lag_ms": lag * 1000, "task_start_lag_ms": (began - start - due) * 1000,
                          "success": False, "censored": False}
                try:
                    rows, results = await core_feed.feed(client, capture, *sessions[reader], records, phase, reader)
                    core_feed.check_result(manifest, reader, rows, results)
                    record["success"] = True
                except asyncio.CancelledError:
                    record["censored"] = True
                    raise
                except (httpx.HTTPError, core_feed.CoreRequestFailure):
                    record["failure"] = "http_failure"
                except (ValueError, KeyError, TypeError):
                    record["failure"] = "semantic_failure"
                    counters[("all", "semantic_failures")] += 1
                finally:
                    record["completion_ms"] = (time.perf_counter() - began) * 1000
                    record["scheduled_completion_ms"] = (time.perf_counter() - start - due) * 1000
                    counters[(phase, "completed" if record["success"] else "failed")] += 1
                    feeds.write(json.dumps(record, separators=(",", ":")) + "\n")

            def finished(task):
                in_flight.discard(task)
                if not task.cancelled() and task.exception() is not None:
                    counters[("all", "internal_task_errors")] += 1

            reader_of = reader_indices if reader_indices is not None else None
            try:
                for due, slot in schedule(users, interval, warmup + duration):
                    reader = slot if reader_of is None else reader_of[slot]
                    await asyncio.sleep(max(0, start + due - time.perf_counter()))
                    lag = time.perf_counter() - start - due
                    phase = "warmup" if due < warmup else "measured"
                    counters[(phase, "scheduled")] += 1
                    if lag > max_lag:
                        counters[(phase, "missed_start")] += 1
                        feeds.write(json.dumps({"scheduled_seconds": due, "reader_index": reader, "phase": phase,
                            "missed_start": True, "scheduler_lag_ms": lag * 1000}) + "\n")
                        continue
                    task = asyncio.create_task(one(due, reader, phase, lag))
                    in_flight.add(task)
                    counters[(phase, "started")] += 1
                    counters[("all", "peak_feed_in_flight")] = max(counters[("all", "peak_feed_in_flight")], len(in_flight))
                    task.add_done_callback(finished)
                    # Predeclared overload stop: at least 100 failures and >10% of
                    # completed measured feeds. All unfinished work is still drained.
                    failed = counters[("measured", "failed")]
                    completed = counters[("measured", "completed")]
                    if failed >= 100 and failed / (failed + completed) > .10:
                        counters[("all", "error_stop")] = 1
                        break
                remaining = set(in_flight)
                if remaining:
                    await asyncio.wait(remaining, timeout=drain)
            finally:
                pending = set(in_flight)
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
                monitoring.cancel()
                monitor_results = await asyncio.gather(monitoring, return_exceptions=True)
                if any(isinstance(r, Exception) for r in monitor_results):
                    counters[("all", "monitor_errors")] += 1
                requests.flush()
                feeds.flush()
    usage = resource.getrusage(resource.RUSAGE_SELF)
    return {"counts": {f"{a}:{b}": v for (a, b), v in counters.items()},
            "request_counts": {f"{p}:{k}:{s}": n for (p, k, s), n in records.counts.items()},
            "generator_window_cpu_seconds": time.process_time() - baseline_cpu,
            "generator_maxrss_platform_units": usage.ru_maxrss,
            "generator_platform": platform.platform(), "generator_logical_cpus": os.cpu_count(),
            "generator_fd_limits": resource.getrlimit(resource.RLIMIT_NOFILE),
            "peak_http_requests": records.peak_in_flight, "http_requests_after_drain": records.in_flight,
            "valid_offered_load": not any(counters[(p, "missed_start")] for p in ("warmup", "measured"))
                and not any(counters[("all", k)] for k in ("error_stop", "internal_task_errors", "monitor_errors", "semantic_failures")),
            "scope": "Text-only core API sequence. Inspect raw failures/censoring and resource/correlation receipts; no automatic capacity claim."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--users", type=int, required=True)
    parser.add_argument("--interval", type=float, default=60)
    parser.add_argument("--warmup", type=float, default=60)
    parser.add_argument("--duration", type=float, default=180)
    parser.add_argument("--drain", type=float, default=60)
    parser.add_argument("--api-origin", help="explicit private-IP API on a separate test host; never a production hostname")
    args = parser.parse_args()
    verified = dataset_v2.validate(args.directory)
    manifest = json.loads((args.directory / "manifest.json").read_bytes())
    receipt = json.loads(args.receipt.read_bytes())
    sources = provenance.sources()
    if not (receipt.get("complete") and receipt.get("research_observer") and receipt["dataset_id"] == verified["dataset_id"]
            and receipt["correctness"]["sources"] == sources):
        raise ValueError("matching current-source local research restore receipt required")
    base = validate_target(args.api_origin or receipt["api"])
    if args.users < 1 or args.interval <= 0 or args.warmup < 0 or args.duration <= 0 or args.drain <= 0:
        raise ValueError("invalid load durations/counts")
    args.out.mkdir(parents=True, exist_ok=False)
    (args.out / "protocol.json").write_text(json.dumps({**verified, "sources": sources,
        **{k: getattr(args, k) for k in ("users", "interval", "warmup", "duration", "drain")}, "api_origin": base,
        "condition": "first deliveries during warm-up; steady-refresh with real logging/delivery dedupe"}, indent=2))
    print("[load-core] session preparation precedes all scheduled traffic", flush=True)
    result = asyncio.run(run_point(base, manifest, args.users, args.interval, args.warmup, args.duration, args.drain, args.out))
    (args.out / "summary.json").write_text(json.dumps(result, indent=2))
    print("[load-core] point drained; raw observations retained", flush=True)


if __name__ == "__main__":
    main()
