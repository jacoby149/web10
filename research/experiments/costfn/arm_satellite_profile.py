"""One untreated stage inventory on the new isolated realism store.

Independent canonical IDs let failed-main follow-ups be profiled separately.
This is explicitly NOT a completed feed, parity verdict, frozen baseline rerun,
or performance cell. No satellite builds or query treatments are installed.
"""
import argparse
import asyncio
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path
import time

import httpx

import arm_satellite_runtime as runtime
import core_feed
import smoke_realism
import restore_realism as restore


def stage_payload(template, token, groups, ids, kind):
    return core_feed.payload(template, token, groups, None if kind == "main" else ids)


async def profile(root):
    root = Path(root)
    session = runtime.Session(root)
    output = root / "profile"
    output.mkdir(exist_ok=False)
    manifest = json.loads((root / "input/manifest.json").read_bytes())
    restored = json.loads((root / "restore.json").read_bytes())
    # Reader one is the preserved ordinary reader, not selected for outcome.
    reader = manifest["readers"][1]
    quote = smoke_realism.literals
    memberships, _ = session.rows("profile_setup_memberships", "SELECT group_id,role FROM group_members FINAL "
        "WHERE member_key=" + quote([reader]) + " AND deleted=0 AND endsWith(group_id,'/followers') ORDER BY group_id")
    groups = [row["group_id"] for row in memberships]
    if sum(row["role"] == "member" for row in memberships) != 20:
        raise ValueError("ordinary canonical reader scope differs")
    expected, _ = session.rows("profile_setup_reference_ids", "SELECT doc_id,author_key FROM documents FINAL "
        "WHERE collection_name='posts' AND deleted=0 AND NOT has(tags,'ad') AND NOT has(tags,'product') "
        "AND doc_id IN (SELECT doc_id FROM doc_groups FINAL WHERE deleted=0 AND group_id IN (" + quote(groups)
        + ")) ORDER BY created_at DESC,doc_id LIMIT 21")
    ids = [row["doc_id"] for row in expected]
    if len(ids) != 21:
        raise ValueError("reference page incomplete")
    capture = core_feed.wire()
    requests, spans = [], []
    async with httpx.AsyncClient(base_url=restored["api"], timeout=120, trust_env=False) as client:
        login = await client.post('/v3/login', json={"username": reader, "password": manifest["password"], "site": "costfn"})
        login.raise_for_status()
        token = login.json()["token"]
        denial = await client.post('/v3/query', json={"token": token, "sql": "SELECT doc_id FROM posts LIMIT 1", "groups": groups},
                                   headers={"Origin": "https://ungranted.research.invalid"})
        if denial.status_code != 403:
            raise ValueError("wrong-Origin control failed")
        for item, kind in zip(capture["requests"], ("main", "reactions", "comments", "views"), strict=True):
            started_utc = datetime.now(UTC).isoformat()
            start = time.monotonic()
            span = {"kind": kind, "started": started_utc, "independent_reference_ids_for_followup": kind != "main"}
            print("[satellite-profile] untreated stage start", kind, flush=True)
            try:
                payload = stage_payload(item["payload"], token, groups, ids, kind)
                await core_feed.request(client, item["path"], payload,
                                        manifest["origin"], requests, kind, "inventory", 1)
                span["http_completed"] = True
            except (httpx.HTTPError, ValueError) as error:
                span.update(http_completed=False, failure_class=type(error).__name__)
            finally:
                span.update(ended=datetime.now(UTC).isoformat(), elapsed_ms=(time.monotonic() - start) * 1000)
                spans.append(span)
                (output / "requests.json").write_text(json.dumps(requests, indent=2) + "\n")
                (output / "spans.json").write_text(json.dumps(spans, indent=2) + "\n")
                print("[satellite-profile] untreated stage end", kind, span["http_completed"], flush=True)
    session.query("profile_flush", "SYSTEM FLUSH LOGS")
    for span in spans:
        rows, _ = session.rows("profile_native_attribution", "SELECT query_id,query_duration_ms,read_rows,read_bytes,"
            "memory_usage,exception_code,lower(hex(SHA256(query))) AS sql_sha256,query FROM system.query_log "
            "WHERE user='web10' AND is_initial_query=1 AND type IN "
            "('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing') "
            "AND query_start_time_microseconds>=parseDateTime64BestEffort(" + quote([span["started"]]) + ") "
            "AND query_start_time_microseconds<parseDateTime64BestEffort(" + quote([span["ended"]]) + ") "
            "ORDER BY query_start_time_microseconds,query_id")
        span["native_queries"] = rows
        span["read_rows"] = sum(int(row["read_rows"]) for row in rows)
        span["read_bytes"] = sum(int(row["read_bytes"]) for row in rows)
    raw = restore.command(session.compose, session.env, "logs", "--no-log-prefix", "api").decode()
    observations = [json.loads(line.split("COSTFN_REQUEST=", 1)[1]) for line in raw.splitlines()
                    if line.startswith("COSTFN_REQUEST=")]
    wanted = {row["request_id"] for row in requests}
    observations = [row for row in observations if row.get("request_id") in wanted]
    (output / "observations.json").write_text(json.dumps(observations, indent=2) + "\n")
    result = {"kind": "SATELLITE_ARM_UNTREATED_STAGE_INVENTORY", "dataset_id": manifest["dataset_id"],
              "droplet_id": session.host_id, "reader": reader, "groups": groups,
              "reference_page": expected, "wrong_origin_denied": True, "stages": spans,
              "complete_sequence_parity": "NOT_ESTABLISHED", "satellite_builds_started": False,
              "scope": "one untreated call per shape; independently supplied followup IDs, not a completed sequence or cell"}
    actual_scopes = {}
    for request in requests:
        scope_path = root / "scope-observer" / (request["request_id"] + ".jsonl")
        if scope_path.exists():
            events = [json.loads(line) for line in scope_path.read_text().splitlines()]
            if events and events[0]["reader"] == reader:
                actual_scopes[request["kind"]] = events[0]["readable"]
    if not all(kind in actual_scopes for kind in ("main", "reactions", "comments")):
        raise ValueError("actual authorized compiler scopes missing; do not infer them from fixture memberships")
    result["actual_readable_by_kind"] = actual_scopes
    result["source_sha256"] = {name: hashlib.sha256((Path(__file__).parent / name).read_bytes()).hexdigest()
                               for name in ("arm_satellite_profile.py", "arm_satellite_profile_api.py",
                                            "arm_satellite_profile.compose.yml", "arm_satellite_runtime.py", "core_feed.py")}
    (output / "inventory.json").write_text(json.dumps(result, indent=2) + "\n")
    print("[satellite-profile] live inventory ready; review before builds", flush=True)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    asyncio.run(profile(parser.parse_args().root))
