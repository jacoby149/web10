"""Bounded synthetic receipt: actual app SQL -> safe compiler -> disposable ClickHouse.

Run from api/: uv run --frozen python ../marketing/web10-social/screenshots/hashtag-query.py
No production access, grants, services or research datasets; only this container is removed.
"""
import json
import subprocess
import sys
import time
import uuid
from pathlib import Path

import clickhouse_connect

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "api"))
from app.v3.services.safe_query import build_safe_query

APP = ROOT / "marketing/web10-social"
OUT = ROOT / ".context/hashtag-autocomplete"
NAME = "hashtag-query-" + uuid.uuid4().hex[:10]
PASSWORD = "isolated-synthetic-fixture"


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


client = None
try:
    docker("run", "--rm", "-d", "--name", NAME, "--memory=1g", "--cpus=2",
           "-p", "127.0.0.1::8123", "-e", "CLICKHOUSE_PASSWORD=" + PASSWORD,
           "clickhouse/clickhouse-server:24.8.14.39")
    for attempt in range(100):
        binding = docker("port", NAME, "8123/tcp")
        if binding:
            break
        time.sleep(0.1)
    port = int(binding.split(":")[-1])
    for attempt in range(100):
        try:
            client = clickhouse_connect.get_client(host="127.0.0.1", port=port, password=PASSWORD)
            break
        except Exception:
            if attempt == 99:
                raise
            time.sleep(0.2)
    tables = {
        "documents": "doc_id String, author_key String, posted_by String, collection_name String, body String, ref_value String, tags Array(String), created_at DateTime64(3), updated_at DateTime64(3), ad_mode String, ad_target String, deleted UInt8",
        "doc_groups": "doc_id String, group_id String, updated_at DateTime64(3), deleted UInt8",
        "user_blacklist": "user_key String, blocked_key String, updated_at DateTime64(3), deleted UInt8",
        "group_blacklist": "user_key String, group_id String, blocked_key String, updated_at DateTime64(3), deleted UInt8",
        "user_group_sharing": "user_key String, group_id String, sharing_enabled UInt8, updated_at DateTime64(3), deleted UInt8",
        "group_hidden_docs": "group_id String, doc_id String, updated_at DateTime64(3), deleted UInt8",
        "banned_users": "username String, updated_at DateTime64(3), deleted UInt8",
    }
    for table, columns in tables.items():
        client.command(f"CREATE TABLE {table} ({columns}) ENGINE=Memory")

    def post(doc_id, hashtags, *, author="creator", group="discover", tags=None, deleted=0):
        client.insert("documents", [[doc_id, author, "posts", json.dumps({"hashtags": hashtags}), tags or [], deleted]],
                      column_names=["doc_id", "author_key", "collection_name", "body", "tags", "deleted"])
        client.insert("doc_groups", [[doc_id, group]], column_names=["doc_id", "group_id"])

    for tag, count in [("music", 1), ("musician", 3), ("musictop", 4), ("livemusic", 5), ("music_live", 2), ("musicxlive", 3)]:
        for i in range(count):
            post(f"{tag}-{i}", [tag, tag])  # Repeated occurrences must count once.
    post("private", ["music"], group="private")
    post("ad", ["music"], tags=["ad"])
    post("product", ["music"], tags=["product"])
    post("deleted", ["music"], deleted=1)
    post("blocked", ["music"], author="blocked-author")
    client.insert("user_blacklist", [["blocked-author", "anon"]], column_names=["user_key", "blocked_key"])
    post("hidden", ["music"])
    client.insert("group_hidden_docs", [["discover", "hidden"]], column_names=["group_id", "doc_id"])
    post("unindexed", [])
    queries = json.loads(subprocess.check_output([
        "bun", "-e", "import {hashtagSearchSql} from './src/data/hashtagSearch.ts'; console.log(JSON.stringify(['music','music_',''].map(q=>[q,hashtagSearchSql(q)])))",
    ], cwd=APP, text=True))
    results = {}
    for query, sql in queries:
        compiled = build_safe_query(sql, {"posts": ["discover"]})
        rows = client.query(compiled).result_rows
        results[query] = rows
    assert results["music"] == [("music", 1), ("musictop", 4), ("musician", 3), ("musicxlive", 3), ("music_live", 2), ("livemusic", 5)], results
    assert results["music_"] == [("music_live", 2)], results
    assert results[""][0] == ("livemusic", 5), results
    OUT.mkdir(parents=True, exist_ok=True)
    receipt = {"engine": client.command("SELECT version()"), "results": results,
               "distinctPosts": True, "exactBeforePopularity": True, "literalUnderscore": True,
               "privateAdProductDeletedBlockedHiddenExcluded": True, "syntheticOnly": True}
    (OUT / "query-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))
finally:
    if client:
        client.close()
    subprocess.run(["docker", "rm", "-f", NAME], check=False, capture_output=True)
