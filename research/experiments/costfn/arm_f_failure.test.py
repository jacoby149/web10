"""Offline fault injection: persistence before cleanup, no engine or paid work."""
import json
from pathlib import Path
import stat
import tempfile
import unittest
from types import SimpleNamespace

import arm_f_failure as failure
from arm_f_gates import Programme


class FailureTests(unittest.TestCase):
    def test_finally_checkpoint_precedes_cleanup_and_preserves_primary_error(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, 'primary failure'):
                try:
                    raise RuntimeError('primary failure')
                finally:
                    path = failure.before_cleanup(directory, stage='R+W', operation='shutdown')
                    value = json.loads(path.read_bytes())
                    self.assertEqual(value['failure_message'], 'primary failure')
                    self.assertEqual(value['context']['stage'], 'R+W')
            self.assertIsNone(failure.before_cleanup(directory))

    def test_dry_gate_failure_retains_message_stack_and_cell_before_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runner = Programme(root, 123)
            def dry(output):
                with failure.operation(root, operation='trim', reader='reader-201', group='group-a', document='doc-a'):
                    raise RuntimeError('forced trim diagnostic message')
            with self.assertRaisesRegex(RuntimeError, 'forced trim'):
                try:
                    runner.run('Step0', dry)
                finally:
                    receipt = json.loads((root / 'F-gates/Step0/result.json').read_bytes())
                    self.assertEqual(receipt['failure_message'], 'forced trim diagnostic message')
                    self.assertIn('raise RuntimeError', receipt['failure_traceback'])
                    self.assertIn('RuntimeError: forced trim', receipt['failure_traceback'])
                    self.assertEqual(receipt['diagnostic_context']['stage'], 'Step0')
                    paths = list((root / 'failures').glob('*.json'))
                    self.assertTrue(paths)
                    inner = next(value for path in paths if (value := json.loads(path.read_bytes()))['context'].get('reader'))
                    self.assertEqual(inner['context']['reader'], 'reader-201')
                    self.assertEqual(stat.S_IMODE(paths[0].stat().st_mode), 0o600)

    def test_transport_secrets_are_redacted_without_losing_stack_frames(self):
        try:
            raise ValueError('fetch https://example.invalid/?X-Amz-Signature=private token=private-token')
        except ValueError as error:
            value = failure.details(error)
        self.assertNotIn('private-token', str(value))
        self.assertNotIn('X-Amz-Signature=private', str(value))
        self.assertIn('test_transport_secrets', value['failure_traceback'])

    def test_native_correlation_persists_before_collection_and_names_collection_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            class Client:
                def command(self, sql, **kwargs):
                    self.assert_receipt()
                    raise OSError('engine unavailable during diagnostic collection')
                def assert_receipt(self):
                    rows = list((Path(directory) / 'failures').glob('*.json'))
                    assert len(rows) == 1
                    value = json.loads(rows[0].read_bytes())
                    assert value['native']['log_comment'] == 'F_READ:trim-id'
                    assert value['failure_message'] == 'original trim error'
            try:
                raise RuntimeError('original trim error')
            except RuntimeError as error:
                path = failure.engine_failure(directory, error, Client(), log_comment='F_READ:trim-id')
            value = json.loads(path.read_bytes())
            self.assertEqual(value['failure_message'], 'original trim error')
            self.assertEqual(value['native']['status'], 'COLLECTION_FAILED')
            self.assertIn('engine unavailable', value['native']['failure_message'])

    def test_native_failure_receipt_joins_actual_query_ids_and_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            client = SimpleNamespace(command=lambda *args, **kwargs: None,
                query=lambda *args, **kwargs: SimpleNamespace(column_names=['query_id', 'exception_code'],
                    result_rows=[('failed-native-id', 241)]))
            try:
                with failure.operation(operation='trim', reader='reader-a', group='group-a'):
                    raise RuntimeError('synthetic native memory stop')
            except RuntimeError as error:
                path = failure.engine_failure(directory, error, client, log_comment='F_READ:trim')
            value = json.loads(path.read_bytes())
            self.assertEqual(value['native']['query_ids'], ['failed-native-id'])
            self.assertEqual(value['native']['rows'][0]['exception_code'], 241)
            self.assertIn('synthetic native memory stop', value['failure_traceback'])


if __name__ == '__main__':
    unittest.main()
