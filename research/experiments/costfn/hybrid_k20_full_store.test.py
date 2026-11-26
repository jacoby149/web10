"""No-engine stage-order, stop and citation controls for the full-store hybrid runner."""
import contextlib
import json
import unittest
from pathlib import Path
import tempfile
from unittest.mock import Mock, patch

import costfn_task
import hybrid_k20_attachment as attachment
import hybrid_k20_full_store as runner
import hybrid_k20_run_current as current
import hybrid_k20_slice as slice


CANNED_AUDIT = [
    dict(phase='warmup', parity='PASS', complete_http_wall_ms=8000.0,
        captured_totals=dict(read_rows=1, logical_read_bytes=90, summed_native_duration_ms=10,
            largest_statement_memory_bytes=100)),
    dict(phase='measured', parity='PASS', complete_http_wall_ms=7000.0,
        captured_totals=dict(read_rows=1, logical_read_bytes=100, summed_native_duration_ms=10,
            largest_statement_memory_bytes=100)),
]


def make_admission(root, **overrides):
    value = dict(
        costfn_task_id='rd4-hybrid-k20-full-store',
        costfn_run_rules='Jacob Hoffman 2026-11-24 costfn task continuation',
        droplet_id=1, deadline_utc='2026-12-01T00:00:00+00:00',
        hybrid_k20_source_commit='b' * 40,
        hybrid_k20_directive=slice.DIRECTIVE,
        restored_snapshot_id='255003176',
        pin_index_directive='Jacob Hoffman 2026-11-22 skinny app-shaped billboard pin lookup then rerun',
        row_model_admitted=False)
    value.update(overrides)
    (Path(root) / 'admission.json').write_text(json.dumps(value))
    return value


class SourceGuard(unittest.TestCase):
    def test_task_mode_accepts_the_bound_source(self):
        with tempfile.TemporaryDirectory() as directory:
            make_admission(directory)
            with patch.object(runner.current, 'subprocess'), \
                    patch.object(runner.current, 'costfn_task') as tasklib:
                tasklib.source.return_value = 'c' * 40
                self.assertEqual(runner.source_guard(json.loads((Path(directory) / 'admission.json').read_text())),
                    'c' * 40)

    def test_each_binding_refusal(self):
        with tempfile.TemporaryDirectory() as directory:
            for overrides in (
                    dict(hybrid_k20_directive='other'),
                    dict(restored_snapshot_id='999999999'),
                    dict(row_model_admitted=True),
                    dict(layout_clock_directive=current.window.DIRECTIVE, composition_admitted=True,
                         row_model_admitted=True),
                    dict(hybrid_k20_source_commit=current.PREFLIGHT),
                    dict(hybrid_k20_source_commit='nothex')):
                with self.subTest(overrides=overrides):
                    value = make_admission(directory, **overrides)
                    (Path(directory) / 'admission.json').unlink()
                    with self.assertRaisesRegex(ValueError, 'binding required'):
                        runner.source_guard(value)


class SteadyState(unittest.TestCase):
    def test_optimize_only_the_version_tables_and_bank_the_event_regime(self):
        queries = []

        class Session:
            host_id = 1

            def rows(self, label, sql):
                assert 'system.parts' in sql, sql
                return ([{'parts': 3, 'rows': '10', 'compressed_bytes': '5', 'uncompressed_bytes': '7'}], label)

            def query(self, label, sql, *, setup_seconds=600):
                queries.append(sql)
                return ('', label)

            def native(self, query_id):
                return dict(query_id=query_id, exception_code=0)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(runner.modern, 'Session', return_value=Session()):
                receipt = runner.steady_state(root)
                self.assertTrue((root / 'full-store-steady-state.json').exists())
        self.assertEqual(len(queries), len(runner.HOT_TABLES))
        for query in queries:
            self.assertTrue(query.startswith('OPTIMIZE TABLE ') and query.endswith(' FINAL'), query)
        self.assertNotIn('OPTIMIZE TABLE ' + runner.EVENT_TABLE + ' FINAL', queries)
        for key in ('regime', 'declaration', 'cost_reference', 'before', 'after',
                    'event_parts_before', 'event_parts_after'):
            self.assertIn(key, receipt)
        self.assertEqual(len(receipt['before']), len(runner.HOT_TABLES) + 1)


class ChunkedSatelliteBuild(unittest.TestCase):
    def recording_session(self):
        class Session:
            host_id = 7
            parts = [{'name': 'p', 'rows': '1', 'data_version': '1', 'content': 'c'}]

            def __init__(self):
                self.statements = []

            def rows(self, label, sql):
                assert 'cityHash64' in sql or 'system.parts' in sql, sql
                self.statements.append(sql)
                if 'system.parts' in sql:
                    return (Session.parts, label)
                if 'mismatches' in sql:
                    return ([{'mismatches': 0}], label)
                return ([{'ties': 0}], label)

            def query(self, label, sql, **kwargs):
                self.statements.append(sql)
                return ('', label)

            def native(self, query_id):
                return dict(query_id=query_id, exception_code=0)

        return Session()

    def test_chunked_copy_is_one_receipted_insert_per_owned_bucket(self):
        session = self.recording_session()
        with tempfile.TemporaryDirectory() as directory:
            proof = attachment.build(session, Path(directory), chunked=True)
        copies = [sql for sql in session.statements if sql.startswith('INSERT INTO ' + attachment.TABLE)]
        self.assertEqual(len(copies), attachment.BUCKETS)
        for bucket, sql in enumerate(copies):
            self.assertIn(f'cityHash64(doc_id)%{attachment.BUCKETS}={bucket}', sql)
        self.assertEqual(proof['copy_chunks'], attachment.BUCKETS)
        self.assertEqual(proof['parity'], 'PASS')
        self.assertEqual([stage['stage'] for stage in proof['writes']],
            ['create', *(['copy'] * attachment.BUCKETS), 'settle'])

    def test_default_copy_keeps_the_single_slice_statement(self):
        session = self.recording_session()
        with tempfile.TemporaryDirectory() as directory:
            proof = attachment.build(session, Path(directory))
        copies = [sql for sql in session.statements if sql.startswith('INSERT INTO ' + attachment.TABLE)]
        self.assertEqual(len(copies), 1)
        self.assertNotIn('cityHash64', copies[0])
        self.assertEqual(proof['copy_chunks'], 1)


class SeedDayBucketsRepair(unittest.TestCase):
    def test_int_admission_value_normalizes_to_the_banked_default(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'admission.json').write_text(json.dumps(dict(aggregate_seed_day_buckets=4096)))
            with patch.object(runner.modern, 'admitted'), \
                    patch.object(runner.modern.arm_t, 'digitalocean_id', return_value=1):
                actions = runner.Actions(root, Mock())
            self.assertIsNone(actions.approval['aggregate_seed_day_buckets'])
            self.assertEqual(actions.approval['aggregate_seed_day_buckets_repaired_from'], 4096)

    def test_dict_admission_value_passes_through_untouched(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'admission.json').write_text(json.dumps(
                dict(aggregate_seed_day_buckets={'2026-01-01': 4})))
            with patch.object(runner.modern, 'admitted'), \
                    patch.object(runner.modern.arm_t, 'digitalocean_id', return_value=1):
                actions = runner.Actions(root, Mock())
            self.assertEqual(actions.approval['aggregate_seed_day_buckets'], {'2026-01-01': 4})
            self.assertNotIn('aggregate_seed_day_buckets_repaired_from', actions.approval)


class Driver(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.calls = []

    def patched(self, *, diverge=None, fail=None):
        def stage(name, progress):
            self.calls.append(name)
            if fail and name == fail:
                raise ValueError('stage failed: ' + name)
            if name == 'verify-ads':
                (self.root / 'composition-proof.json').write_text(json.dumps(dict(droplet_id=1)))
            if name == 'furniture':
                (self.root / 'reference-ordinary').mkdir(parents=True, exist_ok=True)
                (self.root / 'reference-ordinary' / 'expected-billboards.json').write_text(
                    json.dumps(dict(ids=[])))
            return {}

        def steady(root=None):
            (self.root / 'full-store-steady-state.json').write_text('{}')

        def satellite(root=None):
            (self.root / 'hybrid-attachment-proof.json').write_text('{}')
            return dict(copy_chunks=32, writes=[])

        def run_complete(parent, name, profile_name, mode, expected, **kwargs):
            self.calls.append(('cell', kwargs))
            if diverge:
                raise costfn_task.ParityDivergence('parity')

        actions = Mock(restore=lambda: dict(snapshot_id='255003176'), stage=stage)
        return (patch.object(runner, 'source_guard', return_value='b' * 40),
            patch.object(runner.modern, 'install_sessions'),
            patch.object(runner, 'Actions', return_value=actions),
            patch.object(runner.modern, 'Session'),
            patch.object(runner.setup, 'parts', return_value=('copy-parts', 'parts-query')),
            patch.object(runner.contract, 'gate'),
            patch.object(runner, 'steady_state', side_effect=steady),
            patch.object(runner, 'validate_furniture'),
            patch.object(runner, 'satellite_stage', side_effect=satellite),
            patch.object(runner, 'validate_satellite'),
            patch.object(runner.cells, 'run_complete', side_effect=run_complete),
            patch.object(runner.baseline, 'audit_cell', return_value=CANNED_AUDIT),
            patch.object(runner.comparison, 'plans', return_value=[]))

    def patched_run(self, **kwargs):
        patches = self.patched(**kwargs)
        with contextlib.ExitStack() as stack:
            for entry in patches:
                stack.enter_context(entry)
            return runner.run(self.root)

    def test_full_sequence_and_citation_only(self):
        make_admission(self.root)
        result = self.patched_run()
        self.assertEqual(result['status'], 'EVIDENCE_COLLECTED')
        steps = list(json.loads((self.root / 'costfn-task.json').read_bytes())['steps'])
        self.assertEqual(steps, ['restore', 'steady-state', 'read-setup', 'migrate', 'billboard-fixtures',
            'furniture', 'gate:refs', 'gate:paired-tallies', 'gate:views', 'gate:ads', 'satellite',
            'r1:hybrid:capture', 'r2:hybrid:capture'])
        cell_calls = [call for call in self.calls if isinstance(call, tuple) and call[0] == 'cell']
        self.assertEqual(len(cell_calls), 2)
        for _, kwargs in cell_calls:
            self.assertEqual((kwargs['projected'], kwargs['hybrid'], kwargs['aggregate']), (True, True, True))
            self.assertEqual(kwargs['serving_mode'], 'F_DOCUMENT_STREAM_V1')
        self.assertIs(result['indexed_baseline']['cited_not_remeasured'], True)
        self.assertIn('reported, not assumed', result['derived']['label'])
        self.assertEqual(result['claim_boundary'], runner.CLAIM_BOUNDARY)
        self.assertEqual(result['six_case'], 'NOT_ADMITTED')

    def test_parity_divergence_is_terminal_and_publishes_no_result(self):
        make_admission(self.root)
        with self.assertRaises(costfn_task.ParityDivergence):
            self.patched_run(diverge=True)
        state = json.loads((self.root / 'costfn-task.json').read_bytes())
        self.assertEqual(state['status'], 'PARITY_DIVERGENCE')
        self.assertFalse((self.root / 'hybrid-k20-full-store.json').exists())

    def test_setup_failure_never_reaches_measurement(self):
        make_admission(self.root)
        with self.assertRaisesRegex(ValueError, 'furniture'):
            self.patched_run(fail='furniture')
        state = json.loads((self.root / 'costfn-task.json').read_bytes())
        self.assertEqual(state['status'], 'NEEDS_REPAIR')
        self.assertNotIn('satellite', state['steps'])
        self.assertNotIn('r1:hybrid:capture', state['steps'])
        self.assertFalse((self.root / 'hybrid-k20-full-store.json').exists())


if __name__ == '__main__':
    unittest.main()

