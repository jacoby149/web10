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


def correctness(base, manifest):
    async def check():
        records = []
        async with httpx.AsyncClient(base_url=base, timeout=120, trust_env=False) as client:
            sessions = await core_feed.prepare(client, manifest, min(2, len(manifest["readers"])))
            checks = []
            for index, (token, groups) in enumerate(sessions):
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
                "correlated_requests": len(records), "sources": provenance.sources(),
                "scope": "Local text-only core API floor; not load capacity, lifecycle or media assurance."}
    return asyncio.run(check())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--project", required=True)
    parser.add_argument("--port", type=int, default=6091)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--expected-id", required=True)
    args = parser.parse_args()
    result = restore_dataset.restore(args.directory, args.project, args.port, args.receipt, args.expected_id,
                                    fixture=dataset_v2, checker=correctness, research=True)
    print(json.dumps(result, indent=2))
