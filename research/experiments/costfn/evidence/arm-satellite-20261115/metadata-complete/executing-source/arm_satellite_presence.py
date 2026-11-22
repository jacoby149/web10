"""Preserve zero-valued reaction GROUP BY rows, including unknown reaction types."""
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path

import sqlglot
from sqlglot import exp

import arm_satellite_batch_run as batching
import arm_satellite_counts as counts
import arm_satellite_runtime as runtime
import arm_satellite_serve as serve
import arm_satellite_sql as typed


def build(root):
    root = Path(root)
    session = runtime.Session(root)
    envelope = session.verify_envelope()
    parity = json.loads((root / "metadata-parity/result.json").read_bytes())
    if parity.get("outcome") != "PASS" or parity.get("droplet_id") != session.host_id:
        raise ValueError("independent same-host metadata parity required")
    output = root / "presence"
    output.mkdir(exist_ok=False)
    profile = json.loads((root / "profile/inventory.json").read_bytes())
    old = json.loads((root / "counts-batch-p2/result.json").read_bytes())
    source, _ = counts.generation(session)
    if source != old["canonical_generation"]:
        raise ValueError("changed canonical generation before presence setup")
    result = {"kind": "SATELLITE_COUNTER_PRESENCE", "outcome": "BUILDING", "T1": "NOT_RUN",
              "droplet_id": session.host_id, "canonical_generation": source, "envelope": envelope, "scopes": [], "build_queries": [],
              "started_utc": datetime.now(UTC).isoformat(), "feed_activated": False}
    result["source_sha256"] = {name: hashlib.sha256((Path(__file__).parent / name).read_bytes()).hexdigest()
                              for name in ("arm_satellite_presence.py", "arm_satellite_batch_run.py", "arm_satellite_serve.py")}
    batching.save(output, result)
    try:
        docs, links = "satellite_presence_documents", "satellite_presence_links"
        session.query("presence_fixture_docs", "CREATE TABLE " + docs + " AS documents")
        session.query("presence_fixture_links", "CREATE TABLE " + links + " AS doc_groups")
        session.query("presence_fixture_insert", "INSERT INTO " + docs + " (doc_id,author_key,collection_name,body,ref_value,created_at,updated_at) "
                      "VALUES ('unknown-kind','fixture-author','reactions','{\"type\":\"future-kind\"}','unknown-target',now64(3),now64(3))")
        session.query("presence_fixture_link", "INSERT INTO " + links + " (doc_id,group_id,created_at,updated_at) VALUES ('unknown-kind','allowed',now64(3),now64(3))")
        presence = typed.Counter("reactions:present", "reactions")
        recipes = [*counts.RECIPES[:2], presence]
        boundary = sqlglot.parse_one(counts.canonical_boundary("reactions", ["allowed"], "fixture"), read="clickhouse")
        for table in boundary.find_all(exp.Table):
            if table.name in ("documents", "doc_groups"):
                table.set("this", exp.to_identifier(docs if table.name == "documents" else links))
        scope = typed.scope_key("fixture", {"reactions": ["allowed"]}, "presence-fixture", recipes)
        fixture = batching.build_scope(session, output, result, "presence_fixture", scope,
            {"reactions": boundary.sql(dialect="clickhouse")}, recipes, 8, documents=docs, links=links)
        select = sqlglot.parse_one("SELECT ref_value,countIf(JSONExtractString(body,'type')='like') AS like_count,"
            "countIf(JSONExtractString(body,'type')='dislike') AS dislike_count FROM reactions "
            "WHERE ref_value IN ('unknown-target') GROUP BY ref_value", read="clickhouse")
        rows, _ = session.rows("presence_zero_group", serve.counter_query(select, scope, ["unknown-target"], scope))
        if rows != [{"ref_value": "unknown-target", "like_count": "0", "dislike_count": "0"}]:
            raise ValueError("presence fixture INVALID: zero-valued aggregate row lost")
        fixture.update(complete=True, parity="PASS", zero_group=rows)
        mapping = {"reactions": profile["actual_readable_by_kind"]["reactions"]["reactions"]}
        scope = typed.scope_key(profile["reader"], mapping, source, [presence])
        info = batching.build_scope(session, output, result, "reaction_presence", scope,
            {"reactions": counts.canonical_boundary("reactions", mapping["reactions"], profile["reader"])}, [presence], 8)
        ids = old["stratified_targets"]["all_ids"]
        info["comparisons"] = batching.compare(session, scope, ids, [presence], source, mapping, profile["reader"])
        info.update(complete=True, groups_by_service=mapping)
        closing, _ = counts.generation(session)
        if closing != source:
            raise ValueError("source generation changed during presence setup")
        result.update(outcome="PASS", T1="PASS", serving_scope_key=scope)
    except Exception as error:
        result.update(outcome="STOP", failure_class=type(error).__name__)
        raise
    finally:
        result["completed_utc"] = datetime.now(UTC).isoformat()
        batching.save(output, result)
    return result
