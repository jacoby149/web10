"""Connected source seams using typed driver doubles; never starts an engine."""
from datetime import UTC, datetime
import inspect
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import sqlglot
from sqlglot import exp
from clickhouse_connect.driver.client import Client

import row_model as model
from row_model_actions import Actions, DIRECTIVE, project
from row_model_build import Builder
import row_model_build as build
from row_model_native import Driver
import row_model_run as launcher
import row_model_worker as worker
import engagement_composition_run as composition_runner


class NativeClient:
    """Pinned API-shaped double: query IDs, native terminals and typed blocks."""
    def __init__(self):
        self.terminals, self.events, self.settings = {}, [], []
        self.fail_next = False

    def terminal(self, identifier):
        return dict(query_id=identifier, type='QueryFinish', exception_code=0, exception='', read_rows=17,
            read_bytes=340, query_duration_ms=4, written_rows=0, written_bytes=0, memory_usage=100,
            native_max_execution_time='600', native_max_rows_to_read='0', native_max_bytes_to_read='0',
            native_max_memory_usage=str(22 * 1024**3))

    def query(self, statement, **kwargs):
        inspect.signature(Client.query).bind_partial(None, statement, **kwargs)
        if 'FROM system.query_log' in statement:
            self.events.append('observe')
            tree = sqlglot.parse_one(statement, read='clickhouse')
            predicate = tree.args['where'].this
            values = [bytes.fromhex(node.this.this).decode() for node in predicate.find_all(exp.Unhex)]
            rows = [self.terminals[key] for key in values if key in self.terminals]
            columns = list(self.terminal(''))
            return SimpleNamespace(column_names=columns, result_rows=[tuple(row[c] for c in columns) for row in rows])
        identifier = kwargs['settings']['query_id']
        self.settings.append(kwargs['settings'])
        self.events.append('data')
        self.terminals[identifier] = self.terminal(identifier)
        if self.fail_next:
            self.fail_next = False
            self.terminals[identifier].update(exception_code=159, type='ExceptionWhileProcessing', read_rows=20_000_000)
            raise ConnectionError('transport failed after native submission')
        return SimpleNamespace(column_names=['value'], result_rows=[(42,)])

    def command(self, statement, **kwargs):
        if statement == 'SYSTEM FLUSH LOGS':
            self.events.append('flush')
            return None
        identifier = kwargs['settings']['query_id']
        self.terminals[identifier] = self.terminal(identifier)
        return None

    def insert(self, table, rows, **kwargs):
        inspect.signature(Client.insert).bind_partial(None, table, rows, **kwargs)
        identifier = kwargs['context'].settings['query_id']
        self.terminals[identifier] = self.terminal(identifier)


class IntegrationTests(unittest.TestCase):
    def driver(self, directory):
        client = NativeClient()
        return Driver(client, Path(directory) / 'native', lambda:None), client

    def test_actual_pinned_driver_arguments_and_native_observation_after_sample_clock(self):
        with tempfile.TemporaryDirectory() as directory:
            driver, client = self.driver(directory)
            def operation():
                result = driver.query('SELECT value FROM row_integers')
                client.events.append('operation-return')
                return result
            actual, sample = driver.sample('feed', 'rows', 'measured', operation)
        self.assertEqual(actual, [dict(value=42)])
        self.assertLess(client.events.index('operation-return'), client.events.index('flush'))
        self.assertEqual(sample['read_bytes'], 340)
        self.assertEqual(sample['inclusive_read_bytes'], 340)
        settings = client.settings[0]
        for name in ('max_rows_to_read', 'max_rows_to_read_leaf', 'max_bytes_to_read', 'max_bytes_to_read_leaf'):
            self.assertEqual(settings[name], 0)
        self.assertEqual(settings['max_execution_time'], 600)

    def test_large_ingest_history_sql_gets_bounded_parser_allowance_only_outside_samples(self):
        identities = [model.Identity('actor', f'00000000-0000-0000-0000-{i:012d}') for i in range(4096)]
        statement = build.histories(['source_a', 'source_b', 'source_c'], identities)
        self.assertGreater(len(statement.encode()), 256 * 1024)
        with tempfile.TemporaryDirectory() as directory:
            driver, client = self.driver(directory)
            driver.query(statement)
            driver.sample('feed', 'canonical', 'measured', lambda: driver.query(statement))
        self.assertEqual(client.settings[0]['max_query_size'], 16 * 1024**2)
        self.assertNotIn('max_query_size', client.settings[1])

    def test_fence_is_named_separately_and_inclusive_native_cost_is_not_dropped(self):
        with tempfile.TemporaryDirectory() as directory:
            driver, _ = self.driver(directory)
            def operation():
                driver.fence_call(lambda: driver.query('SELECT rows FROM system.parts'))
                return driver.query('SELECT value FROM row_text')
            _, sample = driver.sample('feed', 'rows', 'measured', operation)
        self.assertEqual(sample['stages']['assembly']['read_bytes'], 340)
        self.assertEqual(sample['stages']['generation_fence']['read_bytes'], 340)
        self.assertEqual(sample['inclusive_read_bytes'], 680)
        self.assertGreaterEqual(sample['inclusive_elapsed_ms'], sample['elapsed_ms'])

    def test_typed_path_denies_JSON_casts_and_canonical_fallback_before_native_submission(self):
        with tempfile.TemporaryDirectory() as directory:
            driver, client = self.driver(directory)
            driver.variant = 'rows'
            for statement in ('SELECT body FROM engagement_documents', 'SELECT value FROM foreign.row_text',
                    'SELECT body FROM tables',
                    "SELECT JSONExtractString(value,'text') FROM row_text", 'SELECT toUInt64(value) FROM row_text',
                    'SELECT CAST(value AS UInt64) FROM row_text', 'SELECT unhex(value) FROM row_text'):
                with self.subTest(statement=statement), self.assertRaises(ValueError):
                    driver.query(statement)
        self.assertFalse(client.events)

    def test_native_timeout_partial_actuals_survive_without_resubmission_and_next_cell_runs(self):
        with tempfile.TemporaryDirectory() as directory:
            driver, client = self.driver(directory)
            client.fail_next = True
            with self.assertRaises(ConnectionError):
                driver.sample('failed', 'rows', 'measured', lambda: driver.query('SELECT value FROM row_text'))
            preserved = json.loads((driver.root / 'failed-measured-rows.json').read_bytes())
            self.assertTrue(preserved['operation_failed'])
            self.assertEqual(preserved['read_rows'], 20_000_000)
            self.assertEqual(client.events.count('data'), 1)
            _, next_sample = driver.sample('independent', 'rows', 'measured', lambda: driver.query('SELECT value FROM row_text'))
            self.assertEqual(next_sample['read_rows'], 17)
            self.assertEqual(client.events.count('data'), 2)

    def test_late_typed_result_body_failure_is_not_recorded_as_client_success(self):
        class LateResult:
            column_names = ['value']
            @property
            def result_rows(self):
                raise ConnectionError('late typed body transport failure')
        class ClientWithLateBody(NativeClient):
            def query(self, statement, **kwargs):
                result = super().query(statement, **kwargs)
                return result if 'system.query_log' in statement else LateResult()
        with tempfile.TemporaryDirectory() as directory:
            client = ClientWithLateBody()
            driver = Driver(client, Path(directory)/'native', lambda:None)
            with self.assertRaisesRegex(ConnectionError, 'late typed body'):
                driver.sample('late-body', 'rows', 'measured', lambda:driver.query('SELECT value FROM row_text'))
            self.assertEqual(driver.records[0]['outcome'], 'INCOMPLETE')
            self.assertEqual(driver.records[0]['native']['exception_code'], 0)
            self.assertEqual(client.events.count('data'), 1)

    def test_successful_setup_receipts_are_batched_instead_of_flushing_per_value_seek(self):
        with tempfile.TemporaryDirectory() as directory:
            driver, client = self.driver(directory)
            for _ in range(3):
                driver.query('SELECT value FROM row_text')
            self.assertNotIn('flush', client.events)
            driver.collect_pending()
            driver.require_native(driver.records)
        self.assertEqual(client.events.count('flush'), 1)
        self.assertEqual(len(driver.records), 3)

    def test_concrete_canonical_oracle_handles_full_author_keys_edits_deletions_and_exact_projection(self):
        clock = datetime(2026,11,19,tzinfo=UTC)
        def row(author, text, offset=0, deleted=False):
            return dict(author_key=author, doc_id='same', body=json.dumps(dict(text=text)), deleted=deleted,
                created_at=clock, updated_at=clock.replace(second=offset))
        rows = [row('a','old'), row('a','new',1), row('b','other'), row('c','deleted'), row('c','deleted',1,True)]
        action = Actions(Path('unused'), SimpleNamespace(query=lambda statement:rows, insert=Mock()))
        identities = [model.Identity(author,'same') for author in ('a','b','c')]
        actual = action.canonical(identities)
        self.assertEqual(actual[identities[0]]['body']['text'], 'new')
        self.assertEqual(actual[identities[1]]['body']['text'], 'other')
        self.assertIsNone(actual[identities[2]])
        self.assertEqual(project(actual[identities[0]], [('body','text'),('missing',)]), {('body','text'):'new'})

    def test_history_identity_lookup_resolves_deleted_target_with_full_key_canonical_verification(self):
        calls = []
        def query(statement):
            calls.append(statement)
            return [dict(author_key='owner', doc_id='deleted-target')]
        builder = Builder(query, None, None, source_tables=['engagement_documents'], quiescent_verified=True,
            identity_table='canonical_row_model_identities')
        self.assertEqual(builder.reference_owners({'deleted-target'}), {'deleted-target':model.Identity('owner','deleted-target')})
        self.assertIn('canonical_row_model_identities', calls[0])
        self.assertIn('documents', calls[1])
        self.assertNotIn('deleted = 0', calls[1])
        self.assertNotIn('deleted=0', calls[1])

    def test_host_bridge_requires_explicit_row_admission_before_any_session_or_Docker(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'admission.json').write_text('{}')
            with patch.object(launcher.modern, 'Session', side_effect=AssertionError('must not contact engine')):
                with self.assertRaisesRegex(ValueError, 'explicit .*admission'):
                    launcher.run(root)

    def test_worker_admission_requires_all_fixes_bank_and_bound_DO_host(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            value = dict(row_model_admitted=True, row_model_directive=DIRECTIVE)
            (root / 'admission.json').write_text(json.dumps(value))
            (root / 'programme-all-fixes').mkdir()
            (root / 'programme-all-fixes/summary.json').write_text('{"stages":{}}')
            with patch.object(worker.modern, 'admitted') as admission:
                with self.assertRaises(ValueError):
                    worker.admission(root, 123)
            admission.assert_called_once_with(value, 123)

    def test_default_worker_refuses_nonresearch_environment_before_metadata_or_client(self):
        with patch.dict(worker.os.environ, {'COSTFN_DISPOSABLE':'0'}), \
                patch.object(worker.arm_t, 'digitalocean_id', side_effect=AssertionError('must refuse first')):
            with self.assertRaisesRegex(ValueError, 'disposable research container'):
                worker.run(Path('unused'))

    def test_host_command_runs_real_worker_with_owned_root_and_no_service_ports(self):
        command = launcher.command(SimpleNamespace(compose=['docker','compose','-p','owned']), '/owned/root')
        self.assertIn('/owned/root:/row-state', command)
        self.assertIn('/research/row_model_worker.py', command)
        self.assertIn('--no-deps', command)
        self.assertNotIn('--service-ports', command)

    def test_current_source_binding_is_required_before_restore_or_row_follow_on(self):
        value = dict(row_model_admitted=True, row_model_directive=DIRECTIVE,
            row_model_source_binding=launcher.cell.binding())
        launcher.source_ready(value)
        with self.assertRaisesRegex(ValueError, 'current-source'):
            launcher.source_ready({**value, 'row_model_source_binding':{}})

    def test_concrete_typed_action_assembles_rows_without_calling_canonical_inside_measurement(self):
        clock = datetime(2026,11,19,tzinfo=UTC)
        source = dict(author_key='a', doc_id='p', body='{"text":"shown","other":7}',
            created_at=clock, updated_at=clock, deleted=False)
        expected = {**source, 'body':json.loads(source['body'])}
        expected.pop('deleted')
        identity = model.Identity('a','p')
        memory = model.MemoryStore()
        batch = model.decompose(expected, 1)
        memory.stage(batch)
        memory.publish(batch.node)
        class DriverDouble:
            variant = None
            def query(self, statement):
                if self.variant == 'rows':
                    raise AssertionError('typed treatment must not call the canonical JSON oracle')
                return [source]
            def insert(self, *args):
                raise AssertionError('no writes during assembly')
            def sample(self, name, variant, phase, operation):
                self.variant = variant
                try:
                    result = operation()
                    return result, dict(elapsed_ms=1, read_rows=1, read_bytes=100)
                finally:
                    self.variant = None
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'row-model').mkdir()
            action = Actions(root, DriverDouble())
            action.pages['ordinary'] = [identity]
            action.store = SimpleNamespace(read=lambda identities, paths, frozen:{
                value:project(memory.read(value), paths) if paths is not None else memory.read(value) for value in identities})
            result = action.measure('uniform-K20-feed', 'rows', 'measured')
            packet = root / result['comparison_packet']['private_file']
            self.assertEqual(packet.stat().st_mode & 0o777, 0o600)
        self.assertEqual(result['parity'], 'PASS')
        self.assertEqual(result['documents'], 1)

    def test_composed_entry_refuses_unprepared_row_source_before_session_or_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'admission.json').write_text('{}')
            with patch.object(composition_runner, 'Actions', side_effect=AssertionError('must refuse before native controller')):
                with self.assertRaisesRegex(ValueError, 'current-source'):
                    composition_runner.run(root, with_row_model=True)

    def test_canonical_payload_control_selects_winners_in_SQL_instead_of_decoding_full_history(self):
        clock = datetime(2026,11,19,tzinfo=UTC)
        row = dict(author_key='a', doc_id='p', body='{"text":"current"}', deleted=False,
            created_at=clock, updated_at=clock)
        query = Mock(return_value=[row])
        action = Actions(Path('unused'), SimpleNamespace(query=query, insert=Mock()))
        action.canonical([model.Identity('a','p')], control=True)
        sql = query.call_args.args[0]
        self.assertIn('row_model_winner=1', sql)
        self.assertIn('updated_at DESC,deleted DESC', sql)
        sqlglot.parse_one(sql, read='clickhouse')

    def test_history_identity_lookup_never_guesses_between_same_ID_different_authors(self):
        rows = [dict(author_key=author, doc_id='same') for author in ('a','b')]
        builder = Builder(lambda statement:rows, None, None, source_tables=['engagement_documents'],
            quiescent_verified=True, identity_table='canonical_row_model_identities')
        with self.assertRaisesRegex(ValueError, 'ambiguous legacy'):
            builder.reference_owners({'same'})

    def test_ingest_page_pushes_exact_distinct_topK_into_each_PK_lane_but_never_limits_history(self):
        statement = build.identity_page(['source_a','source_b'], ('actor','cursor'), size=3)
        tree = sqlglot.parse_one(statement, read='clickhouse')
        leaves = [select for select in tree.find_all(exp.Select)
            if isinstance(select.args.get('from_').this, exp.Table)]
        self.assertEqual(len(leaves), 2)
        for leaf in leaves:
            self.assertTrue(leaf.args.get('distinct'))
            self.assertEqual(leaf.args['limit'].expression.this, '3')
            self.assertIn('author_key', leaf.args['where'].sql())
        history = sqlglot.parse_one(build.histories(['source_a','source_b'], [model.Identity('actor','doc')]), read='clickhouse')
        self.assertFalse(list(history.find_all(exp.Limit)))
        for table in history.find_all(exp.Table):
            self.assertIn('doc_id', table.find_ancestor(exp.Select).args['where'].sql())
        sources = [list(range(12)), [1,3,8,13,14], [0,8,15,16,17]]
        for after in (-1,3,11,15):
            expected = sorted({value for values in sources for value in values if value>after})[:3]
            actual = sorted({value for values in sources for value in sorted(set(v for v in values if v>after))[:3]})[:3]
            self.assertEqual(actual, expected)


if __name__ == '__main__':
    unittest.main()
