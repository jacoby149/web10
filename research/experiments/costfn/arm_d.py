#!/usr/bin/env python3
"""Arm D — re-key the research stack's documents table on the frozen input.

PLAN.md §8 production-migration mechanics, dry-run on a disposable research
project: create ``documents_armd`` with
``ORDER BY (author_key, created_at, doc_id, updated_at)`` — the date in the
MIDDLE (first would break the author-prefix ownership lookup; last would
sort only versions of one doc) — ``INSERT SELECT`` the copy (the copy IS the
re-sort), parity checks (row counts, per-author distribution, content hash,
exact spot-document lookups, feed output old vs new on the live stack), then
flip with the old table retained as the rollback path. All other tables stay
byte-identical. Every step is receipted. Refuses any project that is not a
dedicated disposable ``web10-costfn-frozen-*`` project: this is a
measurement on the frozen input, not a migration, and it never touches
production storage.
"""
import argparse
import asyncio
import hashlib
import json
import os
import time
from pathlib import Path

import httpx

import core_feed
import dataset_v2
import provenance
import restore_dataset
import topology

ARM_D_DDL = """CREATE TABLE IF NOT EXISTS documents_armd (
    doc_id String,
    author_key String,
    collection_name String,
    body String,
    ref_value String DEFAULT '',
    tags Array(String),
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0,
    ad_mode String DEFAULT 'none',
    ad_target String DEFAULT '',
    posted_by String DEFAULT ''
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (author_key, created_at, doc_id, updated_at)"""
ROLLBACK_NAME = "documents_old_arma"
OLD_KEY_MARK = "ORDER BY (author_key, doc_id)"
NEW_KEY_MARK = "ORDER BY (author_key, created_at, doc_id, updated_at)"


class Step:
    def __init__(self, name):
        self.name, self.t0 = name, None
        self.rows = 0

    def __enter__(self):
        self.t0 = time.time()
        return self

    def __exit__(self, *exc):
        if exc[0] is None:
            self.elapsed_seconds = round(time.time() - self.t0, 3)
        return False





# ClickHouse 24.8: SHA256 (uppercase) over strings only; arraySort gives a
# deterministic multiset digest. Per-row digest -> sorted concat -> SHA256.
_ROW_DIGEST = ("HEX(SHA256(concat(doc_id, '|', author_key, '|', collection_name, '|', "
               "toString(created_at), '|', toString(updated_at), '|', toString(deleted))))")
_FULL_ROW_DIGEST = ("HEX(SHA256(concat(doc_id, '|', author_key, '|', collection_name, '|', body, "
                    "'|', ref_value, '|', arrayStringConcat(tags), '|', toString(created_at), '|', "
                    "toString(updated_at), '|', toString(deleted), '|', ad_mode, '|', ad_target, '|', "
                    "posted_by)))")


def content_hash(table):
    return (f"SELECT HEX(SHA256(arrayStringConcat(arraySort(groupArray({_ROW_DIGEST}))))) "
            f"FROM {table}").strip()


def author_distribution_hash(table):
    return (f"SELECT HEX(SHA256(arrayStringConcat(arraySort(groupArray(concat(author_key, '|', toString(c))))))) "
            f"FROM (SELECT author_key, count() AS c FROM {table} GROUP BY author_key)").strip()


def spot_doc_ids(n=25, seed_mod=400000, offset=7):
    # Deterministic hash sampling: no global sort over the full table.
    return (f"SELECT doc_id FROM documents WHERE cityHash64(doc_id) % {seed_mod} = {offset} "
            f"ORDER BY doc_id LIMIT {n} FORMAT TSVRaw")


async def live_feeds(base, manifest, readers=2):
    """Real core-feed sequence for `readers` readers; main-row hashes + checks.

    Sequential request shape on purpose: this step proves the re-key changes
    no output, not latency. Concurrent K=20 feeds on this pinned-allocation
    machine are memory-contended (that contention IS a measured result — see
    the trial records); the performance trials use the standard concurrent
    acceptance shape instead.
    """
    out = []
    wire = core_feed.wire()
    async with httpx.AsyncClient(base_url=base, timeout=120, trust_env=False) as client:
        sessions = await core_feed.prepare(client, manifest, readers)
        for index, (token, groups) in enumerate(sessions):
            records = []
            main = await core_feed.request(client, wire["requests"][0]["path"],
                                           core_feed.payload(wire["requests"][0]["payload"], token, groups),
                                           dataset_v2.ORIGIN, records, "main", "arm-d-parity", index)
            rows = main["rows"]
            if not rows:
                raise ValueError("empty main result is not an Arm D parity sample")
            ids = [r["doc_id"] for r in rows]
            followups = []
            for item, kind in zip(wire["requests"][1:], ("reactions", "comments", "views")):
                followups.append(await core_feed.request(client, item["path"],
                    core_feed.payload(item["payload"], token, groups, ids),
                    dataset_v2.ORIGIN, records, kind, "arm-d-parity", index))
            check = core_feed.check_result(manifest, index, rows, followups)
            reactions, comments, views = followups
            out.append({"reader_index": index, "main_rows_sha256":
                        hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest(),
                        "main_rows": len(rows), "check": check,
                        "reactions_rows": len(reactions["rows"]),
                        "comments_rows": len(comments["rows"])})
    return out


def arm_d(directory, receipt_path, out_path, spot=25):
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_bytes())
    verified = dataset_v2.validate(directory)
    receipt = json.loads(Path(receipt_path).read_bytes())
    if not (receipt.get("complete") and receipt.get("research_observer")
            and receipt["dataset_id"] == verified["dataset_id"]):
        raise ValueError("matching completed local research restore receipt required")
    project = receipt["project"]
    if not project.startswith("web10-costfn-frozen-"):
        raise ValueError("Arm D refuses to run outside a dedicated disposable research project")
    compose = topology.commands(receipt)
    env = topology.environment(receipt, os.environ) if receipt.get("docker_contexts") else os.environ.copy()

    def ch(query):
        # restore_dataset.run() carries its own 900 s subprocess timeout.
        return restore_dataset.run(compose + ["exec", "-T", "clickhouse", "clickhouse-client",
                                              "--user", "web10", "--password", "web10",
                                              "--database", "web10", "--query", query],
                                   env).decode().strip()

    steps = []

    def record(name, fn, **extra):
        step = Step(name)
        with step:
            value = fn()
        result = {"name": name, "elapsed_seconds": step.elapsed_seconds, "value": value, **extra}
        steps.append(result)
        return value

    try:
        _arm_d_body(directory, manifest, verified, receipt, project, compose, env, ch, spot, steps, record, out_path)
    except Exception as exc:
        # Retain the partial evidence before re-raising: which step failed,
        # which parity held, whether the flip happened (it is the last
        # destructive step; a pre-flip failure leaves the A table intact).
        out = Path(out_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({
            "kind": "ARM_D_FAILED", "error": f"{type(exc).__name__}: {exc}",
            "project": project, "dataset_id": verified["dataset_id"], "recipe": manifest["recipe"],
            "ddl": ARM_D_DDL, "rollback_table": ROLLBACK_NAME,
            "steps_completed": [s.get("name") for s in steps],
            "steps": steps, "sources": provenance.sources(),
            "scope": "Partial Arm D evidence; the failed step is the failure. Pre-flip failures leave "
                     "the Arm A table intact (the flip is the last step).",
        }, indent=1) + "\n")
        print(f"[arm-d] FAILED; partial receipt retained at {out}", flush=True)
        raise


def _arm_d_body(directory, manifest, verified, receipt, project, compose, env, ch, spot, steps, record, out_path):
    # 0 — pre-state: the A key is in place and no Arm D artifacts exist.
    old_create = ch("SHOW CREATE TABLE documents")
    if OLD_KEY_MARK not in old_create:
        raise ValueError("documents does not carry the Arm A sort key; refuse to re-key from unknown state")
    for table in ("documents_armd", ROLLBACK_NAME):
        if ch(f"SELECT count() FROM system.tables WHERE database = 'web10' AND name = '{table}'") != "0":
            raise ValueError(f"{table} already exists on this project; use a fresh restore")
    base_count = ch("SELECT count() FROM documents")
    steps.append({"name": "pre_state", "documents_rows": int(base_count),
                  "old_key_asserted": True, "rollback_absent": True})

    # 1-2 — create + copy (the copy IS the re-sort).
    record("create_documents_armd", lambda: ch(ARM_D_DDL) or "created")
    record("insert_select_re_sort", lambda: ch(f"INSERT INTO documents_armd SELECT * FROM documents"))

    # 3 — structural parity.
    new_count = ch("SELECT count() FROM documents_armd")
    if new_count != base_count:
        raise ValueError(f"row count parity failed: {base_count} -> {new_count}; drop the arm, keep the evidence")
    steps.append({"name": "row_count_parity", "old": int(base_count), "new": int(new_count)})
    old_content, new_content = ch(content_hash("documents")), ch(content_hash("documents_armd"))
    if old_content != new_content:
        raise ValueError("content hash parity failed; drop the arm, keep the evidence")
    steps.append({"name": "content_hash_parity", "sha256": old_content})
    old_authors, new_authors = ch(author_distribution_hash("documents")), ch(author_distribution_hash("documents_armd"))
    if old_authors != new_authors:
        raise ValueError("per-author distribution parity failed; drop the arm, keep the evidence")
    steps.append({"name": "author_distribution_parity", "sha256": old_authors})
    mod = max(1, int(base_count) // max(1, spot))
    ids = [line for line in ch(spot_doc_ids(n=spot, seed_mod=mod)).splitlines() if line]
    if len(ids) < min(spot, int(base_count)):
        raise ValueError(f"spot sample returned {len(ids)} ids; deterministic sampling failed, keep the evidence")
    spot_hashes = []
    for doc_id in ids:
        old_row = ch(f"SELECT {_FULL_ROW_DIGEST} FROM documents WHERE doc_id = '{doc_id}'")
        new_row = ch(f"SELECT {_FULL_ROW_DIGEST} FROM documents_armd WHERE doc_id = '{doc_id}'")
        if not old_row or old_row != new_row:
            raise ValueError(f"spot document lookup parity failed for {doc_id}; drop the arm, keep the evidence")
        spot_hashes.append({"doc_id": doc_id, "row_sha256": new_row})
    steps.append({"name": "spot_document_lookups", "checked": len(spot_hashes), "samples": spot_hashes})

    # 4 — live feed parity, old key.
    pre_feeds = asyncio.run(live_feeds(receipt["api"], manifest))
    steps.append({"name": "live_feeds_pre_flip", "feeds": pre_feeds})

    # 5 — flip (atomic rename; old table kept as the rollback path).
    record("flip", lambda: ch(f"RENAME TABLE documents TO {ROLLBACK_NAME}, documents_armd TO documents") or "flipped")
    new_create = ch("SHOW CREATE TABLE documents")
    if NEW_KEY_MARK not in new_create:
        raise ValueError("post-flip table does not carry the Arm D sort key")
    steps.append({"name": "post_flip_key_asserted", "rollback_table": ROLLBACK_NAME})

    # 6 — live feed parity, new key: exact same main rows and checks.
    post_feeds = asyncio.run(live_feeds(receipt["api"], manifest))
    for pre, post in zip(pre_feeds, post_feeds):
        if pre["main_rows_sha256"] != post["main_rows_sha256"] or pre["check"] != post["check"]:
            raise ValueError("feed output parity failed across the flip; the arm is INVALID, not slow — roll back and keep the evidence")
    steps.append({"name": "live_feeds_post_flip", "feeds": post_feeds,
                  "exact_main_output_parity": True})

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "kind": "ARM_D_SORT_KEY_REKEY",
        "project": project, "dataset_id": verified["dataset_id"], "recipe": manifest["recipe"],
        "ddl": ARM_D_DDL, "rollback_table": ROLLBACK_NAME,
        "mechanics": "create -> INSERT SELECT re-sort -> parity (rows, content, per-author, spot lookups, live feeds) -> atomic flip -> post-flip live-feed parity",
        "steps": steps, "sources": provenance.sources(),
        "scope": "Research-stack Arm D treatment on the frozen input. Not a production migration; "
                 "the rollback table is retained until explicitly dropped. Output parity with Arm A "
                 "is required for the arm to be valid; any parity failure aborts before the flip "
                 "except the live-feed post-flip check, which is kept as evidence either way.",
    }, indent=1) + "\n")
    print(json.dumps({"arm_d_receipt": str(out), "rows": int(base_count),
                      "spot_checked": len(spot_hashes), "rollback_table": ROLLBACK_NAME}, indent=2))
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="frozen input directory (manifest.json)")
    parser.add_argument("--receipt", type=Path, required=True, help="completed local research restore receipt")
    parser.add_argument("--out", type=Path, required=True, help="Arm D receipt path")
    parser.add_argument("--spot", type=int, default=25)
    args = parser.parse_args()
    arm_d(args.directory, args.receipt, args.out, spot=args.spot)
