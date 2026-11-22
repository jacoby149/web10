"""Remaining typed access paths for Config P; pointers, never copied bodies.

All builds are explicit setup on the approved isolated host. No runtime patch,
fanout writer, production DDL, default change or authorization replacement.
"""
import argparse
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path

import arm_satellite_runtime as runtime
import arm_satellite_sql as typed
import arm_satellite_counts as counts_builder
import arm_t

STRINGS_DDL = """CREATE TABLE strings (
    owner_key String, field_name String, value String,
    author_key String, doc_id String, version DateTime64(3)
) ENGINE = MergeTree ORDER BY (owner_key,field_name,value,author_key,doc_id)
SETTINGS index_granularity=64"""
TIMESTAMPS_DDL = """CREATE TABLE timestamps (
    field_name String, value DateTime64(3), author_key String,
    doc_id String, version DateTime64(3)
) ENGINE = MergeTree ORDER BY (field_name,value,doc_id,author_key)
SETTINGS index_granularity=64"""

TRANSPOSE_BUILD = """INSERT INTO doc_groups_t
SELECT g.group_id,d.created_at,g.doc_id,d.author_key,g.created_at,g.updated_at,g.deleted,
       d.collection_name,d.tags,d.ref_value,
       JSONExtractString(d.body,'post_id'),JSONExtractString(d.body,'repost_of')
FROM (SELECT * FROM doc_groups FINAL WHERE deleted=0) AS g
INNER JOIN (SELECT * FROM documents FINAL WHERE deleted=0) AS d ON g.doc_id=d.doc_id"""
TRANSPOSE_CHECK = """SELECT count() AS matched,
countIf(tuple(t.author_key,t.created_at,t.link_created_at,t.updated_at,t.deleted,
              t.collection_name,t.tags,t.ref_value,t.comment_post_id,t.repost_of)
     != tuple(d.author_key,d.created_at,g.created_at,g.updated_at,g.deleted,
              d.collection_name,d.tags,d.ref_value,
              JSONExtractString(d.body,'post_id'),JSONExtractString(d.body,'repost_of'))) AS mismatched
FROM doc_groups_t AS t
INNER JOIN (SELECT * FROM doc_groups FINAL WHERE deleted=0) AS g ON t.doc_id=g.doc_id AND t.group_id=g.group_id
INNER JOIN (SELECT * FROM documents FINAL WHERE deleted=0) AS d ON t.doc_id=d.doc_id AND t.author_key=d.author_key"""


def identity_builds(service="posts", profile_service="profile", reference_key="repost_of", *, discover):
    """Application vocabulary is recipe data; schema is only generic typed fields."""
    q = typed.literal
    return {
        "document_identity": "INSERT INTO strings SELECT doc_id,concat('document:',collection_name),"
            "author_key,author_key,doc_id,updated_at FROM documents FINAL WHERE deleted=0",
        "profile_identity": "INSERT INTO strings SELECT author_key," + q("service:" + profile_service)
            + ",doc_id,author_key,doc_id,updated_at FROM documents FINAL WHERE deleted=0 AND collection_name="
            + q(profile_service),
        "reference_identity": "INSERT INTO strings SELECT JSONExtractString(body," + q(reference_key) + "),"
            + q("body:" + reference_key) + ",doc_id,author_key,doc_id,updated_at FROM documents FINAL "
            "WHERE deleted=0 AND collection_name=" + q(service) + " AND JSONExtractString(body,"
            + q(reference_key) + ")!=''",
        "inventory_identity": "INSERT INTO strings SELECT " + q(discover) + "," + q("tag:node_ad")
            + ",doc_id,author_key,doc_id,updated_at FROM documents FINAL WHERE deleted=0 AND has(tags,'node_ad') "
            "AND doc_id IN (SELECT doc_id FROM doc_groups FINAL WHERE deleted=0 AND group_id=" + q(discover) + ")",
        "shared_time": "INSERT INTO timestamps SELECT " + q(service) + ",created_at,author_key,doc_id,updated_at "
            "FROM documents FINAL WHERE deleted=0 AND collection_name=" + q(service)
            + " AND NOT has(tags,'ad') AND NOT has(tags,'product')",
    }


def view_builds(service, source_generation):
    scope = hashlib.sha256(json.dumps({"source": "content_events", "service": service,
        "event_type": "delivery", "source_generation": source_generation}, sort_keys=True).encode()).hexdigest()
    result = []
    for name, aggregate in (("delivery:impressions", "count()"), ("delivery:reach", "uniqExact(reader_key)")):
        result.append("INSERT INTO counting_numbers SELECT doc_id," + typed.literal(name) + ","
            + typed.literal(scope) + "," + aggregate + " FROM content_events WHERE service="
            + typed.literal(service) + " AND event_type='delivery' GROUP BY doc_id")
    return scope, result


def build_view_snapshots(session, execute, result, *, explore=False):
    result["view_treatment"] = "PHASE_1_6_CONFLICT_OPEN_NOT_ACTIVATED"
    result["view_acceptance_eligible"] = False
    if not explore:
        print("[satellite-p] skip view snapshots; Phase 1.6 replacement is not approved", flush=True)
        return
    print("[satellite-p] exploratory view snapshot start; excluded from feed acceptance", flush=True)
    event_parts, _ = session.rows("view_generation", "SELECT name,rows,data_version FROM system.parts "
        "WHERE database='web10' AND table='content_events' AND active ORDER BY name")
    event_generation = hashlib.sha256(json.dumps(event_parts, sort_keys=True).encode()).hexdigest()
    scope, queries = view_builds("posts", event_generation)
    result["view_scope"] = scope
    result["view_freshness"] = "exploratory setup snapshot only; no live delivery maintenance or feed acceptance"
    for index, sql in enumerate(queries):
        execute("exploratory_views_" + str(index), sql, seconds=1200)
    print("[satellite-p] exploratory view snapshot end; Phase 1.6 conflict remains open", flush=True)


def count_receipt(root, host, path=None):
    path = Path(path) if path is not None else Path(root) / "counts/result.json"
    counts = json.loads(path.read_bytes())
    expected_table = {"SATELLITE_SCOPE_COUNT_BUILD_T1": "counting_numbers",
                      "SATELLITE_BATCH_COUNT_BUILD_T1": "counting_numbers_p2"}.get(counts.get("kind"))
    completed = {scope.get("label") for scope in counts.get("scopes", []) if scope.get("complete") is True}
    if (counts.get("T1") != "PASS" or counts.get("droplet_id") != host
            or counts.get("dataset_id") != arm_t.DATASET or expected_table is None
            or counts.get("final_table", expected_table) != expected_table
            or not {"main", "reactions", "comments"} <= completed):
        raise ValueError("complete same-host native T1 and exact final count table required")
    if expected_table == "counting_numbers_p2" and not any(
            scope.get("label") == "fixture" and scope.get("complete") is True and scope.get("parity") == "PASS"
            for scope in counts["scopes"]):
        raise ValueError("batched native regression fixture must pass before metadata setup")
    return counts


def build(root, *, explore_view_snapshots=False, counts_receipt=None):
    root = Path(root)
    session = runtime.Session(root)
    session.verify_envelope()
    counts = count_receipt(root, session.host_id, counts_receipt)
    current, _ = counts_builder.generation(session)
    if current != counts["canonical_generation"]:
        raise ValueError("canonical generation changed since count T1; do not build metadata")
    output = root / "metadata"
    output.mkdir(exist_ok=False)
    result = {"kind": "SATELLITE_CONFIG_P_METADATA_BUILDS", "dataset_id": arm_t.DATASET,
              "droplet_id": session.host_id, "outcome": "BUILDING", "started_utc": datetime.now(UTC).isoformat(),
              "steps": [], "body_copies": False, "fanout": False, "T2": "NOT_RUN"}
    counts_path = Path(counts_receipt) if counts_receipt is not None else root / "counts/result.json"
    result["count_receipt_sha256"] = hashlib.sha256(counts_path.read_bytes()).hexdigest()
    result["count_table"] = counts.get("final_table", "counting_numbers")
    result["canonical_generation"] = current
    result["source_sha256"] = {name: hashlib.sha256((Path(__file__).parent / name).read_bytes()).hexdigest()
                               for name in ("arm_satellite_metadata.py", "arm_satellite_runtime.py", "arm_satellite_sql.py",
                                            "arm_satellite_counts.py", "arm_t.py")}
    result["open_integration_gates"] = ["independent profile/ref/inventory/view parity",
        "live view-delivery maintenance", "balanced/Trending cached slices", "Config P API adapter",
        "all-reader scope/storage/maintenance cost", "T2/T3/T5/T6/T8"]

    def save():
        (output / "result.json").write_text(json.dumps(result, indent=2) + "\n")

    def execute(label, sql, seconds=900):
        (output / (label + ".sql")).write_text(sql + "\n")
        _, query_id = session.query("satellite_build_" + label, sql, setup_seconds=seconds)
        result["steps"].append({"label": label, "query_id": query_id, "setup_native": session.native(query_id)})
        save()

    save()
    try:
        transpose_ddl = arm_t.DDL + " SETTINGS index_granularity=64"
        for label, ddl in (("transpose_ddl", transpose_ddl), ("strings_ddl", STRINGS_DDL), ("timestamps_ddl", TIMESTAMPS_DDL)):
            execute(label, ddl)
        execute("transpose", TRANSPOSE_BUILD)
        expected, _ = session.rows("transpose_expected", "SELECT count() AS n FROM "
            "(SELECT doc_id FROM doc_groups FINAL WHERE deleted=0) AS g INNER JOIN "
            "(SELECT doc_id FROM documents FINAL WHERE deleted=0) AS d ON g.doc_id=d.doc_id", setup_seconds=900)
        check, _ = session.rows("transpose_exact_reconciliation", TRANSPOSE_CHECK, setup_seconds=900)
        stored, _ = session.rows("transpose_rows", "SELECT count() AS n FROM doc_groups_t")
        if int(stored[0]["n"]) != int(expected[0]["n"]) or int(check[0]["matched"]) != int(expected[0]["n"]) or int(check[0]["mismatched"]):
            raise ValueError("transpose exact row/metadata reconciliation failed")
        result["transpose_reconciliation"] = {"expected": expected, "stored": stored, "check": check}
        # This experiment's app vocabulary is data passed to the typed builder.
        for label, sql in identity_builds(discover="api.localhost/groups/web10/discover").items():
            execute(label, sql)
        build_view_snapshots(session, execute, result, explore=explore_view_snapshots)
        result["generic_storage_rows"], _ = session.rows("typed_storage_counts", "SELECT field_name,count() AS n "
            "FROM strings GROUP BY field_name ORDER BY field_name")
        closing, _ = counts_builder.generation(session)
        if closing != current:
            raise ValueError("canonical generation changed during metadata setup")
        result.update(outcome="BUILT_PENDING_INDEPENDENT_PARITY_AND_LIVE_MAINTENANCE",
                      completed_utc=datetime.now(UTC).isoformat())
    except Exception as error:
        result.update(outcome="BUILD_FAILED_STOP", failure_class=type(error).__name__,
                      completed_utc=datetime.now(UTC).isoformat())
        save()
        raise
    save()
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("--counts-receipt", type=Path, help="explicit complete native T1 receipt, including batched p2")
    parser.add_argument("--explore-view-snapshots", action="store_true",
                        help="exploratory only; never replaces Phase 1.6 or satisfies feed acceptance")
    args = parser.parse_args()
    build(args.root, explore_view_snapshots=args.explore_view_snapshots, counts_receipt=args.counts_receipt)
