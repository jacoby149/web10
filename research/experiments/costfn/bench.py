#!/usr/bin/env python3
"""Bench for the access-control cost function experiment (the three-line ablation).

Measures the policy layer web10 adds (auth -> app_contract -> candidates ->
readable -> group_meta -> compile -> serialize) against K (the reader's
readable-set size), with the columnar scan held out or measured as the credited
baseline. It drives the three evaluation flags (settings.py / run_query) by
restarting the API container with different env, then scrapes the node's
`[query] … timing_ms …` log lines and computes per-phase percentiles + the
causal overhead delta.

The three lines (per research/digital-ocean-thinking.md):
  A = no-policy baseline   (QUERY_EVAL_NO_POLICY=1)      — the credited ClickHouse baseline
  B = policy, real scan    (no flags)                    — the actual system
  C = policy, stubbed scan (QUERY_EVAL_STUB_EXECUTE=1)   — our layer, isolated

And the readable-resolution algorithm is varied: per-group (default) vs batched
(QUERY_EVAL_READABLE_MODE=batched), so the figure shows the bottleneck + the fix.

This script is OFFLINE-TESTABLE: the pure functions (log parsing, percentile,
delta math, matrix expansion) are unit-tested in bench.test.py without a droplet.
The network/collect half only runs on the experiment host.

Usage (on the experiment host):
  python3 bench.py --manifest ./seed-manifest.json --k 100 \
      --runs 20 --compose "docker compose -f ../../docker-compose.yml -p web10-costfn" \
      --out ./results
"""

import argparse
import json
import os
import re
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
        rec = {}
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
    """B − A: the causal authorization overhead.

    Computed as the difference of the per-record policy totals' medians, plus
    the per-phase deltas (so the figure can show WHERE the overhead lives).
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
    if cell["line"] == "A":
        env["QUERY_EVAL_NO_POLICY"] = "1"
        env.pop("QUERY_EVAL_STUB_EXECUTE", None)
        env.pop("QUERY_EVAL_READABLE_MODE", None)
    elif cell["line"] == "C":
        env["QUERY_EVAL_STUB_EXECUTE"] = "1"
        env.pop("QUERY_EVAL_NO_POLICY", None)
        env["QUERY_EVAL_READABLE_MODE"] = cell["mode"] if cell["mode"] != "n/a" else "per-group"
    else:  # B
        env.pop("QUERY_EVAL_NO_POLICY", None)
        env.pop("QUERY_EVAL_STUB_EXECUTE", None)
        env["QUERY_EVAL_READABLE_MODE"] = cell["mode"] if cell["mode"] != "n/a" else "per-group"
    return env


# ── network/collect half (experiment host only) ──────────────────────────────

PERSONAL_SQL = "SELECT doc_id FROM posts"
DISCOVER_SQL = "SELECT doc_id FROM posts"


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
    cmd = compose_cmd.split()
    env_args = []
    for k, v in env.items():
        env_args += ["-e", f"{k}={v}"]
    subprocess.run(cmd + ["up", "-d", "--force-recreate"] + env_args + ["api"], check=True, capture_output=True)


def _tail_api_logs(compose_cmd, since_epoch):
    cmd = compose_cmd.split() + ["logs", "--since", str(since_epoch), "api"]
    r = subprocess.run(cmd, capture_output=True, text=True)
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
        except Exception:
            time.sleep(1)
        # Pace: 60/min => >=1s between queries stays safely under budget.
        time.sleep(rate_limit_sleep)
    return ok


def collect_cell(compose_cmd, base_url, manifest, cell, runs, results_dir):
    """Run one matrix cell: restart the API with the cell's env, issue `runs`
    queries, scrape the timing logs, summarize. Returns the result dict."""
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
    ok = _run_queries(base_url, token, sql, groups, runs)
    time.sleep(2)  # let the last log lines flush
    logs = _tail_api_logs(compose_cmd, since)
    records = parse_timing_lines(logs)

    summary = summarize(records)
    result = {
        "cell": cell,
        "runs_requested": runs,
        "queries_200": ok,
        "timing_samples": len(records),
        "summary": summary,
        "_records": records,  # retained for the per-record B-A delta (not written to disk)
    }
    path = os.path.join(results_dir, f"cell-{cell['line']}-{cell['feed']}-k{cell['k']}-{cell['mode']}.json")
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
    p.add_argument("--api", default="http://localhost:6000", help="API base URL")
    p.add_argument("--compose", default="docker compose -f ../../docker-compose.yml -p web10-costfn")
    p.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "results"))
    args = p.parse_args()

    os.makedirs(args.out, exist_ok=True)
    with open(args.manifest) as f:
        manifest = json.load(f)

    cells = expand_matrix(args.k, args.feeds, args.modes, args.lines)
    print(f"[bench] {len(cells)} cells across feeds={args.feeds} k={args.k} modes={args.modes} lines={args.lines}")

    all_cells = []
    for cell in cells:
        print(f"[bench] running cell {cell} ...")
        res = collect_cell(args.compose, args.api, manifest, cell, args.runs, args.out)
        all_cells.append(res)
        print(f"[bench]   {res['timing_samples']} timing samples, {res['queries_200']} ok")

    # Compute the causal overhead (B − A) per (feed, k, mode) where both exist,
    # from the retained per-record data (the true delta, not a summary diff).
    by_key = {}
    for res in all_cells:
        c = res["cell"]
        key = (c["feed"], c["k"], c["mode"] if c["mode"] != "n/a" else "both")
        by_key.setdefault(key, {})[c["line"]] = res
    deltas = {}
    for key, lines in by_key.items():
        if "B" in lines and "A" in lines:
            deltas[str(key)] = causal_overhead(lines["B"]["_records"], lines["A"]["_records"])

    report = {
        "manifest": {k: manifest[k] for k in ("seed", "reader", "k", "creators_total")},
        "cells": [{k: c[k] for k in ("cell", "runs_requested", "queries_200", "timing_samples")} for c in all_cells],
        "summaries": {str(c["cell"]): c["summary"] for c in all_cells},
        "causal_overhead_B_minus_A": deltas,
    }
    with open(os.path.join(args.out, "report.json"), "w") as f:
        json.dump(report, f, indent=2)
    print(f"[bench] done; report -> {os.path.join(args.out, 'report.json')}")


if __name__ == "__main__":
    main()
