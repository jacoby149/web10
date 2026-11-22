"""Independent full-multiset metadata checks before any Config P feed probe."""
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path

import arm_satellite_counts as counts
import arm_satellite_runtime as runtime


def difference(actual, expected, columns):
    names = ",".join(columns)
    return ("SELECT count() AS mismatches FROM (SELECT " + names + ",sum(weight) AS delta FROM ("
            "SELECT " + names + ",toInt8(1) AS weight FROM (" + actual + ") UNION ALL SELECT "
            + names + ",toInt8(-1) AS weight FROM (" + expected + ")) GROUP BY " + names + " HAVING delta!=0)")


def checks():
    common = ["owner_key", "field_name", "value", "author_key", "doc_id", "version"]
    document = ("SELECT doc_id AS owner_key,concat('document:',collection_name) AS field_name,"
                "author_key AS value,author_key,doc_id,updated_at AS version FROM documents FINAL WHERE deleted=0")
    profile = ("SELECT author_key AS owner_key,'service:profile' AS field_name,doc_id AS value,"
               "author_key,doc_id,updated_at AS version FROM documents FINAL WHERE deleted=0 AND collection_name='profile'")
    reference = ("SELECT JSONExtractString(body,'repost_of') AS owner_key,'body:repost_of' AS field_name,doc_id AS value,"
                 "author_key,doc_id,updated_at AS version FROM documents FINAL WHERE deleted=0 AND collection_name='posts' AND owner_key!=''")
    inventory = ("SELECT 'api.localhost/groups/web10/discover' AS owner_key,'tag:node_ad' AS field_name,doc_id AS value,"
                 "author_key,doc_id,updated_at AS version FROM documents FINAL WHERE deleted=0 AND has(tags,'node_ad') "
                 "AND doc_id IN (SELECT doc_id FROM doc_groups FINAL WHERE deleted=0 AND group_id='api.localhost/groups/web10/discover')")
    result = {}
    for label, predicate, expected in (("identities", "startsWith(field_name,'document:')", document),
            ("profiles", "field_name='service:profile'", profile), ("references", "field_name='body:repost_of'", reference),
            ("inventory", "field_name='tag:node_ad'", inventory)):
        result[label] = difference("SELECT * FROM strings WHERE " + predicate, expected, common)
    result["time"] = difference("SELECT * FROM timestamps", "SELECT 'posts' AS field_name,created_at AS value,"
        "author_key,doc_id,updated_at AS version FROM documents FINAL WHERE deleted=0 AND collection_name='posts' "
        "AND NOT has(tags,'ad') AND NOT has(tags,'product')", ["field_name", "value", "author_key", "doc_id", "version"])
    return result


def verify(root):
    root = Path(root)
    session = runtime.Session(root)
    envelope = session.verify_envelope()
    metadata = json.loads((root / "metadata/result.json").read_bytes())
    if metadata["outcome"] != "BUILT_PENDING_INDEPENDENT_PARITY_AND_LIVE_MAINTENANCE" or metadata["droplet_id"] != session.host_id:
        raise ValueError("same-host completed metadata build required")
    output = root / "metadata-parity"
    output.mkdir(exist_ok=False)
    result = {"kind": "SATELLITE_METADATA_INDEPENDENT_PARITY", "outcome": "CHECKING", "checks": {},
              "droplet_id": session.host_id, "started_utc": datetime.now(UTC).isoformat(), "envelope": envelope,
              "metadata_sha256": hashlib.sha256((root / "metadata/result.json").read_bytes()).hexdigest(), "T2": "NOT_RUN"}

    def save():
        (output / "result.json").write_text(json.dumps(result, indent=2) + "\n")

    save()
    try:
        before, _ = counts.generation(session)
        if before != metadata["canonical_generation"]:
            raise ValueError("canonical generation changed before independent parity")
        for label, sql in checks().items():
            (output / (label + ".sql")).write_text(sql + "\n")
            rows, query_id = session.rows("independent_metadata_" + label, sql, setup_seconds=900)
            result["checks"][label] = {"mismatches": int(rows[0]["mismatches"]), "native": session.native(query_id)}
            save()
            if result["checks"][label]["mismatches"]:
                raise ValueError("metadata multiset parity INVALID: " + label)
        after, _ = counts.generation(session)
        if after != before:
            raise ValueError("canonical generation changed during independent parity")
        result.update(outcome="PASS", canonical_generation=after)
    except Exception as error:
        result.update(outcome="STOP", failure_class=type(error).__name__)
        raise
    finally:
        result["completed_utc"] = datetime.now(UTC).isoformat()
        save()
    return result
