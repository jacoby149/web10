"""No-engine admission, discipline and gate controls for the DAU runner."""
import json
import unittest
from pathlib import Path
import tempfile
from unittest.mock import Mock, patch

import costfn_task
import dau_sustain_run as run
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
        dau_host=dict(region='nyc2', size='g-48vcpu-192gb-intel', price_hourly=2.6994,
            storage_gib=720, storage_class='NVMe', backstop_h=12, compute_ceiling_usd=25.0),
        dau_envelope=dict(container_bytes=107374182400, server_bytes=85899345920),
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
                    storage_gib=720, storage_class='HDD', backstop_h=12, compute_ceiling_usd=25.0)),
                dict(dau_host=dict(region='nyc2', size='g-48vcpu-192gb-intel', price_hourly=2.6994,
                    storage_gib=720, storage_class='NVMe', backstop_h=12, compute_ceiling_usd=50.0)),
                dict(dau_envelope=dict(container_bytes=10, server_bytes=20)),
                dict(restored_snapshot_id='999999999'),
                dict(hybrid_k20_projected_admitted=True)):
            with self.subTest(overrides=overrides):
                with patch.object(run, 'full_store') as store:
                    store.source_guard.return_value = 'c' * 40
                    with self.assertRaisesRegex(ValueError, 'required|declared|differs|refused|indexed'):
                        run.admission_gate(approval(**overrides))

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


if __name__ == '__main__':
    unittest.main()
