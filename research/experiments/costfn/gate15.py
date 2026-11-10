#!/usr/bin/env python3
"""Phase-1.5 gate — the counting_numbers satellite on the K=20/1M D stack.

Task gates (receipts retained either way):
  1. Count parity: satellite follow-up counts equal the Step-1 treated
     follow-up outputs on every probe — checked natively (the same 20 IDs
     through both compiled forms) AND on every measured feed (the feed
     oracle IS the Step-1 output contract). Disagreement = the arm is
     INVALID; the oracle is never adjusted.
  2. Sequence gate re-run on the same stack/input: all measured feeds
     200, lifecycle 7/7 before+after, CH alive at the pinned 5 GB; the
     per-shape native table is published and the follow-ups must show
     point-seek scale in the native log (large rows read = the key is not
     being used -> investigate, do not report around it).
  3. Ablation statement: sequence bytes/request before (~255 MB, the
     Step-1 gate receipt) vs after; follow-up rows/bytes before vs after.

Freshness contract (PROTOCOL): the satellite is built before the gate,
rebuilt AFTER the lifecycle-before writes and BEFORE the measured window
(lifecycle controls write documents; the snapshot must not predate them
in any way that the measured counts could see).
"""
import argparse
import json
import os
import subprocess
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import arm_d_rewrite
import asyncio
import core_feed
import dataset_v2
import lifecycle
import load_core
import phase1
import satellite

PORT = 6097
OUT = phase1.P1 / "phase15-gate"
SLOT = "k20-1m-dispersed"
PROJECT = "web10-costfn-frozen-p15-gate"
READERS = ("c42-reader", "c42-r000001")


def ch(project, query, timeout=900):
    out = subprocess.run(phase1.compose(project) + ["exec", "-T", "clickhouse", "clickhouse-client",
                                                    "--user", "web10", "--password", "web10",
                                                    "--database", "web10", "--query", query],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
    if out.returncode != 0:
        raise RuntimeError(f"ch: {out.stdout.decode(errors='replace')[-400:]}")
    return out.stdout.decode().strip()


def post_ids_for(index, recipe):
    return [dataset_v2.doc_id(dataset_v2.creator(recipe, i), "posts")
            for i in sorted(dataset_v2.followed_indices(recipe, index), reverse=True)[:20]]


def step1_followup_sql(service, reader, groups, ids):
    """The Step-1 treated form, parameterised from the pinned golden."""
    raw = arm_d_rewrite._followup_template_raw(service)
    return arm_d_rewrite.transform_followup(
        raw.replace("{GROUPS}", ", ".join(f"'{g}'" for g in groups))
           .replace("{IDS}", ", ".join(f"'{i}'" for i in ids))
           .replace("{READER}", reader), reader, service)


def native_a_b_parity(recipe, manifest, record):
    provider_groups = [f"api.localhost/groups/users/c42-c{i:06d}/followers" for i in range(20)]
    groups = provider_groups + ["api.localhost/groups/web10/discover"]
    parity = []
    for index in (0, 1):
        reader = manifest["readers"][index]
        ids = post_ids_for(index, recipe)
        for service in ("reactions", "comments"):
            step1 = step1_followup_sql(service, reader, groups, ids)
            sat = arm_d_rewrite.satellite_followup_sql(service, ids)
            s1_rows = [line for line in ch(PROJECT, step1 + " FORMAT TSVRaw").splitlines() if line]
            sat_rows = [line for line in ch(PROJECT, sat + " FORMAT TSVRaw").splitlines() if line]
            ok = s1_rows == sat_rows
            parity.append({"reader_index": index, "service": service, "step1_rows": len(s1_rows),
                           "satellite_rows": len(sat_rows), "identical": ok,
                           "step1_sample": s1_rows[:2], "satellite_sample": sat_rows[:2]})
            if not ok:
                raise RuntimeError(f"count parity FAILED reader {index} {service}: {s1_rows[:2]} vs {sat_rows[:2]}")
    record["gate1_count_parity"] = {"probes": parity, "result": "PASS — identical on every probe"}
    return parity


def restart_api_satellite():
    env = {**os.environ, "API_PORT": str(PORT), "COSTFN_ARM_D": "1", "COSTFN_SATELLITE": "1",
           "COSTFN_RESOLVER": "batched"}
    subprocess.run(phase1.compose(PROJECT) + ["up", "-d", "--force-recreate", "api"], env=env,
                   stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, timeout=600, check=True)
    for _ in range(90):
        try:
            if urllib.request.urlopen(f"http://127.0.0.1:{PORT}/docs", timeout=3).status == 200:
                return
        except Exception:
            time.sleep(2)
    raise RuntimeError("research API did not become ready")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-restore", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    log = OUT / "gate.log"
    record = {"gate": "PHASE15_SATELLITE", "project": PROJECT, "input": SLOT,
              "dataset_id": phase1.PINNED_IDS[SLOT], "port": PORT,
              "started_utc": datetime.now(timezone.utc).isoformat(),
              "allocation": "pinned 5 GB ClickHouse (research.compose.yml)",
              "config": {"layout": "D", "main_treatment": True, "followup_form": "satellite-point-seek",
                         "inventory_ttl": 60.0, "mode": "batched"}}
    try:
        manifest = json.loads((phase1.input_dir(SLOT) / "manifest.json").read_text())
        if not args.skip_restore:
            restored = phase1.restore(SLOT, PROJECT, phase1.PINNED_IDS[SLOT], OUT, log, warmups=6)
            record["restore"] = {"complete": restored["complete"], "clickhouse_version": restored["clickhouse_version"]}
            rekeyed = phase1.rekey(SLOT, restored, OUT, log)
            record["rekey"] = {"kind": rekeyed.get("kind")}
        receipt_path = OUT / "restored.json"

        # Satellite build #1 (pre-lifecycle snapshot).
        record["satellite_build_1"] = satellite.build(PROJECT, str(receipt_path), str(OUT / "satellite-1.json"))

        restart_api_satellite()

        # Gate 1 — native A/B count parity (before any measured traffic).
        native_a_b_parity(manifest["recipe"], manifest, record)

        # Lifecycle before (writes documents) -> satellite rebuild (freshness
        # contract) -> measured window.
        base = f"http://127.0.0.1:{PORT}"
        before = asyncio.run(lifecycle.controls(base, manifest))
        (OUT / "lifecycle-before.json").write_text(json.dumps(before, indent=1) + "\n")
        record["lifecycle_before"] = before["passed"]
        record["satellite_build_2"] = satellite.build(PROJECT, str(receipt_path), str(OUT / "satellite-2.json"))

        run_out = OUT / "run"
        run_out.mkdir(exist_ok=True)
        result = asyncio.run(load_core.run_point(base, manifest, 2, 5.0, 5.0, 10.0, 60.0, run_out))
        (run_out / "summary.json").write_text(json.dumps(result, indent=2))
        record["measured"] = {k: v for k, v in result["counts"].items()}
        record["valid_offered_load"] = result["valid_offered_load"]
        request_counts = result["request_counts"]
        record["request_counts"] = request_counts

        after = asyncio.run(lifecycle.controls(base, manifest))
        (OUT / "lifecycle-after.json").write_text(json.dumps(after, indent=1) + "\n")
        record["lifecycle_after"] = after["passed"]

        record["native_shapes"] = phase1.native_breakdown(PROJECT, OUT, time.time() - 900)
        record["observer_records"] = phase1.observer_harvest(PROJECT, OUT, time.time() - 900)

        fu = [x for x in record["native_shapes"] if x["shape"] in ("followup-satellite", "followup-treated")]
        record["gate2_followup_scale"] = fu or "NO FOLLOW-UP SHAPE IN THE NATIVE LOG — investigate"
        record["gate2_result"] = (all(v == 0 for k, v in request_counts.items() if "400" in k or "500" in k)
                                  and all(request_counts.get(f"measured:{k}:200", 0) == 4
                                          for k in ("main", "reactions", "comments", "views")))
        record["gate2"] = "PASS" if record["gate2_result"] else "FAIL"

        # Gate 3 — ablation statement vs the Step-1 gate receipt.
        before_tbl = {"main": "82k rows / 2.8 MB", "followups": "3.19M rows / 126 MB each",
                      "sequence": "~255 MB native per request (evidence/phase0-armd-20261110.json)"}
        record["gate3_ablation"] = {"before": before_tbl,
                                    "after": {f"{x['shape']}": f"{x['avg_rows']} rows / {x['avg_mb']} MB"
                                               for x in record["native_shapes"]},
                                    "note": "before = the preserved Step-1 gate; after = this gate's native log"}
        ch_alive = ch(PROJECT, "SELECT 1") == "1"
        record["clickhouse_alive_at_pinned_cap"] = ch_alive
        record["result"] = "PASS" if (record["gate2_result"] and record["gate1_count_parity"]["result"].startswith("PASS")
                                     and record["lifecycle_before"] and record["lifecycle_after"] and ch_alive) else "FAIL"
        record["completed_utc"] = datetime.now(timezone.utc).isoformat()
    except Exception as exc:
        record["error"] = f"{type(exc).__name__}: {str(exc)[:300]}"
        record["completed_utc"] = datetime.now(timezone.utc).isoformat()
        record["result"] = "ERROR (receipt retained; teardown next)"
    finally:
        (OUT / "gate.json").write_text(json.dumps(record, indent=1) + "\n")
        try:
            phase1.run_cmd(phase1.compose(PROJECT) + ["down", "-v", "--remove-orphans"], timeout=600)
        except Exception:
            pass
        record["teardown_verified_empty"] = subprocess.run(
            ["docker", "ps", "-a", "--filter", f"name={PROJECT}", "--format", "{{.Names}}"],
            stdout=subprocess.PIPE, text=True).stdout.strip() == ""
        (OUT / "gate.json").write_text(json.dumps(record, indent=1) + "\n")
    print(json.dumps({k: record.get(k) for k in ("result", "gate1_count_parity", "gate2", "gate2_result", "error")},
                     indent=1)[:2000])


if __name__ == "__main__":
    main()
