"""Offline checks for the Nov 24 task protocol, without a host or ClickHouse."""
from datetime import UTC, datetime, timedelta
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

import arm_f_cloud as cloud
import arm_f_deploy as deploy
import arm_f_runtime as runtime
import arm_satellite_runtime as satellite
import arm_t
from costfn_seed_resume import Seed
from costfn_task import ParityDivergence, Task, read
import engagement_modern as modern
import engagement_window as window


def approval():
    start = datetime(2026, 11, 24, tzinfo=UTC)
    return dict(costfn_task_id='rd4-k20', costfn_run_rules=window.TASK_RULES, approved_by='Jacob',
        approved_utc=start.isoformat(), deadline_utc=(start + timedelta(days=1)).isoformat(),
        droplet_id=123, dataset_id=arm_t.DATASET, configuration='F', cutoff=2000,
        watchdog_verified=False, host_self_kill_verified=True, cleanup_model='agent-supervised-self-kill',
        T7_admitted=False, sort_order_arm_admitted=False, hybrid_k20_source_commit='a' * 40)


class TaskTests(unittest.TestCase):
    def test_clock_is_metadata_not_a_native_work_limit(self):
        value = approval()
        after = datetime.fromisoformat(value['deadline_utc']) + timedelta(hours=5)
        runtime.admitted(value, 123, now=after)
        satellite.admitted({**value, 'configuration': 'P', 'kind': 'SATELLITE_CONFIG_P_OPERATION_APPROVAL',
            'scope': 'F_GATES_ONLY', 'parent_admission_sha256': 'admission', 'canonical_sources_approved': True,
            'scope_qualified_counts_approved': True, 'fanout': False}, 123, now=after)
        self.assertEqual(modern.remaining(value), float('inf'))
        self.assertTrue(window.valid(value, 86400))
        self.assertFalse(window.valid(value, 14400))
        self.assertFalse(any('RuntimeMaxSec' in bit for bit in deploy.worker_command(-1, '/research/', task=True)))
        with self.assertRaises(ValueError):
            runtime.admitted(value, 124, now=after)

    def test_cloud_backstop_does_not_auto_delete_pending_custody(self):
        lease = {'costfn_task_id': 'test', 'costfn_run_rules': window.TASK_RULES, 'deadline': 86401,
            'created_epoch': 1, 'size': 's-8vcpu-32gb-amd', 'hourly_usd': .25, 'name': 'web10-fanout-f-123456789abc',
            'tag': 'web10-fanout-f-123456789abc', 'configuration': 'F', 'region': 'nyc3', 'account_uuid': 'owned'}
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'lease.json'
            cloud.save(path, lease)
            with patch.object(cloud, 'account'), patch.object(cloud, 'cleanup') as cleanup:
                cloud.tick(path)
                cleanup.assert_not_called()
                cloud.tick(path, stop=True)
                cleanup.assert_called_once()

    def test_repair_keeps_single_admission_and_reuses_valid_steps(self):
        with TemporaryDirectory() as directory:
            root, value = Path(directory), approval()
            (root / 'admission.json').write_text(json.dumps(value))
            first = Task(root, value, 'a' * 40)
            with self.assertRaisesRegex(FileNotFoundError, 'handoff'):
                with first.attempt():
                    first.step('slice', lambda: {'manifest': 'banked'})
                    first.step('projected-read', Mock(side_effect=FileNotFoundError('handoff')))
            second = Task(root, value, 'b' * 40)
            with self.assertRaisesRegex(ValueError, 'record'):
                with second.attempt():
                    self.fail('changed source must identify its repair')
            old, validate = Mock(), Mock()
            with second.attempt('restore the handoff file'):
                self.assertEqual(second.step('slice', old, validate), {'manifest': 'banked'})
                second.step('projected-read', lambda: 'fresh receipt')
            old.assert_not_called()
            validate.assert_called_once_with({'manifest': 'banked'})
            actual = read(second.path)
            self.assertEqual([a['status'] for a in actual['attempts']], ['NEEDS_REPAIR', 'COMPLETE'])
            self.assertEqual(actual['identity']['source_start'], 'a' * 40)
            self.assertEqual(actual['source_end'], 'b' * 40)

    def test_parity_divergence_is_terminal_and_does_not_publish_costs(self):
        with TemporaryDirectory() as directory:
            root, value = Path(directory), approval()
            (root / 'admission.json').write_text(json.dumps(value))
            task = Task(root, value, 'a' * 40)
            with self.assertRaises(ParityDivergence):
                with task.attempt():
                    raise ParityDivergence('wrong ordered response')
            self.assertEqual(read(task.path)['status'], 'PARITY_DIVERGENCE')
            self.assertFalse((root / 'hybrid-k20-projected-comparison.json').exists())
            with self.assertRaisesRegex(ValueError, 'terminal'):
                with task.attempt():
                    self.fail('must not retry an oracle divergence')


class SeedTests(unittest.TestCase):
    def test_reuse_success_and_resolve_lost_ack_without_repeating_the_insert(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            session = Mock(host_id=32, ledger=root / 'native.jsonl')
            session.rows.return_value = ([{'name': 'frozen'}], 'fingerprint')
            seed = Seed(session, root, 1, {})
            sql = 'INSERT INTO content_events_aggregated SELECT 1'
            def lost_ack():
                session.ledger.write_text(json.dumps(dict(label='day0', phase='start', query_id='exact-native-id',
                    sql_sha256=hashlib.sha256(sql.encode()).hexdigest())) + '\n')
                raise OSError('lost acknowledgement')
            native = Mock(return_value=dict(type='QueryFinish', exception_code=0))
            with self.assertRaises(OSError):
                seed.step('day0', sql, False, lost_ack, native)
            retry = Mock()
            second = Seed(session, root, 1, {})
            self.assertEqual(second.step('day0', sql, False, retry, native)[1], 'exact-native-id')
            self.assertEqual(second.step('day0', sql, False, retry, native)[1], 'exact-native-id')
            native.assert_called_once_with(session, 'exact-native-id')
            retry.assert_not_called()
            session.rows.return_value = ([{'name': 'different'}], 'fingerprint')
            with self.assertRaisesRegex(ValueError, 'generation changed'):
                Seed(session, root, 1, {})


if __name__ == '__main__':
    unittest.main()
