"""No-engine admission, discipline and gate controls for the DAU runner."""
import asyncio
from datetime import UTC, datetime
import json
import sqlite3
import sys
import unittest
from pathlib import Path
import tempfile
import uuid
from unittest.mock import AsyncMock, Mock, patch

import sqlglot

import costfn_task
import arm_f_native
import dau_sustain_admission as binding
import dau_sustain_cell_policy as cell_policy
import dau_sustain_fixture_transfer as transfer
import dau_sustain_live as live
from dau_sustain_dispatch import Dispatch
import dau_sustain_memory as memory
import dau_sustain_native_audit as native_audit
import dau_sustain_parity as parity
import dau_sustain_readers as readers
import dau_sustain_reference as reference
import dau_sustain_run as run
import dau_sustain_scope_proof as scope_proof
import dau_sustain_timed as timed
import dau_sustain_workload as wl
import engagement_window as window


def approval(**overrides):
    value = dict(
        costfn_task_id='rd4-dau-sustain',
        costfn_run_rules=window.TASK_RULES,
        droplet_id=1, deadline_utc='2026-12-01T00:00:00+00:00',
        hybrid_k20_source_commit='b' * 40,
        hybrid_k20_directive='RD4-HYBRID-K20-NATIVE baseline reproduction only',
        restored_snapshot_id='255003176',
        pin_index_directive='Jacob Hoffman 2026-11-22 skinny app-shaped billboard pin lookup then rerun',
        row_model_admitted=False,
        dau_sustain_directive=run.DIRECTIVE,
        purpose='DAU_SUSTAINED_CONTRACT_RATE',
        dau_host=dict(region='nyc3', size='c-16', price_hourly=0.50,
            storage_gib=200, storage_class='local SSD', backstop_h=12, compute_ceiling_usd=25.0,
            cores=16, threads=32, ram_gb=32),
        dau_envelope=dict(container_bytes=30064771200, server_bytes=23622320128,
            api_bytes=2147483648, minio_bytes=1073741824),
        dau_store_source='PARQUET_TRANSFER',
        hybrid_k20_projected_admitted=False)
    value.update(overrides)
    return value


class AdmissionGate(unittest.TestCase):
    def test_each_misbinding_refuses(self):
        for overrides in (
                dict(dau_sustain_directive='other'),
                dict(purpose='ENGAGEMENT_ALL_FIXES'),
                dict(dau_host=dict(region='nyc2', size='s-8vcpu-32gb-amd', price_hourly=.25,
                    storage_gib=400, storage_class='NVMe', backstop_h=24, compute_ceiling_usd=25.0)),
                dict(dau_host=dict(region='nyc2', size='g-48vcpu-192gb-intel', price_hourly=2.6994,
                    storage_gib=720, storage_class='', backstop_h=12, compute_ceiling_usd=25.0)),
                dict(dau_host=dict(region='nyc2', size='g-48vcpu-192gb-intel', price_hourly=2.6994,
                    storage_gib=720, storage_class='NVMe', backstop_h=12, compute_ceiling_usd=50.0)),
                dict(dau_envelope=dict(container_bytes=10, server_bytes=20)),
                dict(dau_envelope=dict(container_bytes=107374182400, server_bytes=85899345920)),
                dict(restored_snapshot_id='999999999'),
                dict(dau_store_source='SNAPSHOT'),
                dict(hybrid_k20_projected_admitted=True)):
            with self.subTest(overrides=overrides):
                with patch.object(run, 'full_store') as store:
                    store.source_guard.return_value = 'c' * 40
                    with self.assertRaisesRegex(ValueError, 'required|declared|differs|refused|indexed'):
                        run.admission_gate(approval(**overrides))

    def test_derived_requirement_binds_or_a_declared_closest_class_note(self):
        host = dict(region='nyc3', size='c2-8vcpu-16gb', price_hourly=.25,
            storage_gib=200, storage_class='NVMe', backstop_h=12, compute_ceiling_usd=25.0)
        with patch.object(run, 'full_store') as store:
            store.source_guard.return_value = 'c' * 40
            with self.assertRaisesRegex(ValueError, 'derived host requirement'):
                run.admission_gate(approval(dau_host=host))
            host['class_note'] = ('no dedicated-CPU class in the provider catalogue; the closest class at '
                'the derived resources (16 cores / 32 threads / 32 GB RAM) is the CPU-Optimized c-16, '
                '16 vCPU / 32 GB / 200 GB local SSD; vCPU-to-core mapping per the provider class docs')
            run.admission_gate(approval(dau_host=host))
            host['class_note'] = '   '
            with self.assertRaisesRegex(ValueError, 'derived host requirement'):
                run.admission_gate(approval(dau_host=host))

    def test_task_mode_and_source_binding_are_required(self):
        value = approval(costfn_task_id=None, costfn_run_rules=None)
        with patch.object(run, 'full_store') as store:
            store.source_guard.return_value = 'c' * 40
            with self.assertRaisesRegex(ValueError, 'task-mode'):
                run.admission_gate(value)
        with patch.object(run, 'full_store') as store:
            store.source_guard.side_effect = ValueError('explicit baseline-only source/snapshot binding required')
            with self.assertRaisesRegex(ValueError, 'binding required'):
                run.admission_gate(approval())


class WriterDiscipline(unittest.TestCase):
    def test_payload_is_text_only_posts_in_own_followers_plus_discover(self):
        payload = run.writer_payload('writer-1', 7, 'discover-group')
        self.assertEqual(payload['service'], 'posts')
        self.assertEqual(payload['body'], dict(text='dau sustain 7', status='active'))
        self.assertEqual(payload['groups'], ['writer-1/followers', 'discover-group'])
        self.assertNotIn('media', payload['body'])
        self.assertNotIn('author_as', payload)

    def test_writer_cannot_target_a_followers_group_or_duplicate(self):
        with self.assertRaisesRegex(ValueError, 'own-followers plus Discover'):
            run.writer_payload('writer-1', 7, 'other/followers')
        with self.assertRaisesRegex(ValueError, 'own-followers plus Discover'):
            run.writer_payload('writer-1', 7, 'writer-1/followers')


class ErrorClasses(unittest.TestCase):
    def test_http_status_and_engine_stops_are_classed_content_free(self):
        def http_error(status):
            class Status:
                pass

            Status.status_code = status

            class HttpError(ValueError):
                response = Status()

            return HttpError(str(status))

        self.assertEqual(run.error_class_of(http_error(503)), '5xx')
        self.assertEqual(run.error_class_of(http_error(429)), '429')
        self.assertEqual(run.error_class_of(http_error(404)), '4xx_content')
        self.assertEqual(run.error_class_of(ValueError('Memory limit exceeded: code 241')),
            'memory_cap_refusal')
        self.assertEqual(run.error_class_of(TimeoutError('read Timeout')), 'timeout')
        self.assertEqual(run.error_class_of(ValueError('boom')), 'other')


class OracleAudit(unittest.TestCase):
    def setUp(self):
        self.billboards = dict(rows=[dict(doc_id='d1', author_key='a')],
            billboard_setup=dict(node_ratio=.25),
            followups=[[dict(doc_id='r1')], [dict(doc_id='c1')]])
        self.expected_views = {'d1': dict(impressions=4, reach=2)}
        self.sample = dict(rows=[dict(doc_id='d1', author_key='a')],
            followups=[dict(rows=[dict(doc_id='r1')]), dict(rows=[dict(doc_id='c1')]),
                {'d1': dict(impressions=4, reach=2)}])

    def test_exact_response_passes(self):
        with patch.object(run.ads, 'compare') as compare:
            compare.side_effect = None
            run.audit_response(self.sample, 'reader-1', self.billboards, self.expected_views)
            compare.assert_called_once_with(self.sample['rows'], self.billboards['rows'],
                self.billboards['billboard_setup'])

    def test_followup_or_views_divergence_stops(self):
        bad = json.loads(json.dumps(self.sample))
        bad['followups'][0] = dict(rows=[dict(doc_id='other')])
        with patch.object(run.ads, 'compare'):
            with self.assertRaises(costfn_task.ParityDivergence):
                run.audit_response(bad, 'reader-1', self.billboards, self.expected_views)
        bad = json.loads(json.dumps(self.sample))
        bad['followups'][2] = {'d1': dict(impressions=5, reach=2)}
        with patch.object(run.ads, 'compare'):
            with self.assertRaises(costfn_task.ParityDivergence):
                run.audit_response(bad, 'reader-1', self.billboards, self.expected_views)


class ExpectedPreload(unittest.TestCase):
    def artifacts(self, root, *, names=('ordinary', 'fixture')):
        for name in names:
            directory = root / ('reference-' + name)
            directory.mkdir(parents=True)
            (directory / 'expected.json').write_text(json.dumps(
                dict(rows=[dict(doc_id='d-' + name, group_id='g-' + name)], eligible_ads=[])))

    def test_saved_read_setup_preloads_the_expected_references(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.artifacts(root)
            actions = Mock()
            actions.expected = {}
            run.preload_expected(root, {'read-setup': dict(evidence={})}, actions)
            self.assertEqual(set(actions.expected), {'ordinary', 'fixture'})
            self.assertEqual(actions.expected['ordinary']['rows'][0]['group_id'], 'g-ordinary')

    def test_live_read_setup_is_left_to_the_stage(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.artifacts(root)
            actions = Mock()
            actions.expected = {}
            run.preload_expected(root, dict(restore=dict(evidence={})), actions)
            self.assertEqual(actions.expected, {})

    def test_saved_billboards_use_the_applied_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.artifacts(root)
            for name in ('ordinary', 'fixture'):
                (root / ('reference-' + name) / 'expected-billboards.json').write_text(
                    json.dumps(dict(rows=[dict(ad_mode='node')])))
            actions = Mock(expected={})
            run.preload_expected(root, {'read-setup': {}, 'billboard-fixtures': {}}, actions)
            self.assertEqual(actions.expected['ordinary']['rows'], [dict(ad_mode='node')])

    def test_saved_read_setup_missing_an_artifact_refuses(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.artifacts(root, names=('ordinary',))
            actions = Mock()
            actions.expected = {}
            with self.assertRaisesRegex(ValueError, 'without its fixture reference artifact'):
                run.preload_expected(root, {'read-setup': dict(evidence={})}, actions)


class ParquetInfrastructure(unittest.TestCase):
    def test_fresh_metadata_is_bound_to_the_current_store_without_settling_again(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'input').mkdir()
            (root / 'input/manifest.json').write_text('{}')
            action = Mock(root=root)
            state = dict(canonical_generation='g', canonical_content_sha256='bytes')
            with patch.object(run, 'setup') as setup, patch.object(run, 'certificates') as cert, \
                    patch.object(run.modern, 'Session') as session:
                setup.infrastructure.return_value = 'g'
                cert.fingerprint.return_value = state
                self.assertIs(run.Actions.base_infrastructure(action), cert.verify.return_value)
                setup.infrastructure.assert_called_once_with(root, 'dau-parquet', initial=True, settle=False,
                    additional_groups=set(), reader_groups=None)
                cert.bind.assert_called_once_with(root, session.return_value, 'g', dict(
                    kind='DAU_VERIFIED_PARQUET_REBUILT',
                    input_manifest_sha256=run.digest(root / 'input/manifest.json'),
                    canonical_content_sha256='bytes'))
                self.assertEqual(run.read(root / 'before-projection-fingerprint.json'), state)


class StoreCounts(unittest.TestCase):
    def test_parquet_transfer_binds_to_the_verified_input_not_the_snapshot_census(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'admission.json').write_text(json.dumps(dict(dau_store_source='PARQUET_TRANSFER')))
            (root / 'input').mkdir()
            (root / 'input' / 'manifest.json').write_text(json.dumps(dict(files=dict(
                documents=dict(rows=88200300), content_events=dict(rows=1600000000),
                doc_groups=dict(rows=92200600)))))
            self.assertEqual(run.input_manifest_counts(root), dict(documents=88200300,
                content_events=1600000000, doc_groups=92200600))

    def test_parquet_transfer_refuses_store_drift_from_the_input(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'admission.json').write_text(json.dumps(dict(dau_store_source='PARQUET_TRANSFER')))
            (root / 'input').mkdir()
            (root / 'input' / 'manifest.json').write_text(json.dumps(dict(files=dict(
                documents=dict(rows=88200300), content_events=dict(rows=1600000000),
                doc_groups=dict(rows=92200600)))))
            session = Mock()
            session.rows.side_effect = lambda label, sql: (
                [dict(documents=88200363, events=1600000000)], label)
            with patch.object(run, 'canonical_fingerprint', return_value=dict(
                    canonical_content_sha256='x', canonical_generation='g')), \
                    patch.object(run.modern, 'Session', return_value=session):
                with self.assertRaisesRegex(ValueError, 'verified input'):
                    run.verify_store(root)


class RestoreReentry(unittest.TestCase):
    def test_completed_import_reverifies_and_skips_the_reimport(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'admission.json').write_text(json.dumps(
                dict(dau_store_source='PARQUET_TRANSFER', droplet_id=1,
                    dau_envelope=dict(container_bytes=100, server_bytes=80, api_bytes=32,
                        minio_bytes=1))))
            (root / 'restore.json').write_text(json.dumps(
                dict(project='web10-costfn-frozen-x', api_port=6098,
                    overlay=str(root / 'restore.overlay.json'))))
            (root / 'restore.overlay.json').write_text(json.dumps(self.overlay_value()))
            (root / 'input').mkdir()
            (root / 'input' / 'manifest.json').write_text(json.dumps(dict(files=dict(
                documents=dict(rows=run.BANKED_DOCUMENT_COUNT),
                content_events=dict(rows=run.BANKED_EVENT_COUNT),
                doc_groups=dict(rows=92200600)))))
            counts = [dict(documents=run.BANKED_DOCUMENT_COUNT,
                        events=run.BANKED_EVENT_COUNT)]
            with patch.object(run.arm_run, 'operation'), \
                    patch.object(run.restore, 'restore') as banked, \
                    patch.object(run.restore, 'command'), \
                    patch.object(run.modern, 'Session'), \
                    patch.object(run, 'store_counts', return_value=counts), \
                    patch.object(run, 'verify_envelope',
                                 return_value=dict(engine='26.10.4.207', container_bytes=100,
                                     server_bytes=80)), \
                    patch('restore_dataset.wait_for'):
                value = run.restore_parquet(root, json.loads((root / 'admission.json').read_text()))
            banked.assert_not_called()
            self.assertEqual(value['restore_source'],
                'ARCHIVED_PARQUET_TRANSFERRED_FROM_SNAPSHOT_HOST')
            self.assertTrue((root / 'dau-restore.json').exists())
            modern = json.loads((root / 'modern-restore.json').read_text())
            self.assertIsNone(modern['fixture'])
            self.assertEqual(modern['restore_source'], 'PARQUET_VERIFIED_INPUT')

    def test_partial_restore_states_refuse(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'admission.json').write_text(json.dumps(
                dict(dau_store_source='PARQUET_TRANSFER', droplet_id=1,
                    dau_envelope=dict(container_bytes=100, server_bytes=80, api_bytes=32,
                        minio_bytes=1))))
            approval = json.loads((root / 'admission.json').read_text())
            with patch.object(run.arm_run, 'operation'), \
                    patch.object(run.restore, 'restore') as banked:
                (root / 'restore.overlay.json').write_text(json.dumps('overlay'))
                with self.assertRaisesRegex(FileExistsError, 'no partial adoption'):
                    run.restore_parquet(root, approval)
                (root / 'restore.overlay.json').unlink()
                (root / 'restore.json').write_text(json.dumps(dict(project='x', api_port=1,
                    overlay='o')))
                with self.assertRaisesRegex(ValueError, 'no partial adoption'):
                    run.restore_parquet(root, approval)
            banked.assert_not_called()

    @staticmethod
    def overlay_value():
        return dict(services={
            'clickhouse': dict(image='ghcr.io/x/base-clickhouse:26.10.4.207',
                environment={'CLICKHOUSE_DO_NOT_CHOWN': '1'},
                volumes=[{'type': 'bind', 'source': '/opt/fanout/input',
                    'target': '/var/lib/clickhouse/user_files/input', 'read_only': True}]),
            'api': dict(mem_limit='2g'), 'minio': dict(mem_limit='512m')})


class EnvelopeOverlay(unittest.TestCase):
    @staticmethod
    def overlay_value():
        return dict(services={
            'clickhouse': dict(image='ghcr.io/x/base-clickhouse:26.10.4.207',
                environment={'CLICKHOUSE_DO_NOT_CHOWN': '1'},
                volumes=[{'type': 'bind', 'source': '/opt/fanout/input',
                    'target': '/var/lib/clickhouse/user_files/input', 'read_only': True}]),
            'api': dict(mem_limit='2g'), 'minio': dict(mem_limit='512m')})

    def test_envelope_rewrites_caps_and_preserves_the_input_bind(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'restore.overlay.json').write_text(json.dumps(self.overlay_value()))
            approval = dict(dau_envelope=dict(container_bytes=107374182400,
                server_bytes=85899345920, api_bytes=34359738368, minio_bytes=1073741824))
            got = run.apply_envelope_overlay(root, approval)
            clickhouse = got['services']['clickhouse']
            self.assertEqual(clickhouse['mem_limit'], '107374182400')
            self.assertEqual(clickhouse['volumes'][0], 'clickhouse-data:/var/lib/clickhouse')
            self.assertEqual(clickhouse['volumes'][2],
                {'type': 'bind', 'source': '/opt/fanout/input',
                 'target': '/var/lib/clickhouse/user_files/input', 'read_only': True})
            self.assertIn('dau-memory.xml', clickhouse['volumes'][3])
            self.assertEqual(got['services']['api']['mem_limit'], '34359738368')
            self.assertEqual(got['services']['minio']['mem_limit'], '1073741824')

    def test_overlay_bind_and_native_cap_follow_small_host_admission(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'restore.overlay.json').write_text(json.dumps(self.overlay_value()))
            got = run.apply_envelope_overlay(root, approval())
            memory_path = root.resolve() / 'dau-memory.xml'
            self.assertEqual(got['services']['clickhouse']['volumes'][3],
                f'{memory_path}:/etc/clickhouse-server/config.d/costfn-memory.xml:ro')
            self.assertIn('<max_server_memory_usage>23622320128</max_server_memory_usage>',
                memory_path.read_text())

    def test_missing_overlay_or_input_bind_refuses(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'restore overlay required'):
                run.apply_envelope_overlay(Path(directory), dict(dau_envelope=dict(
                    container_bytes=1, server_bytes=1, api_bytes=1, minio_bytes=1)))
            broken = self.overlay_value()
            broken['services']['clickhouse']['volumes'] = []
            (Path(directory) / 'restore.overlay.json').write_text(json.dumps(broken))
            with self.assertRaisesRegex(ValueError, 'input bind missing'):
                run.apply_envelope_overlay(Path(directory), dict(dau_envelope=dict(
                    container_bytes=1, server_bytes=1, api_bytes=1, minio_bytes=1)))


class CanonicalFingerprint(unittest.TestCase):
    def test_generation_change_mid_fingerprint_refuses(self):
        class CountsModule:
            results = ('gen-one', 'gen-two')
            i = 0

            @classmethod
            def generation(cls, session):
                value = cls.results[cls.i]
                cls.i += 1
                return value, None

        session = Mock()
        session.rows.side_effect = lambda label, sql: (
            [{'table': 'documents', 'path': '/p'}], label)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'restore.json').write_text(json.dumps(dict(
                project='web10-costfn-frozen-x', api_port=6098,
                overlay=str(root / 'overlay.json'))))
            with patch.object(run.restore, 'command', side_effect=[
                    b'clickhouse-container\n',
                    json.dumps([dict(Mounts=[dict(Destination='/var/lib/clickhouse',
                        Source=str(directory))])]).encode()]), \
                    patch.object(run, 'certificates') as certs, \
                    patch.dict(sys.modules, {'arm_satellite_counts': CountsModule}):
                certs.content_files.return_value = []
                with self.assertRaisesRegex(ValueError, 'changed during'):
                    run.canonical_fingerprint(session)


class Gates(unittest.TestCase):
    @staticmethod
    def receipt(**overrides):
        debt = [dict(i=i, phase='A',
            values={name: (5.0 if name == 'parts:documents' else 0.0)
                for name, _ in wl.DEBT_QUANTITIES}, in_flight=0) for i in range(4)]
        value = dict(windows={'A': wl.receipt_window('A', wl.offered_achieved(), {'A': debt},
            median_single_read_ms=100.0)},
            debt_by_phase={'A': debt},
            drain=dict(in_flight_zero_within_bound=True, bound_s=0.3, in_flight_peak=10),
            divergences=0,
            resource_stops=[],
            error_counts=dict(memory_cap_refusal=0, timeout=0, error_429=0, error_5xx=0,
                error_4xx=0, other=0, divergence=0))
        value.update(overrides)
        return value

    def test_clean_peak_is_a_strong_sentence(self):
        gates = run.evaluate_gates(self.receipt(), dict(server_bytes=100))
        self.assertEqual(gates['G1_debt_slope']['outcome'], 'CLEAN_PASS')
        self.assertEqual(gates['G2_drain']['outcome'], 'PASS')
        self.assertEqual(gates['G4_errors']['outcome'], 'PASS')
        self.assertEqual(gates['G5_envelope']['outcome'], 'PASS')

    def test_sustained_positive_engine_memory_is_named_debt_with_time_to_bind(self):
        debt = [dict(i=i, phase='A',
            values={name: (float(i * 10) if name == 'engine_memory:bytes' else 0.0)
                for name, _ in wl.DEBT_QUANTITIES}, in_flight=0) for i in range(4)]
        gates = run.evaluate_gates(self.receipt(windows={'A': wl.receipt_window('A',
            wl.offered_achieved(), {'A': debt}, median_single_read_ms=100.0)},
            debt_by_phase={'A': debt}), dict(server_bytes=1000))
        self.assertEqual(gates['G1_debt_slope']['outcome'], 'NAMED_DEBT')
        self.assertIn('engine_memory:bytes', gates['G1_debt_slope']['named_debt'])
        self.assertGreater(gates['G1_debt_slope']['named_debt']['engine_memory:bytes'], 0)

    def test_drain_failure_or_content_errors_fail(self):
        gates = run.evaluate_gates(self.receipt(
            drain=dict(in_flight_zero_within_bound=False, bound_s=0.3, in_flight_peak=10)),
            dict(server_bytes=100))
        self.assertEqual(gates['G2_drain']['outcome'], 'FAIL')
        gates = run.evaluate_gates(self.receipt(error_counts=dict(memory_cap_refusal=0,
            timeout=0, error_429=2, error_5xx=1, error_4xx=0, other=0, divergence=0)),
            dict(server_bytes=100))
        self.assertEqual(gates['G4_errors']['outcome'], 'FAIL')
        self.assertEqual(gates['G4_errors']['counts']['error_429'], 2)


class ReaderPool(unittest.TestCase):
    def test_shared_span_and_readability_are_verified_per_reader(self):
        banked = dict(groups=['c1/followers', 'c2/followers'],
            actual_readable_by_kind=dict(main=dict(posts=['c1/followers']),
                reactions=dict(posts=['c1/followers']),
                comments=dict(posts=['c1/followers'])))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'input').mkdir()
            (root / 'input' / 'manifest.json').write_text(json.dumps(
                dict(readers=['r0', 'r1'] + [f'pool-{i}' for i in range(wl.READERS)])))
            (root / 'profile-ordinary.json').write_text(json.dumps(banked))

            async def scopes(d, session, *, reader_override=None):
                if reader_override == 'pool-7':
                    return dict(groups=['c1/followers', 'other/followers'],
                        actual_readable_by_kind=banked['actual_readable_by_kind'])
                (d / 'profile').mkdir(parents=True, exist_ok=True)
                (d / 'profile' / 'inventory.json').write_text(json.dumps(dict(reader=reader_override)))
                return dict(groups=banked['groups'],
                    actual_readable_by_kind=banked['actual_readable_by_kind'])

            with patch.object(run.arm_run, 'setup_scopes', side_effect=scopes):
                with self.assertRaisesRegex(ValueError, 'shared span'):
                    run.reader_pool(root, Mock())
            self.assertFalse((root / 'dau-reader-pool.json').exists())

            async def scopes_ok(d, session, *, reader_override=None):
                (d / 'profile').mkdir(parents=True, exist_ok=True)
                (d / 'profile' / 'inventory.json').write_text(json.dumps(dict(reader=reader_override)))
                return dict(groups=banked['groups'],
                    actual_readable_by_kind=banked['actual_readable_by_kind'])

            with patch.object(run.arm_run, 'setup_scopes', side_effect=scopes_ok):
                pool = run.reader_pool(root, Mock())
            self.assertEqual(pool['readers_count'], wl.READERS)
            self.assertEqual(pool['shared_span'], banked['groups'])


class DiverseReaderPreflight(unittest.TestCase):
    @staticmethod
    def rows(n):
        return [dict(reader=f'reader-{i:03d}', groups=[f'p/groups/users/followed-{i:03d}/followers',
            f'p/groups/users/reader-{i:03d}/followers'], nonself_with_posts=1) for i in range(n)]

    def test_selection_is_ordered_distinct_and_refuses_without_relaxing_threshold(self):
        self.assertEqual(readers.selection(self.rows(149)), [])
        selection = readers.selection(self.rows(152))
        self.assertEqual(len(selection), 150)
        self.assertEqual(selection[149]['reader'], 'reader-149')
        self.assertNotEqual(selection[0]['groups'], selection[1]['groups'])
        with self.assertRaisesRegex(ValueError, 'distinct principals'):
            readers.selection(self.rows(149) + self.rows(1))
        with self.assertRaisesRegex(ValueError, 'invalid reader census'):
            readers.selection([dict(self.rows(1)[0], nonself_with_posts=0)])

    def test_census_query_is_read_only_and_uses_current_authority_and_post_heads(self):
        query = readers.census_sql('https://social.test', 'api.test')
        self.assertEqual(len(sqlglot.parse(query, read='clickhouse')), 1)
        self.assertEqual(sqlglot.parse_one(query, read='clickhouse').key, 'select')
        for seam in ('FROM users', 'FROM app_contracts', 'FROM group_members', 'FROM doc_groups',
                     'FROM documents', '(updated_at,deleted)', 'HAVING nonself_with_posts>=1',
                     "group_id != concat(", ",member_key,'/followers')"):
            self.assertIn(seam, query)

    def test_banks_native_census_and_reuses_exact_selection_without_requerying(self):
        for count, outcome in ((149, readers.REFUSED), (151, 'SELECTED')):
            with self.subTest(count=count), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / 'input').mkdir()
                manifest = root / 'input/manifest.json'
                run.save(manifest, dict(origin='https://social.test', provider='api.test', dataset_id='dataset'))
                session = Mock()
                query_id = 'fanout-f-reader-census'
                session.rows.return_value = self.rows(count), query_id
                session.native.return_value = dict(query_id=query_id, type='QueryFinish', exception_code=0)
                frozen = readers.freeze(root, session)
                self.assertEqual(frozen['qualifying_count'], count)
                self.assertEqual(frozen['outcome'], outcome)
                self.assertEqual(frozen['readers_count'], 150 if count >= 150 else 0)
                self.assertEqual(frozen['census_sha256'], costfn_task.digest(root / 'dau-diverse-reader-census.json'))
                self.assertEqual(readers.freeze(root, session), frozen)
                session.rows.assert_called_once()
                session.native.assert_called_once_with(query_id)
                run.save(manifest, dict(origin='https://social.test', provider='api.test', dataset_id='different'))
                with self.assertRaisesRegex(ValueError, 'does not match'):
                    readers.freeze(root, session)

    def test_host_amendment_refuses_c16_and_engine_memory_inflation(self):
        value = approval(dau_reader_criterion=readers.CRITERION)
        with self.assertRaisesRegex(ValueError, 'requires c-32'):
            run.diverse_host_admission(value)
        value['dau_host'].update(size='c-32', expected_guest_logical_cpus=32)
        value['dau_envelope'].update(container_bytes=28 * 1024**3, server_bytes=22 * 1024**3)
        run.diverse_host_admission(value)
        value['dau_envelope']['server_bytes'] += 1
        with self.assertRaisesRegex(ValueError, '28/22 GiB'):
            run.diverse_host_admission(value)

    def test_overnight_backstop_is_exact_and_amended_only(self):
        value = approval(dau_overnight=True, dau_reader_criterion=readers.CRITERION)
        value['dau_host'].update(size='c-32', expected_guest_logical_cpus=32)
        value['dau_envelope'].update(container_bytes=28 * 1024**3, server_bytes=22 * 1024**3)
        with patch.object(run.full_store, 'source_guard'):
            with self.assertRaisesRegex(ValueError, 'host class'):
                run.admission_gate(value)
            value['dau_host']['backstop_h'] = 24
            run.admission_gate(value)
            del value['dau_reader_criterion']
            with self.assertRaisesRegex(ValueError, 'requires the amended'):
                run.admission_gate(value)

    def test_legacy_serial_shared_oracle_cannot_start_a_measurement(self):
        with self.assertRaisesRegex(ValueError, 'sustained windows blocked'):
            run.run('/does/not/exist')


class DiverseDispatch(unittest.IsolatedAsyncioTestCase):
    async def test_http_workload_uses_each_reader_token_and_banks_only_private_response(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            http = Mock(capture=reference.core_feed.wire())
            http.sequence = AsyncMock(return_value=dict(phase='A', path_mode='F_DOCUMENT_STREAM_V1', rows=[1]))
            http.post = AsyncMock(return_value=(dict(author_key='writer', doc_id='doc', groups=['self', 'discover']),
                dict(request_id='write1')))
            workload = timed.HTTPWorkload(http, output, run_id='00000000-0000-0000-0000-000000000001',
                reader_tokens={'reader': 'private-token'}, writers=[dict(reader='writer', groups=['self', 'discover'])],
                writer_tokens={'writer': 'private-writer-token'})
            await workload.read(dict(reader_index=1, slot=4, phase='A'), dict(reader='reader', index=1, groups=['following']))
            await workload.write(dict(writer_index=0, slot=0))
            http.sequence.assert_awaited_once_with('private-token', ['following'], phase='A')
            self.assertEqual(http.post.call_args.args[0], '/v3/create')
            self.assertEqual(http.post.call_args.kwargs.keys(), {'operation'})
            for path in output.glob('*/*.json'):
                self.assertNotIn('token', path.read_text())
            http.sequence.return_value['path_mode'] = 'canonical_fallback'
            with self.assertRaisesRegex(ValueError, 'declared indexed path'):
                await workload.read(dict(reader_index=1, slot=5, phase='A'),
                    dict(reader='reader', index=1, groups=['following']))

    async def test_slow_reads_do_not_reduce_offers_and_drain_does_not_cancel(self):
        saved, release = [], asyncio.Event()
        dispatch = Dispatch(limit=2, record=saved.append)

        async def slow(entry):
            await release.wait()

        start = asyncio.get_running_loop().time()
        entries = [dict(slot=i, offset_s=i * 0.01, reader_index=i) for i in range(3)]
        await dispatch.offer(entries, origin=start, end=start + 0.1, operation=slow, classify=None)
        self.assertEqual(dispatch.peak, 2)
        self.assertEqual(dispatch.counts, dict(scheduled=3, offered=3, started=2, backpressured=1))
        self.assertFalse(await dispatch.drain(0))
        self.assertEqual(saved[0]['error_class'], 'backpressure')
        self.assertIsNone(saved[0]['started_s'])
        release.set()
        self.assertTrue(await dispatch.drain(1))
        self.assertEqual(dispatch.counts['completed'], 2)

    async def test_terminal_error_stops_future_offers_without_marking_success(self):
        saved = []
        dispatch = Dispatch(limit=2, record=saved.append)

        async def error(entry):
            raise ValueError('private content must not appear in the record')

        start = asyncio.get_running_loop().time()
        await dispatch.offer([dict(slot=0, offset_s=0), dict(slot=1, offset_s=0.1)],
            origin=start, end=start + 1, operation=error, classify=lambda exc: ('parity', True))
        self.assertEqual(dispatch.counts['offered'], 1)
        self.assertEqual(dispatch.counts['completed'], 0)
        self.assertEqual(saved[0]['error_class'], 'parity')
        self.assertNotIn('private', json.dumps(saved))

    async def test_workload_carries_reads_across_phases_while_writer_runs(self):
        read_records, writer_records, samples, actors = [], [], [], []
        release = asyncio.Event()
        abort = asyncio.Event()

        async def read(entry, actor):
            actors.append((entry['phase'], actor['reader']))
            await release.wait()

        async def write(entry):
            self.assertEqual(entry['writer_index'], 0)

        async def observe(phase, dispatch, origin, stop):
            samples.append((phase, len(dispatch.pending)))
            if phase == 'D':
                release.set()
            await stop.wait()

        phases = [dict(name=name, rate=20.0, duration_s=0.1) for name in ('W', 'A', 'B')]
        result = await timed.workload(phases=phases,
            readers=[dict(index=0, reader='reader-0'), dict(index=1, reader='reader-1')],
            writer_count=1, read=read, write=write, observe=observe, record_read=read_records.append,
            record_write=writer_records.append, classify=lambda exc: ('error', True), drain_bound=0.4,
            max_reads=10, max_writes=2, abort=abort)
        self.assertEqual(actors, [(phase, reader) for phase in ('W', 'A', 'B') for reader in ('reader-0', 'reader-1')])
        self.assertTrue(result['drain_ok'])
        self.assertEqual(result['reader_accounting']['completed'], 6)
        self.assertEqual(len(writer_records), 1)
        self.assertEqual(samples[-1], ('D', 6))


class DiverseParityAndMemory(unittest.TestCase):
    def test_oracles_are_bound_to_schedule_and_never_sort_outputs(self):
        first = dict(rows=[1, 2], followups=[{'rows': [3, 4]}, {'rows': []}, {}])
        second = dict(rows=[2, 1], followups=[{'rows': [4, 3]}, {'rows': []}, {}])
        slots = {('A', 0): 0, ('A', 1): 1}
        oracles = {0: first, 1: second}
        records = [dict(phase='A', slot=0, reader_index=0, **first),
            dict(phase='A', slot=1, reader_index=1, **second)]
        self.assertEqual(parity.verify(records, slots, oracles)['verified_responses'], 2)
        for bad in ([dict(records[0], **second), records[1]],
                    [dict(records[0], followups=second['followups']), records[1]],
                    [dict(records[0], reader_index=1), records[1]], records[:1], records + records[:1]):
            with self.assertRaises(costfn_task.ParityDivergence):
                parity.verify(bad, slots, oracles)

    def test_only_reconciled_disjoint_publications_prove_an_invariant_page(self):
        commit = dict(actor='writer', doc_id='post', slot=0, reconciled=True,
            committed_groups=['writer/followers', 'discover'])
        writers = {'writer': commit['committed_groups']}
        self.assertEqual(parity.writer_ledger([commit], writers, {0: ['other/followers']}, {0}), {0})
        for records, scope in (([commit], ['discover']), ([], ['other/followers']),
                ([dict(commit, reconciled=False)], ['other/followers'])):
            with self.assertRaises(costfn_task.ParityDivergence):
                parity.writer_ledger(records, writers, {0: scope}, {0})

    def test_memory_partitions_host_without_counting_cgroup_cache_twice(self):
        host = memory.meminfo('MemTotal: 65536 kB\nMemFree: 10240 kB\nMemAvailable: 32768 kB\n'
            'Buffers: 1024 kB\nCached: 20480 kB\nShmem: 1024 kB\nSReclaimable: 768 kB\n')
        engine = memory.memory_stat('anon 31457280\nfile 12582912\n')
        api = memory.memory_stat('anon 1048576\nfile 1048576\n')
        receipt = memory.account(host, engine, api, engine_current=44_000_000,
            api_current=2_200_000, api_rss=1_100_000, engine_cap=28 * 1024**3, server_cap=22 * 1024**3)
        self.assertTrue(receipt['host']['partition_consistent'])
        self.assertEqual(receipt['host']['page_cache_and_buffers_bytes'], 20480 * 1024)
        self.assertEqual(receipt['host']['occupied_bytes'], receipt['host']['page_cache_and_buffers_bytes']
            + receipt['host']['os_other_and_unattributed_bytes'] + engine['anon'] + api['anon'])

    def test_memory_sample_reads_live_cgroup_equivalent_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            proc, cgroups = root / 'proc', root / 'cgroups'
            proc.mkdir()
            (proc / 'meminfo').write_text('MemTotal: 65536 kB\nMemFree: 10240 kB\n'
                'MemAvailable: 32768 kB\nBuffers: 1024 kB\nCached: 20480 kB\nShmem: 1024 kB\n')
            for pid, name in ((1, 'engine'), (2, 'api')):
                group = cgroups / name
                group.mkdir(parents=True)
                (group / 'memory.stat').write_text('anon 1000\nfile 2000\n')
                (group / 'memory.current').write_text('3000\n')
                (group / 'cgroup.procs').write_text(f'{pid}\n')
                (proc / str(pid)).mkdir()
                (proc / str(pid) / 'cgroup').write_text(f'0::/{name}\n')
                (proc / str(pid) / 'status').write_text('VmRSS: 2 kB\n')
            cap = 28 * 1024**3
            (cgroups / 'engine/memory.max').write_text(str(cap))
            sample = memory.sample(1, 2, engine_cap=cap, server_cap=22 * 1024**3, proc=proc, cgroups=cgroups)
            self.assertEqual(sample['engine']['cgroup_current_bytes'], 3000)
            self.assertEqual(sample['api']['process_rss_bytes'], 2048)
            with self.assertRaisesRegex(ValueError, 'cap differs'):
                memory.sample(1, 2, engine_cap=cap - 1, server_cap=22 * 1024**3, proc=proc, cgroups=cgroups)


class DiverseReference(unittest.TestCase):
    def test_ordering_does_not_touch_main_or_view_request_and_keeps_id_binding(self):
        capture = reference.core_feed.wire()
        ordered = reference.ordered_capture(capture)
        self.assertEqual(capture['requests'][0], ordered['requests'][0])
        self.assertEqual(capture['requests'][3], ordered['requests'][3])
        identifier = '00000000-0000-0000-0000-000000000001'
        for item, column in zip(ordered['requests'][1:3], ('ref_value', 'post_id'), strict=True):
            payload = reference.core_feed.payload(item['payload'], '', ['a'], [identifier])
            self.assertIn("'" + identifier + "'", payload['sql'])
            order = sqlglot.parse_one(payload['sql'], read='clickhouse').args['order']
            self.assertEqual([item.this.name for item in order.expressions], [column])

    def test_banked_pins_only_affect_exact_full_keys(self):
        rows = [dict(author_key='other', doc_id='same'), dict(author_key='original', doc_id='same')]
        creative = dict(author_key='advertiser', doc_id='creative')
        ledger = dict(posts=[dict(post=['original', 'same'], placement='node', ad=creative)])
        self.assertEqual(reference.apply_billboards(rows, ledger), [rows[0], dict(rows[1], node_ad=creative)])
        with self.assertRaisesRegex(ValueError, 'serving-produced ads'):
            reference.apply_billboards([dict(rows[0], ad=creative)], ledger)


class DiverseNativeAudit(unittest.TestCase):
    def test_publication_audit_separates_only_the_verified_bootstrap_intent(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'intents.sqlite'
            with sqlite3.connect(path) as source:
                source.execute('CREATE TABLE intents (sequence,operation_id,actor_key,operation,state,result_json)')
                source.execute('INSERT INTO intents VALUES (?,?,?,?,?,?)',
                    (1, 'canonical-bootstrap', '__derived_setup__', 'bootstrap', 'complete', '{}'))
            boundary = native_audit.bootstrap_sequence(path)
            self.assertEqual(boundary, 1)
            self.assertEqual(native_audit.committed_publications(path, boundary, []), [])
            with sqlite3.connect(path) as source:
                source.execute('INSERT INTO intents VALUES (?,?,?,?,?,?)',
                    (2, 'unaudited', 'writer', 'publish', 'pending', None))
            with self.assertRaisesRegex(ValueError, 'single completed bootstrap'):
                native_audit.bootstrap_sequence(path)
            with self.assertRaisesRegex(ValueError, 'unresolved'):
                native_audit.committed_publications(path, boundary, [])

    def test_native_intents_and_attachment_heads_reconcile_to_issued_write(self):
        operation = '00000000-0000-0000-0000-000000000001'
        groups = ['discover', 'writer/followers']
        issued = [dict(operation_id=operation, actor='writer', doc_id='d1', slot=0, request_id='request')]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'intents.sqlite'
            with sqlite3.connect(path) as source:
                source.execute('CREATE TABLE intents (sequence,operation_id,actor_key,operation,state,result_json)')
                source.execute('INSERT INTO intents VALUES (?,?,?,?,?,?)', (1, operation + ':publish',
                    'writer', 'publish', 'complete', json.dumps(dict(author_key='writer', doc_id='d1', groups=groups))))
            session = Mock()
            session.rows.return_value = [dict(author_key='writer', doc_id='d1', collection_name='posts', groups=groups)], 'native'
            session.native.return_value = dict(query_id='native', type='QueryFinish', exception_code=0)
            result = native_audit.reconcile_publications(session, path, 0, issued,
                {'writer': groups}, {0: ['reader/followers']})
            self.assertEqual(result['commits'][0]['journal_sequence'], 1)
            sql = session.rows.call_args.args[1]
            self.assertIn('LIMIT 1 BY author_key,doc_id', sql)
            self.assertIn('LIMIT 1 BY doc_id,group_id', sql)
            session.native.assert_called_once_with('native')
            with self.assertRaises(costfn_task.ParityDivergence):
                native_audit.reconcile_publications(session, path, 0, issued,
                    {'writer': groups}, {0: ['discover']})
            with sqlite3.connect(path) as source:
                source.execute("UPDATE intents SET state='reconciling' WHERE sequence=1")
            with self.assertRaisesRegex(ValueError, 'unresolved'):
                native_audit.committed_publications(path, 0, issued)

    def test_view_bookends_prove_stability_only_without_writes_or_ttl_loss(self):
        old = {'rows': {'0': [dict(doc_id='d', impressions=7, reach=3, first_expiry_utc='2026-11-28 00:00:00')]}}
        end = datetime(2026, 11, 27, tzinfo=UTC)
        self.assertEqual(native_audit.settled_views(old, old, end, append_only_verified=True),
            {0: {'d': dict(impressions=7, reach=3)}})
        with self.assertRaisesRegex(ValueError, 'invariant'):
            native_audit.settled_views(old, {'rows': {}}, end, append_only_verified=True)
        with self.assertRaisesRegex(ValueError, 'invariant'):
            native_audit.settled_views(old, old, end, append_only_verified=False)
        with self.assertRaisesRegex(ValueError, 'expire'):
            native_audit.settled_views(old, old, end.replace(day=28), append_only_verified=True)
        sql = native_audit.raw_views_sql(['doc'], ['group'])
        self.assertIn('FROM content_events WHERE', sql)
        self.assertNotIn('content_events_aggregated', sql)

    def test_reader_tallies_bind_the_actual_groups_for_each_route(self):
        profile = dict(actual_readable_by_kind=dict(main=dict(posts=['following'], comments=['following'],
            reactions=['following']), comments=dict(comments=['discover']), reactions=dict(reactions=['discover'])))
        self.assertEqual(set((label, service, tuple(groups)) for label, service, groups in scope_proof.expected_scopes(profile)),
            {('main', 'posts', ('following',)), ('main', 'comments', ('following',)), ('main', 'reactions', ('following',)),
             ('comments', 'comments', ('discover',)), ('reactions', 'reactions', ('discover',))})

    def test_route_refuses_uncertified_principal_scope_and_page_target(self):
        binding = dict(canonical_generation='generation', copy_hash='copy')
        readable = {'comments': ['discover']}
        key = scope_proof.sql.scope('reader', 'comments', ['discover'], 'generation', 'copy')
        proof = dict(binding=binding, routes={'reader': dict(readable_by_kind={'comments': readable},
            routes={'comments': {'comments': dict(key=key, groups=['discover'], verified_ids=['target'])}})})
        self.assertEqual(scope_proof.checked_route(proof, 'reader', 'comments', readable, ['target']), {'comments': key})
        for actor, groups, ids in (('another', readable, ['target']), ('reader', readable, ['unexpected']),
                ('reader', {'comments': ['other']}, ['target'])):
            with self.assertRaises(ValueError):
                scope_proof.checked_route(proof, actor, 'comments', groups, ids)


class DiverseCellPolicy(unittest.TestCase):
    def test_batched_membership_counts_preserve_recipient_sets_and_required_readers(self):
        groups = ['a', 'b']
        expected = {'a': {'reader'}, 'b': {'other'}}
        rows = [dict(group_id='a', member_key='reader'), dict(group_id='a', member_key='also'),
            dict(group_id='b', member_key='other')]
        self.assertEqual(arm_f_native.verified_group_counts(groups, expected, rows), {'a': 2, 'b': 1})
        for malformed in (rows[:-1], rows + rows[:1], rows + [dict(group_id='outside', member_key='reader')]):
            with self.assertRaises(ValueError):
                arm_f_native.verified_group_counts(groups, expected, malformed)
        sql = arm_f_native.batch_members_sql(groups)
        self.assertIn('PARTITION BY group_id,member_key ORDER BY updated_at DESC,deleted DESC', sql)
        self.assertIn("WHERE rn=1 AND deleted=0 AND member_key NOT IN ('anyone','authenticated','anon')", sql)
        self.assertNotIn('LIMIT', sql)

    def test_fanout_classification_checks_each_reader_only_on_their_groups(self):
        profile = dict(reader='ordinary', groups=['a', 'b'], dau_group_readers={'a': ['ordinary'], 'b': ['selected']})
        admitted = dict(purpose='DAU_SUSTAINED_CONTRACT_RATE', dau_overnight=True)
        self.assertEqual(arm_f_native.membership_requirements(admitted, profile),
            {'a': {'ordinary'}, 'b': {'selected'}})
        with self.assertRaisesRegex(ValueError, 'only apply'):
            arm_f_native.membership_requirements({}, profile)
        with self.assertRaisesRegex(ValueError, 'exact frozen reader coverage'):
            arm_f_native.membership_requirements(admitted, dict(profile, dau_group_readers={'a': ['ordinary']}))
        self.assertEqual(arm_f_native.membership_requirements({}, dict(reader='ordinary', groups=['a', 'b'])),
            {'a': {'ordinary'}, 'b': {'ordinary'}})

    def test_writer_slot_keeps_native_journal_key_and_forbids_scope_drift(self):
        run_id = uuid.UUID('00000000-0000-0000-0000-000000000001')
        operation = str(uuid.uuid5(run_id, 'publication:9'))
        groups = ['writer/followers', 'discover']
        expected = {'writer': set(groups)}
        payload = dict(service='posts', groups=groups, body=dict(text='dau sustain 9', status='active'))
        self.assertEqual(cell_policy.publication(str(run_id), 'writer', expected, payload, operation,
            has_origin=False, delegated=False), str(uuid.uuid5(uuid.NAMESPACE_URL, 'writer:' + operation + ':publish')))
        for actor, value, identity, origin, delegated in (
                ('other', payload, operation, False, False),
                ('writer', dict(payload, author_as='discover'), operation, False, False),
                ('writer', dict(payload, groups=['following', 'discover']), operation, False, False),
                ('writer', dict(payload, groups=['discover', 'discover']), operation, False, False),
                ('writer', dict(payload, body=dict(text='dau sustain 09', status='active')), operation, False, False),
                ('writer', payload, str(run_id), False, False),
                ('writer', payload, operation, True, False), ('writer', payload, operation, False, True)):
            with self.assertRaises(ValueError):
                cell_policy.publication(str(run_id), actor, expected, value, identity, has_origin=origin, delegated=delegated)

    def test_boot_bundle_requires_every_reader_and_disjoint_existing_writer_groups(self):
        approved = approval(dau_overnight=True, dau_reader_criterion=readers.CRITERION, composition_admitted=True)
        provider = 'example.test'
        discover = provider + '/groups/web10/discover'
        writers = dict(provider=provider, discover=discover, actors=[dict(reader=f'writer-{i}',
            groups=[provider + f'/groups/users/writer-{i}/followers', discover]) for i in range(wl.WRITER_ACTORS)])
        proof = dict(routes={f'reader-{i}': dict(index=i, groups=[f'following-{i}']) for i in range(wl.READERS)})
        self.assertEqual(len(cell_policy.validate(approved, proof, writers)), wl.WRITER_ACTORS)
        proof['routes']['reader-0']['groups'].append(writers['actors'][0]['groups'][0])
        with self.assertRaisesRegex(ValueError, 'outside Following'):
            cell_policy.validate(approved, proof, writers)


class DiverseLiveReceipt(unittest.TestCase):
    def test_live_successor_uses_repair_source_only_after_same_host_prepare(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            approved = approval()
            run.save(root / 'admission.json', approved)
            predecessor = costfn_task.Task(root, approved, approved['hybrid_k20_source_commit'])
            keys = {'retained-fixture-import', 'steady-state', 'furniture', *('gate:' + name for name in run.contract.GATES)}
            prep = root / 'costfn-task-indexed-prep.json'
            run.save(prep, dict(identity=predecessor.identity, status='NEEDS_REPAIR', steps={name: {} for name in keys}))
            with self.assertRaisesRegex(ValueError, 'completed exact same-task'):
                run.measurement_task(root, approved, 'f' * 40)
            run.save(prep, dict(run.read(prep), status='COMPLETE'))
            run.save(root / 'composition-proof.json', {'proof': 1})
            run.save(root / 'dau-diverse-reader-selection.json', {'readers': 150})
            task = run.measurement_task(root, approved, 'f' * 40)
            self.assertEqual(task.path.name, 'costfn-task-diverse.json')
            self.assertEqual(task.identity['source_start'], approved['hybrid_k20_source_commit'])
            self.assertEqual(task.initial_source, 'f' * 40)
            run.save(root / 'composition-proof.json', {'proof': 2})
            with self.assertRaisesRegex(ValueError, 'basis changed'):
                run.measurement_task(root, approved, 'f' * 40)

    def test_achieved_rate_excludes_responses_finishing_after_the_window(self):
        phase = dict(name='A', rate=3, duration_s=1)
        records = [dict(phase='A', offered_s=0, started_s=0.01, finished_s=0.9, error_class=None),
            dict(phase='A', offered_s=0.4, started_s=0.41, finished_s=1.1, error_class=None),
            dict(phase='A', offered_s=0.8, started_s=None, finished_s=0.8, error_class='backpressure')]
        report = live.phase_reconciliation(records, [phase])['A']
        self.assertEqual([report[key] for key in ('offered', 'started', 'completed', 'completed_in_window')], [3, 2, 2, 1])
        self.assertEqual(report['achieved_rps'], 1)

    def test_disk_space_decline_counts_as_debt_and_io_is_attributable(self):
        data = [dict(phase='A', elapsed_s=10 * i, debt=dict(values={'disk_free:bytes': 100-i*10},
            io=dict(device='dev', read_bytes=i*512, write_bytes=i*1024))) for i in range(4)]
        report = live.debt_summary(data)['A']
        self.assertEqual(report['slope_per_second']['disk_free:bytes'], -1)
        self.assertTrue(report['sustained_debt']['disk_free:bytes'])
        self.assertEqual(report['written_bytes'], 3072)
        data[-1]['debt']['io']['device'] = 'other'
        with self.assertRaisesRegex(ValueError, 'device changed'):
            live.debt_summary(data)


class RetainedFixtureTransfer(unittest.TestCase):
    def test_only_retained_fixture_namespace_and_original_consent_origin_are_exported(self):
        result = transfer.source_queries(dict(groups=['first', 'second', 'large'], sizes=[3, 3, 2000],
            collision_authors=['writer', 'other'], writer='writer'))
        self.assertEqual(set(result), set(transfer.SCHEMAS))
        self.assertIn('FROM doc_groups WHERE group_id IN', result['documents'])
        self.assertIn(transfer.q('https://fanout.research.invalid'), result['app_contracts'])
        self.assertNotIn(transfer.q('https://costfn.research.invalid'), result['app_contracts'])
        with self.assertRaisesRegex(ValueError, 'route shape'):
            transfer.source_queries(dict(groups=['first', 'first', 'large'], sizes=[3, 3, 2000]))

    def test_manifest_refuses_a_modified_retained_authority_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture = root / 'fixture.json'
            fixture.write_bytes(b'{}')
            entries = {}
            for table, rows in dict(documents=63, doc_groups=93, group_contracts=3, group_members=2006, app_contracts=2).items():
                path = root / (table + '.parquet')
                path.write_bytes(b'PAR1dataPAR1')
                entries[table] = dict(rows=rows, bytes=path.stat().st_size, sha256=run.digest(path))
            with patch.object(transfer, 'FIXTURE_SHA', run.digest(fixture)):
                manifest = dict(snapshot_id=transfer.SNAPSHOT, source_restore_sha256=transfer.RESTORE_SHA,
                    fixture_sha256=transfer.FIXTURE_SHA, input_manifest_sha256='input', files=entries)
                run.save(root / 'manifest.json', manifest)
                self.assertEqual(transfer.validate_directory(root, 'input'), manifest)
                (root / 'group_members.parquet').write_bytes(b'PAR1fakePAR1')
                with self.assertRaisesRegex(ValueError, 'group_members'):
                    transfer.validate_directory(root, 'input')

    def test_owned_guest_timer_and_c32_are_required_for_binding(self):
        name = 'web10-fanout-f-0123456789ab'
        lease = dict(dau_overnight=True, name=name, tag=name, configuration='F', size='c-32', region='nyc1',
            account_uuid='account', max_usd=25, hourly_usd=1, snapshot_id='255003176', restored_snapshot_id='255003176',
            droplet_id=100, created_epoch=1000, deadline=87400, costfn_task_id='dau-test', costfn_run_rules=window.TASK_RULES)
        guest = dict(droplet_id=100, logical_cpus=32, memory_bytes=64 * 1024**3, timer_active=True, timer_deadline_epoch=87400)
        result = binding.bind(lease, guest, 'b' * 40)
        self.assertEqual(result['budget_usd'], 25)
        self.assertTrue(result['host_self_kill_verified'])
        with self.assertRaisesRegex(ValueError, 'armed deadline'):
            binding.bind(lease, dict(guest, timer_deadline_epoch=87401), 'b' * 40)
        with self.assertRaisesRegex(ValueError, 'exact owned'):
            binding.bind(dict(lease, size='c-16'), guest, 'b' * 40)


if __name__ == '__main__':
    unittest.main()
