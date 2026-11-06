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
import subprocess
from pathlib import Path
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
    check("parse: query ID retained for traceability", recs[0]["query_id"] == "aaaa")
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
        def collect(compose, api, manifest, cell, runs, out, warmup):
            return {"cell": cell, "runs_requested": runs, "queries_200": runs,
                    "queries_completed": runs, "transport": "fixture",
                    "timing_samples": runs, "summary": {}, "_records": [_rec(0 if cell["line"] == "A" else 5, 2)]}
        with patch.object(sys, "argv", ["bench.py", "--manifest", path, "--out", out, "--k", "10", "--runs", "3"]), patch.object(bench, "collect_cell", side_effect=collect):
            bench.main()
        with open(os.path.join(out, "report.json")) as f:
            report = json.load(f)
        check("report: shared A baseline pairs with both B modes and feeds", len(report["causal_overhead_B_minus_A"]) == 4)
        check("report: explicit noncausal scope", "NOT paired causal" in report["comparison_scope"])
        with open(os.path.join(out, "schedule.json")) as f:
            schedule = json.load(f)
        check("schedule: seed, warmup and ordered cells persisted", schedule["order_seed"] == 42 and schedule["warmup"] == 3 and len(schedule["cells"]) == 10)


def test_repeat_receipts():
    cells = bench.expand_matrix([10, 100, 1000], ["personal", "discover"], ["per-group", "batched"], ["A", "B", "C"])
    order = bench.ordered_cells(cells, 42)
    check("order: reproducible", order == bench.ordered_cells(cells, 42))
    check("order: shuffled without changing matrix", order != cells and len(order) == len(cells) and all(c in order for c in cells))
    check("order: different trial seed changes order", order != bench.ordered_cells(cells, 43))
    check("order: input unchanged", cells == bench.expand_matrix([10, 100, 1000], ["personal", "discover"], ["per-group", "batched"], ["A", "B", "C"]))
    records = [_rec(1000, 1), _rec(2, 1), _rec(4, 1)]
    manifest = {"reader": "reader", "password": "not-logged", "followed": ["c"], "creator_groups": {"c": "g"}}
    cell = {"line": "B", "feed": "personal", "k": 1, "mode": "batched"}
    with tempfile.TemporaryDirectory() as out, patch.object(bench, "_restart_api"), patch.object(bench, "_api_up", return_value=True), patch.object(bench, "_login", return_value="not-logged"), patch.object(bench, "_run_queries", return_value=3) as query, patch.object(bench, "_tail_api_logs", return_value="logs"), patch.object(bench, "parse_timing_lines", return_value=records), patch.object(bench.time, "sleep"):
        result = bench.collect_cell("compose", "api", manifest, cell, 2, out, 1)
        check("warmup: issued plus measured requests", query.call_args.args[4] == 3)
        check("warmup: excluded from percentile", result["summary"]["readable"]["p50"] == 3)
        with open(os.path.join(out, "cell-B-personal-k1-batched.json")) as f:
            receipt = json.load(f)
        check("raw: retained every measured sample", receipt["records"] == records[1:])
        check("raw: warmup retained separately", receipt["warmup_records"] == records[:1])
        check("raw: credentials absent", "not-logged" not in json.dumps(receipt))
        try:
            bench.collect_cell("compose", "api", manifest, cell, 2, out, 1)
        except FileExistsError:
            check("raw: refuses to overwrite a completed cell", True)
        else:
            check("raw: refuses to overwrite a completed cell", False)
    cell = {**cell, "line": "A", "mode": "n/a"}
    with tempfile.TemporaryDirectory() as out, patch.object(bench, "_restart_api"), patch.object(bench, "_api_up", return_value=True), patch.object(bench, "_login", return_value="not-logged"), patch.object(bench, "baseline_records", return_value=records) as baseline:
        result = bench.collect_cell("compose", "api", manifest, cell, 2, out, 1)
        check("baseline warmup: requested and excluded", baseline.call_args.args[-1] == 3 and result["summary"]["readable"]["p50"] == 3)
        check("baseline accounting: direct executions are not HTTP", result["queries_completed"] == 2 and result["queries_200"] == 0 and result["warmup_excluded"] == 1)
    with tempfile.TemporaryDirectory() as out, patch.object(bench, "_restart_api"), patch.object(bench, "_api_up", return_value=True), patch.object(bench, "_login", return_value="not-logged"), patch.object(bench, "baseline_records", return_value=records[:1]):
        try:
            bench.collect_cell("compose", "api", manifest, cell, 2, out, 1)
        except RuntimeError:
            with open(os.path.join(out, "cell-A-personal-k1-n-a.json")) as f:
                receipt = json.load(f)
            check("short cell: raw observations retained, no valid summary", receipt["complete"] is False and receipt["observed_timings_unclassified"] == records[:1] and "summary" not in receipt)
        else:
            check("short cell: rejects incomplete observations", False)


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


def test_schema_startup_retry():
    # Execute the actual shell loop against a fake compose command that models
    # the temporary-server handoff. This is orchestration, not a DB smoke test.
    source = Path(__file__).with_name("run.sh").read_text()
    start = source.index("for template in ../../../clickhouse-init/*.sql.template; do")
    stop = source.index('\n$COMPOSE up -d --no-deps api', start)
    loop = source[start:stop]
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        fake = root / "fake-compose"
        fake.write_text('#!/usr/bin/env python3\nimport os,pathlib,sys\np=pathlib.Path(os.environ["COUNT_FILE"])\nn=int(p.read_text())+1 if p.exists() else 1\np.write_text(str(n))\nsys.exit(210 if n == 2 or os.environ.get("ALWAYS_FAIL") else 0)\n')
        fake.chmod(0o755)
        sleep = root / "sleep"
        sleep.write_text('#!/bin/sh\nexit 0\n')
        sleep.chmod(0o755)
        count = root / "count"
        env = {**os.environ, "COMPOSE": str(fake), "COUNT_FILE": str(count),
               "PATH": str(root) + os.pathsep + os.environ["PATH"]}
        result = subprocess.run(["bash", "-c", "set -euo pipefail\n" + loop],
                                cwd=Path(__file__).parent, env=env, capture_output=True, text=True, timeout=10)
        check("schema: retries refusal between templates", result.returncode == 0 and count.read_text() == "3" and "retrying" in result.stdout)
        count.unlink()
        result = subprocess.run(["bash", "-c", "set -euo pipefail\n" + loop],
                                cwd=Path(__file__).parent, env={**env, "ALWAYS_FAIL": "1"}, capture_output=True, text=True, timeout=10)
        check("schema: failure is bounded, API never started", result.returncode == 1 and count.read_text() == "60" and "schema failed" in result.stderr)


def main():
    test_parse()
    test_percentile()
    test_summarize()
    test_policy_total()
    test_causal_overhead()
    test_expand_matrix()
    test_env_for_cell()
    test_orchestration()
    test_repeat_receipts()
    test_seed()
    test_schema_startup_retry()
    print()
    if FAILED:
        print(f"{len(FAILED)} FAILED: {FAILED}")
        sys.exit(1)
    print("all bench offline tests passed")


if __name__ == "__main__":
    main()
