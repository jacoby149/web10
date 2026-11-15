"""Network/engine-free Arm T admission, SQL AST and mocked adapter controls.

These are NOT native query execution, independent parity or performance proof.
"""
import copy
import asyncio
import importlib.util
import json
import os
import re
import sys
import tempfile
import types
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import Mock, patch

import sqlglot
from sqlglot import exp

import arm_t
import arm_t_rewrite as rewrite

HERE = Path(__file__).resolve().parent
GOLDEN = (HERE / "evidence/arm-d-compiled-main-golden-20261109.sql").read_text().strip()
GROUPS = ["node.invalid/groups/shared-room", "node.invalid/groups/another-room"]
WINNERS = [{"author_key": "not-the-group-owner", "doc_id": "winner", "group_id": GROUPS[0], "created_ms": 1000}]


def compiled(groups=GROUPS, reader="reader"):
    old = re.search(r"group_id IN \((.*?)\)\)", GOLDEN).group(1)
    return GOLDEN.replace(old, rewrite.literals(groups)).replace("'c42-reader'", rewrite.literal(reader))


class SQLTests(unittest.TestCase):
    def test_shared_multi_author_groups_do_not_require_owner_mapping(self):
        sql = rewrite.candidates_sql(compiled(), "reader", GROUPS)
        tree = sqlglot.parse_one(sql, read="clickhouse")
        slices = [s for s in tree.find_all(exp.Select)
                  if any(t.name == "doc_groups_t" for t in s.find_all(exp.Table)) and s.args.get("limit")]
        # One candidate-set expansion in each canonical documents/link prefix.
        self.assertTrue(slices)
        for select in slices:
            if select.args.get("from_") and select.args["from_"].this.name == "doc_groups_t":
                self.assertEqual(select.args["limit"].expression.this, "22")
                where = select.args["where"].sql()
                self.assertIn("collection_name", where)
                self.assertIn("tags", where)
                self.assertIn("group_hidden_docs", where)
        self.assertNotIn("role = 'owner'", sql)
        self.assertNotIn("created_at >=", sql)
        self.assertNotIn("CASE d.author_key", sql)

    def test_full_identity_and_original_link_predicates_are_inside_windows(self):
        sql = rewrite.main_sql(compiled(), "reader", GROUPS, WINNERS)
        tree = sqlglot.parse_one(sql, read="clickhouse")
        for table in tree.find_all(exp.Table):
            parent = table.find_ancestor(exp.Select)
            if table.name == "documents":
                self.assertIn("(author_key, doc_id) IN", parent.args["where"].sql())
                self.assertTrue(list(parent.find_all(exp.Window)))
            if table.name == "doc_groups":
                self.assertIn("doc_id IN", parent.args["where"].sql())
                self.assertTrue(list(parent.find_all(exp.Window)))

    def test_all_five_original_gates_and_group_projection_survive(self):
        original = rewrite.pinned(compiled(), "reader", GROUPS)
        treated = sqlglot.parse_one(rewrite.main_sql(compiled(), "reader", GROUPS, WINNERS), read="clickhouse")
        for before, after in zip(original.args["with_"].expressions, treated.args["with_"].expressions):
            # ClickHouse serialization normalizes NOT IN into NOT (... IN ...).
            normalized = sqlglot.parse_one(before.this.sql(dialect="clickhouse"), read="clickhouse")
            self.assertEqual(normalized.args["where"], after.this.args["where"])
            self.assertEqual(before.this.expressions, after.this.expressions)
        for gate in ("user_blacklist", "group_blacklist", "user_group_sharing", "group_hidden_docs", "banned_users"):
            self.assertEqual(sum(t.name == gate for t in original.find_all(exp.Table)),
                             sum(t.name == gate for t in treated.find_all(exp.Table)))

    def test_aggregates_and_cross_author_references_are_not_shortcut(self):
        sql = rewrite.main_sql(compiled(), "reader", GROUPS, WINNERS)
        for fragment in ("comment_post_id IN ('winner')", "repost_of IN ('winner')",
                         "ref_value IN ('winner')", "countIf(", "JSONExtractString(body, 'post_id')",
                         "not-the-group-owner", "dg.group_id"):
            self.assertIn(fragment, sql)
        self.assertNotIn("counting_numbers", sql)

    def test_empty_page_is_valid_and_still_scoped(self):
        sql = rewrite.main_sql(compiled(), "reader", GROUPS, [])
        self.assertIn("WHERE 0", sql)
        sqlglot.parse_one(sql, read="clickhouse")

    def test_duplicate_attachments_do_not_change_outer_order_or_limit(self):
        winners = [*WINNERS, {**WINNERS[0], "group_id": GROUPS[1]}]
        tree = sqlglot.parse_one(rewrite.main_sql(compiled(), "reader", GROUPS, winners), read="clickhouse")
        original = rewrite.pinned(compiled(), "reader", GROUPS)
        self.assertEqual(tree.args["order"], original.args["order"])
        self.assertEqual(tree.args["limit"], original.args["limit"])
        self.assertIsNone(tree.args.get("distinct"))

    def test_compiler_ranking_reader_and_policy_drift_refuse(self):
        for sql in (compiled().replace("LIMIT 21", "LIMIT 20"),
                    compiled().replace("updated_at DESC", "updated_at ASC", 1),
                    compiled().replace("blocked_key = 'reader'", "blocked_key = 'attacker'", 1),
                    compiled().replace("(0) AS score", "(1) AS score")):
            with self.subTest(sql=sql[-100:]), self.assertRaises(ValueError):
                rewrite.candidates_sql(sql, "reader", GROUPS)

    def test_identifier_injection_and_scope_mismatch_refuse(self):
        for value in ("a' OR 1=1", "a\\b", "", 5):
            with self.assertRaises(ValueError):
                rewrite.literal(value)
        for groups in ([], GROUPS + GROUPS, ["unrequested"], ["x"] * 1002):
            with self.assertRaises(ValueError):
                rewrite.candidates_sql(compiled(), "reader", groups)
        with self.assertRaises(ValueError):
            rewrite.main_sql(compiled(), "reader", GROUPS, [{**WINNERS[0], "group_id": "secret"}])

    def test_current_actual_compiler_still_matches_reviewed_capture(self):
        # Compiler only: no server, SQL execution, credentials or network.
        sys.path.insert(0, str(HERE.parents[2] / "api"))
        from app.v3.services.safe_query import build_safe_query
        wire = json.loads((HERE / "evidence/core-feed-wire-v7.json").read_bytes())
        current = build_safe_query(wire["requests"][0]["payload"]["sql"],
                                   {s: GROUPS for s in rewrite.SERVICES}, member_key="reader")
        rewrite.pinned(current, "reader", GROUPS)

    def test_guard_row_and_ties_never_silently_change_the_frozen_order(self):
        rows = [{**WINNERS[0], "doc_id": "doc-" + str(i), "created_ms": 1000-i} for i in range(22)]
        self.assertEqual(rewrite.canonical_page(rows), rows[:21])
        for index in (0, 20):
            tied = copy.deepcopy(rows)
            tied[index+1]["created_ms"] = tied[index]["created_ms"]
            with self.subTest(index=index), self.assertRaisesRegex(rewrite.InvalidArm, "timestamp tie"):
                rewrite.canonical_page(tied)
        with self.assertRaises(rewrite.InvalidArm):
            rewrite.canonical_page(rows[::-1])


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.now = datetime(2026, 11, 14, 12, tzinfo=UTC)
        self.evidence = {
            "diagnosis": {"outcome": "BASELINE_BOUNDARY_SCANS_CONFIRMED", "dataset_id": arm_t.DATASET,
                          "baseline_query_sha256": arm_t.BASELINE_QUERY, "read_rows": 360801800,
                          "unexpected_attribution": False},
            "pilot": {"study": "B", "dataset_id": arm_t.DATASET, "accounts": 1000000, "trials": 3,
                      "launched_utc": "2026-11-14T11:00:00Z", "droplet_id": 111},
            "cleanup": {"droplet_id": 222, "verified": True, "deadline_utc": "2026-11-14T13:00:00Z"}}
        self.gate = {"kind": "ARM_T_ADMISSION", "approved_by": "Jacob", "dataset_id": arm_t.DATASET,
                     "droplet_id": 222, "budget_usd": 1, "deadline_utc": "2026-11-14T13:00:00Z",
                     "input_reviewed": True, "storage_admitted": True}
        # Synthetic retained-query bytes cannot have the historical SHA preimage.
        # Mock ONLY that file's hash; all other artifact/source bindings are real.
        baseline_path = HERE / "evidence/REALISM-SMOKE-20261113.json"
        baseline = json.loads(baseline_path.read_bytes())
        query_path = self.root / "retained.sql"
        query_path.write_text("synthetic retained query fixture")
        plan_path = self.root / "scan.txt"
        plan_path.write_text("synthetic native scan attribution fixture")
        real_digest = arm_t.digest
        self.hash_patch = patch.object(arm_t, "digest", side_effect=lambda path:
            arm_t.BASELINE_QUERY if Path(path) == query_path else real_digest(path))
        self.hash_patch.start()
        self.addCleanup(self.hash_patch.stop)
        self.evidence["diagnosis"].update(
            baseline_receipt_sha256=arm_t.digest(baseline_path), sources=baseline["sources"],
            native_query_ids=[a["native_query_id"] for a in baseline["attempts"] if a.get("native_query_id")],
            scan_rows_by_table={"documents": 176400600, "doc_groups": 184401200},
            retained_query={"path": query_path.name, "sha256": arm_t.BASELINE_QUERY},
            scan_evidence={"path": plan_path.name, "sha256": arm_t.digest(plan_path)})
        self.write()

    def write(self):
        for name, data in self.evidence.items():
            path = self.root / (name + ".json")
            path.write_text(json.dumps(data))
            self.gate[name] = {"path": path.name, "sha256": arm_t.digest(path)}
        self.path = self.root / "admission.json"
        self.path.write_text(json.dumps(self.gate))

    def test_complete_distinct_host_fixture_admission(self):
        self.assertEqual(arm_t.admission(self.path, 222, self.now), self.gate)

    def test_missing_diagnosis_pilot_and_cleanup_do_not_turn_into_go(self):
        for key in self.evidence:
            saved = self.evidence[key]
            self.evidence[key] = {}
            self.write()
            with self.subTest(key=key), self.assertRaises(ValueError):
                arm_t.admission(self.path, 222, self.now)
            self.evidence[key] = saved

    def test_diagnosis_surprise_stops(self):
        self.evidence["diagnosis"]["unexpected_attribution"] = True
        self.write()
        with self.assertRaisesRegex(ValueError, "STOP"):
            arm_t.admission(self.path, 222, self.now)

    def test_arithmetic_only_diagnosis_and_missing_plan_refuse(self):
        for key in ("sources", "native_query_ids", "baseline_receipt_sha256", "scan_rows_by_table",
                    "retained_query", "scan_evidence"):
            saved = self.evidence["diagnosis"].pop(key)
            self.write()
            with self.subTest(key=key), self.assertRaises(ValueError):
                arm_t.admission(self.path, 222, self.now)
            self.evidence["diagnosis"][key] = saved

    def test_serial_smoke_is_not_pilot_and_future_launch_is_not_launch(self):
        for changes in ({"study": "serial-smoke"}, {"launched_utc": "2026-11-15T00:00:00Z"}, {"trials": 1}):
            saved = copy.deepcopy(self.evidence["pilot"])
            self.evidence["pilot"].update(changes)
            self.write()
            with self.assertRaisesRegex(ValueError, "pilot"):
                arm_t.admission(self.path, 222, self.now)
            self.evidence["pilot"] = saved

    def test_tampered_evidence_expired_lease_and_shared_host_refuse(self):
        (self.root / "pilot.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "digest"):
            arm_t.admission(self.path, 222, self.now)
        self.write()
        with self.assertRaises(ValueError):
            arm_t.admission(self.path, 222, datetime(2026, 11, 15, tzinfo=UTC))
        self.evidence["pilot"]["droplet_id"] = 222
        self.write()
        with self.assertRaisesRegex(ValueError, "own droplet"):
            arm_t.admission(self.path, 222, self.now)

    def test_mac_refuses_before_metadata_network(self):
        with patch.object(arm_t.platform, "system", return_value="Darwin"), \
             patch.object(arm_t.urllib.request, "build_opener") as opener:
            with self.assertRaisesRegex(ValueError, "DigitalOcean-only"):
                arm_t.digitalocean_id()
            opener.assert_not_called()

    def test_receipt_seal_detects_source_or_value_changes(self):
        receipt = {"outcome": "ARM_T_BUILD_VERIFIED", "dataset_id": arm_t.DATASET,
                   "rewrite_sha256": arm_t.digest(rewrite.__file__),
                   "builder_sha256": arm_t.digest(arm_t.__file__), "droplet_id": 222,
                   "deadline_utc": "2099-01-01T00:00:00Z"}
        receipt["receipt_sha256"] = arm_t.seal(receipt)
        path = self.root / "build.json"
        path.write_text(json.dumps(receipt))
        self.assertEqual(arm_t.read_build(path), receipt)
        receipt["outcome"] = "ARM_T_BUILD_FAILED"
        path.write_text(json.dumps(receipt))
        with self.assertRaises(ValueError):
            arm_t.read_build(path)

    def test_expired_or_baseline_build_and_runtime_admission_refuse(self):
        receipt = {"outcome": "ARM_T_BUILD_VERIFIED", "dataset_id": arm_t.DATASET,
                   "rewrite_sha256": arm_t.digest(rewrite.__file__),
                   "builder_sha256": arm_t.digest(arm_t.__file__), "droplet_id": 222,
                   "deadline_utc": "2099-01-01T00:00:00Z"}
        for changes in ({"droplet_id": 618505005}, {"deadline_utc": "2020-01-01T00:00:00Z"}):
            data = {**receipt, **changes}
            data["receipt_sha256"] = arm_t.seal(data)
            path = self.root / "expired.json"
            path.write_text(json.dumps(data))
            with self.assertRaises(ValueError):
                arm_t.read_build(path)
        with self.assertRaises(ValueError):
            arm_t.runtime_admission({**receipt, "admission_sha256": "wrong"}, self.path, 222)


class BuildTests(unittest.TestCase):
    def setUp(self):
        import restore_realism

        self.restore = restore_realism
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.restored = self.root / "restore.json"
        self.restored.write_text(json.dumps({"project": "web10-costfn-frozen-armt-test", "node_import_complete": True,
            "dataset_id": arm_t.DATASET, "validation_sha256": arm_t.VALIDATION,
            "envelope": {"container_bytes": 28 * 1024**3, "clickhouse_server_bytes": 22 * 1024**3,
                         "sensitivity": False}, "api_port": 6095, "overlay": "isolated.json"}))
        self.output = self.root / "build.json"
        self.gate = self.root / "admission.json"
        self.gate.write_text("synthetic admission, mocked before engine work")
        self.sql = []
        self.fail = None

    def command(self, compose, env, *args, **kwargs):
        if args[0] == "ps":
            return b"one-owned-container"
        if args[0] == "inspect":
            return str(28 * 1024**3).encode()
        sql = args[args.index("--query") + 1]
        self.sql.append(sql)
        if sql == "SELECT version()":
            return b"24.8.14.39"
        if "system.server_settings" in sql:
            return str(22 * 1024**3).encode()
        if sql.startswith("SHOW CREATE TABLE"):
            return ("ORDER BY " + ("(author_key, doc_id)" if sql.endswith("documents") else "(doc_id, group_id)")).encode()
        if "system.tables" in sql:
            return (json.dumps({"data": [{"name": t, "uuid": "uuid-" + t}
                                        for t in ("doc_groups", "doc_groups_t", "documents")]}).encode()
                    if "FORMAT JSON" in sql else b"0")
        if "HAVING count()!=1" in sql:
            return b"1" if self.fail == "history" else b"0"
        if "WHERE deleted!=0" in sql:
            return b"0"
        if sql.startswith("SELECT count() FROM"):
            return b"2" if sql.endswith("documents") or (sql.endswith("doc_groups_t") and self.fail == "count") else b"3"
        if sql == arm_t.RECONCILE:
            return b"3\t1" if self.fail == "metadata" else b"3\t0"
        if sql in (arm_t.DDL, arm_t.BUILD):
            return b""
        raise AssertionError("unexpected mocked setup SQL")

    def build(self):
        manifest = {"files": {"documents": {"rows": 2}, "doc_groups": {"rows": 3}}}
        with patch.object(arm_t, "digitalocean_id", return_value=222), \
             patch.object(arm_t, "admission", return_value={"deadline_utc": "2099-01-01T00:00:00Z"}), \
             patch.object(arm_t, "host_resources", return_value={"host_memory_bytes": 32 * 1024**3}), \
             patch.object(self.restore, "verified_input", return_value=manifest), \
             patch.object(self.restore, "commands", return_value=["mocked-compose"]), \
             patch.object(self.restore, "command", side_effect=self.command):
            return arm_t.build(self.root, "validation.json", self.restored, self.gate, self.output)

    def test_mocked_build_reconciles_rows_metadata_and_binds_store(self):
        result = self.build()
        self.assertEqual(result["outcome"], "ARM_T_BUILD_VERIFIED")
        self.assertEqual(result["variant_rows"], result["source_counts"]["doc_groups"])
        self.assertEqual(len(result["tables"]), 3)
        self.assertEqual(arm_t.read_build(self.output), result)
        mutations = [q for q in self.sql if q.startswith(("CREATE", "INSERT", "ALTER", "RENAME", "DROP"))]
        self.assertEqual(mutations, [arm_t.DDL, arm_t.BUILD])

    def test_history_count_and_metadata_failures_are_retained_not_repaired(self):
        for failure in ("history", "count", "metadata"):
            with self.subTest(failure=failure):
                self.fail = failure
                self.output = self.root / (failure + ".json")
                self.sql = []
                with self.assertRaises(ValueError):
                    self.build()
                receipt = json.loads(self.output.read_bytes())
                self.assertEqual(receipt["outcome"], "ARM_T_BUILD_FAILED")
                self.assertEqual(receipt["receipt_sha256"], arm_t.seal(receipt))
                self.assertNotIn("DROP", " ".join(self.sql))
                if failure == "history":
                    self.assertNotIn(arm_t.DDL, self.sql)

    def test_existing_attempt_refuses_before_host_or_engine_adoption(self):
        self.output.write_text("preserved attempt")
        with patch.object(arm_t, "digitalocean_id") as host:
            with self.assertRaises(FileExistsError):
                self.build()
            host.assert_not_called()
        self.assertEqual(self.output.read_text(), "preserved attempt")

    def test_builder_never_has_original_table_mutations(self):
        for sql in (arm_t.DDL, arm_t.BUILD):
            tree = sqlglot.parse_one(sql, read="clickhouse")
            self.assertIn("doc_groups_t", tree.this.sql())
            self.assertNotRegex(sql, r"(?i)\b(DROP|ALTER|RENAME|TRUNCATE|EXCHANGE)\b")
        self.assertIn("ORDER BY (group_id, created_at, doc_id)", arm_t.DDL)
        self.assertNotIn("IF NOT EXISTS", arm_t.DDL)
        self.assertIn("d.author_key", arm_t.BUILD)
        self.assertIn("d.created_at", arm_t.BUILD)


class AdapterTests(unittest.TestCase):
    def load(self, winners=WINNERS, flags=None, table_match=True):
        observer = types.ModuleType("research_api")
        observer.original_compile = Mock(return_value=compiled())
        observer.application = Mock()
        self.observation = {}
        observer.current = Mock(get=Mock(return_value=self.observation))
        observer.safe_query = types.SimpleNamespace(UnsafeQueryError=type("UnsafeQueryError", (ValueError,), {}))
        ch = types.ModuleType("app.v3.services.clickhouse")
        ch.QueryExecutionError = type("QueryExecutionError", (Exception,), {})
        ch.execute_query = Mock(side_effect=[(["name", "uuid"], [("doc_groups_t", "table-id")]),
            (["author_key", "doc_id", "group_id", "created_ms"],
             [tuple(r[k] for k in ("author_key", "doc_id", "group_id", "created_ms")) for r in winners])])
        app = types.ModuleType("app")
        v3 = types.ModuleType("app.v3")
        services = types.ModuleType("app.v3.services")
        services.clickhouse = ch
        fastapi = types.ModuleType("fastapi")

        class HTTPException(Exception):
            def __init__(self, status_code, detail):
                super().__init__(detail)
                self.status_code = status_code

        fastapi.HTTPException = HTTPException
        receipt = {"receipt_sha256": "source-bound-fixture", "tables":
                   [{"name": "doc_groups_t", "uuid": "table-id" if table_match else "other-store"}]}
        spec = importlib.util.spec_from_file_location("arm_t_adapter_test", HERE / "arm_t_api.py")
        module = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {"COSTFN_ARM_T": "1", "COSTFN_ARM_T_BUILD_RECEIPT": "fixture.json",
                                    "COSTFN_ARM_T_ADMISSION": "admission.json",
                                    "COSTFN_ARM_D": "0", "COSTFN_SATELLITE": "0", "COSTFN_VIEWS_TREAT": "0", **(flags or {})}), \
             patch.dict(sys.modules, {"research_api": observer, "app": app, "app.v3": v3,
                                    "app.v3.services": services, "app.v3.services.clickhouse": ch, "fastapi": fastapi}), \
             patch.object(arm_t, "read_build", return_value=receipt), \
             patch.object(arm_t, "digitalocean_id", return_value=222), \
             patch.object(arm_t, "runtime_admission"):
            spec.loader.exec_module(module)
        return module, observer, ch

    def setUp(self):
        self.runtime = patch.object(arm_t, "runtime_admission")
        self.runtime_mock = self.runtime.start()
        self.addCleanup(self.runtime.stop)

    def test_candidate_queries_are_in_request_observation_and_use_ten_second_limit(self):
        module, observer, ch = self.load()
        actual = module.compile_main("wire", {s: GROUPS for s in rewrite.SERVICES}, member_key="reader")
        self.assertIn("arm-t canonical main", actual)
        self.assertEqual(ch.execute_query.call_args.kwargs["settings"]["max_execution_time"], 10)
        self.assertTrue(self.observation["arm_t"]["selection_cost_is_main_request_cost"])
        self.assertIs(observer.original_compile, module.compile_main)

    def test_other_treatments_and_wrong_store_fail_closed(self):
        for flag in ("COSTFN_ARM_D", "COSTFN_SATELLITE", "COSTFN_VIEWS_TREAT"):
            with self.assertRaises(RuntimeError):
                self.load(flags={flag: "1"})
        with self.assertRaisesRegex(RuntimeError, "different store"):
            self.load(table_match=False)

    def test_followups_are_not_silently_treated(self):
        module, _, ch = self.load()
        self.assertEqual(module.compile_main("wire", {"comments": GROUPS}, member_key="reader"), compiled())
        self.assertEqual(ch.execute_query.call_count, 1)  # Startup identity check only.

    def test_unequal_service_scope_and_native_failure_never_fall_back(self):
        module, _, ch = self.load()
        with self.assertRaises(ValueError):
            module.compile_main("wire", {s: GROUPS if s == "posts" else GROUPS[:1]
                                         for s in rewrite.SERVICES}, member_key="reader")
        ch.execute_query.side_effect = RuntimeError("synthetic native timeout")
        with self.assertRaises(RuntimeError):
            module.compile_main("wire", {s: GROUPS for s in rewrite.SERVICES}, member_key="reader")
        self.assertEqual(self.observation["arm_t"]["selection_state"], "failed")
        self.assertIn("candidate_sql_sha256", self.observation["arm_t"])

    def test_native_execution_error_uses_caught_compile_error_and_keeps_identity(self):
        module, observer, ch = self.load()
        ch.execute_query.side_effect = ch.QueryExecutionError("synthetic native code 159")
        with self.assertRaises(module.HTTPException) as error:
            module.compile_main("wire", {s: GROUPS for s in rewrite.SERVICES}, member_key="reader")
        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(self.observation["arm_t"]["snapshot"], "source-bound-fixture")
        self.assertEqual(self.observation["arm_t"]["failure_class"], "QueryExecutionError")

    def test_expired_runtime_refuses_before_compiler_query_or_asgi_app(self):
        module, observer, ch = self.load()
        self.runtime_mock.side_effect = ValueError("expired")
        observer.original_compile = Mock()
        with self.assertRaises(ValueError):
            module.compile_main("wire", {s: GROUPS for s in rewrite.SERVICES}, member_key="reader")
        with self.assertRaises(ValueError):
            asyncio.run(module.application({"type": "http"}, Mock(), Mock()))
        module._compile.assert_not_called()
        self.assertEqual(ch.execute_query.call_count, 1)
        observer.application.assert_not_called()

    def test_tied_canonical_page_is_explicitly_invalid_not_timed_success(self):
        module, observer, _ = self.load(winners=[*WINNERS, {**WINNERS[0], "doc_id": "equal-time"}])
        with self.assertRaises(module.HTTPException):
            module.compile_main("wire", {s: GROUPS for s in rewrite.SERVICES}, member_key="reader")
        self.assertIn("timestamp tie", self.observation["arm_t"]["invalid_reason"])

    def test_invalid_response_has_fixed_content_free_stop_marker(self):
        module, observer, _ = self.load()
        self.observation["arm_t"] = {"invalid_reason": "ambiguous timestamp tie"}
        messages = []

        async def app(scope, receive, send):
            await send({"type": "http.response.start", "status": 400, "headers": []})

        async def send(message):
            messages.append(message)

        observer.application = app
        asyncio.run(module.application({"type": "http"}, Mock(), send))
        self.assertEqual(messages[0]["headers"], [(b"x-arm-t-invalid", b"1")])


if __name__ == "__main__":
    unittest.main()
