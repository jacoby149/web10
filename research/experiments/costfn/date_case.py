"""Separately identified rolling-date workload. Frozen V2 artifacts are never edited."""
import asyncio
import contextlib
from datetime import datetime, timedelta, timezone
import gzip
import json
from pathlib import Path
import shutil

import httpx

import core_feed
import dataset as v1
import dataset_v2 as v2
import provenance
import study_plan

TABLES = v2.TABLES
CLOCK = datetime(2026, 11, 9, 12, tzinfo=timezone.utc)
CUTOFF_MS = int((CLOCK - timedelta(days=30)).timestamp() * 1000)
CONTRACT = {"clock": CLOCK.isoformat(), "cutoff_ms": CUTOFF_MS, "recent_percent": 5,
            "selection": "creator index modulo 100 < 5", "window_days": 30,
            "scope": "Explicit date-filtered Following sensitivity, not normal Following eligibility or original study"}


def transform(table, row, creators):
    if table not in ("documents", "doc_groups"):
        return row
    index = int((datetime.fromisoformat(row["created_at"]) - datetime(2026, 1, 1)).total_seconds())
    if index % 100 < 5:
        stamp = (CLOCK - timedelta(seconds=creators - index)).strftime("%Y-%m-%d %H:%M:%S.000")
        return {**row, "created_at": stamp, "updated_at": stamp}
    return row


def base(parent):
    return {**v2.manifest_base(parent["recipe"]), "format": "web10-costfn-date-v1",
            "parent_dataset_id": parent["dataset_id"], "date_contract": CONTRACT,
            "date_generator_sha256": v1.digest(__file__)}


def derive(source, destination):
    source, destination = Path(source), Path(destination)
    v2.validate(source)
    parent = json.loads((source / "manifest.json").read_bytes())
    if parent["recipe"]["creators"] > 2000000 or parent["recipe"]["follow"] < 500:
        raise ValueError("date sensitivity requires bounded creators and at least 500 followed authors")
    destination.mkdir(exist_ok=False, parents=True)
    manifest = base(parent)
    manifest["files"] = {}
    for table, info in parent["files"].items():
        target = destination / info["name"]
        if table in ("documents", "doc_groups"):
            with gzip.open(source / info["name"], "rb") as incoming, target.open("xb") as raw:
                with gzip.GzipFile(filename="", mode="wb", mtime=0, fileobj=raw) as outgoing:
                    for line in incoming:
                        outgoing.write(v1.encoded(transform(table, json.loads(line), parent["recipe"]["creators"])))
        else:
            shutil.copyfile(source / info["name"], target)
        manifest["files"][table] = {**info, "bytes": target.stat().st_size, "sha256": v1.digest(target)}
        print(f"[date-case] derived {table}", flush=True)
    manifest["dataset_id"] = v1.identity(manifest)
    (destination / "manifest.json").write_bytes(v1.encoded(manifest))
    return manifest


def validate(directory):
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_bytes())
    v2.check_recipe(manifest["recipe"])
    expected = {**base({"recipe": manifest["recipe"], "dataset_id": manifest["parent_dataset_id"]}),
                "files": manifest["files"], "dataset_id": manifest["dataset_id"]}
    if manifest != expected or v1.identity(manifest) != manifest["dataset_id"]:
        raise ValueError("date fixture manifest/source mismatch")
    if set(manifest["files"]) != set(TABLES) or {p.name for p in directory.iterdir()} != {"manifest.json", *(f"{t}.jsonl.gz" for t in TABLES)}:
        raise ValueError("unexpected date fixture files")
    counts = dict.fromkeys(TABLES, 0)
    with contextlib.ExitStack() as stack:
        streams = {}
        for table, info in manifest["files"].items():
            path = directory / f"{table}.jsonl.gz"
            if path.is_symlink() or info["name"] != path.name or path.stat().st_size != info["bytes"] or v1.digest(path) != info["sha256"]:
                raise ValueError("date fixture integrity mismatch")
            streams[table] = stack.enter_context(gzip.open(path, "rb"))
        for table, row in v2.rows(manifest["recipe"]):
            if streams[table].readline() != v1.encoded(transform(table, row, manifest["recipe"]["creators"])):
                raise ValueError("date fixture row mismatch")
            counts[table] += 1
        if any(streams[t].read(1) or counts[t] != manifest["files"][t]["rows"] for t in TABLES):
            raise ValueError("date fixture count mismatch")
    return {"dataset_id": manifest["dataset_id"], "rows": counts, "date_contract": CONTRACT}


def capture():
    value = json.loads((Path(__file__).parent / "evidence/core-feed-date-wire-v1.json").read_bytes())
    if study_plan.wire_errors(value):
        raise ValueError("stale date source capture")
    if f"p.created_at >= fromUnixTimestamp64Milli({CUTOFF_MS})" not in value["requests"][0]["payload"]["sql"]:
        raise ValueError("date capture lacks exact lower bound")
    return value


def sources():
    here = Path(__file__).parent
    return {**provenance.sources(), "date_wire_sha256": v1.digest(here / "evidence/core-feed-date-wire-v1.json"),
            "date_pagination_sha256": v1.digest(here / "evidence/core-feed-date-next-page-v1.json")}


def indices(manifest, reader, offset=0):
    # Independent arithmetic oracle, not transform()/rows() or returned IDs.
    recipe = manifest["recipe"]
    start = 0 if recipe["locality"] == "hot" else reader * recipe["follow"] % recipe["creators"]
    candidates = sorted(((start + j) % recipe["creators"] for j in range(recipe["follow"])), reverse=True)
    return [i for i in candidates if i % 100 in (0, 1, 2, 3, 4)][offset:offset + 21]


def check_result(manifest, reader, rows, followups):
    wanted = indices(manifest, reader)
    if len(wanted) != 21 or [r["doc_id"] for r in rows] != [v2.doc_id(v2.creator(manifest["recipe"], i), "posts") for i in wanted]:
        raise ValueError("wrong nonempty date-filtered IDs/order")
    reactions, comments, views = followups
    likes = {r["ref_value"]: (int(r["like_count"]), int(r["dislike_count"])) for r in reactions["rows"]}
    counts = {r["post_id"]: int(r["comment_count"]) for r in comments["rows"]}
    for i, row in zip(wanted, rows):
        profile = json.loads(row["profile_body"]) if isinstance(row["profile_body"], str) else row["profile_body"]
        stamp = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        expected_stamp = CLOCK - timedelta(seconds=manifest["recipe"]["creators"] - i)
        if stamp.tzinfo is None or stamp != expected_stamp or stamp < CLOCK - timedelta(days=30):
            raise ValueError("old/offsetless date result")
        if row["author_key"] != v2.creator(manifest["recipe"], i) or profile.get("display_name") != f"Creator {i}":
            raise ValueError("wrong date author/profile")
        doc = row["doc_id"]
        if likes.get(doc) != (1, 0) or counts.get(doc, 0) != int(i % 10 == 0):
            raise ValueError("wrong date engagement")
        if views.get(doc, {}).get("impressions", 0) < 1 or views.get(doc, {}).get("reach", 0) < 1:
            raise ValueError("missing date delivery/view")
    return {"fetched": 21, "displayed": 20, "date": True, "profiles": True, "engagement": True, "views": True}


def correctness(base, manifest):
    async def run():
        records, checks = [], []
        wire = capture()
        async with httpx.AsyncClient(base_url=base, timeout=120, trust_env=False) as client:
            sessions = await core_feed.prepare(client, manifest, 2)
            for reader, (token, groups) in enumerate(sessions):
                rows, followups = await core_feed.feed(client, wire, token, groups, records, "preflight", reader)
                checks.append(check_result(manifest, reader, rows, followups))
                second = core_feed.payload(wire["requests"][0]["payload"], token, groups)
                cursor = round(datetime.fromisoformat(rows[19]["created_at"].replace("Z", "+00:00")).timestamp() * 1000)
                page = json.loads((Path(__file__).parent / "evidence/core-feed-date-next-page-v1.json").read_bytes())
                if page["feed_sha256"] != study_plan.sha(study_plan.ROOT / study_plan.SOURCES["feed"]) or page["capture_sha256"] != v1.digest(Path(__file__).parent / "capture-pagination.ts"):
                    raise ValueError("stale actual date pagination builder")
                if f"p.created_at >= fromUnixTimestamp64Milli({CUTOFF_MS})" not in page["sql"]:
                    raise ValueError("date pagination lost eligibility")
                second["sql"] = page["sql"].replace("__CURSOR_MS__", str(cursor))
                result = await core_feed.request(client, "/v3/query", second, v2.ORIGIN, records, "pagination", "preflight", reader)
                if [r["doc_id"] for r in result["rows"]] != [v2.doc_id(v2.creator(manifest["recipe"], i), "posts") for i in indices(manifest, reader, 20)]:
                    raise ValueError("date pagination mismatch")
                denied = await client.post("/v3/query", json=second, headers={"Origin": "https://ungranted.research.invalid"})
                if denied.status_code != 403:
                    raise ValueError("date Origin control not denied")
        if not records or not all(r["correlated"] for r in records):
            raise ValueError("date request correlation missing")
        return {"checks": checks, "real_discovery": True, "pagination": True, "origin_denial": True,
                "sources": provenance.sources(), "date_contract": CONTRACT}
    return asyncio.run(run())
