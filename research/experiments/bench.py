#!/usr/bin/env python3
"""Query-engine load generator for the web10 SIGMOD experiment.

Replays the feed query (the 267→1 query) + key flows against the running node,
collects the phase-level timing from the API's `[query] … timing_ms` log lines,
and computes p50/p95/p99 per phase.

The bench is the "is the access model fast enough" measurement: the `readable`
phase is the access decision (the claim's core metric), `execute` is the
ClickHouse scan, and `readable/execute` is the overhead the access model adds.

Usage:
  python3 bench.py --readers 100 --duration 60 --api http://localhost:6000
  python3 bench.py --readers 100 --duration 120 --api http://localhost:6000 --concurrency 20

The bench:
  1. Logs in as N synthetic readers (the seed's users).
  2. Each reader replays the feed query (the real feed SQL from the social app)
     in a loop for `duration` seconds.
  3. The API logs `[query] id=… timing_ms auth=… app_contract=… … total=…`
     per query. The bench tails the API log, parses those lines, and computes
     p50/p95/p99 per phase.
  4. Writes the results to bench-results.json.

The feed query is the same shape the social app runs (buildFeedQuery in
feed.ts): a SELECT over `posts` with LEFT JOINs to `reactions`, `comments`,
and `profile`, filtered to the reader's followers groups. The bench uses a
simplified version (no ranking score — chronological, which is the `newest`
path) so the SQL is stable and the measurement is about the access model +
the scan, not the ranking math.

Environment:
  API_BASE — the API's base URL (default http://localhost:6000)
  API_LOG — path to the API's log file (default: docker logs, tailed live)
"""

import argparse
import json
import os
import re
import statistics
import subprocess
import sys
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

API_BASE = os.getenv("API_BASE", "http://localhost:6000")

# The feed query (chronological — the `newest` path, no ranking score).
# Same shape as buildFeedQuery in feed.ts, simplified: no power-mean score,
# no cursor (page 1), LIMIT 20. The access model + the scan are what we're
# measuring, not the ranking math.
FEED_SQL = (
    "SELECT p.doc_id AS doc_id, p.author_key AS author_key, p.body AS body, "
    "p.tags AS tags, p.created_at AS created_at, p.ref_value AS ref_value, "
    "p.ad_mode AS ad_mode, p.ad_target AS ad_target, "
    "coalesce(eng.like_count, 0) AS likes, coalesce(eng.dislike_count, 0) AS dislikes, "
    "coalesce(cmt.comment_count, 0) AS comments, "
    "pr.body AS profile_body "
    "FROM posts p "
    "LEFT JOIN (SELECT ref_value, "
    "countIf(JSONExtractString(body, 'type') = 'like') AS like_count, "
    "countIf(JSONExtractString(body, 'type') = 'dislike') AS dislike_count "
    "FROM reactions WHERE ref_value != '' GROUP BY ref_value) eng ON eng.ref_value = p.doc_id "
    "LEFT JOIN (SELECT JSONExtractString(body, 'post_id') AS post_id, count() AS comment_count "
    "FROM comments WHERE JSONExtractString(body, 'post_id') != '' GROUP BY post_id) cmt "
    "ON cmt.post_id = p.doc_id "
    "LEFT JOIN (SELECT author_key, body FROM profile "
    "QUALIFY row_number() OVER (PARTITION BY author_key ORDER BY updated_at DESC) = 1) pr "
    "ON pr.author_key = p.author_key "
    "WHERE not has(p.tags, 'ad') AND not has(p.tags, 'product') "
    "ORDER BY toUnixTimestamp64Milli(p.created_at) DESC "
    "LIMIT 20"
)

# The phase names in the timing log line (the order in the log format string).
PHASES = [
    "auth",
    "app_contract",
    "parse_validate",
    "candidates",
    "readable",
    "group_meta",
    "compile",
    "execute",
    "serialize",
    "prepare",
    "total",
]

# The timing log line format (from query.py):
# [query] id=… timing_ms auth=0.3 app_contract=0.8 … total=24.7
TIMING_RE = re.compile(
    r"\[query\] id=(\S+) timing_ms "
    + r" ".join(f"{p}=(\d+\.\d+)" for p in PHASES)
)


class TimingCollector:
    """Tails the API log and collects timing_ms lines into per-phase lists."""

    def __init__(self, log_cmd: list[str]):
        self.log_cmd = log_cmd
        self.phase_data: dict[str, list[float]] = {p: [] for p in PHASES}
        self.query_ids: set[str] = set()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._tail, daemon=True)

    def start(self):
        self._thread.start()

    def stop(self):
        self._stop.set()
        self._thread.join(timeout=5)

    def _tail(self):
        try:
            proc = subprocess.Popen(
                self.log_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
            )
            for line in proc.stdout:
                if self._stop.is_set():
                    break
                m = TIMING_RE.search(line)
                if m:
                    qid = m.group(1)
                    if qid in self.query_ids:
                        continue  # dedup (docker logs can repeat)
                    self.query_ids.add(qid)
                    for i, phase in enumerate(PHASES):
                        self.phase_data[phase].append(float(m.group(i + 2)))
        except Exception as e:
            print(f"[bench] log tail error: {e}", file=sys.stderr)

    def summary(self) -> dict:
        out = {}
        for phase in PHASES:
            data = self.phase_data[phase]
            if not data:
                out[phase] = {"n": 0}
                continue
            data_sorted = sorted(data)
            n = len(data_sorted)
            out[phase] = {
                "n": n,
                "p50": _percentile(data_sorted, 50),
                "p95": _percentile(data_sorted, 95),
                "p99": _percentile(data_sorted, 99),
                "mean": round(statistics.mean(data_sorted), 3),
                "max": round(data_sorted[-1], 3),
            }
        # The headline number: the access-decision overhead as a fraction of
        # the data read. readable / execute.
        if out.get("readable", {}).get("n") and out.get("execute", {}).get("n"):
            r = out["readable"]["p50"]
            e = out["execute"]["p50"]
            out["overhead_pct"] = round((r / e) * 100, 2) if e > 0 else None
        return out


def _percentile(sorted_data: list[float], pct: float) -> float:
    """Linear-interpolation percentile (the same method numpy uses)."""
    if not sorted_data:
        return 0.0
    k = (len(sorted_data) - 1) * (pct / 100)
    f = int(k)
    c = f + 1 if f + 1 < len(sorted_data) else f
    d = k - f
    return round(sorted_data[f] + d * (sorted_data[c] - sorted_data[f]), 3)


def login(session: requests.Session, username: str, password: str) -> str | None:
    """Log in and return the JWT, or None on failure."""
    try:
        r = session.post(
            f"{API_BASE}/v3/login",
            json={"username": username, "password": password, "site": "bench"},
            timeout=10,
        )
        if r.status_code == 200:
            return r.json().get("token")
    except Exception:
        pass
    return None


def run_feed_query(session: requests.Session, token: str, reader: str, stop: threading.Event) -> int:
    """Replay the feed query in a loop until stop is set. Returns query count."""
    count = 0
    headers = {"Authorization": f"Bearer {token}"}
    while not stop.is_set():
        try:
            r = session.post(
                f"{API_BASE}/v3/query",
                json={"sql": FEED_SQL},
                headers=headers,
                timeout=30,
            )
            if r.status_code == 200:
                count += 1
            elif r.status_code == 429:
                # Rate limited — back off briefly.
                time.sleep(1)
            else:
                # A non-200 that isn't a rate limit: log it once and continue.
                if count == 0:
                    print(f"[bench] {reader}: query returned {r.status_code}: {r.text[:200]}", file=sys.stderr)
                time.sleep(0.1)
        except requests.exceptions.ConnectionError:
            time.sleep(1)
        except Exception:
            time.sleep(0.5)
    return count


def main():
    parser = argparse.ArgumentParser(description="web10 SIGMOD experiment bench")
    parser.add_argument("--readers", type=int, default=100, help="number of synthetic readers")
    parser.add_argument("--duration", type=int, default=60, help="bench duration in seconds")
    parser.add_argument("--concurrency", type=int, default=20, help="concurrent query threads")
    parser.add_argument("--api", default=API_BASE, help="API base URL")
    parser.add_argument("--log-cmd", default="docker logs -f web10-prod-api-1",
                        help="command to tail the API log (default: docker logs -f web10-prod-api-1)")
    parser.add_argument("--seed-summary", default=os.path.join(os.path.dirname(__file__), "seed-summary.json"),
                        help="path to the seed summary (scale numbers)")
    parser.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "bench-results.json"),
                        help="output path for the results")
    args = parser.parse_args()

    global API_BASE
    API_BASE = args.api

    # Read the scale numbers (the seed summary).
    scale = {}
    if os.path.exists(args.seed_summary):
        with open(args.seed_summary) as f:
            scale = json.load(f)
    print(f"[bench] scale: {json.dumps(scale)}")

    # Start the timing collector (tails the API log).
    log_cmd = args.log_cmd.split()
    collector = TimingCollector(log_cmd)
    collector.start()

    # Log in as the readers.
    print(f"[bench] logging in {args.readers} readers...")
    session = requests.Session()
    tokens: list[tuple[str, str]] = []  # (reader, token)
    for i in range(args.readers):
        username = f"user{i:07d}"
        token = login(session, username, "bench-password")
        if token:
            tokens.append((username, token))
        if i % 1000 == 0 and i > 0:
            print(f"[bench]   {i}/{args.readers} logged in")
    print(f"[bench] {len(tokens)} readers authenticated")

    if not tokens:
        print("[bench] error: no readers authenticated", file=sys.stderr)
        sys.exit(1)

    # Run the bench: N concurrent threads, each replaying the feed query.
    print(f"[bench] running {args.duration}s at {args.concurrency} concurrency...")
    stop = threading.Event()
    total_queries = 0
    queries_lock = threading.Lock()

    def worker(reader_token: tuple[str, str]):
        nonlocal total_queries
        reader, token = reader_token
        s = requests.Session()
        n = run_feed_query(s, token, reader, stop)
        with queries_lock:
            total_queries += n

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = [pool.submit(worker, rt) for rt in tokens]
        # Wait for the duration, then stop.
        time.sleep(args.duration)
        stop.set()
        for f in as_completed(futures):
            f.result()  # propagate exceptions

    elapsed = time.time() - t0
    collector.stop()

    # Compute the summary.
    timing = collector.summary()
    qps = round(total_queries / elapsed, 1) if elapsed > 0 else 0

    results = {
        "config": {
            "readers": args.readers,
            "duration_s": args.duration,
            "concurrency": args.concurrency,
            "api": args.api,
        },
        "scale": scale,
        "throughput": {
            "total_queries": total_queries,
            "qps": qps,
            "elapsed_s": round(elapsed, 1),
        },
        "timing_ms": timing,
        "headline": {
            "access_decision_p50_ms": timing.get("readable", {}).get("p50"),
            "data_read_p50_ms": timing.get("execute", {}).get("p50"),
            "overhead_pct": timing.get("overhead_pct"),
        },
    }

    with open(args.out, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n[bench] results written to {args.out}")
    print(f"[bench] throughput: {qps} qps ({total_queries} queries in {elapsed:.1f}s)")
    print(f"[bench] access decision (readable) p50: {timing.get('readable', {}).get('p50')} ms")
    print(f"[bench] data read (execute) p50: {timing.get('execute', {}).get('p50')} ms")
    print(f"[bench] overhead: {timing.get('overhead_pct')}%")
    print(f"\n[bench] per-phase p50/p95/p99 (ms):")
    for phase in PHASES:
        d = timing.get(phase, {})
        if d.get("n"):
            print(f"  {phase:16s} p50={d['p50']:8.3f}  p95={d['p95']:8.3f}  p99={d['p99']:8.3f}  n={d['n']}")


if __name__ == "__main__":
    main()
