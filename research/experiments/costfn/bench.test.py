#!/usr/bin/env python3
"""Offline regression tests for bench.py — no droplet, no API, no Docker.

These pin the pure functions the experiment depends on: the `[query] timing_ms`
log parser, the percentile math, the per-phase summary, the policy-total
(execute excluded), the causal-overhead (B−A) delta, the matrix expansion, and
the per-cell env derivation. If any of these drifts, the paper's numbers are
wrong even if the harness "runs" — so they're tested here, offline, the same
way the social runner's orchestration is tested without a connected stack.

Run:  python3 research/experiments/costfn/bench.test.py
"""

import os
import sys
import ast
import json
import tempfile
from unittest.mock import patch, Mock

sys.path.insert(0, os.path.dirname(__file__))
import bench  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILED.append(name)


# ── parse_timing_lines ───────────────────────────────────────────────────────

SAMPLE_LOG = """
some other log line noise
[query] id=aaaa timing_ms auth=1.00 app_contract=0.50 parse_validate=0.20 candidates=0.30 readable=5.00 group_meta=0.40 compile=0.60 execute=12.00 serialize=0.10 prepare=0.05 total=20.15
[query] id=bbbb timing_ms auth=1.10 app_contract=0.55 parse_validate=0.25 candidates=0.35 readable=6.00 group_meta=0.45 compile=0.70 execute=13.00 serialize=0.15 prepare=0.06 total=22.61
[query] id=aaaa timing_ms auth=1.00 app_contract=0.50 parse_validate=0.20 candidates=0.30 readable=5.00 group_meta=0.40 compile=0.60 execute=12.00 serialize=0.10 prepare=0.05 total=20.15
not a timing line
"""


def test_parse():
    recs = bench.parse_timing_lines(SAMPLE_LOG)
    check("parse: two unique records (dedup by id)", len(recs) == 2, f"got {len(recs)}")
    check("parse: phase values captured", recs[0]["readable"] == 5.0 and recs[0]["execute"] == 12.0)
    check("parse: all phases present", all(p in recs[0] for p in bench.PHASES))
    check("parse: empty input -> empty list", bench.parse_timing_lines("") == [])
    check("parse: noise-only -> empty list", bench.parse_timing_lines("hello\nworld\n") == [])


# ── percentile ───────────────────────────────────────────────────────────────


def test_percentile():
    data = [1.0, 2.0, 3.0, 4.0, 5.0]
    check("pct: p50 of 1..5 is 3", bench.percentile(sorted(data), 50) == 3.0)
    check("pct: p0 is min", bench.percentile(sorted(data), 0) == 1.0)
    check("pct: p100 is max", bench.percentile(sorted(data), 100) == 5.0)
    check("pct: empty -> None", bench.percentile([], 50) is None)
    check("pct: single element", bench.percentile([7.0], 95) == 7.0)
    # Linear interpolation: p95 of 1..20 (n=20) -> k=18.05 -> 19 + 0.05*(20-19)=19.05
    check("pct: interpolated p95 of 1..20", bench.percentile(list(range(1, 21)), 95) == 19.05,
          f"got {bench.percentile(list(range(1, 21)), 95)}")


# ── summarize ────────────────────────────────────────────────────────────────


def test_summarize():
    recs = bench.parse_timing_lines(SAMPLE_LOG)
    s = bench.summarize(recs)
    check("summarize: n counts samples", s["readable"]["n"] == 2)
    check("summarize: p50 computed", s["readable"]["p50"] == 5.5)  # median of 5,6
    check("summarize: missing phase -> n 0", bench.summarize([])["total"]["n"] == 0)


# ── policy_total (execute excluded) ──────────────────────────────────────────


def test_policy_total():
    rec = bench.parse_timing_lines(SAMPLE_LOG)[0]
    # policy layer = total - execute (the scan held out). For the sample record:
    # total 18.15 - execute 12.0 = 6.15.
    expected = rec["total"] - rec["execute"]
    check("policy_total excludes execute", abs(bench.policy_total(rec) - expected) < 1e-3,
          f"{bench.policy_total(rec)} vs {expected}")
    check("policy_total uses POLICY_PHASES", "execute" not in bench.POLICY_PHASES and "total" not in bench.POLICY_PHASES)


# ── causal_overhead (B − A) ──────────────────────────────────────────────────


def _rec(readable, execute):
    base = {p: 0.0 for p in bench.PHASES}
    base["readable"] = readable
    base["execute"] = execute
    base["total"] = sum(base.values())
    return base


def test_causal_overhead():
    # B has a higher readable cost than A; execute differs but is excluded from
    # the policy overhead.
    b_recs = [_rec(10.0, 100.0), _rec(12.0, 110.0)]
    a_recs = [_rec(2.0, 100.0), _rec(3.0, 110.0)]
    d = bench.causal_overhead(b_recs, a_recs)
    check("overhead: not None when both sides have data", d is not None)
    # policy total B median = (10+12)/2 = 11 (execute excluded); A = (2+3)/2 = 2.5
    check("overhead: B policy median", d["b_policy_median_ms"] == 11.0, f"got {d['b_policy_median_ms']}")
    check("overhead: A policy median", d["a_policy_median_ms"] == 2.5, f"got {d['a_policy_median_ms']}")
    check("overhead: delta = B - A", d["overhead_median_ms"] == 8.5, f"got {d['overhead_median_ms']}")
    check("overhead: total delta kept separate from policy delta", d["total_delta_median_ms"] == 8.5)
    # per-phase readable delta: median([10,12]) - median([2,3]) = 11 - 2.5 = 8.5
    check("overhead: per-phase delta for readable", d["per_phase_delta_ms"]["readable"] == 8.5,
          f"got {d['per_phase_delta_ms'].get('readable')}")
    check("overhead: None when A empty", bench.causal_overhead(b_recs, []) is None)
    check("overhead: None when B empty", bench.causal_overhead([], a_recs) is None)


# ── expand_matrix ────────────────────────────────────────────────────────────


def test_expand_matrix():
    cells = bench.expand_matrix([10, 100], ["personal", "discover"], ["per-group", "batched"], ["A", "B", "C"])
    # personal: K in {10,100} -> A(1) + B*2modes + C*2modes = 5 each => 10
    # discover: K=1 only   -> A(1) + B*2modes + C*2modes = 5
    # total = 15.
    check("matrix: total cell count", len(cells) == 15, f"got {len(cells)}")
    disc = [c for c in cells if c["feed"] == "discover"]
    check("matrix: discover always K=1", all(c["k"] == 1 for c in disc))
    check("matrix: discover line A has one mode (n/a)", sum(1 for c in disc if c["line"] == "A") == 1)
    pers = [c for c in cells if c["feed"] == "personal"]
    check("matrix: personal sweeps K", {c["k"] for c in pers} == {10, 100})
    check("matrix: every cell has feed/k/mode/line", all(set(c) == {"feed", "k", "mode", "line"} for c in cells))


# ── env_for_cell ─────────────────────────────────────────────────────────────


def test_env_for_cell():
    base = {"CLICKHOUSE_HOST": "clickhouse"}
    a = bench.env_for_cell({"line": "A", "mode": "n/a"}, base)
    check("env A: HTTP policy remains enabled for direct baseline", a.get("QUERY_EVAL_NO_POLICY") == "0")
    check("env A: stub off + mode default", a["QUERY_EVAL_STUB_EXECUTE"] == "0" and a["QUERY_EVAL_READABLE_MODE"] == "per-group")
    check("env A: base preserved", a.get("CLICKHOUSE_HOST") == "clickhouse")

    c_pg = bench.env_for_cell({"line": "C", "mode": "per-group"}, base)
    check("env C: STUB set", c_pg.get("QUERY_EVAL_STUB_EXECUTE") == "1")
    check("env C: NO_POLICY off", c_pg["QUERY_EVAL_NO_POLICY"] == "0")
    check("env C: mode per-group", c_pg.get("QUERY_EVAL_READABLE_MODE") == "per-group")

    c_bat = bench.env_for_cell({"line": "C", "mode": "batched"}, base)
    check("env C batched: mode batched", c_bat.get("QUERY_EVAL_READABLE_MODE") == "batched")

    b = bench.env_for_cell({"line": "B", "mode": "batched"}, base)
    check("env B: neither flag enabled", b["QUERY_EVAL_NO_POLICY"] == b["QUERY_EVAL_STUB_EXECUTE"] == "0")
    check("env B: mode batched", b.get("QUERY_EVAL_READABLE_MODE") == "batched")

    # Line A with a non-n/a mode still clears the mode (A ignores resolution).
    a2 = bench.env_for_cell({"line": "A", "mode": "batched"}, base)
    check("env A: mode reset even if set", a2["QUERY_EVAL_READABLE_MODE"] == "per-group")


def test_orchestration():
    with patch.object(bench.subprocess, "run") as run:
        env = bench.env_for_cell({"line": "B", "mode": "batched"}, {"QUERY_EVAL_NO_POLICY": "1"})
        bench._restart_api('docker compose -f "path with spaces/compose.yml"', env)
        args, kwargs = run.call_args
        check("compose: no invalid -e and quoted path preserved", "-e" not in args[0] and "path with spaces/compose.yml" in args[0])
        check("compose: subprocess environment resets stale flag", kwargs["env"]["QUERY_EVAL_NO_POLICY"] == "0")
        check("compose: recreate API only", "--no-deps" in args[0])
    response = Mock(stdout='COSTFN_BASELINE=[{"execute": 2, "total": 2}]\n')
    with patch.object(bench.subprocess, "run", return_value=response) as run:
        records = bench.baseline_records("docker compose", bench.PERSONAL_SQL, ["g"], "reader", 1)
        check("baseline: direct CH scan, no invented posts table", "sq.build_safe_query" in run.call_args.args[0][-2])
        check("baseline: policy phases zero", bench.policy_total(records[0]) == 0)
    with tempfile.TemporaryDirectory() as out:
        manifest = {"seed": 42, "reader": "r", "k": 10, "creators_total": 10, "followed": list(range(10))}
        path = os.path.join(out, "manifest.json")
        with open(path, "w") as f:
            json.dump(manifest, f)
        def collect(compose, api, manifest, cell, runs, out):
            return {"cell": cell, "runs_requested": runs, "queries_200": runs,
                    "queries_completed": runs, "transport": "fixture",
                    "timing_samples": runs, "summary": {}, "_records": [_rec(0 if cell["line"] == "A" else 5, 2)]}
        with patch.object(sys, "argv", ["bench.py", "--manifest", path, "--out", out, "--k", "10", "--runs", "3"]), patch.object(bench, "collect_cell", side_effect=collect):
            bench.main()
        with open(os.path.join(out, "report.json")) as f:
            report = json.load(f)
        check("report: shared A baseline pairs with both B modes and feeds", len(report["causal_overhead_B_minus_A"]) == 4)


def test_seed():
    import seed
    with patch.object(seed, "_post", return_value={"group_id": "g"}) as post:
        seed.create_followers_group(None, "token", "followers")
        payload = post.call_args.args[2]
        check("seed: real snake_case group schema", payload["join_policy"] == "open" and payload["members"][0] == {"member_key": "anyone", "role": "member"})
        check("seed: join role defined", any(r["name"] == "member" for r in payload["roles"]))
        seed.join_group(None, "token", "g")
        check("seed: join group_id", post.call_args.args[2]["group_id"] == "g")
        seed.post(None, "token", "g", "text")
        check("seed: real document endpoint", post.call_args.args[1] == "/v3/create")
    with open(seed.__file__) as f:
        ast.parse(f.read())
    check("seed: imports and compiles", True)


def main():
    test_parse()
    test_percentile()
    test_summarize()
    test_policy_total()
    test_causal_overhead()
    test_expand_matrix()
    test_env_for_cell()
    test_orchestration()
    test_seed()
    print()
    if FAILED:
        print(f"{len(FAILED)} FAILED: {FAILED}")
        sys.exit(1)
    print("all bench offline tests passed")


if __name__ == "__main__":
    main()
