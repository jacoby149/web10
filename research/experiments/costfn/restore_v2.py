#!/usr/bin/env python3
"""Fresh-project V2 restore plus real discovery/nonempty core-feed acceptance."""
import argparse
import asyncio
import json
from pathlib import Path

import httpx

import core_feed
import dataset_v2
import provenance
import restore_dataset


def correctness(base, manifest, warmups=0):
    async def check():
        records = []
        warmup_records = []
        warmup_stats = None
        preflight_retries = 0
        async with httpx.AsyncClient(base_url=base, timeout=120, trust_env=False) as client:
            sessions = await core_feed.prepare(client, manifest, min(2, len(manifest["readers"])))
            checks = []
            if warmups > 0:
                # Excluded preparation warm-ups: the same real app/SDK sequence,
                # run before the strict functional check so a large cold restore
                # is checked under the study's declared steady-refresh-after-
                # warm-up condition (PROTOCOL §2). They are not study samples:
                # warm-up failures are counted, never raised — the strict check
                # below is the gate.
                warmup_failures = 0
                for index, (token, groups) in enumerate(sessions):
                    for _ in range(warmups):
                        try:
                            await core_feed.feed(client, core_feed.wire(), token, groups, warmup_records, "preflight-warmup", index)
                        except (httpx.HTTPError, core_feed.CoreRequestFailure, ValueError):
                            warmup_failures += 1
                warmup_stats = {"preflight_warmups_excluded": warmups * len(sessions),
                                "preflight_warmup_failures": warmup_failures,
                                "preflight_warmup_records": len(warmup_records)}
            for index, (token, groups) in enumerate(sessions):
                try:
                    rows, followups = await core_feed.feed(client, core_feed.wire(), token, groups, records, "preflight", index)
                except (httpx.HTTPError, core_feed.CoreRequestFailure):
                    # A cold/contended large stack (post-import merge storm under
                    # the pinned allocation) can fail the strict feed once:
                    # settle 90 s and retry ONCE — recorded, never silent.
                    if preflight_retries >= 1:
                        raise
                    preflight_retries += 1
                    print(f"[restore] preflight feed {index} hit a contended stack; settling 90 s and retrying once", flush=True)
                    await asyncio.sleep(90)
                    rows, followups = await core_feed.feed(client, core_feed.wire(), token, groups, records, "preflight", index)
                checks.append(core_feed.check_result(manifest, index, rows, followups))
                if len(rows) > 20:
                    second = await core_feed.request(client, "/v3/query", core_feed.next_page_payload(core_feed.wire(), token, groups, rows[19]["created_at"]),
                        dataset_v2.ORIGIN, records, "pagination", "preflight", index)
                    indices = sorted(dataset_v2.followed_indices(manifest["recipe"], index), reverse=True)[20:41]
                    wanted = [dataset_v2.doc_id(dataset_v2.creator(manifest["recipe"], i), "posts") for i in indices]
                    if [r["doc_id"] for r in second["rows"]] != wanted:
                        raise ValueError("actual app cursor skipped/duplicated/reordered posts")
                    checks[-1]["pagination"] = True
                denied = await client.post("/v3/query", json={"token": token, "sql": "SELECT doc_id FROM posts LIMIT 1", "groups": groups},
                    headers={"Origin": "https://ungranted.research.invalid"})
                if denied.status_code != 403:
                    raise ValueError("missing-app-grant control was not denied")
            if not all(r.get("correlated") for r in records):
                raise ValueError("research observation/correlation is absent")
        return {"core_results": checks, "real_discovery": True, "origin_denial": True,
                "preflight_warmups": warmup_stats,
                "preflight_strict_retries": preflight_retries,
                "correlated_requests": len(records), "sources": provenance.sources(),
                "scope": "Local text-only core API floor; not load capacity, lifecycle or media assurance."}
    return asyncio.run(check())


def correctness_structural(base, manifest):
    """#1464 admission precedent, declared for the K>=1000 stress cells:
    the strict full-feed preflight fails on those inputs by the known
    ten-second native limit (the Q01 preflight record), so admission is
    import/counts + real discovery + one authorized exact-document query +
    wrong-Origin denial — no full-feed latency pass is claimed during
    preparation. The stress cell's measured failures are the result.
    """
    async def check():
        import uuid as _uuid
        records = []
        async with httpx.AsyncClient(base_url=base, timeout=60, trust_env=False) as client:
            sessions = await core_feed.prepare(client, manifest, min(2, len(manifest["readers"])))
            for index, (token, groups) in enumerate(sessions):
                # One authorized exact-document query: the newest followed post.
                indices = sorted(dataset_v2.followed_indices(manifest["recipe"], index), reverse=True)
                doc = dataset_v2.doc_id(dataset_v2.creator(manifest["recipe"], indices[0]), "posts")
                ok = await client.post("/v3/query", json={"token": token,
                    "sql": f"SELECT doc_id FROM posts WHERE doc_id = '{doc}' LIMIT 1", "groups": groups},
                    headers={"Origin": dataset_v2.ORIGIN})
                if ok.status_code != 200 or [r["doc_id"] for r in ok.json().get("rows", [])] != [doc]:
                    raise ValueError("structural admission: the authorized exact-document read failed")
                denied = await client.post("/v3/query", json={"token": token, "sql": "SELECT doc_id FROM posts LIMIT 1", "groups": groups},
                    headers={"Origin": "https://ungranted.research.invalid"})
                if denied.status_code != 403:
                    raise ValueError("structural admission: missing-app-grant control was not denied")
        return {"core_results": [{"structural_exact_document": True, "origin_denial": True}
                                  for _ in range(min(2, len(manifest["readers"])))],
                "real_discovery": True, "origin_denial": True,
                "admission": "structural (declared for K>=1000 stress cells; no full-feed latency claim)",
                "correlated_requests": 0, "sources": provenance.sources(),
                "scope": "Local structural admission; not load capacity, lifecycle or media assurance."}
    return asyncio.run(check())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--project", required=True)
    parser.add_argument("--port", type=int, default=6091)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--expected-id", required=True)
    parser.add_argument("--preflight-warmups", type=int, default=0,
        help="excluded warm-up core feeds per reader before the strict check (large cold restores)")
    parser.add_argument("--admit-structural", action="store_true",
        help="#1464 admission precedent: discovery + exact-document + denial, no full-feed preflight")
    args = parser.parse_args()
    checker = correctness_structural if args.admit_structural \
        else (lambda base, manifest: correctness(base, manifest, warmups=args.preflight_warmups))
    result = restore_dataset.restore(args.directory, args.project, args.port, args.receipt, args.expected_id,
                                    fixture=dataset_v2, checker=checker, research=True)
    print(json.dumps(result, indent=2))
