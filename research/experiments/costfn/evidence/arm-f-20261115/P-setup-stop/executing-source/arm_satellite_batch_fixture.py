"""Native regression fixture for batching, before expensive realism setup."""
import json

import sqlglot
from sqlglot import exp

import arm_satellite_counts as original
import arm_satellite_sql as typed

DOCS = "satellite_batch_fixture_documents"
LINKS = "satellite_batch_fixture_links"


def rows():
    documents, links = [], []

    def document(doc, author, service, target, *, kind="like", version=1, deleted=0):
        body = {"post_id": target} if service == "comments" else {"type": kind}
        documents.append((doc, author, service, json.dumps(body), target, version, deleted))

    def link(doc, group="allowed", version=1, deleted=0):
        links.append((doc, group, version, deleted))

    for service in ("reactions", "comments"):
        for index in range(15):
            doc = service + "-outside-" + str(index)
            document(doc, "same-author", service, "outside-target")
            link(doc, "outside")
    document("outside-target", "same-author", "posts", "")
    link("outside-target")
    document("shared", "another-author", "reactions", "shared-target")
    link("shared")
    link("shared", "second")
    for author in ("author-a", "author-b"):
        document("collision", author, "reactions", "collision-target")
    link("collision")
    link("collision", "second")
    document("edited-kind", "a", "reactions", "edited-target")
    document("edited-kind", "a", "reactions", "edited-target", kind="dislike", version=2)
    link("edited-kind")
    document("moved", "a", "reactions", "old-target")
    document("moved", "a", "reactions", "current-target", version=2)
    link("moved")
    document("deleted", "a", "reactions", "dead-target")
    document("deleted", "a", "reactions", "dead-target", version=2, deleted=1)
    link("deleted")
    document("removed", "a", "reactions", "removed-target")
    link("removed")
    link("removed", version=2, deleted=1)
    document("positive-comment", "a", "comments", "comment-target")
    link("positive-comment")
    return documents, links


def expected():
    return {("shared-target", "reactions:like"): 2, ("shared-target", "fixture:distinct"): 1,
            ("collision-target", "reactions:like"): 4, ("collision-target", "fixture:distinct"): 1,
            ("current-target", "reactions:like"): 1, ("current-target", "fixture:distinct"): 1,
            ("edited-target", "reactions:dislike"): 1, ("comment-target", "comments"): 1}


def verify(session, output, result, total):
    from arm_satellite_batch_run import FINAL, build_scope, save
    session.query("batch_fixture_documents", "CREATE TABLE " + DOCS + " AS documents")
    session.query("batch_fixture_links", "CREATE TABLE " + LINKS + " AS doc_groups")
    documents, links = rows()
    q = typed.literal
    timestamp = lambda version: "fromUnixTimestamp64Milli(" + str(1793491200000 + version) + ")"  # noqa: E731
    values = ["(" + ",".join([*(q(value) for value in row[:5]), timestamp(1), timestamp(row[5]), str(row[6])]) + ")"
              for row in documents]
    session.query("batch_fixture_insert_documents", "INSERT INTO " + DOCS
                  + " (doc_id,author_key,collection_name,body,ref_value,created_at,updated_at,deleted) VALUES " + ",".join(values))
    values = ["(" + ",".join([q(doc), q(group), timestamp(1), timestamp(version), str(deleted)]) + ")"
              for doc, group, version, deleted in links]
    session.query("batch_fixture_insert_links", "INSERT INTO " + LINKS
                  + " (doc_id,group_id,created_at,updated_at,deleted) VALUES " + ",".join(values))
    recipes = [*original.RECIPES[:3], typed.Counter("fixture:distinct", "reactions", match_body_key="type", match_value="like", distinct=True)]
    mapping = {"reactions": ["allowed", "second"], "comments": ["allowed", "second"]}
    boundaries = {}
    for service, groups in mapping.items():
        tree = sqlglot.parse_one(original.canonical_boundary(service, groups, "fixture-reader"), read="clickhouse")
        for table in tree.find_all(exp.Table):
            if table.name in ("documents", "doc_groups"):
                table.set("this", exp.to_identifier(DOCS if table.name == "documents" else LINKS))
        boundaries[service] = tree.sql(dialect="clickhouse")
    scope = typed.scope_key("fixture-reader", mapping, "batch-fixture-v2", recipes)
    info = build_scope(session, output, result, "fixture", scope, boundaries, recipes, total, documents=DOCS, links=LINKS)
    actual, _ = session.rows("batch_fixture_result", "SELECT doc_id,counter_name,value FROM " + FINAL
                             + " WHERE scope_key=" + q(scope) + " ORDER BY doc_id,counter_name")
    got = {(row["doc_id"], row["counter_name"]): int(row["value"]) for row in actual}
    if len(got) != len(actual) or got != expected():
        result["fixture_actual"] = actual
        result["T1"] = "FAIL"
        save(output, result)
        raise ValueError("T1 INVALID: batched outside/shared/history native fixture mismatch")
    info.update(complete=True, parity="PASS", rows=actual,
                covers="fifteen-versus-zero, shared row2/distinct1, cross-author same-ID row4/distinct1, type/ref edits, document/attachment tombstones, positive comments")
    save(output, result)
