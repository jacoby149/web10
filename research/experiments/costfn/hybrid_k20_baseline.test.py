"""No-engine controls for the current-arm evidence adapter."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from hybrid_k20_baseline import PHASES, audit_cell


class CurrentArm(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.traces = self.root / 'F-stages'
        self.traces.mkdir()
        sql = 'SELECT 1'
        self.digest = hashlib.sha256(sql.encode()).hexdigest()
        self.sql = self.traces / (self.digest + '.sql')
        self.sql.write_text(sql)
        self.samples, self.harvest = {}, []
        for index, phase in enumerate(PHASES):
            request = f'{index:032x}'
            traces, native = [], []
            for num in range(2):
                identity = f'{phase}-{num}'
                row = dict(query_id=identity, log_comment='F_READ:' + request, exception_code='0',
                    read_rows='322', read_bytes=str(400 + num), query_duration_ms=str(2 + num),
                    memory_usage=str(1000 + num))
                traces.append(dict(request_id=request, query_id=identity, success=True,
                    sql_sha256=self.digest, stage='preparation'))
                native.append(row)
                self.harvest.append(dict(row, type='QueryFinish'))
            self.harvest.append(dict(native[0], query_id=f'{phase}-aux', type='QueryFinish',
                log_comment='F_WRITE:' + request, memory_usage='2000'))
            (self.traces / (request + '.jsonl')).write_text('\n'.join(map(json.dumps, traces)))
            self.samples[phase] = dict(phase=phase, parity='PASS', path_mode='P_DOCUMENT_STREAM_V1',
                elapsed_ms=26.5, request_ids=[request], native=native)

    def audit(self):
        for phase, sample in self.samples.items():
            (self.root / (phase + '.json')).write_text(json.dumps(sample))
        (self.root / 'all-native-including-failures-and-writes.json').write_text(json.dumps(self.harvest))
        return audit_cell(self.root)

    def test_banks_wall_native_duration_and_memory_with_different_scopes(self):
        for result in self.audit():
            self.assertEqual(result['complete_http_wall_ms'], 26.5)
            self.assertEqual(result['captured_by_stage']['preparation'], dict(read_rows=644,
                logical_read_bytes=801, summed_native_duration_ms=5, largest_statement_memory_bytes=1001))
            self.assertEqual(result['auxiliary_totals']['logical_read_bytes'], 400)
            self.assertEqual(result['request_tagged_totals']['largest_statement_memory_bytes'], 2000)

    def test_refuses_oracle_mismatch_and_fallback(self):
        for value in (dict(parity='FAIL'), dict(path_mode='canonical_fallback')):
            with self.subTest(value=value):
                self.samples['warmup'].update(parity='PASS', path_mode='P_DOCUMENT_STREAM_V1')
                self.samples['warmup'].update(value)
                with self.assertRaisesRegex(ValueError, 'original indexed path and oracle parity'):
                    self.audit()

    def test_refuses_receipt_without_memory_or_with_changed_metrics(self):
        self.harvest[0]['memory_usage'] = '0'
        with self.assertRaisesRegex(ValueError, 'native metrics differ'):
            self.audit()
        del self.harvest[0]['memory_usage']
        with self.assertRaisesRegex(KeyError, 'memory_usage'):
            self.audit()

    def test_refuses_missing_or_duplicate_native_receipts(self):
        row = self.harvest.pop(0)
        with self.assertRaisesRegex(ValueError, 'incomplete request-tagged native inventory'):
            self.audit()
        self.harvest.extend((row, row))
        with self.assertRaisesRegex(ValueError, 'duplicate native query identity'):
            self.audit()

    def test_refuses_changed_captured_sql(self):
        self.sql.write_text('SELECT 2')
        with self.assertRaisesRegex(ValueError, 'SQL digest differs'):
            self.audit()


if __name__ == '__main__':
    unittest.main()
