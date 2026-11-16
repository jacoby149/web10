"""Scoped continuation refusals/scheduling. Mocked I/O, never native PASS."""
from datetime import UTC, datetime, timedelta
import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import arm_f_banked as banked
import arm_f_cloud as cloud
import arm_f_gates as gates
import arm_f_infrastructure as infra
import arm_f_scoped as scoped
import arm_f_report as report


class BankedTests(unittest.TestCase):
    def archive(self, root, *, bad_builder=False):
        repository = Path(banked.__file__).resolve().parents[3]
        names = ['research/experiments/costfn/' + name for name in banked.BUILDERS]
        names += ['api/app/v3/services/safe_query.py']
        sources = {name: hashlib.sha256((repository / name).read_bytes()).hexdigest() for name in names}
        if bad_builder:
            sources[names[0]] = '0' * 64
        files = {name: {} for name in banked.NAMES}
        files.update({'source-manifest.json': sources, 'result.json': {'outcome': 'P_STEP0_COMPLETE', 'P_T2': 'PASS'},
            'serve-probe/config-p.json': {'T2': 'PASS'}, 'step0-stage-table.json': {'complete_response_T2': 'PASS'},
            'counts-batch-p2/result.json': {'T1': 'PASS'}, 'metadata-parity/result.json': {'outcome': 'PASS'},
            'presence/result.json': {'T1': 'PASS'}})
        path = root / 'banked-P.tar.gz'
        with tarfile.open(path, 'w:gz') as archive:
            for name, value in files.items():
                raw = json.dumps(value).encode()
                member = tarfile.TarInfo(name)
                member.size = len(raw)
                archive.addfile(member, io.BytesIO(raw))
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def test_immutable_archive_and_identical_builders_required(self):
        for bad in (False, True):
            with self.subTest(bad_builder=bad), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                checksum = self.archive(root, bad_builder=bad)
                with patch.object(banked, 'ARCHIVE_SHA256', checksum):
                    if bad:
                        with self.assertRaisesRegex(ValueError, 'builder source differs'):
                            banked.load(root)
                    else:
                        self.assertEqual(banked.load(root)['presence/result.json']['T1'], 'PASS')
                with patch.object(banked, 'ARCHIVE_SHA256', '0' * 64):
                    with self.assertRaisesRegex(ValueError, 'archive hash differs'):
                        banked.load(root)


class ScopedTests(unittest.TestCase):
    def test_spot_receipts_cannot_impersonate_full_parity_or_unscoped_permission(self):
        operation = {'scope': 'F_GATES_ONLY', 'banked_P_sha256': banked.ARCHIVE_SHA256}
        receipts = [dict(validation=infra.VERDICT, banked_archive_sha256=banked.ARCHIVE_SHA256,
            full_parity_rerun=False, outcome='INFRASTRUCTURE_BUILT_SPOTS_PASS') for _ in range(4)]
        receipts[2]['outcome'] = 'BOUNDED_SPOT_PASS'
        self.assertTrue(infra.serving_valid(operation, *receipts))
        self.assertFalse(infra.serving_valid({}, *receipts))
        receipts[2]['outcome'] = 'PASS'
        self.assertFalse(infra.serving_valid(operation, *receipts))

    def test_stage_table_joins_exact_native_ids_and_keeps_mixed_labels(self):
        stages = [{'query_id': 'q', 'request_id': 'r', 'stage': 'counts_embedded_in_resolution'}]
        native = [{'query_id': 'q', 'exception_code': 0, 'read_rows': '20', 'read_bytes': '200', 'query_duration_ms': '4'}]
        self.assertEqual(report.table(native, stages)['r']['counts_embedded_in_resolution']['read_bytes'], 200)
        with self.assertRaises(ValueError):
            report.table(native, stages * 2)
        with self.assertRaises(ValueError):
            report.table(native, [])

    def proof(self, root):
        past = datetime.now(UTC) - timedelta(minutes=1)
        proof = dict(outcome='PASS', source_sha256=scoped.sources(), banked_P_sha256=banked.ARCHIVE_SHA256,
            actual_authorized_publish=True, hook_readiness='PASS', droplet_id=123, request_id='real-request',
            recipient_pointers=10, completed_utc=past.isoformat())
        path = root / 'deploy-rehearsal.json'
        path.write_text(json.dumps(proof))
        return proof, dict(rehearsal_sha256=gates.digest(path), droplet_id=456, approved_utc=datetime.now(UTC).isoformat())

    def test_rehearsal_requires_actual_publish_source_fresh_host_and_prior_clock(self):
        for fault in ('none', 'no-publish', 'source', 'host', 'clock', 'hash'):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                proof, approval = self.proof(root)
                if fault == 'no-publish':
                    proof['actual_authorized_publish'] = False
                elif fault == 'source':
                    proof['source_sha256'] = {}
                elif fault == 'host':
                    approval['droplet_id'] = 123
                elif fault == 'clock':
                    approval['approved_utc'] = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
                path = root / 'deploy-rehearsal.json'
                path.write_text(json.dumps(proof))
                approval['rehearsal_sha256'] = gates.digest(path) if fault != 'hash' else '0' * 64
                if fault == 'none':
                    self.assertEqual(scoped.rehearsal_proof(root, approval)['outcome'], 'PASS')
                else:
                    with self.assertRaises(ValueError):
                        scoped.rehearsal_proof(root, approval)

    def test_no_paid_admission_clock_when_rehearsal_absent(self):
        with patch.object(banked, 'load'), patch.object(cloud, 'initialize') as initialize:
            with self.assertRaisesRegex(ValueError, 'no gates admission clock'):
                scoped.initialize('F_GATES_ONLY', '/nonexistent-test-archive', state='unused')
        initialize.assert_not_called()

    def test_scoped_programme_cites_but_never_reexecutes_step0(self):
        with tempfile.TemporaryDirectory() as directory:
            actions = SimpleNamespace(root=Path(directory), host=123, approval={'scope': 'F_GATES_ONLY'}, active_root=None,
                setup=Mock(), cite=Mock(return_value={'verified': True, 'status': 'CITED_NOT_REMEASURED'}))
            names = ('build', 'publish', 'parity', 'quiet', 'follow', 'population', 'populated', 'rebuild', 'stale', 'boundaries', 'load')
            for name in names:
                setattr(actions, name, Mock(return_value={'verified': True}))
            with patch.object(scoped, 'ScopedActions', return_value=actions):
                result = scoped.run(directory)
            self.assertEqual(tuple(result), gates.SCOPED_ORDER)
            self.assertEqual(result['Banked-P']['outcome'], 'CITED')
            self.assertNotIn('Step0', result)
            self.assertNotIn('T7', result)

    def test_changed_stored_spot_and_duplicate_counter_rows_refuse(self):
        recipe = SimpleNamespace(name='comments')
        old = {'comparisons': [{'counter': 'comments', 'canonical': {'positive': 4}, 'stored': {'positive': 4}}]}
        for rows in ([{'doc_id': 'positive', 'value': '4'}], [{'doc_id': 'positive', 'value': '5'}],
                     [{'doc_id': 'positive', 'value': '4'}] * 2):
            session = SimpleNamespace(rows=Mock(return_value=(rows, 'native')))
            if len(rows) == 1 and rows[0]['value'] == '4':
                self.assertEqual(infra.check_values(session, 'a' * 64, ['positive', 'zero'], [recipe], 'b' * 64, old)[0]['status'], 'BANKED_SPOT_PASS')
            else:
                with self.assertRaises(ValueError):
                    infra.check_values(session, 'a' * 64, ['positive', 'zero'], [recipe], 'b' * 64, old)


if __name__ == '__main__':
    unittest.main()
