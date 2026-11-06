#!/usr/bin/env python3
"""Bench for the access-control cost function experiment (the three-line ablation).

Measures the policy layer web10 adds (auth -> app_contract -> candidates ->
readable -> group_meta -> compile -> serialize) against K (the reader's
readable-set size), with the columnar scan held out or measured as the credited
baseline. It drives the three evaluation flags (settings.py / run_query) by
restarting the API container with different env, then scrapes the node's
`[query] … timing_ms …` log lines and computes per-phase percentiles + the
pipeline-versus-direct-scan delta (not causal authorization overhead).

The three lines (per research/digital-ocean-thinking.md):
  A = direct scan baseline (precompiled projection)     — the credited ClickHouse baseline
  B = policy, real scan    (no flags)                    — the actual system
  C = policy, stubbed scan (QUERY_EVAL_STUB_EXECUTE=1)   — our layer, isolated

And the readable-resolution algorithm is varied: per-group (default) vs batched
(QUERY_EVAL_READABLE_MODE=batched), so the figure shows the bottleneck + the fix.

This script is OFFLINE-TESTABLE: the pure functions (log parsing, percentile,
delta math, matrix expansion) are unit-tested in bench.test.py without a droplet.
The network/collect half only runs on the experiment host.

Usage (on the experiment host):
  python3 bench.py --manifest ./seed-manifest.json --k 100 \
      --runs 20 --compose "docker compose -f compose.yml -p web10-costfn" \
      --out ./results
"""

import argparse
import json
import os
import random
import re
import shlex
import statistics
import subprocess
import sys
import time

# The phase names in the timing log line (order matches query.py's format string).
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

# The policy layer = everything except the columnar scan (execute) AND the
# grand total (which would double-count). This is "our part" — the thing the
# experiment isolates.
POLICY_PHASES = [p for p in PHASES if p not in ("execute", "total")]

TIMING_RE = re.compile(
    r"\[query\] id=(\S+) timing_ms " + " ".join(r"{}=(\d+\.\d+)".format(p) for p in PHASES)
)


# ── pure functions (offline-testable) ────────────────────────────────────────


def parse_timing_lines(text):
    """Parse `[query] … timing_ms …` lines into a list of {phase: ms} dicts.

    Returns one dict per matched line (deduped by query id — docker logs can
    repeat a line). Lines that don't match are ignored (other log noise).
    """
    seen = set()
    out = []
    for line in text.splitlines():
        m = TIMING_RE.search(line)
        if not m:
            continue
        qid = m.group(1)
        if qid in seen:
            continue
        seen.add(qid)
        rec = {"query_id": qid}
        for i, phase in enumerate(PHASES):
            rec[phase] = float(m.group(i + 2))
        out.append(rec)
    return out


def percentile(sorted_data, pct):
    """Linear-interpolation percentile (numpy's default method)."""
    if not sorted_data:
        return None
    k = (len(sorted_data) - 1) * (pct / 100)
    f = int(k)
    c = f + 1 if f + 1 < len(sorted_data) else f
    d = k - f
    return round(sorted_data[f] + d * (sorted_data[c] - sorted_data[f]), 3)


def summarize(records):
    """Per-phase p50/p95/p99/mean/max over a list of timing records."""
    out = {}
    for phase in PHASES:
        vals = sorted(r[phase] for r in records if phase in r)
        if not vals:
            out[phase] = {"n": 0}
            continue
        out[phase] = {
            "n": len(vals),
            "p50": percentile(vals, 50),
            "p95": percentile(vals, 95),
            "p99": percentile(vals, 99),
            "mean": round(statistics.mean(vals), 3),
            "max": round(vals[-1], 3),
        }
    return out


def policy_total(record):
    """The sum of the policy phases (our part) for one record — excludes execute."""
    return sum(record[p] for p in POLICY_PHASES if p in record)


def causal_overhead(b_records, a_records):
    """Historical name: B − A pipeline-versus-direct-scan summary deltas.

    Not a causal estimate: A lacks B's HTTP/auth/compile/serialization path;
    trials are not paired and output equivalence is not checked here.
    Computed as the difference of policy totals' medians, plus phase deltas.
    Returns None if either side has no samples.
    """
    if not b_records or not a_records:
        return None
    b_policy = sorted(policy_total(r) for r in b_records)
    a_policy = sorted(policy_total(r) for r in a_records)
    b_med = percentile(b_policy, 50)
    a_med = percentile(a_policy, 50)
    per_phase = {}
    for phase in POLICY_PHASES:
        bv = sorted(r[phase] for r in b_records if phase in r)
        av = sorted(r[phase] for r in a_records if phase in r)
        if bv and av:
            per_phase[phase] = round(percentile(bv, 50) - percentile(av, 50), 3)
    return {
        "total_delta_median_ms": round(
            percentile(sorted(r["total"] for r in b_records), 50)
            - percentile(sorted(r["total"] for r in a_records), 50), 3),
        "b_policy_median_ms": b_med,
        "a_policy_median_ms": a_med,
        "overhead_median_ms": round(b_med - a_med, 3),
        "overhead_pct_of_a": round((b_med - a_med) / a_med * 100, 2) if a_med else None,
        "per_phase_delta_ms": per_phase,
        "n_b": len(b_records),
        "n_a": len(a_records),
    }


def expand_matrix(k_values, feeds, readable_modes, lines):
    """Expand the experiment matrix into explicit (feed, k, mode, line) cells.

    `feeds`: e.g. ["personal", "discover"]. For discover, K is always 1 (one
    board group) regardless of the k_values sweep — the discover axis is node
    size, not K; this cell just records k=1. `lines`: subset of ["A","B","C"].
    Returns a flat list of cell dicts (the bench runs each).
    """
    cells = []
    for feed in feeds:
        ks = [1] if feed == "discover" else list(k_values)
        for k in ks:
            # Line A (no-policy) skips readable resolution entirely, so the
            # readable mode is irrelevant — run it ONCE per (feed, k), not once
            # per mode. Lines B/C vary by readable mode (per-group vs batched).
            if "A" in lines:
                cells.append({"feed": feed, "k": k, "mode": "n/a", "line": "A"})
            for mode in readable_modes:
                for line in lines:
                    if line == "A":
                        continue  # already added once above
                    cells.append({"feed": feed, "k": k, "mode": mode, "line": line})
    return cells


def env_for_cell(cell, base_env):
    """The API container env for one cell (drives the three flags)."""
    env = dict(base_env)
    env.update(QUERY_EVAL_NO_POLICY="0", QUERY_EVAL_STUB_EXECUTE="0",
               QUERY_EVAL_READABLE_MODE="per-group", QUERY_EVAL_STUB_ROWS="20")
    if cell["line"] == "C":
        env["QUERY_EVAL_STUB_EXECUTE"] = "1"
        env["QUERY_EVAL_READABLE_MODE"] = cell["mode"] if cell["mode"] != "n/a" else "per-group"
    elif cell["line"] == "B":
        env["QUERY_EVAL_READABLE_MODE"] = cell["mode"] if cell["mode"] != "n/a" else "per-group"
    return env


# ── network/collect half (experiment host only) ──────────────────────────────

PERSONAL_SQL = "SELECT doc_id, body FROM posts ORDER BY created_at DESC, doc_id LIMIT 20"
DISCOVER_SQL = PERSONAL_SQL

# A cannot use /v3/query: its validator forbids physical tables even in eval
# mode, while its no-policy branch skips the service CTEs. Compile the same
# posts projection once, with known-readable seed groups, then time only CH.
BASELINE_SCRIPT = """
import json, sys, time
from app.v3.services import clickhouse as ch, safe_query as sq
sql, groups, reader, runs = json.loads(sys.argv[1])
compiled = sq.build_safe_query(sql, {'posts': groups}, member_key=reader, max_limit=1000)
records = []
for _ in range(runs):
    start = time.perf_counter()
    columns, rows = ch.execute_query(compiled, settings={'max_execution_time': 30})
    elapsed = (time.perf_counter() - start) * 1000
    records.append({'execute': elapsed, 'total': elapsed})
    time.sleep(1)
print('COSTFN_BASELINE=' + json.dumps(records))
"""


def baseline_records(compose_cmd, sql, groups, reader, runs):
    result = subprocess.run(
        shlex.split(compose_cmd) + ["exec", "-T", "api", "uv", "run", "python", "-c",
                                    BASELINE_SCRIPT, json.dumps([sql, groups, reader, runs])],
        check=True, capture_output=True, text=True,
    )
    line = next(line for line in result.stdout.splitlines() if line.startswith("COSTFN_BASELINE="))
    return [{**dict.fromkeys(PHASES, 0.0), **r} for r in json.loads(line.split("=", 1)[1])]


def _api_up(base_url, timeout_s=90):
    import requests

    t0 = time.time()
    while time.time() - t0 < timeout_s:
        try:
            if requests.get(f"{base_url}/docs", timeout=5).status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


def _restart_api(compose_cmd, env):
    """Restart the api container with the given env (drives the flags)."""
    cmd = shlex.split(compose_cmd)
    subprocess.run(cmd + ["up", "-d", "--no-deps", "--force-recreate", "api"],
                   env={**os.environ, **env}, check=True, capture_output=True)


def _tail_api_logs(compose_cmd, since_epoch):
    cmd = shlex.split(compose_cmd) + ["logs", "--since", str(since_epoch), "api"]
    r = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return r.stdout + r.stderr


def _login(base_url, username, password):
    import requests

    r = requests.post(f"{base_url}/v3/login", json={"username": username, "password": password, "site": "costfn"}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def _run_queries(base_url, token, sql, groups, n, rate_limit_sleep=1.0):
    """Issue n queries, pacing under the 60/min/user rate limit. Returns count
    of 200s. (The timing comes from the logs, not the responses.)"""
    import requests

    ok = 0
    for i in range(n):
        payload = {"token": token, "sql": sql}
        if groups:
            payload["groups"] = groups
        try:
            r = requests.post(f"{base_url}/v3/query", json=payload, timeout=60)
            if r.status_code == 200:
                ok += 1
            elif r.status_code == 429:
                time.sleep(rate_limit_sleep * 2)
            else:
                raise RuntimeError(f"query {i + 1}/{n}: HTTP {r.status_code}: {r.text[:300]}")
        except requests.RequestException as exc:
            raise RuntimeError(f"query {i + 1}/{n} failed") from exc
        # Pace: 60/min => >=1s between queries stays safely under budget.
        time.sleep(rate_limit_sleep)
    return ok


def ordered_cells(cells, seed):
    """Reproducible randomized cell order, independent of global RNG state."""
    result = list(cells)
    random.Random(seed).shuffle(result)
    return result


def collect_cell(compose_cmd, base_url, manifest, cell, runs, results_dir, warmup=3):
    """Run one matrix cell: restart the API with the cell's env, issue `runs`
    queries, scrape the timing logs, summarize. Returns the result dict."""
    path = os.path.join(results_dir, f"cell-{cell['line']}-{cell['feed']}-k{cell['k']}-{cell['mode'].replace('/', '-')}.json")
    if os.path.exists(path):
        raise FileExistsError(f"Refusing to overwrite retained cell: {path}")
    env = env_for_cell(cell, {})
    _restart_api(compose_cmd, env)
    if not _api_up(base_url):
        raise RuntimeError(f"API did not come up for cell {cell}")

    token = _login(base_url, manifest["reader"], manifest["password"])
    if cell["feed"] == "discover":
        sql, groups = DISCOVER_SQL, [manifest["discover_board"]]
    else:
        # Personal feed: scope to the reader's followed creators' groups.
        sql = PERSONAL_SQL
        groups = [manifest["creator_groups"][name] for name in manifest["followed"][: cell["k"]]]

    since = int(time.time())
    requested = runs + warmup
    if cell["line"] == "A":
        records = baseline_records(compose_cmd, sql, groups, manifest["reader"], requested)
        ok = len(records)  # direct CH executions, not HTTP responses
    else:
        ok = _run_queries(base_url, token, sql, groups, requested)
        time.sleep(2)  # let the last log lines flush
        logs = _tail_api_logs(compose_cmd, since)
        records = parse_timing_lines(logs)
    if ok != requested or len(records) != requested:
        # Do not discard a short cell or misclassify its samples as measured
        # versus warm-up when requests/timings are missing. No valid summary.
        with open(path, "w") as f:
            json.dump({"cell": cell, "complete": False,
                       "runs_requested": runs, "warmup_requested": warmup,
                       "successful_including_warmup": ok,
                       "observed_timings_unclassified": records}, f, indent=2)
        raise RuntimeError(f"Incomplete cell {cell}: {ok}/{requested} successful, {len(records)} timings")

    warmup_records, records = records[:warmup], records[warmup:]

    summary = summarize(records)
    result = {
        "cell": cell,
        "complete": True,
        "runs_requested": runs,
        "queries_200": runs if cell["line"] != "A" else 0,
        "queries_completed": runs,
        "warmup_excluded": warmup,
        "warmup_records": warmup_records,
        "transport": "direct-clickhouse" if cell["line"] == "A" else "http",
        "timing_samples": len(records),
        "summary": summary,
        "_records": records,
        "records": records,  # durable raw phases; never credentials or response bodies
    }
    with open(path, "w") as f:
        json.dump({k: v for k, v in result.items() if k != "_records"}, f, indent=2)
    return result


def main():
    p = argparse.ArgumentParser(description="access-control cost function bench")
    p.add_argument("--manifest", required=True, help="path to seed-manifest.json")
    p.add_argument("--k", type=int, nargs="+", default=[10, 100, 1000], help="K values to sweep (personal feed)")
    p.add_argument("--feeds", nargs="+", default=["personal", "discover"])
    p.add_argument("--modes", nargs="+", default=["per-group", "batched"])
    p.add_argument("--lines", nargs="+", default=["A", "B", "C"])
    p.add_argument("--runs", type=int, default=20, help="queries per cell (>=20 for p95)")
    p.add_argument("--warmup", type=int, default=3, help="excluded requests per cell, retained separately")
    p.add_argument("--order-seed", type=int, default=42, help="seed for randomized cell order")
    p.add_argument("--api", default="http://localhost:6000", help="API base URL")
    p.add_argument("--compose", default=f"docker compose -f {shlex.quote(os.path.join(os.path.dirname(__file__), 'compose.yml'))} -p web10-costfn")
    p.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "results"))
    args = p.parse_args()

    os.makedirs(args.out, exist_ok=True)
    if any(name in ("schedule.json", "report.json") or name.startswith("cell-")
           for name in os.listdir(args.out)):
        p.error("output directory already contains a trial; use a new --out directory")
    with open(args.manifest) as f:
        manifest = json.load(f)
    if args.runs < 1 or args.warmup < 0 or any(k < 1 or k > len(manifest["followed"]) for k in args.k):
        p.error("runs must be positive, warmup nonnegative and K must fit the seeded followed groups")

    cells = ordered_cells(expand_matrix(args.k, args.feeds, args.modes, args.lines), args.order_seed)
    with open(os.path.join(args.out, "schedule.json"), "w") as f:
        json.dump({"order_seed": args.order_seed, "warmup": args.warmup,
                   "runs": args.runs, "cells": cells}, f, indent=2)
    print(f"[bench] {len(cells)} cells across feeds={args.feeds} k={args.k} modes={args.modes} lines={args.lines}")

    all_cells = []
    for cell in cells:
        print(f"[bench] running cell {cell} ...")
        res = collect_cell(args.compose, args.api, manifest, cell, args.runs, args.out, args.warmup)
        all_cells.append(res)
        print(f"[bench]   {res['timing_samples']} timing samples")

    # Historical B-minus-A summary deltas; neither paired nor causal. Raw
    # phase observations are retained so summaries can be independently checked.
    by_key = {}
    for res in all_cells:
        c = res["cell"]
        key = (c["feed"], c["k"])
        by_key.setdefault(key, {})[(c["line"], c["mode"])] = res
    deltas = {}
    for key, lines in by_key.items():
        for mode in args.modes:
            if ("B", mode) in lines and ("A", "n/a") in lines:
                deltas[str((*key, mode))] = causal_overhead(
                    lines[("B", mode)]["_records"], lines[("A", "n/a")]["_records"])

    report = {
        "order_seed": args.order_seed,
        "warmup_per_cell": args.warmup,
        "comparison_scope": "Historical B-minus-A key is a pipeline-versus-direct-scan delta, NOT paired causal authorization overhead.",
        "manifest": {k: manifest[k] for k in ("seed", "reader", "k", "creators_total")},
        "cells": [{k: c[k] for k in ("cell", "runs_requested", "queries_200", "queries_completed", "transport", "timing_samples")} for c in all_cells],
        "summaries": {str(c["cell"]): c["summary"] for c in all_cells},
        "causal_overhead_B_minus_A": deltas,
    }
    with open(os.path.join(args.out, "report.json"), "w") as f:
        json.dump(report, f, indent=2)
    print(f"[bench] done; report -> {os.path.join(args.out, 'report.json')}")


if __name__ == "__main__":
    main()
