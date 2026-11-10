#!/usr/bin/env python3
"""Real source-captured core-feed HTTP workload and independent result oracle."""
import asyncio
import copy
from datetime import datetime
import json
from pathlib import Path
import re
import time
import uuid

import httpx

import dataset_v2 as fixture
import study_plan

HERE = Path(__file__).resolve().parent


class CoreRequestFailure(RuntimeError):
    """An HTTP follow-up failed; distinct from wrong-result/semantic failures."""


def wire():
    value = json.loads((HERE / "evidence/core-feed-wire-v5.json").read_bytes())
    errors = study_plan.wire_errors(value)
    if errors:
        raise ValueError("stale core-feed source capture: " + "; ".join(errors))
    return value


def next_page_payload(capture, token, groups, cursor):
    page = json.loads((HERE / "evidence/core-feed-next-page-v4.json").read_bytes())
    if page["feed_sha256"] != study_plan.sha(study_plan.ROOT / study_plan.SOURCES["feed"]) or page["capture_sha256"] != study_plan.sha(HERE / "capture-pagination.ts"):
        raise ValueError("stale cursor builder capture")
    if not isinstance(cursor, str) or not re.fullmatch(r"[0-9T:+.Z -]{19,40}", cursor):
        raise ValueError("unexpected cursor timestamp")
    value = payload(capture["requests"][0]["payload"], token, groups)
    parsed = datetime.fromisoformat(cursor.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("cursor must identify its UTC offset")
    value["sql"] = page["sql"].replace("__CURSOR_MS__", str(round(parsed.timestamp() * 1000)))
    return value


def payload(template, token, groups, ids=None):
    value = copy.deepcopy(template)
    value["token"] = token
    value["groups"] = [fixture.DISCOVER] if "doc_ids" in value else groups
    if ids is not None:
        if "sql" in value:
            if not all(isinstance(i, str) and len(i) == 36 and str(uuid.UUID(i)) == i for i in ids):
                raise ValueError("unexpected document IDs from server")
            value["sql"] = value["sql"].replace("__POST_IDS__", ", ".join(f"'{i}'" for i in ids))
            value["groups"] = list(dict.fromkeys([*groups, fixture.DISCOVER]))
        else:
            value["doc_ids"] = ids
    return value


async def request(client, path, body, origin, records, kind, phase, reader):
    request_id = uuid.uuid4().hex
    started = time.perf_counter()
    record = {"request_id": request_id, "kind": kind, "phase": phase, "reader_index": reader,
              "status": None, "error": None, "client_start_monotonic": started}
    if hasattr(records, "begin"):
        records.begin()
    try:
        response = await client.post(path, json=body, headers={"Origin": origin, "X-Research-ID": request_id})
        record["status"] = response.status_code
        record["correlated"] = response.headers.get("x-research-id") == request_id
        response.raise_for_status()
        return response.json()
    except asyncio.CancelledError:
        record["error"] = "cancelled"
        raise
    except (httpx.HTTPError, ValueError):
        record["error"] = "http_or_decode_failure"
        raise
    finally:
        record["client_ms"] = (time.perf_counter() - started) * 1000
        record["client_end_monotonic"] = time.perf_counter()
        records.append(record)  # metadata only; never body, token, signed URL or exception text


async def feed(client, capture, token, groups, records, phase, reader):
    requests = capture["requests"]
    main = await request(client, requests[0]["path"], payload(requests[0]["payload"], token, groups),
                         fixture.ORIGIN, records, "main", phase, reader)
    rows = main.get("rows", [])
    if not rows:
        raise ValueError("empty main result is not a core-feed sample")
    ids = [r["doc_id"] for r in rows]
    results = await asyncio.gather(*(request(client, item["path"], payload(item["payload"], token, groups, ids),
        fixture.ORIGIN, records, kind, phase, reader) for item, kind in zip(requests[1:], ("reactions", "comments", "views"))), return_exceptions=True)
    for result in results:
        if isinstance(result, httpx.HTTPError):
            raise CoreRequestFailure("core-feed HTTP follow-up failed") from None
        if isinstance(result, BaseException):
            raise result
    return rows, results


def check_result(manifest, reader_index, rows, followups):
    """Independent expected semantics, not a replay of fixture.rows()."""
    recipe = manifest["recipe"]
    start = 0 if recipe["locality"] == "hot" else reader_index * recipe["follow"] % recipe["creators"]
    indices = sorted(((start + j) % recipe["creators"] for j in range(recipe["follow"])), reverse=True)[:21]
    expected = [fixture.doc_id(f"c{recipe['seed']}-c{i:06d}", "posts") for i in indices]
    if [r["doc_id"] for r in rows] != expected:
        raise ValueError("wrong core-feed authors/IDs/order/count")
    reactions, comments, views = followups
    likes = {r["ref_value"]: (int(r["like_count"]), int(r["dislike_count"])) for r in reactions["rows"]}
    comment_counts = {r["post_id"]: int(r["comment_count"]) for r in comments["rows"]}
    for i, row in zip(indices, rows):
        profile = row.get("profile_body")
        if isinstance(profile, str):
            profile = json.loads(profile)
        if row["author_key"] != f"c{recipe['seed']}-c{i:06d}" or not profile or profile.get("display_name") != f"Creator {i}":
            raise ValueError("missing/wrong joined profile")
        if likes.get(row["doc_id"]) != (1, 0) or comment_counts.get(row["doc_id"], 0) != int(i % 10 == 0):
            raise ValueError("wrong nonempty engagement counts")
        metric = views.get(row["doc_id"], {})
        if metric.get("impressions", 0) < 1 or metric.get("reach", 0) < 1:
            raise ValueError("missing actual delivery/view metric")
    return {"fetched": len(rows), "displayed": min(20, len(rows)), "profiles": True,
            "likes": True, "comments": True, "views": True, "exact_order": True}


async def prepare(client, manifest, count):
    if count < 1 or count > len(manifest["readers"]):
        raise ValueError("distinct session count exceeds fixture")
    sessions = [None] * count
    queue = asyncio.Queue()
    for index in range(count):
        queue.put_nowait(index)

    async def prepare_one(index):
        reader = manifest["readers"][index]
        response = await client.post("/v3/login", json={"username": reader, "password": fixture.PASSWORD, "site": "costfn"})
        response.raise_for_status()
        token = response.json()["token"]
        response = await client.post("/v3/groups/list", json={"token": token}, headers={"Origin": fixture.ORIGIN})
        response.raise_for_status()
        # Same predicate as real getFeedGroups. No manufactured group list.
        groups = [g["group_id"] for g in response.json() if g["group_id"].endswith("/followers")]
        recipe = manifest["recipe"]
        expected = {fixture.followers(fixture.creator(recipe, i)) for i in fixture.followed_indices(recipe, index)}
        if set(groups) != expected:
            raise ValueError("real group discovery differs from fixture follow graph")
        sessions[index] = (token, groups)

    async def worker():
        while not queue.empty():
            index = queue.get_nowait()
            await prepare_one(index)
            if index % 100 == 0 or index == count - 1:
                print(f"[core-feed] prepared reader index {index + 1}/{count}", flush=True)

    workers = [asyncio.create_task(worker()) for _ in range(min(8, count))]
    try:
        await asyncio.gather(*workers)
    except BaseException:
        for task in workers:
            task.cancel()
        await asyncio.gather(*workers, return_exceptions=True)
        raise
    return sessions
