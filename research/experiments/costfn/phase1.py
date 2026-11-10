#!/usr/bin/env python3
"""Phase-1 runner — per-cell study trials on the frozen inputs, local only.

PROTOCOL §5 discipline, automated: >=3 independent trials per cell, a FRESH
disposable restore per trial, >=30 measured samples per cell after >=3
excluded warm-ups, randomized reader (seeded per trial), raw per-request
records + native ClickHouse metrics retained for every cell, and failed /
timed-out cells kept as results. $0, no cloud, one pinned engine (24.8),
pinned 5 GB ClickHouse allocation (research.compose.yml).

Study configurations (declared in PROTOCOL §4, 10.11.2026):
  B  — store-size scaling: K=20 dispersed, N in {10k, 100k, 1M}; winning
       configuration = D layout + sequence treatments (batched mode).
  C  — K cost function at N=1M: K in {20, 100, 1000} x {hot, dispersed};
       same winning configuration. K=1000 cells are expected to be hard;
       failures are the measured stress bound, not repaired mid-study.
  A  — mechanism repeat: K in {10, 100, 1000} dispersed, UN-treated Arm A
       query, readable-resolution mode varied (per-group = production
       default, batched = research). If bench.py's simplified query were
       used, captions would say mechanism-only; the real core-feed
       sequence is used, so no such caption is needed.
  P  — paired resolver ablation: >=20 pairs x >=3 trials on the D-layout
       stack with the treatments DISARMED (the comparator substitutes the
       resolver mapping inside the real compile path; a treated query
       would remove the resolver from the measured path and void the delta).
       Claim: resolver recomputation cost only.
  X  — attribution control (operator-declared): the main-query author-set
       treatment on the OLD Arm A key (author_key is a prefix on both
       keys) — prices mechanism vs layout separately.

Usage:
  python3 phase1.py schedule                 # write the cell schedule + seeds
  python3 phase1.py run <study> [cell ...]   # run trials for the cell(s)
  python3 phase1.py summarize <study>        # per-cell aggregation from receipts
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

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
P1 = REPO / ".context/p1"
PORT = 6095
TRIALS = 3
SAMPLE = {"users": 1, "interval": 5.0, "warmup": 15.0, "duration": 150.0, "drain": 60.0}
# 15 s warm-up = 3 excluded feeds; 150 s measured = 30 feeds at 5 s cadence.

PINNED_IDS = {
    "k20-1m-dispersed": "424cdf26029869728e73033921583160d47764d76175f2ec4b3f7b2a5d1ea0d2",
    "k20-1m-hot": "ed2e8a02c2c213eb12d4d2fb1ce78c1ec13b6f58b7de0c4f968eca0a45bbf637",
    "k100-1m-dispersed": "2fededb9dfd73ffca1d81904b5c3b96bad4d955f4fc6f3286d4dddec4ce74656",
    "k100-1m-hot": "017949e4ae89d87f28683cf07ae7e751070d1cabce9e4895ca6b48b42066c839",
    "k10-1m-dispersed": "880adce4e61aca0110d6ebbe6fbf14dd7aa136b1f4cebcf520357fd30b12b9d3",
    "k20-100k-dispersed": "43d14a2b8abd062ceed71c2952ca1fa34d386245adb4ad95fb75a9d77de6d92d",
    "k20-10k-dispersed": "6118af723d7918049d891f1245255d723e0e5a9f0ae951b746c3634aad0bd692",
    "k1000-1m-dispersed": "dbed2201952f9ca1b581c30a541e44b6912a5a6ba1bec84ee166aa80575132b4",
    "k1000-1m-hot": "53b16c1072a8e80032b20ae23c5675040b851274ad7a314a106b7557be3b5363",
}

CELLS = [
    # study, cell, input slot, layout (A = original key, D = re-keyed), treatment armed, resolver mode, kind
    ("B", "b-10k-d",  "k20-10k-dispersed",    "D", True,  "batched", "sample"),
    ("B", "b-100k-d", "k20-100k-dispersed",   "D", True,  "batched", "sample"),
    ("B", "b-1m-d",   "k20-1m-dispersed",     "D", True,  "batched", "sample"),
    ("C", "c-k20-d",  "k20-1m-dispersed",     "D", True,  "batched", "sample"),
    ("C", "c-k20-h",  "k20-1m-hot",           "D", True,  "batched", "sample"),
    ("C", "c-k100-d", "k100-1m-dispersed",    "D", True,  "batched", "sample"),
    ("C", "c-k100-h", "k100-1m-hot",          "D", True,  "batched", "sample"),
    ("C", "c-k1000-d", "k1000-1m-dispersed",  "D", True,  "batched", "sample"),
    ("C", "c-k1000-h", "k1000-1m-hot",        "D", True,  "batched", "sample"),
    ("A", "a-k10-pg", "k10-1m-dispersed",     "A", False, "per-group", "sample"),
    ("A", "a-k10-bt", "k10-1m-dispersed",     "A", False, "batched", "sample"),
    ("A", "a-k100-pg", "k100-1m-dispersed",   "A", False, "per-group", "sample"),
    ("A", "a-k100-bt", "k100-1m-dispersed",   "A", False, "batched", "sample"),
    ("A", "a-k1000-pg", "k1000-1m-dispersed", "A", False, "per-group", "sample"),
    ("A", "a-k1000-bt", "k1000-1m-dispersed", "A", False, "batched", "sample"),
    ("P", "p-k20",    "k20-1m-dispersed",     "D", False, "batched", "paired"),
    ("X", "x-k20-oldkey", "k20-1m-dispersed", "A", True,  "batched", "sample"),
]


def compose(project):
    return ["docker", "compose", "-f", str(HERE / "compose.yml"), "-f", str(HERE / "research.compose.yml"), "-p", project]


def run_cmd(cmd, env=None, timeout=1800, log=None):
    if log:
        with log.open("a") as handle:
            handle.write(f"$ {' '.join(cmd[:8])} ...\n")
            proc = subprocess.run(cmd, env=env, stdout=handle, stderr=subprocess.STDOUT, timeout=timeout)
    else:
        proc = subprocess.run(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
    if proc.returncode != 0:
        tail = proc.stdout.decode(errors="replace")[-2500:] if proc.stdout else "(no output; see log)"
        raise RuntimeError(f"command failed rc={proc.returncode}: {cmd[0]} {cmd[1] if len(cmd) > 1 else ''}\n{tail}")
    return proc


def ch_query(project, query, timeout=900):
    out = subprocess.run(compose(project) + ["exec", "-T", "clickhouse", "clickhouse-client",
                                            "--user", "web10", "--password", "web10", "--query", query],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
    if out.returncode != 0:
        raise RuntimeError(f"ch query failed: {out.stdout.decode(errors='replace')[-500:]}")
    return out.stdout.decode().strip()


def input_dir(slot):
    d = REPO / ".context/inputs" / slot
    if not (d / "manifest.json").exists():
        raise SystemExit(f"missing frozen input {slot}; generate it first (dataset_v2.py build ... --seed 42)")
    return d


def restore(slot, project, expected_id, outdir, log, warmups):
    run_cmd([sys.executable, str(HERE / "restore_v2.py"), str(input_dir(slot)),
             "--project", project, "--port", str(PORT), "--expected-id", expected_id,
             "--preflight-warmups", str(warmups), "--receipt", str(outdir / "restored.json")],
            log=log, timeout=5400)
    return json.loads((outdir / "restored.json").read_text())


def rekey(slot, receipt, outdir, log, no_live=False):
    cmd = [sys.executable, str(HERE / "arm_d.py"), str(input_dir(slot)),
           "--receipt", str(outdir / "restored.json"), "--out", str(outdir / "rekey.json")]
    if no_live:
        cmd.append("--no-live-parity")
    run_cmd(cmd, log=log, timeout=5400)
    return json.loads((outdir / "rekey.json").read_text())


def restart_api(project, treatment, mode):
    import os
    env = {**os.environ, "API_PORT": str(PORT), "COSTFN_ARM_D": "1" if treatment else "0",
           "COSTFN_RESOLVER": mode}
    run_cmd(compose(project) + ["up", "-d", "--force-recreate", "api"], env=env, timeout=900)
    # wait for /docs
    import urllib.request
    for _ in range(90):
        try:
            if urllib.request.urlopen(f"http://127.0.0.1:{PORT}/docs", timeout=3).status == 200:
                return
        except Exception:
            time.sleep(2)
    raise RuntimeError("research API did not become ready")


def native_breakdown(project, outdir, since_epoch):
    query = (
        "SELECT CASE WHEN query LIKE '%CASE d.author_key%' THEN 'main-treated' "
        "WHEN query LIKE 'WITH%' AND query LIKE '%ref_value IN (%' THEN 'followup-treated' "
        "WHEN query LIKE '%node_ad%' THEN 'ad-inventory' "
        "WHEN query LIKE 'WITH%' AND query LIKE '%group_id IN (%' THEN 'followup-armA' "
        "WHEN query LIKE 'WITH%' THEN 'main-armA' "
        "WHEN query LIKE '%groups/list%' THEN 'group-meta' ELSE 'other' END AS shape, "
        "count() AS n, round(avg(read_rows),0) AS avg_rows, round(avg(read_bytes)/1048576,1) AS avg_mb, "
        "round(avg(query_duration_ms),0) AS avg_ms, sum(exception_code != 0) AS failures "
        "FROM system.query_log WHERE type='QueryFinish' AND event_time >= toDateTime(%d) "
        "GROUP BY shape ORDER BY n DESC FORMAT JSONEachRow" % int(since_epoch))
    rows = json.loads("[]" if not ch_query(project, query) else ch_query(project, query))
    (outdir / "native.json").write_text(json.dumps(rows, indent=1) + "\n")
    return rows


def observer_harvest(project, outdir, since_epoch):
    proc = subprocess.run(compose(project) + ["logs", "--since", str(max(0, time.time() - (time.time() - since_epoch))),
                                              "--no-log-prefix", "api"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    lines = [l for l in proc.stdout.decode(errors="replace").splitlines() if "COSTFN_REQUEST=" in l]
    (outdir / "observer.log").write_text("\n".join(lines) + "\n")
    return len(lines)


def trial(study, cell, slot, layout, treatment, mode, kind, trial_no, seed, log):
    project = f"web10-costfn-frozen-p1-{study.lower()}-{cell.replace('-', '')}-t{trial_no}"
    outdir = P1 / study / cell / f"trial-{trial_no}"
    outdir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(f"{seed}:{study}:{cell}:{trial_no}")
    reader_index = rng.randrange(0, 20000) if kind == "sample" else None
    record = {"study": study, "cell": cell, "input": slot, "layout": layout, "treatment": treatment,
              "mode": mode, "kind": kind, "trial": trial_no, "seed": f"{seed}:{study}:{cell}:{trial_no}",
              "reader_index": reader_index, "project": project, "port": PORT,
              "started_utc": datetime.now(timezone.utc).isoformat()}
    warmups = 3 if "1m" in slot else 0
    try:
        since = time.time()
        restored = restore(slot, project, PINNED_IDS[slot], outdir, log, warmups)
        record["restore"] = {"complete": restored["complete"], "preparation_seconds": restored["preparation_seconds"],
                             "clickhouse_version": restored["clickhouse_version"]}
        if layout == "D":
            rekeyed = rekey(slot, restored, outdir, log, no_live=(kind == "paired"))
            record["rekey"] = {"kind": rekeyed.get("kind")}
        restart_api(project, treatment, mode)
        since = time.time()
        if kind == "sample":
            driver = outdir / "sample_driver.py"
            driver.write_text(f'''
import json, sys
from pathlib import Path
sys.path.insert(0, r"{HERE}")
import load_core
manifest = json.loads(Path(r"{input_dir(slot)}").read_text() if False else (Path(r"{input_dir(slot)}/manifest.json")).read_text())
outdir = Path(r"{outdir}/run"); outdir.mkdir(parents=True, exist_ok=True)
result = load_core.run_point("http://127.0.0.1:{PORT}", manifest, {SAMPLE['users']}, {SAMPLE['interval']},
                             {SAMPLE['warmup']}, {SAMPLE['duration']}, {SAMPLE['drain']}, outdir,
                             reader_indices=[{reader_index}])
(outdir / "summary.json").write_text(json.dumps(result, indent=2))
print(json.dumps({{"measured_completed": result["counts"].get("measured:completed", 0),
                   "measured_failed": result["counts"].get("measured:failed", 0),
                   "valid_offered_load": result["valid_offered_load"]}}))
''')
            proc = subprocess.run([sys.executable, str(driver)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                  timeout=3600, cwd=str(HERE))
            sample_out = proc.stdout.decode().strip().splitlines()[-1]
            record["sample"] = json.loads(sample_out) if sample_out else {}
            record["sample_rc"] = proc.returncode
        else:  # paired
            run_cmd([sys.executable, str(HERE / "paired_trial.py"), str(input_dir(slot)),
                     "--receipt", str(outdir / "restored.json"), "--out", str(outdir / "paired"),
                     "--pairs", "20", "--seed", str(rng.randrange(10**6))], log=log, timeout=3600)
        record["native_shapes"] = native_breakdown(project, outdir, since)
        record["observer_records"] = observer_harvest(project, outdir, since)
        record["completed_utc"] = datetime.now(timezone.utc).isoformat()
    except Exception as exc:
        record["error"] = f"{type(exc).__name__}: {str(exc)[:400]}"
        record["completed_utc"] = datetime.now(timezone.utc).isoformat()
    finally:
        (outdir / "trial.json").write_text(json.dumps(record, indent=1) + "\n")
        try:
            run_cmd(compose(project) + ["down", "-v", "--remove-orphans"], timeout=600)
        except RuntimeError:
            pass
        leftover = subprocess.run(["docker", "ps", "-a", "--filter", f"name={project}", "--format", "{{.Names}}"],
                                  stdout=subprocess.PIPE, text=True).stdout.strip()
        record["teardown_verified_empty"] = leftover == ""
        (outdir / "trial.json").write_text(json.dumps(record, indent=1) + "\n")
    return record


def schedule(args):
    P1.mkdir(parents=True, exist_ok=True)
    seed = args.seed
    doc = {"generated_utc": datetime.now(timezone.utc).isoformat(), "seed": seed, "port": PORT,
           "trials_per_cell": TRIALS, "sample": SAMPLE,
           "discipline": "fresh restore per trial; 30 measured feeds after 3 excluded warm-ups at 5 s cadence; "
                         "randomized fixture-reader index per trial; raw records + native metrics retained; "
                         "failures are results",
           "cells": [{"study": s, "cell": c, "input": slot, "layout": lay, "treatment": t,
                      "mode": m, "kind": k, "pinned_dataset_id": PINNED_IDS[slot]}
                     for (s, c, slot, lay, t, m, k) in CELLS]}
    (P1 / "phase1-schedule.json").write_text(json.dumps(doc, indent=1) + "\n")
    print(json.dumps({"schedule": str(P1 / "phase1-schedule.json"), "cells": len(CELLS),
                      "trials_total": len(CELLS) * TRIALS}, indent=2))


def summarize(study):
    out = {}
    for cell in sorted(p.name for p in (P1 / study).iterdir() if p.is_dir()):
        trials = []
        for t in sorted((P1 / study / cell).iterdir()):
            rj = t / "trial.json"
            if rj.exists():
                trials.append(json.loads(rj.read_text()))
        out[cell] = trials
    (P1 / f"phase1-{study}-summary.json").write_text(json.dumps(out, indent=1) + "\n")
    for cell, trials in out.items():
        print(cell, "->", [(t.get("trial"), t.get("sample", t.get("error", ""))) for t in trials])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd")
    p_sched = sub.add_parser("schedule")
    p_sched.add_argument("--seed", type=int, default=int(time.time()))
    p_run = sub.add_parser("run")
    p_run.add_argument("study", choices=[c[0] for c in CELLS])
    p_run.add_argument("cells", nargs="*")
    p_sum = sub.add_parser("summarize")
    p_sum.add_argument("study", choices=[c[0] for c in CELLS])
    args = parser.parse_args()
    if args.cmd == "schedule":
        schedule(args)
    elif args.cmd == "summarize":
        summarize(args.study)
    elif args.cmd == "run":
        cells = [c for c in CELLS if c[0] == args.study and (not args.cells or c[1] in args.cells)]
        if not cells:
            raise SystemExit("no cells selected")
        log = P1 / f"run-{args.study}.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        for (study, cell, slot, layout, treatment, mode, kind) in cells:
            for n in range(1, TRIALS + 1):
                outdir = P1 / study / cell / f"trial-{n}"
                if (outdir / "trial.json").exists():
                    print(f"[phase1] {study}/{cell} t{n} already has a receipt; skipping", flush=True)
                    continue
                print(f"[phase1] {study}/{cell} trial {n}/{TRIALS} "
                      f"(layout={layout} treatment={treatment} mode={mode} kind={kind})", flush=True)
                trial(study, cell, slot, layout, treatment, mode, kind, n, int(log.stat().st_mtime), log)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
