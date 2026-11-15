"""Build scope-qualified counters and run native T1 on the approved realism copy.

This does not activate a feed adapter. Build SQL comes from current canonical
boundaries, not Arm D/T goldens or author hints. Frozen implementations survive.
"""
import argparse
from dataclasses import asdict
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
import sys

import sqlglot
from sqlglot import exp

import arm_satellite_runtime as runtime
import arm_satellite_sql as typed
import smoke_realism


RECIPES = (
    typed.Counter("reactions:like", "reactions", match_body_key="type", match_value="like"),
    typed.Counter("reactions:dislike", "reactions", match_body_key="type", match_value="dislike"),
    typed.Counter("comments", "comments", target_body_key="post_id"),
    typed.Counter("reposts", "posts", target_body_key="repost_of"),
)


def canonical_boundary(service, groups, reader):
    # Loading just the compiler does not initialize the API or a database client.
    api = Path(__file__).resolve().parents[3] / "api"
    if str(api) not in sys.path:
        sys.path.insert(0, str(api))
    from app.v3.services import safe_query
    return safe_query._boundary_cte_sql(service, groups, reader)


def generation(session):
    rows, _ = session.rows("canonical_generation", "SELECT table,name,rows,data_version FROM system.parts "
        "WHERE database='web10' AND active AND table IN ('documents','doc_groups','group_members',"
        "'group_contracts','app_contracts','user_blacklist','group_blacklist','user_group_sharing',"
        "'group_hidden_docs','banned_users') ORDER BY table,name")
    return hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest(), rows


def oracle_boundary(service, groups, reader):
    """Independent FINAL-table reference, never the treatment's boundary SQL."""
    q = typed.literal
    group_list = ",".join(q(group) for group in groups) or "''"
    return ("SELECT d.* FROM (SELECT * FROM documents FINAL WHERE collection_name=" + q(service)
        + " AND deleted=0) AS d INNER JOIN (SELECT doc_id,group_id FROM doc_groups FINAL WHERE deleted=0 "
        "AND group_id IN (" + group_list + ")) AS g ON d.doc_id=g.doc_id WHERE "
        "d.author_key NOT IN (SELECT user_key FROM user_blacklist FINAL WHERE deleted=0 AND blocked_key=" + q(reader) + ") "
        "AND (d.author_key,g.group_id) NOT IN (SELECT user_key,group_id FROM group_blacklist FINAL "
        "WHERE deleted=0 AND blocked_key=" + q(reader) + ") AND NOT (d.author_key!=" + q(reader)
        + " AND (d.author_key,g.group_id) IN (SELECT user_key,group_id FROM user_group_sharing FINAL "
        "WHERE deleted=0 AND sharing_enabled=0)) AND (d.doc_id,g.group_id) NOT IN "
        "(SELECT doc_id,group_id FROM group_hidden_docs FINAL WHERE deleted=0) AND d.author_key NOT IN "
        "(SELECT username FROM banned_users FINAL WHERE deleted=0)")


def verify_fixture(session, scopes):
    """Actual current canonical boundary, pointed at tiny separate fixture tables."""
    def query(label, sql):
        return session.query("t1_fixture_" + label, sql)
    query("documents", "CREATE TABLE satellite_fixture_documents AS documents")
    query("links", "CREATE TABLE satellite_fixture_links AS doc_groups")
    for service, body in (("reactions", '{"type":"like"}'), ("comments", '{"post_id":"target"}')):
        query("insert_" + service, "INSERT INTO satellite_fixture_documents "
              "(doc_id,author_key,collection_name,body,ref_value,created_at,updated_at) SELECT "
              "concat(" + typed.literal(service + "-") + ",toString(number)),'same-author'," + typed.literal(service)
              + "," + typed.literal(body) + ",'target',now64(3),now64(3) FROM numbers(15)")
    query("insert_shared", "INSERT INTO satellite_fixture_documents "
          "(doc_id,author_key,collection_name,body,ref_value,created_at,updated_at) VALUES "
          "('shared-reaction','another-author','reactions','{\"type\":\"like\"}','shared-target',now64(3),now64(3))")
    query("insert_target", "INSERT INTO satellite_fixture_documents "
          "(doc_id,author_key,collection_name,body,ref_value,created_at,updated_at) VALUES "
          "('target','same-author','posts','{}','',now64(3),now64(3))")
    query("insert_outside_links", "INSERT INTO satellite_fixture_links (doc_id,group_id,created_at,updated_at) "
          "SELECT doc_id,'outside',created_at,updated_at FROM satellite_fixture_documents WHERE ref_value='target'")
    query("insert_links", "INSERT INTO satellite_fixture_links (doc_id,group_id,created_at,updated_at) VALUES "
          "('target','allowed',now64(3),now64(3)),('shared-reaction','allowed',now64(3),now64(3)),"
          "('shared-reaction','second',now64(3),now64(3))")
    recipes = [*RECIPES[:3], typed.Counter("distinct-like", "reactions", match_body_key="type", match_value="like", distinct=True)]
    mapping = {"reactions": ["allowed", "second"], "comments": ["allowed", "second"]}
    boundaries = {}
    for service, groups in mapping.items():
        tree = sqlglot.parse_one(canonical_boundary(service, groups, "reader"), read="clickhouse")
        for table in tree.find_all(exp.Table):
            if table.name in ("documents", "doc_groups"):
                table.set("this", exp.to_identifier({"documents": "satellite_fixture_documents",
                                                    "doc_groups": "satellite_fixture_links"}[table.name]))
        boundaries[service] = tree.sql(dialect="clickhouse")
    scope = typed.scope_key("reader", mapping, "isolated-native-fixture-v1", recipes)
    for index, sql in enumerate(typed.build_counts(boundaries, scope, recipes)):
        query("build_" + str(index), sql)
    rows, _ = session.rows("t1_fixture_values", "SELECT doc_id,counter_name,value FROM counting_numbers WHERE scope_key="
                           + typed.literal(scope) + " ORDER BY doc_id,counter_name")
    actual = {(row["doc_id"], row["counter_name"]): int(row["value"]) for row in rows}
    if actual != {("shared-target", "distinct-like"): 1, ("shared-target", "reactions:like"): 2}:
        raise ValueError("T1 INVALID: outside-group author admitted or shared multiplicity incorrect")
    source, _ = session.rows("t1_fixture_source_counts", "SELECT collection_name,count() AS n FROM satellite_fixture_documents "
                             "WHERE ref_value='target' GROUP BY collection_name ORDER BY collection_name")
    if {row["collection_name"]: int(row["n"]) for row in source} != {"reactions": 15, "comments": 15}:
        raise ValueError("T1 fixture does not replay the preserved fifteen-versus-zero case")
    scopes.append({"scope_key": scope, "kind": "isolated_native_attachment_regression", "rows": rows,
                   "outside_author_owned_sources": source,
                   "outside_group_like": actual.get(("target", "reactions:like"), 0),
                   "outside_group_comment": actual.get(("target", "comments"), 0), "parity": "PASS"})


def build(root):
    root = Path(root)
    session = runtime.Session(root)
    envelope = session.verify_envelope()
    profile = json.loads((root / "profile/inventory.json").read_bytes())
    if profile["droplet_id"] != session.host_id or profile["satellite_builds_started"] is not False:
        raise ValueError("same-host completed Step 0 inventory required before build")
    if not (root / "evidence/inventory-reported.json").exists():
        raise ValueError("operator-facing Step 0 receipt must be reported before builds")
    output = root / "counts"
    output.mkdir(exist_ok=False)
    result = {"kind": "SATELLITE_SCOPE_COUNT_BUILD_T1", "outcome": "BUILDING", "T1": "NOT_RUN",
              "configuration": "P", "droplet_id": session.host_id, "dataset_id": profile["dataset_id"],
              "envelope": envelope, "started_utc": datetime.now(UTC).isoformat(), "scopes": [],
              "recipes": [asdict(counter) for counter in RECIPES], "build_queries": [],
              "feed_adapter_activated": False, "fanout": False,
              "aggregation_semantics": "canonical row multiplicity; explicit DISTINCT fixture also checked",
              "scope_scaling_limit": "materialized requested reader scopes only; no all-reader build or maintenance claim"}
    result["source_sha256"] = {name: hashlib.sha256((Path(__file__).parent / name).read_bytes()).hexdigest()
                               for name in ("arm_satellite_counts.py", "arm_satellite_sql.py", "arm_satellite_runtime.py")}

    def save():
        with (output / "result.json").open("w") as stream:
            json.dump(result, stream, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())

    save()
    try:
        # Let existing canonical merges settle before taking the cache generation.
        session.query("settle_documents", "OPTIMIZE TABLE documents FINAL", setup_seconds=900)
        session.query("settle_links", "OPTIMIZE TABLE doc_groups FINAL", setup_seconds=900)
        source_generation, parts = generation(session)
        result["canonical_generation"] = source_generation
        result["canonical_parts"] = parts
        session.query("create_counting_numbers", typed.COUNT_DDL)
        reader = profile["reader"]
        ids = [row["doc_id"] for row in profile["reference_page"]]
        # The reference page exercises zero Following / nonzero Discover counts.
        # Add highest engagement references to avoid only testing that page.
        high, _ = session.rows("t1_stratified_high_engagement", "SELECT ref_value,count() AS n FROM documents FINAL "
            "WHERE collection_name='reactions' AND deleted=0 AND ref_value!='' GROUP BY ref_value "
            "ORDER BY n DESC,ref_value LIMIT 5", setup_seconds=900)
        canyon, _ = session.rows("t1_canyon_author", "SELECT author_key,count() AS n FROM documents FINAL "
            "WHERE collection_name='posts' AND deleted=0 AND NOT has(tags,'ad') AND NOT has(tags,'product') "
            "GROUP BY author_key ORDER BY n DESC,author_key LIMIT 1", setup_seconds=900)
        canyon_ids, _ = session.rows("t1_canyon_targets", "SELECT doc_id FROM documents FINAL WHERE author_key="
            + typed.literal(canyon[0]["author_key"]) + " AND collection_name='posts' AND deleted=0 "
            "AND NOT has(tags,'ad') AND NOT has(tags,'product') ORDER BY created_at DESC,doc_id LIMIT 5")
        ids = sorted(set(ids + [row["ref_value"] for row in high] + [row["doc_id"] for row in canyon_ids]))
        result["stratified_targets"] = {"ordinary_page": len(profile["reference_page"]), "high_engagement": high,
                                         "all_ids": ids, "canyon_author": canyon, "canyon_targets": canyon_ids,
                                         "shared_group_stratum": "explicit two-group native fixture below"}
        for label in ("main", "reactions", "comments"):
            actual_readable = profile["actual_readable_by_kind"][label]
            recipes = [counter for counter in RECIPES if counter.service in actual_readable]
            if not recipes:
                raise ValueError("no configured recipe for the actual authorized request services")
            mapping = {service: actual_readable[service] for service in sorted({counter.service for counter in recipes})}
            scope = typed.scope_key(reader, mapping, source_generation, recipes)
            boundaries = {service: canonical_boundary(service, readable, reader) for service, readable in mapping.items()}
            built = {"label": label, "scope_key": scope, "groups_by_service": mapping, "comparisons": [], "complete": False}
            result["scopes"].append(built)
            save()
            for index, sql in enumerate(typed.build_counts(boundaries, scope, recipes)):
                (output / (label + "-" + str(index) + ".sql")).write_text(sql + "\n")
                _, query_id = session.query("build_" + label + "_" + str(index), sql, setup_seconds=900)
                result["build_queries"].append({"query_id": query_id, "scope": scope, "recipe": recipes[index].name,
                                                "setup_native": session.native(query_id)})
                save()
            for counter in recipes:
                target = ("JSONExtractString(body," + typed.literal(counter.target_body_key) + ")"
                          if counter.target_body_key is not None else counter.target_column)
                predicate = ("JSONExtractString(body," + typed.literal(counter.match_body_key) + ")="
                             + typed.literal(counter.match_value) if counter.match_body_key is not None else "1")
                expected, _ = session.rows("t1_canonical_" + label + "_" + counter.name,
                    "SELECT " + target + " AS doc_id,countIf(" + predicate + ") AS value FROM ("
                    + oracle_boundary(counter.service, mapping[counter.service], reader)
                    + ") WHERE " + target + " IN (" + smoke_realism.literals(ids)
                    + ") GROUP BY doc_id", setup_seconds=900)
                actual, _ = session.rows("t1_stored_" + label + "_" + counter.name,
                    typed.read_counts(scope, ids, [counter.name], built_scope=scope,
                        built_counter_names=[recipe.name for recipe in recipes],
                        current_generation=source_generation, built_generation=source_generation))
                expected_values = {row["doc_id"]: int(row["value"]) for row in expected}
                actual_values = {row["doc_id"]: int(row["value"]) for row in actual}
                if (len(actual_values) != len(actual)
                        or any(actual_values.get(doc, 0) != expected_values.get(doc, 0) for doc in ids)):
                    result["T1"] = "FAIL"
                    raise ValueError("T1 INVALID: scoped canonical count mismatch")
                built["comparisons"].append({"counter": counter.name, "targets": len(ids), "parity": "PASS",
                                              "canonical": expected_values, "stored": actual_values})
                save()
            built["complete"] = True
        verify_fixture(session, result["scopes"])
        current_generation, _ = generation(session)
        if current_generation != source_generation:
            raise ValueError("canonical source generation changed during count build; do not serve")
        result.update(outcome="COUNTS_BUILT_T1_PASS", T1="PASS",
                      completed_utc=datetime.now(UTC).isoformat())
    except Exception as error:
        result.update(outcome="STOP", failure_class=type(error).__name__, completed_utc=datetime.now(UTC).isoformat())
        save()
        raise
    save()
    print("[satellite-p] scope counters built; native stratified T1 passes; T2 still open", flush=True)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    build(parser.parse_args().root)
