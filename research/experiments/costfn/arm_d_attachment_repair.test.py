"""No-engine SQL construction + attachment regression, not native parity proof."""
import json
from pathlib import Path
import unittest

import sqlglot
from sqlglot import exp

import arm_d_attachment_repair as repair
import arm_d_rewrite
import arm_d_realism

GROUPS = ["api.localhost/groups/users/alice/followers", "api.localhost/groups/users/bob/followers"]
INVENTORY = {GROUPS[0]: ["alice"], GROUPS[1]: ["bob"]}
COMPILED, OLD, _ = arm_d_realism.treated_main("reader", GROUPS)


def boundaries(sql):
    tree = sqlglot.parse_one(sql, read="clickhouse")
    # SQL rendering adds explicit grouping around IN predicates. Compare the
    # expression trees, not redundant parenthesis nodes.
    tree = tree.transform(lambda node: node.this if isinstance(node, exp.Paren) else node)
    return {cte.alias: cte.this for cte in tree.args["with_"].expressions}


def latest(rows, keys):
    current = {}
    for row in rows:
        key = tuple(row[k] for k in keys)
        if key not in current or row["version"] > current[key]["version"]:
            current[key] = row
    return [row for row in current.values() if not row.get("deleted", False)]


def fixture_boundary(sql, service, documents, links):
    """Small relational model of the ACTUAL constructor's scan/join AST.

    Deliberately not a SQL engine: supports only the pinned boundary shape;
    policies are separately required to remain byte-equivalent as ASTs below.
    """
    boundary = boundaries(sql)[service]
    source = [table for table in boundary.find_all(exp.Table) if table.name in ("documents", "documents_d")]
    assert len(source) == 1
    where = source[0].find_ancestor(exp.Select).args["where"]
    hints = [node for node in where.find_all(exp.In) if isinstance(node.this, exp.Column) and node.this.name == "author_key"]
    assert len(hints) == 1
    authors = {node.this for node in hints[0].expressions}
    selected = [row for row in latest(documents, ("author", "id"))
                if row["service"] == service and row["author"] in authors]
    group_tables = [table for table in boundary.find_all(exp.Table) if table.name == "doc_groups"]
    if not group_tables:
        return selected  # The old shortcut admits every author's selected doc.
    assert len(group_tables) == 1
    group_where = group_tables[0].find_ancestor(exp.Select).args["where"]
    group_filter = [node for node in group_where.find_all(exp.In) if node.this.name == "group_id"]
    assert len(group_filter) == 1
    groups = {node.this for node in group_filter[0].expressions}
    return [doc for doc in selected for link in latest(links, ("id", "group"))
            if link["id"] == doc["id"] and link["group"] in groups]


class RepairTests(unittest.TestCase):
    def test_retained_native_repair_is_attributed_timeout_not_parity_success(self):
        import hashlib
        root = Path(__file__).parent / "evidence"
        prior_root = root / "arm-d-realism-20261115/arm-d-realism-r1"
        prior = json.loads((prior_root / "result.json").read_bytes())
        actual_root = root / "arm-d-attachment-checked-20261115/retry/arm-d-attachment-checked-r1"
        actual = json.loads((actual_root / "result.json").read_bytes())
        inventory = {row["group_id"]: row["actual_attached_authors"] for row in prior["author_sets"]}
        sql = repair.transform((prior_root / "compiled.sql").read_text().strip(), prior["reader"],
                               prior["groups_including_self"], inventory)
        self.assertEqual(hashlib.sha256(sql.encode()).hexdigest(), actual["treated_sql_sha256"])
        self.assertEqual((actual_root / "treated.sql").read_text().strip(), sql)
        self.assertEqual(actual["outcome"], "NATIVE_FAILURE_STOP")
        self.assertEqual(actual["measured_trials"], [])
        self.assertEqual(actual["parity"], "NOT_RUN")
        self.assertEqual(len(actual["observations"]), 1)
        self.assertEqual(int(actual["observations"][0]["exception_code"]), 159)
        self.assertGreater(int(actual["observations"][0]["read_rows"]), 10_000_000)
        self.assertEqual(actual["anomaly"], "MAIN_EXCEEDS_10M_ROWS")

    def setUp(self):
        self.fixed = repair.transform(COMPILED, "reader", GROUPS, INVENTORY)

    def test_exploit_same_author_outside_group_no_longer_enters_counts(self):
        for service in ("reactions", "comments"):
            with self.subTest(service=service):
                docs = [{"id": "outside", "author": "alice", "service": service, "version": 1}]
                links = [{"id": "outside", "group": "discover", "version": 1}]
                self.assertEqual(len(fixture_boundary(OLD, service, docs, links)), 1)
                self.assertEqual(fixture_boundary(self.fixed, service, docs, links), [])

    def test_positive_attached_cross_author_engagement_remains(self):
        for service in ("reactions", "comments"):
            docs = [{"id": "engagement", "author": "bob", "service": service, "version": 1}]
            links = [{"id": "engagement", "group": GROUPS[0], "version": 1}]
            self.assertEqual(len(fixture_boundary(self.fixed, service, docs, links)), 1)

    def test_latest_document_and_attachment_tombstones_still_deny(self):
        doc = {"id": "reaction", "author": "alice", "service": "reactions", "version": 1}
        link = {"id": "reaction", "group": GROUPS[0], "version": 1}
        for docs, links in (([doc, {**doc, "version": 2, "deleted": True}], [link]),
                            ([doc], [link, {**link, "version": 2, "deleted": True}])):
            self.assertEqual(fixture_boundary(self.fixed, "reactions", docs, links), [])
        self.assertEqual(len(fixture_boundary(self.fixed, "reactions", [doc], [link])), 1)

    def test_multiple_authors_and_duplicate_attachments_are_not_owner_collapsed(self):
        inventory = {GROUPS[0]: ["alice", "charlie"], GROUPS[1]: ["charlie"]}
        fixed = repair.transform(COMPILED, "reader", GROUPS, inventory)
        docs = [{"id": "shared", "author": "charlie", "service": "posts", "version": 1}]
        links = [{"id": "shared", "group": group, "version": 1} for group in GROUPS]
        self.assertEqual(len(fixture_boundary(fixed, "posts", docs, links)), 2)

    def test_every_canonical_gate_join_projection_and_history_expression_survives(self):
        original = boundaries(COMPILED)
        fixed = boundaries(self.fixed)
        for service in arm_d_rewrite.SERVICES:
            self.assertEqual(original[service].args["where"], fixed[service].args["where"])
            self.assertEqual(original[service].args["joins"], fixed[service].args["joins"])
            self.assertEqual(original[service].expressions, fixed[service].expressions)
            source = next(t for t in fixed[service].find_all(exp.Table) if t.name == "documents_d")
            source.set("this", exp.to_identifier("documents"))
            select = source.find_ancestor(exp.Select)
            predicate = select.args["where"].this
            self.assertIsInstance(predicate, exp.And)
            select.set("where", exp.Where(this=predicate.this))
            self.assertEqual(original[service], fixed[service])
        old_tree = sqlglot.parse_one(COMPILED, read="clickhouse")
        new_tree = sqlglot.parse_one(self.fixed, read="clickhouse")
        for tree in (old_tree, new_tree):
            tree.set("with_", None)
            tree.comments = None
        self.assertEqual(old_tree.sql(), new_tree.sql())
        self.assertNotIn("CASE", self.fixed)

    def test_empty_group_is_explicit_and_all_empty_means_no_documents(self):
        sql = repair.transform(COMPILED, "reader", GROUPS, {group: [] for group in GROUPS})
        self.assertEqual(sql.count("WHERE collection_name = '"), 4)
        self.assertEqual(sql.count("AND 0"), 4)

    def test_inventory_and_literal_drift_refused(self):
        bad = ({}, {GROUPS[0]: ["alice"]}, {**INVENTORY, "other": []},
               {GROUPS[0]: ["alice", "alice"], GROUPS[1]: []},
               {GROUPS[0]: ["alice' OR 1=1"], GROUPS[1]: []},
               {GROUPS[0]: [{}], GROUPS[1]: []})
        for inventory in bad:
            with self.subTest(inventory=inventory), self.assertRaises(ValueError):
                repair.transform(COMPILED, "reader", GROUPS, inventory)
        with self.assertRaises(ValueError):
            repair.transform(COMPILED.replace("LIMIT 21", "LIMIT 22"), "reader", GROUPS, INVENTORY)

    def test_native_aggregate_decoding_rejects_truncation_and_does_not_mutate_other_fields(self):
        row = {field: "0" for field in repair.AGGREGATES}
        row.update(body='{"private":"synthetic"}', doc_id="doc")
        decoded = repair.native_rows(json.dumps({"data": [row]}))[0]
        self.assertEqual(decoded["likes"], 0)
        self.assertEqual(decoded["body"], row["body"])
        for value in (True, 1.5, -1, "1.5", "-1", "secret", 2**64):
            with self.subTest(value=value), self.assertRaises(ValueError):
                repair.native_rows(json.dumps({"data": [{**row, "likes": value}]}))

    def test_retained_real_failure_still_fails_after_shared_decoder(self):
        root = Path(__file__).parent / "evidence/arm-d-realism-20261115/arm-d-realism-r1"
        oracle = json.loads((root / "oracle.json").read_bytes())
        raw = json.loads((root / "warmup-0-rows.json").read_bytes())
        rows = repair.native_rows(json.dumps({"data": raw}))
        with self.assertRaisesRegex(ValueError, "wrong main aggregate: likes"):
            arm_d_realism.smoke_realism.validate_rows(rows, oracle["expected"], oracle["profiles"],
                                                     oracle["attachments"], oracle["counts"])


if __name__ == "__main__":
    unittest.main()
