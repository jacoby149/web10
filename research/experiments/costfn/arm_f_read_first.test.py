"""No-engine read-first ordering/coverage/snapshot refusals, not native proof."""
import asyncio
from contextlib import ExitStack
from datetime import UTC, datetime, timedelta
import json
import sqlite3
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import AsyncMock, Mock, patch

import httpx

import arm_f_deploy as deploy
import arm_f_fixtures as fixtures
import arm_f_environment as environment
import arm_f_infrastructure as infrastructure
from arm_f_http import HTTP
import arm_f_read_first as first
import arm_f_reads as reads
import realism_runner
from arm_f_run import save


class ReadFirstTests(unittest.TestCase):
    def test_independent_views_scope_does_not_confuse_private_delivery_with_discover_visibility(self):
        db = sqlite3.connect(':memory:')
        class Unique:
            def __init__(self): self.values = set()
            def step(self, value): self.values.add(value)
            def finalize(self): return len(self.values)
        db.create_function('unhex', 1, lambda value: bytes.fromhex(value).decode())
        db.create_aggregate('uniqExact', 1, Unique)
        db.executescript("CREATE TABLE content_events(doc_id TEXT,service TEXT,event_type TEXT,reader_key TEXT);"
            "CREATE TABLE doc_groups(doc_id TEXT,group_id TEXT,deleted INT);"
            "INSERT INTO content_events VALUES ('public','posts','delivery','reader'),('private','posts','delivery','reader');"
            "INSERT INTO doc_groups VALUES ('public','Discover',0),('private','Private',0);")
        def rows(label, sql, **kwargs):
            cursor = db.execute(sql)
            return [dict(zip([c[0] for c in cursor.description], row)) for row in cursor.fetchall()], label
        session = SimpleNamespace(rows=rows)
        try:
            self.assertEqual(set(reads.views(session, ['public', 'private'], 'raw')), {'public', 'private'})
            self.assertEqual(reads.visible_views(session, ['public', 'private'], ['Discover'], 'visible'),
                {'public': {'impressions': 1, 'reach': 1}})
            self.assertEqual(reads.visible_views(session, ['private'], ['Discover'], 'private'), {})
            self.assertEqual(reads.visible_views(session, ['public'], [], 'denied'), {})
            db.execute("UPDATE doc_groups SET deleted=1 WHERE doc_id='public'")
            self.assertEqual(reads.visible_views(session, ['public'], ['Discover'], 'removed'), {})
        finally:
            db.close()

    def test_every_generation_table_is_settled_without_disabling_merges_or_changing_limits(self):
        session = SimpleNamespace(query=Mock())
        infrastructure.settle_canonical(session)
        self.assertEqual([call.args[1] for call in session.query.call_args_list],
            ['OPTIMIZE TABLE ' + table + ' FINAL' for table in infrastructure.CANONICAL_TABLES])
        self.assertIn('group_members', infrastructure.CANONICAL_TABLES)
        self.assertIn('app_contracts', infrastructure.CANONICAL_TABLES)
        self.assertTrue(all(call.kwargs == {'setup_seconds': 900} for call in session.query.call_args_list))

    def test_stale_generation_fails_before_serving_and_retains_actual_census(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            save(root / 'counts-batch-p2/result.json', {'canonical_generation': 'expected'})
            with patch('arm_satellite_counts.generation', return_value=('changed', [{'table': 'group_members'}])):
                with self.assertRaisesRegex(ValueError, 'before any serving sample'):
                    environment.verify_generation(root, Mock())
            receipt = json.loads((root / 'F-generation-ready.json').read_bytes())
            self.assertFalse(receipt['verified'])
            self.assertEqual(receipt['canonical_parts'], [{'table': 'group_members'}])
            with patch('arm_satellite_counts.generation', return_value=('expected', [])):
                environment.verify_generation(root, Mock())

    def test_real_setup_http_survives_recorded_group_latency_without_changing_measured_default(self):
        async def scenario(root):
            save(root / 'input/manifest.json', {})
            http = HTTP(root, SimpleNamespace(deadline=datetime.now(UTC) + timedelta(hours=1)), root / 'http')
            await http.client.aclose()
            observed = []
            def server(request):
                observed.append(request.extensions['timeout']['read'])
                if observed[-1] < 69.893208:
                    raise httpx.ReadTimeout('recorded group-create exceeds client deadline', request=request)
                return httpx.Response(200, json={'group_id': 'synthetic-group'},
                    headers={'x-research-id': request.headers['x-research-id']})
            http.client = httpx.AsyncClient(base_url='http://127.0.0.1:6098', timeout=65,
                transport=httpx.MockTransport(server))
            try:
                with self.assertRaises(httpx.ReadTimeout):
                    await http.post('/v3/groups/create', {})
                self.assertEqual(await fixtures.group(http, 'synthetic-token', 'fixture', []), 'synthetic-group')
                self.assertEqual(observed, [65, 600])
                self.assertEqual(http.client.timeout.read, 65)
                self.assertTrue(http.records[-1]['setup_only'])
                with self.assertRaisesRegex(ValueError, 'only for fixture group'):
                    await http.post('/v3/query', {}, setup_group=True)
            finally:
                await http.close()
        with tempfile.TemporaryDirectory() as directory:
            asyncio.run(scenario(Path(directory)))

    def test_setup_timeout_respects_original_cleanup_margin(self):
        async def scenario(root):
            save(root / 'input/manifest.json', {})
            http = HTTP(root, SimpleNamespace(deadline=datetime.now(UTC) + timedelta(seconds=240)), root / 'http')
            async def server(request):
                self.assertTrue(0 < request.extensions['timeout']['read'] <= 60)
                return httpx.Response(200, json={}, headers={'x-research-id': request.headers['x-research-id']})
            await http.client.aclose()
            http.client = httpx.AsyncClient(base_url='http://127.0.0.1:6098', timeout=65,
                transport=httpx.MockTransport(server))
            try:
                await http.post('/v3/groups/create', {}, setup_group=True)
                http.session.deadline = datetime.now(UTC) + timedelta(seconds=179)
                with self.assertRaisesRegex(TimeoutError, 'cleanup margin'):
                    await http.post('/v3/groups/create', {}, setup_group=True)
            finally:
                await http.close()
        with tempfile.TemporaryDirectory() as directory:
            asyncio.run(scenario(Path(directory)))

    def test_explicit_worker_and_operator_order_do_not_change_legacy(self):
        command = deploy.worker_command(3600, '/research/', detach=True, scoped=True, read_first=True)
        self.assertIn('/research/arm_f_read_first.py', command)
        self.assertNotIn('--programme', command)
        self.assertEqual(first.ORDER[4:10], ('T2-F', 'T6-F', 'Population', 'T6-F-populated', 'R+W', 'T3-F'))
        self.assertNotIn('T4', first.ORDER)

    def test_real_project_name_limit_is_exercised_before_paid_restore(self):
        prefix = 'web10-costfn-frozen-satellite-f-620093795-'
        with self.assertRaisesRegex(ValueError, 'dedicated disposable project'):
            realism_runner.compose(prefix + 'read-first-0', 6098)
        for name in ('rf0', 'rf1', 'rf2'):
            self.assertEqual(realism_runner.compose(prefix + name, 6098)['envelope']['clickhouse_server_bytes'], 22 * 1024**3)

    def test_setup_reuse_refuses_any_fixture_or_imported_store(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            previous = root / 'previous'
            save(previous / 'admission.json', {})
            save(previous / 'read-first-stop.json', dict(failed_stage='Setup',
                failure_message='dedicated disposable project required', completed=['Banked-P', 'Banked-writes']))
            save(previous / 'trials/old/fixture.json', {})
            actions = SimpleNamespace(root=root / 'new', approval={})
            with self.assertRaisesRegex(ValueError, 'pre-import project-name'):
                first.prepared_setup(actions, previous)

    def test_full_key_continuation_refuses_any_other_oracle_failure_before_engine_io(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            save(root / 'read-first-stop.json', dict(failed_stage='Setup', failure_class='CalledProcessError',
                failure_stderr='native memory failure, not canonical identity ambiguity'))
            actions = SimpleNamespace(root=root / 'next', approval={})
            with patch.object(first.restore, 'command') as command:
                with self.assertRaisesRegex(ValueError, 'unchanged pre-serving'):
                    first.resume_fixture_page(actions, root, root / 'trials/rf0')
                command.assert_not_called()

    def test_coverage_requires_both_authors_shared_and_mixed_on_canonical_page(self):
        fixture = dict(collision_id='c', collision_authors=['a', 'b'], shared_ids=['c', 's'], large_front_id='l')
        rows = [dict(author_key=a, doc_id=d) for a, d in [('a', 'c'), ('b', 'c'), ('a', 'l')]]
        self.assertTrue(reads.fixture_coverage(fixture, {'rows': rows})['verified'])
        for broken in (rows[:1], rows[:2], [rows[0], rows[0], rows[2]], []):
            with self.assertRaisesRegex(ValueError, 'fixture did not reach'):
                reads.fixture_coverage(fixture, {'rows': broken})

    def test_missing_fixture_stops_before_infrastructure_or_snapshot(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            root = Path(directory)
            actions = SimpleNamespace(root=root, active_root=None, check=Mock())
            stack.enter_context(patch.object(first.environment, 'fresh', return_value=root))
            fixture = dict(reader='a', groups=['g'], collision_id='c', shared_ids=['c'], large_front_id='l')
            stack.enter_context(patch.object(first.fixtures, 'parity_fixture', AsyncMock(return_value=fixture)))
            stack.enter_context(patch.object(first, 'setup_scopes', AsyncMock(return_value={})))
            stack.enter_context(patch.object(first, 'Session'))
            oracle = stack.enter_context(patch.object(first.reads, 'reference', return_value={'rows': []}))
            build = stack.enter_context(patch.object(first.environment, 'prepare'))
            with self.assertRaisesRegex(ValueError, 'fixture did not reach'):
                first.prepare_page(actions, 'read-first-0')
            oracle.assert_called_once()
            build.assert_not_called()
            self.assertFalse((root / 'prepared-snapshot-request.json').exists())

    def test_coverage_still_precedes_both_serving_modes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            save(root / 'fixture.json', dict(collision_id='c', shared_ids=['c'], large_front_id='l'))
            with patch.object(reads.environment, 'boot') as boot:
                with self.assertRaises(ValueError):
                    asyncio.run(reads.identical_contract(root, root / 'out', expected={'rows': []}))
                boot.assert_not_called()

    def test_incomplete_snapshot_never_restarts_engine(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            root = Path(directory)
            for name in ('restore.json', 'fixture.json', 'fixture-coverage.json', 'F-build/result.json'):
                save(root / name, {})
            save(root / 'prepared-snapshot.json', dict(outcome='RUNNING'))
            stop = stack.enter_context(patch.object(first.environment, 'stop'))
            session = stack.enter_context(patch.object(first, 'Session'))
            actions = SimpleNamespace(root=root, active_root=root, host=1, approval={'dataset_id': 'frozen'}, check=Mock())
            with self.assertRaisesRegex(ValueError, 'snapshot incomplete'):
                first.snapshot(actions)
            stop.assert_called_once_with(root, engine=True)
            session.assert_not_called()
            request = json.loads((root / 'prepared-snapshot-request.json').read_bytes())
            self.assertTrue(request['engines_stopped'])

    def test_comparison_sums_entire_sequence_and_labels_main_only(self):
        row = dict(phase='measured', elapsed_ms=501, parity='PASS', native=[
            dict(read_rows=1, read_bytes=20_000_000), dict(read_rows=2, read_bytes=5_000_000)])
        result = first.comparison({'F': [row]})
        observed = result['observed_complete_sequences']['F'][0]
        self.assertEqual((observed['read_rows'], observed['read_bytes']), (3, 25_000_000))
        self.assertFalse(observed['below_500ms'])
        self.assertFalse(observed['below_25MB'])
        self.assertEqual(result['comparators']['Arm_T_scope'], 'MAIN_ONLY')
        self.assertFalse(result['formal_T6'])


if __name__ == '__main__':
    unittest.main()
