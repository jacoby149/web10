"""No-engine orchestration/refusal controls. Not native performance/auth proof."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from datetime import UTC, datetime, timedelta
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import threading
import unittest
from unittest.mock import AsyncMock, patch

import httpx
import sqlglot

import arm_f
from arm_f_fence import Fence
import arm_f_faults as faults
import arm_f_guard as guard
import arm_f_gates as gates
from arm_f_http import HTTP
import arm_f_observe as observe
import arm_f_population as population
import arm_f_programme as programme
import arm_f_reference as reference
import arm_f_views as views
import arm_f_environment as environment
import arm_f_reads as reads
from arm_f_run import save


def trial(index=0, samples=100):
    values = []
    for number in range(samples + 1):
        values.append(dict(phase='warmup' if number == 0 else 'measured', elapsed_ms=100,
            parity='PASS', request_ids=[f'r-{index}-{number}-{request}' for request in range(4)],
            native=[dict(query_id=f'q-{index}-{number}', exception_code=0, read_rows=100, read_bytes=1000)]))
    return dict(fresh_restore_sha256='restore-' + str(index), samples=values)


class GateTests(unittest.TestCase):
    def test_three_full_fresh_trials_not_three_diagnostic_observations(self):
        self.assertEqual(len(gates.read_trials([trial(i) for i in range(3)])), 3)
        for values in ([trial()], [trial(0), trial(0), trial(0)], [trial(i, 3) for i in range(3)]):
            with self.assertRaises(ValueError):
                gates.read_trials(values)

    def test_bad_trial_is_not_pooled_away_and_failed_native_never_passes(self):
        for field, value in [('elapsed_ms', 500), ('parity', 'FAIL'), ('native', []), ('stop', True)]:
            sample = trial()
            for row in sample['samples'][1:]:
                row[field] = value
            with self.assertRaises(ValueError):
                gates.read_trial(sample)
        for field, value in [('read_rows', 10_000_001), ('exception_code', 241), ('read_bytes', 25_000_000)]:
            sample = trial()
            sample['samples'][1]['native'][0][field] = value
            with self.assertRaises(ValueError):
                gates.read_trial(sample)

    def test_p95_is_nearest_rank_and_nonfinite_refuses(self):
        self.assertEqual(gates.p95(list(range(100))), 94)
        for values in ([], [float('nan')], [float('inf')], [-1], [True]):
            with self.assertRaises(ValueError):
                gates.p95(values)

    def test_programme_order_is_executable_and_stops_on_failed_action(self):
        with tempfile.TemporaryDirectory() as directory:
            runner = gates.Programme(directory, 123)
            with self.assertRaises(ValueError):
                runner.run('T4', lambda output: {'verified': True})
            self.assertFalse((Path(directory) / 'F-gates/T4').exists())
            runner.run('Step0', lambda output: {'verified': True, 'actual': 'mocked scheduling test only'})
            with self.assertRaises(ValueError):
                runner.run('Build', lambda output: {'verified': False})
            with self.assertRaises(ValueError):
                runner.run('T4', lambda output: {'verified': True})
            state = json.loads((Path(directory) / 'F-gates/programme.json').read_bytes())
            self.assertEqual(state['outcome'], 'STOP')
            self.assertIn('R+W', state['unreached'])
            self.assertTrue((Path(directory) / 'F.stop').exists())

    def test_all_gates_have_real_bound_methods_and_no_t7(self):
        self.assertNotIn('T7', gates.ORDER)
        for name in ('step0', 'build', 'publish', 'parity', 'quiet', 'follow', 'population', 'populated',
                     'rebuild', 'stale', 'boundaries', 'load'):
            self.assertTrue(callable(getattr(programme.Actions, name)))

    def test_load_cannot_pass_on_configured_rates_or_drain(self):
        value = dict(duration_seconds=600, population_fraction=1, lost_deliveries=0, duplicate_deliveries=0,
            recipient_pointers=1, expected_recipient_pointers=1)
        for name, count in (('reads', 14000), ('publishes', 60000), ('follows', 6000)):
            value[name] = dict(offered=count, completed=count, during_window_completed=count, errors=0, pending=0)
        value['reads'].update(latencies_ms=[100] * 100, max_sequence_bytes=1000)
        self.assertTrue(gates.load_verdict(value))
        for mutation in ('population', 'duration', 'lost', 'late', 'under_rate', 'errors'):
            copy = json.loads(json.dumps(value))
            if mutation == 'population':
                copy['population_fraction'] = .001
            if mutation == 'duration':
                copy['duration_seconds'] = 599
            if mutation == 'lost':
                copy['lost_deliveries'] = 1
            if mutation == 'late':
                copy['publishes']['during_window_completed'] -= 1
            if mutation == 'under_rate':
                copy['follows']['completed'] = 5999
            if mutation == 'errors':
                copy['reads']['errors'] = 140
            with self.assertRaises(ValueError, msg=mutation):
                gates.load_verdict(copy)


class PerformanceIntegrationTests(unittest.TestCase):
    """Run the real performance/setup orchestration; mock only native/HTTP I/O."""
    def setup_io(self, stack, parent, events, *, setup_error=None, cleanup_error=None):
        created = []
        def fresh(root, name):
            directory = parent / 'trials' / name
            directory.mkdir(parents=True)
            (directory / 'restore.json').write_text(json.dumps({'fresh_trial': name}))
            created.append(directory)
            events.append(('fresh', name))
            return directory
        async def scope(root, session):
            events.append(('scope', root.name, asyncio.get_running_loop()))
            if setup_error:
                raise setup_error
            return {'reader': 'fixture'}
        async def samples(root, output, **kwargs):
            events.append(('samples', root.name))
            return trial(len(created) - 1)['samples']
        stack.enter_context(patch.object(environment, 'fresh', side_effect=fresh))
        stack.enter_context(patch.object(environment, 'Session', return_value=SimpleNamespace()))
        scope_mock = stack.enter_context(patch.object(environment.setup, 'setup_scopes', new=AsyncMock(side_effect=scope)))
        for owner, name in ((environment.setup, 'build_p_counts'), (environment.metadata, 'build'),
                            (environment.parity, 'verify'), (environment.presence, 'build'),
                            (environment, 'serving_state'), (environment.arm_f_native, 'build')):
            stack.enter_context(patch.object(owner, name))
        stack.enter_context(patch.object(environment, 'boot', side_effect=lambda root: events.append(('boot', root.name))))
        stopped = stack.enter_context(patch.object(environment, 'stop', side_effect=cleanup_error))
        discarded = stack.enter_context(patch.object(environment, 'discard_trial'))
        stack.enter_context(patch.object(reads, 'sequences', new=AsyncMock(side_effect=samples)))
        return created, scope_mock, stopped, discarded

    def test_performance_prepares_three_fresh_trials_in_the_existing_event_loop(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            parent, events = Path(directory), []
            output = parent / 'output'
            output.mkdir()
            created, scope, stopped, discarded = self.setup_io(stack, parent, events)
            async def exercise():
                loop = asyncio.get_running_loop()
                result = await reads.performance(parent, output)
                self.assertEqual([row[2] for row in events if row[0] == 'scope'], [loop] * 3)
                return result
            result = asyncio.run(exercise())
            self.assertTrue(result['verified'])
            self.assertEqual(len(created), 3)
            self.assertEqual(scope.await_count, 3)
            self.assertEqual(stopped.call_count, 3)
            self.assertEqual(discarded.call_count, 2)
            self.assertEqual(result['final_root'], str(created[-1]))

    def test_setup_failure_stops_the_trial_and_never_starts_a_second_restore(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            parent, events = Path(directory), []
            output = parent / 'output'
            output.mkdir()
            created, _, stopped, discarded = self.setup_io(stack, parent, events, setup_error=ValueError('scope setup denied'))
            with self.assertRaisesRegex(ValueError, 'scope setup denied'):
                asyncio.run(reads.performance(parent, output))
            self.assertEqual(len(created), 1)
            stopped.assert_called_once_with(created[0], engine=True)
            discarded.assert_not_called()
            self.assertFalse(any(row[0] == 'samples' for row in events))

    def test_populated_trials_still_seed_each_fresh_store_before_boot_and_reads(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            parent, events = Path(directory), []
            output = parent / 'output'
            output.mkdir()
            created, scope, stopped, discarded = self.setup_io(stack, parent, events)
            def seed(root):
                events.append(('seed', root.name))
            result = asyncio.run(reads.performance(parent, output, populated=True, seed=seed))
            self.assertTrue(result['verified'])
            self.assertEqual(scope.await_count, 3)
            self.assertEqual(stopped.call_count, 3)
            self.assertEqual(discarded.call_count, 2)
            for root in created:
                phases = [row[0] for row in events if len(row) > 1 and row[1] == root.name]
                self.assertEqual(phases, ['fresh', 'scope', 'seed', 'boot', 'samples'])

    def test_synchronous_programme_entry_still_runs_scope_setup_once(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            parent, events = Path(directory), []
            root = parent / 'sync-trial'
            root.mkdir()
            _, scope, _, _ = self.setup_io(stack, parent, events)
            self.assertEqual(environment.prepare(root, parent), root)
            scope.assert_awaited_once()

    def test_cleanup_failure_does_not_replace_the_actual_setup_failure(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            parent, events = Path(directory), []
            output = parent / 'output'
            output.mkdir()
            self.setup_io(stack, parent, events, setup_error=ValueError('scope setup denied'),
                          cleanup_error=RuntimeError('cleanup unavailable'))
            with self.assertRaisesRegex(ValueError, 'scope setup denied'):
                asyncio.run(reads.performance(parent, output))

    def test_cleanup_failure_after_success_is_not_reported_as_a_passing_trial(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            parent, events = Path(directory), []
            output = parent / 'output'
            output.mkdir()
            created, _, _, discarded = self.setup_io(stack, parent, events,
                cleanup_error=RuntimeError('cleanup unavailable'))
            with self.assertRaisesRegex(RuntimeError, 'cleanup unavailable'):
                asyncio.run(reads.performance(parent, output))
            self.assertEqual(len(created), 1)
            discarded.assert_not_called()


class TrialCleanupTests(unittest.TestCase):
    def register(self, parent, name='broken'):
        root = parent / 'trials' / name
        root.mkdir(parents=True)
        project = 'web10-costfn-frozen-satellite-f-123-' + name
        (root / 'admission.json').write_text(json.dumps({'configuration': 'F', 'droplet_id': 123}))
        (root / 'fresh-trial.json').write_text(json.dumps({'fresh': True, 'project': project}))
        return root, project

    def test_registered_trial_stop_does_not_depend_on_live_admission_or_restore_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root, project = self.register(Path(directory))
            with patch.object(environment, 'Session', side_effect=ValueError('admission expired')) as session, \
                    patch.object(guard.subprocess, 'check_output', return_value=b'owned-container\n') as listing, \
                    patch.object(guard.subprocess, 'run') as stop:
                environment.stop(root, engine=True)
                session.assert_not_called()
                self.assertIn('label=com.docker.compose.project=' + project, listing.call_args.args[0])
                stop.assert_called_once_with(['docker', 'stop', '-t', '20', 'owned-container'], check=True, timeout=90)
            self.assertFalse((root / 'restore.json').exists())

    def test_api_only_cleanup_leaves_the_owned_trial_engine_alone(self):
        with tempfile.TemporaryDirectory() as directory:
            root, _ = self.register(Path(directory))
            with patch.object(environment, 'Session', side_effect=ValueError('admission expired')), \
                    patch.object(guard.subprocess, 'check_output', return_value=b'api-container\n') as listing, \
                    patch.object(guard.subprocess, 'run'):
                environment.stop(root)
                self.assertIn('label=com.docker.compose.service=api', listing.call_args.args[0])

    def test_cleanup_still_refuses_a_nontrial_project(self):
        with tempfile.TemporaryDirectory() as directory:
            root, _ = self.register(Path(directory))
            (root / 'fresh-trial.json').write_text(json.dumps({'fresh': True, 'project': 'web10-prod'}))
            with patch.object(guard.subprocess, 'check_output') as listing:
                with self.assertRaises(ValueError):
                    environment.stop(root, engine=True)
                listing.assert_not_called()

    def test_restore_failure_stops_its_exact_registered_project_before_receipt_exists(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            parent = Path(directory)
            (parent / 'admission.json').write_text(json.dumps({'configuration': 'F', 'droplet_id': 123}))
            (parent / 'input').mkdir()
            (parent / 'evidence').mkdir()
            (parent / 'evidence/archive.json').write_text('{}')
            stack.enter_context(patch.object(environment, 'admitted', return_value=datetime.now(UTC) + timedelta(hours=2)))
            stack.enter_context(patch.object(environment.arm_t, 'digitalocean_id', return_value=123))
            stack.enter_context(patch.object(environment.shutil, 'disk_usage', return_value=SimpleNamespace(free=200 * 1024**3)))
            stack.enter_context(patch.object(environment, 'stop'))
            stack.enter_context(patch.object(environment.setup, 'operation'))
            stack.enter_context(patch.object(guard, 'arm', return_value={'verified': True}))
            stopped = stack.enter_context(patch.object(guard, 'stop'))
            stack.enter_context(patch.object(environment.restore, 'restore', side_effect=RuntimeError('restore failed')))
            with self.assertRaisesRegex(RuntimeError, 'restore failed'):
                environment.fresh(parent, 'broken')
            root = parent / 'trials/broken'
            stopped.assert_called_once_with(root)
            self.assertTrue((root / 'fresh-trial.json').exists())
            self.assertFalse((root / 'restore.json').exists())


class SQLTests(unittest.TestCase):
    SQL = ("SELECT e.doc_id,count() AS impressions,countDistinct(e.reader_key) AS reach FROM content_events e "
        "WHERE e.service='posts' AND e.event_type='delivery' AND e.doc_id IN ('d') AND e.doc_id IN "
        "(SELECT doc_id FROM doc_groups WHERE group_id IN ('g') AND deleted=0) GROUP BY e.doc_id")

    def test_same_snapshot_oracle_preserves_original_authority_and_outputs(self):
        original = sqlglot.parse_one(self.SQL, read='clickhouse')
        checked = sqlglot.parse_one(views.checked_sql(self.SQL), read='clickhouse')
        self.assertEqual(checked.expressions[:3], original.expressions)
        for key in ('from_', 'where', 'group'):
            self.assertEqual(checked.args[key], original.args[key])
        self.assertEqual(views.verify([('doc', 3, 2, 3, 2)]), [['doc', 3, 2]])
        for rows in ([('d', 3, 2, 4, 2)], [('d', 3, 2, 3, 1)], [('d', 1, 2, 1, 2)], [('d', 1, 1, 1, 1)] * 2):
            with self.assertRaises(ValueError):
                views.verify(rows)

    def test_reference_contract_is_independent_and_matches_declared_semantics(self):
        sql = 'SELECT p.doc_id,p.author_key,p.group_id FROM posts p ORDER BY p.created_at DESC LIMIT 21'
        self.assertEqual(reference.contract(sql), sqlglot.parse_one(arm_f.document_contract(sql), read='clickhouse'))
        self.assertNotIn('QUALIFY', sql)

    def test_shadow_rewrite_changes_tables_not_literals(self):
        class Session:
            def query(self, label, sql, **kwargs):
                self.sql = sql
                return '', 'id'
            def native(self, query): return {}
        with tempfile.TemporaryDirectory() as directory:
            session = Session()
            builder = population.Builder(session, Path(directory) / 'b', target='fanout_rebuild_9')
            builder.query('query', "SELECT reader_key FROM fanout WHERE group_id='fanout'")
            self.assertIn('FROM fanout_rebuild_9', session.sql)
            self.assertIn("'fanout'", session.sql)
            with self.assertRaises(ValueError):
                population.Builder(session, Path(directory) / 'bad', target='documents')


class LifecycleTests(unittest.TestCase):
    def test_rebuild_waits_for_accepted_mutation_then_blocks_new_mutations(self):
        fence = Fence()
        active, release, exclusive, finish = (threading.Event() for _ in range(4))
        order = []
        def first():
            with fence.shared():
                active.set()
                release.wait(2)
                order.append('accepted-complete')
        def rebuild():
            with fence.rebuild():
                order.append('rebuild')
                exclusive.set()
                finish.wait(2)
        def later():
            with fence.shared():
                order.append('later-complete')
        with ThreadPoolExecutor(max_workers=3) as pool:
            a = pool.submit(first)
            self.assertTrue(active.wait(2))
            b = pool.submit(rebuild)
            release.set()
            self.assertTrue(exclusive.wait(2))
            c = pool.submit(later)
            self.assertEqual(order, ['accepted-complete', 'rebuild'])
            finish.set()
            a.result()
            b.result()
            c.result()
        self.assertEqual(order, ['accepted-complete', 'rebuild', 'later-complete'])

    def test_exact_fault_admission_cannot_be_triggered_by_another_actor_or_operation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            op = '11111111-1111-4111-8111-111111111111:publish'
            save(root / 'fault-admission.json', dict(operation_id=op, actor_key='alice', phase='after_apply',
                expires_utc=(datetime.now(UTC) + timedelta(minutes=1)).isoformat()))
            exits = []
            faults.check(root, 'other', 'alice', 'after_apply', exit_process=exits.append)
            faults.check(root, op, 'mallory', 'after_apply', exit_process=exits.append)
            self.assertEqual(exits, [])
            faults.check(root, op, 'alice', 'after_apply', exit_process=exits.append)
            self.assertEqual(exits, [86])
            self.assertFalse((root / 'fault-admission.json').exists())
            faults.check(root, op, 'alice', 'after_apply', exit_process=exits.append)
            self.assertEqual(exits, [86])

    def test_audit_never_serializes_nonpointer_data_and_refuses_duplicate_physical_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            observe.pointers(root, {'request_id': 'a' * 32}, 'users', [['SECRET']], ['password'])
            self.assertFalse(list(root.iterdir()))
            row = ['r', datetime.now(UTC), 'a', 'd', 'g', 1, 0]
            with self.assertRaises(ValueError):
                observe.pointers(root, {'request_id': 'a' * 32}, 'fanout', [row, row], arm_f.COLUMNS)
            observe.request(root, {'request_id': 'a' * 32, 'token': 'SECRET', 'body': 'PRIVATE', 'fanout': {'path': 'canonical_fallback'}})
            text = next((root / 'requests').iterdir()).read_text()
            self.assertNotIn('SECRET', text)
            self.assertNotIn('PRIVATE', text)

    def test_http_records_real_requests_without_tokens_and_sends_fixed_operation_id(self):
        async def check(directory):
            root = Path(directory)
            (root / 'input').mkdir()
            (root / 'input/manifest.json').write_text(json.dumps({'password': 'fixture'}))
            http = HTTP(root, None, root / 'http')
            await http.client.aclose()
            seen = []
            def handle(request):
                seen.append(request)
                return httpx.Response(200, json={'ok': True}, headers={'X-Research-ID': request.headers['X-Research-ID']})
            http.client = httpx.AsyncClient(transport=httpx.MockTransport(handle), base_url='http://research.invalid')
            try:
                await http.post('/v3/create', {'token': 'SECRET'}, origin='https://app.invalid', operation='stable')
            finally:
                await http.close()
            self.assertEqual(seen[0].headers['X-Fanout-Operation'], 'stable')
            self.assertNotIn('SECRET', (root / 'http/requests.jsonl').read_text())
        with tempfile.TemporaryDirectory() as directory:
            asyncio.run(check(directory))


if __name__ == '__main__':
    unittest.main()
