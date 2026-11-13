"""One ordinary derived-data reader, excluded warm-up, three serial sequences.

Baseline diagnostic only, never a pilot/p95/capacity claim. Expectations are
queried independently from canonical restored facts, not the API responses.
"""
import argparse
import asyncio
import hashlib
import json
import os
import time
from datetime import UTC, datetime
from pathlib import Path

import core_feed
import httpx
import provenance
import restore_realism as restore


def literals(values):
    if not values or any(not isinstance(v, str) or "'" in v or "\\" in v for v in values):
        raise ValueError("invalid synthetic identifier list")
    return ",".join("'" + v + "'" for v in values)


def timestamp_ms(value):
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return round(parsed.timestamp() * 1000)


def validate_rows(rows, expected, profiles, attachments, main_counts):
    if [r["doc_id"] for r in rows] != [r["doc_id"] for r in expected]:
        raise ValueError("wrong candidate IDs/order/count")
    for row, want in zip(rows, expected):
        for field in ("author_key", "posted_by", "tags", "ref_value", "ad_mode", "ad_target"):
            if row[field] != want[field]:
                raise ValueError("wrong main projection: " + field)
        body = json.loads(row["body"]) if isinstance(row["body"], str) else row["body"]
        profile = json.loads(row["profile_body"]) if isinstance(row["profile_body"], str) else row["profile_body"]
        if body != json.loads(want["body"]) or profile != profiles[want["author_key"]]:
            raise ValueError("wrong body/joined profile")
        if timestamp_ms(row["created_at"]) != int(want["created_ms"]):
            raise ValueError("wrong projected creation time")
        if row["group_id"] not in attachments[want["doc_id"]]:
            raise ValueError("wrong projected group")
        counts = main_counts.get(want["doc_id"], {})
        for field in ("likes", "dislikes", "comments", "reposts", "score"):
            if row[field] != counts.get(field, 0):
                raise ValueError("wrong main aggregate: " + field)


def validate_followups(ids, followups, engagements, metrics):
    likes = {r["ref_value"]: (int(r["like_count"]), int(r["dislike_count"])) for r in followups[0]["rows"]}
    comments = {r["post_id"]: int(r["comment_count"]) for r in followups[1]["rows"]}
    if (len(likes) != len(followups[0]["rows"]) or len(comments) != len(followups[1]["rows"])
            or not set(likes) <= set(ids) or not set(comments) <= set(ids)
            or not set(followups[2]) <= set(ids)):
        raise ValueError("duplicate/unrequested follow-up rows")
    for doc in ids:
        expected = engagements.get(doc, {})
        if likes.get(doc, (0, 0)) != (expected.get("likes", 0), expected.get("dislikes", 0)):
            raise ValueError("wrong exact reaction count")
        if comments.get(doc, 0) != expected.get("comments", 0):
            raise ValueError("wrong exact comment count")
        if followups[2].get(doc, {"impressions": 0, "reach": 0}) != metrics.get(doc, {"impressions": 0, "reach": 0}):
            raise ValueError("wrong exact independently observed views/reach")


async def smoke(directory, receipt_path, output):
    receipt = json.loads(Path(receipt_path).read_bytes())
    manifest = json.loads((Path(directory) / "manifest.json").read_bytes())
    if (not receipt.get("node_import_complete") or receipt["dataset_id"] != manifest["dataset_id"]
            or manifest["recipe"]["follow"] != 20 or manifest["format"] != "web10-social-realism-derived-v1"):
        raise ValueError("matching K20 derived node restore required")
    output = Path(output)
    output.mkdir(exist_ok=False)
    compose = restore.commands(receipt["project"], receipt["api_port"], receipt["overlay"])
    env = {**os.environ, "API_PORT": str(receipt["api_port"]),
           "COSTFN_RESEARCH_DIR": str(Path(__file__).resolve().parent),
           "COSTFN_REPO_DIR": str(Path(__file__).resolve().parents[3])}
    oracle_hashes = []

    def sql(text):
        oracle_hashes.append(hashlib.sha256(text.encode()).hexdigest())
        return json.loads(restore.query(compose, env, text +
            " SETTINGS max_execution_time=120, max_threads=4 FORMAT JSON"))["data"]

    # Reader zero is the conditioned viral probe. Reader one is an ordinary,
    # predeclared reader, not selected for its response/performance.
    reader = manifest["readers"][1]
    member_rows = sql("SELECT group_id,role FROM group_members FINAL WHERE member_key=" + literals([reader]) +
                      " AND deleted=0 AND endsWith(group_id,'/followers') ORDER BY group_id")
    groups = [r["group_id"] for r in member_rows]
    if len([r for r in member_rows if r["role"] == "member"]) != 20:
        raise ValueError("ordinary reader does not have exactly twenty follows")
    scope = literals(groups)
    expected = sql("SELECT doc_id,author_key,posted_by,body,tags,ref_value,ad_mode,ad_target,"
        "toUnixTimestamp64Milli(created_at) AS created_ms FROM documents FINAL WHERE deleted=0 "
        "AND collection_name='posts' AND NOT has(tags,'ad') AND NOT has(tags,'product') "
        f"AND doc_id IN (SELECT doc_id FROM doc_groups FINAL WHERE deleted=0 AND group_id IN ({scope})) "
        "ORDER BY created_at DESC,doc_id LIMIT 21")
    if len(expected) != 21:
        raise ValueError("ordinary-reader floor must exercise twenty-one fetched posts")
    ids = [r["doc_id"] for r in expected]
    selected = literals(ids)
    authors = literals(sorted({r["author_key"] for r in expected}))
    profiles = {r["author_key"]: json.loads(r["body"]) for r in sql(
        f"SELECT author_key,body FROM documents FINAL WHERE author_key IN ({authors}) "
        "AND collection_name='profile' AND deleted=0")}
    attachments = {r["doc_id"]: r["groups"] for r in sql(
        f"SELECT doc_id,groupArray(group_id) AS groups FROM doc_groups FINAL WHERE doc_id IN ({selected}) "
        f"AND group_id IN ({scope}) AND deleted=0 GROUP BY doc_id")}

    def engagement(group_scope):
        return {r["ref_value"]: {k: int(r[k]) for k in ("likes", "dislikes", "comments")} for r in sql(
            "SELECT ref_value,countIf(collection_name='reactions' AND JSONExtractString(body,'type')='like') AS likes,"
            "countIf(collection_name='reactions' AND JSONExtractString(body,'type')='dislike') AS dislikes,"
            "countIf(collection_name='comments') AS comments FROM documents FINAL "
            f"WHERE ref_value IN ({selected}) AND collection_name IN ('reactions','comments') AND deleted=0 "
            f"AND doc_id IN (SELECT doc_id FROM doc_groups FINAL WHERE group_id IN ({group_scope}) AND deleted=0) "
            "GROUP BY ref_value")}

    main_counts = engagement(scope)
    engagements = engagement(literals([*groups, "api.localhost/groups/web10/discover"]))

    def metrics():
        return {r["doc_id"]: {k: int(r[k]) for k in ("impressions", "reach")} for r in sql(
            f"SELECT doc_id,count() AS impressions,uniqExact(reader_key) AS reach FROM content_events "
            f"WHERE doc_id IN ({selected}) AND service='posts' AND event_type='delivery' GROUP BY doc_id")}

    capture = core_feed.wire()
    samples, requests = [], []
    async with httpx.AsyncClient(base_url=receipt["api"], timeout=120, trust_env=False) as client:
        response = await client.post('/v3/login', json={"username": reader, "password": manifest["password"], "site": "costfn"})
        response.raise_for_status()
        token = response.json()["token"]
        response = await client.post('/v3/groups/list', json={"token": token}, headers={"Origin": manifest["origin"]})
        response.raise_for_status()
        actual = [r["group_id"] for r in response.json() if r["group_id"].endswith('/followers')]
        if set(actual) != set(groups) or len(actual) != len(groups):
            raise ValueError("real app group discovery differs from canonical membership")
        denied = await client.post('/v3/query', json={"token": token, "sql": "SELECT doc_id FROM posts LIMIT 1", "groups": groups},
                                   headers={"Origin": "https://ungranted.research.invalid"})
        if denied.status_code != 403:
            raise ValueError("wrong-Origin control not denied")
        for index, phase in enumerate(("warmup", "measured", "measured", "measured")):
            before = metrics()
            lower = datetime.now(UTC).isoformat()
            started = time.perf_counter()
            sample = {"index": index, "phase": phase, "success": False, "started": lower}
            print(f"[realism-smoke] {phase} sequence {index} start", flush=True)
            try:
                main = await core_feed.request(client, capture["requests"][0]["path"],
                    core_feed.payload(capture["requests"][0]["payload"], token, groups), manifest["origin"], requests, "main", phase, 1)
                rows = main.get("rows", [])
                validate_rows(rows, expected, profiles, attachments, main_counts)
                followups = []
                for item, kind in zip(capture["requests"][1:], ("reactions", "comments", "views")):
                    followups.append(await core_feed.request(client, item["path"],
                        core_feed.payload(item["payload"], token, groups, ids), manifest["origin"], requests, kind, phase, 1))
                # Measurement ends BEFORE independent verification/observation.
                sample["completion_ms"] = (time.perf_counter() - started) * 1000
                sample["ended"] = datetime.now(UTC).isoformat()
                after = metrics()
                validate_followups(ids, followups, engagements, after)
                delta = {doc: {k: after.get(doc, {}).get(k, 0) - before.get(doc, {}).get(k, 0)
                               for k in ("impressions", "reach")} for doc in ids}
                if any(not 0 <= v["reach"] <= v["impressions"] <= 1 for v in delta.values()):
                    raise ValueError("unexpected independently observed single-reader delivery delta")
                sample.update(success=True, fetched=len(rows), exact_projected_rows=True,
                              exact_followups=True, independent_delivery_delta=delta)
            except (httpx.HTTPError, ValueError) as error:
                sample.setdefault("completion_ms", (time.perf_counter() - started) * 1000)
                sample.setdefault("ended", datetime.now(UTC).isoformat())
                sample["failure_class"] = "http_failure" if isinstance(error, httpx.HTTPError) else "semantic_failure"
                # Fixed semantic assertions are safe; never log HTTP error text/body/token.
                if isinstance(error, ValueError):
                    sample["semantic_error"] = str(error)
            samples.append(sample)
            with (output / 'feeds.jsonl').open('a') as stream:
                stream.write(json.dumps(sample) + '\n')
            (output / 'requests.json').write_text(json.dumps(requests, indent=2))
            print(f"[realism-smoke] {phase} sequence {index} complete: success={sample['success']} "
                  f"elapsed_ms={sample['completion_ms']:.1f}", flush=True)
            if sample.get("failure_class") == "semantic_failure":
                break  # invalid semantics never become performance samples
    restore.query(compose, env, "SYSTEM FLUSH LOGS")
    for sample in samples:
        native = sql("SELECT query_id,toString(type) AS type,query_duration_ms,read_rows,read_bytes,memory_usage,"
            "exception_code,lower(hex(SHA256(query))) AS query_sha256 FROM system.query_log "
            "WHERE user='web10' AND is_initial_query=1 AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing') "
            f"AND query_start_time_microseconds>=parseDateTime64BestEffort({literals([sample['started']])}) "
            f"AND query_start_time_microseconds<parseDateTime64BestEffort({literals([sample['ended']])}) "
            "ORDER BY query_start_time_microseconds,query_id")
        sample['native_queries'] = native
        sample['native_totals'] = {
            'read_rows': sum(int(r['read_rows']) for r in native),
            'read_bytes': sum(int(r['read_bytes']) for r in native),
            'largest_query_peak_bytes': max((int(r['memory_usage']) for r in native), default=0),
            'exception_codes': sorted({int(r['exception_code']) for r in native if int(r['exception_code'])}),
            'attribution': 'exclusive sequential HTTP-sequence wall-clock window; not individual SQL-to-ASGI tracing'}
    (output / 'feeds-with-native.json').write_text(json.dumps(samples, indent=2))
    result = {"scope": "One-reader serial baseline diagnostic; not pilot, p95 or capacity evidence",
              "dataset_id": manifest["dataset_id"], "reader_index": 1, "follow_count": 20,
              "feed_groups_including_self": len(groups), "wrong_origin_denied": True,
              "sources": provenance.sources(), "oracle_query_sha256": oracle_hashes,
              "all_http_requests_correlated": all(r.get('correlated') for r in requests),
              "measured_sequences": [r for r in samples if r["phase"] == "measured"], "pilot_ready": False}
    (output / 'summary.json').write_text(json.dumps(result, indent=2))
    return result


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('directory', type=Path)
    p.add_argument('--receipt', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    asyncio.run(smoke(a.directory, a.receipt, a.out))
