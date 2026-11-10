#!/usr/bin/env python3
"""The counting_numbers satellite (PROTOCOL Phase-1.5 amendment, declared
before any run it affects).

One GENERIC typed satellite, named after a type, never after an app or
feature (D60): counting_numbers(doc_id, counter_name, value)
ORDER BY (doc_id, counter_name). counter_name is application-supplied
DATA — this study's values are 'reactions:like', 'reactions:dislike'
(the app oracle needs the like/dislike split; the split is data, not
schema) and 'comments'. The wider typed family is not built here.

Build = snapshot, dedup-correct: latest version per (doc_id, author_key)
FIRST (rn = 1, deleted = 0 — the tombstone invariant, dedup before
filter), then COUNT DISTINCT live engagement doc_ids grouped by
ref_value, one row per (target doc_id, counter_name). Counting raw
rows/versions is a correctness bug, not an estimate. Rebuild is
wholesale (TRUNCATE + INSERT) — a snapshot with a declared freshness
contract, never incremental maintenance.

CLI:
  python3 satellite.py build  --project <web10-costfn-frozen-*> --receipt <restore receipt> --out <receipt.json>
"""
import argparse
import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import provenance
import restore_dataset
import topology

DDL = """CREATE TABLE IF NOT EXISTS counting_numbers (
    doc_id String,
    counter_name String,
    value Int64
) ENGINE = ReplacingMergeTree ORDER BY (doc_id, counter_name)"""

# Latest version per (doc_id, author_key) FIRST — dedup before filter.
_LIVE = ("(SELECT doc_id, author_key, collection_name, body, ref_value FROM "
         "(SELECT doc_id, author_key, collection_name, body, ref_value, deleted, "
         "row_number() OVER (PARTITION BY doc_id, author_key ORDER BY updated_at DESC, deleted DESC) AS rn "
         "FROM documents) WHERE rn = 1 AND deleted = 0)")

BUILD_SQL = (
    "INSERT INTO counting_numbers "
    f"SELECT ref_value, 'reactions:like' AS counter_name, count(DISTINCT doc_id) AS value FROM {_LIVE} "
    "WHERE collection_name = 'reactions' AND ref_value != '' AND JSONExtractString(body, 'type') = 'like' "
    "GROUP BY ref_value HAVING count(DISTINCT doc_id) > 0 "
    "UNION ALL "
    f"SELECT ref_value, 'reactions:dislike', count(DISTINCT doc_id) FROM {_LIVE} "
    "WHERE collection_name = 'reactions' AND ref_value != '' AND JSONExtractString(body, 'type') = 'dislike' "
    "GROUP BY ref_value HAVING count(DISTINCT doc_id) > 0 "
    "UNION ALL "
    f"SELECT ref_value, 'comments', count(DISTINCT doc_id) FROM {_LIVE} "
    "WHERE collection_name = 'comments' AND ref_value != '' "
    "GROUP BY ref_value HAVING count(DISTINCT doc_id) > 0"
)


def ch(receipt, query, timeout=1800):
    env = topology.environment(receipt, os.environ) if receipt.get("docker_contexts") else os.environ.copy()
    return restore_dataset.run(
        topology.commands(receipt) + ["exec", "-T", "clickhouse",
            "clickhouse-client", "--user", "web10", "--password", "web10", "--database", "web10",
            "--query", query], env, timeout=timeout).decode().strip()


def build(project, receipt_path, out_path):
    r = json.loads(Path(receipt_path).read_text())
    if not (r.get("complete") and r.get("research_observer")):
        raise ValueError("completed local research restore receipt required")
    if not r["project"].startswith("web10-costfn-frozen-"):
        raise ValueError("the satellite is a research-stack treatment; refuses non-disposable projects")
    if r["project"] != project:
        raise ValueError("project name does not match the restore receipt")
    t0 = time.time()
    ch(r, DDL, timeout=300)
    ch(r, "TRUNCATE TABLE counting_numbers", timeout=300)  # wholesale snapshot rebuild (freshness contract)
    ch(r, BUILD_SQL, timeout=3600)
    build_seconds = round(time.time() - t0, 2)

    stats = {}
    for name in ("reactions:like", "reactions:dislike", "comments"):
        rows = int(ch(r, f"SELECT count() FROM counting_numbers WHERE counter_name = '{name}'", timeout=300))
        total = int(ch(r, f"SELECT sum(value) FROM counting_numbers WHERE counter_name = '{name}'", timeout=300))
        distinct = int(ch(r, f"SELECT count(DISTINCT doc_id) FROM counting_numbers WHERE counter_name = '{name}'", timeout=300))
        stats[name] = {"rows": rows, "value_total": total, "distinct_target_docs": distinct}
    receipt_doc = {
        "kind": "COUNTING_NUMBERS_SATELLITE_BUILD",
        "utc": datetime.now(timezone.utc).isoformat(),
        "project": project,
        "source_dataset_id": r["dataset_id"],
        "ddl": DDL,
        "build_sql_sha256": hashlib.sha256(BUILD_SQL.encode()).hexdigest(),
        "build_seconds": build_seconds,
        "counters": stats,
        "total_rows": sum(s["rows"] for s in stats.values()),
        "dedup": "latest version per (doc_id, author_key) first (rn = 1, deleted = 0); count DISTINCT live engagement docs per ref_value",
        "freshness_contract": "snapshot of the frozen input; rebuilt after any fixture or lifecycle writes and "
                              "before every measured window; NOT incrementally maintained; a measured feed whose "
                              "counts could postdate the last rebuild invalidates the cell (rebuild, re-run)",
        "generality": "counter_name is application-supplied data (this study: reactions:like / reactions:dislike / "
                      "comments); no app or feature words in the schema; D60",
        "sources": provenance.sources(),
    }
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(receipt_doc, indent=1) + "\n")
    print(json.dumps({"receipt": str(out), "total_rows": receipt_doc["total_rows"],
                      "build_seconds": build_seconds}, indent=2))
    return receipt_doc


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["build"])
    parser.add_argument("--project", required=True)
    parser.add_argument("--receipt", required=True, help="completed local research restore receipt")
    parser.add_argument("--out", required=True, help="satellite build receipt path")
    args = parser.parse_args()
    build(args.project, args.receipt, args.out)
