"""Offline integrity/claim controls for the closed batched all-time attempt."""
import csv
import hashlib
import io
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).parent / 'evidence/all-fixes-batched-20261120'


class BatchReceiptTests(unittest.TestCase):
    def setUp(self):
        self.result = json.loads((ROOT / 'results.json').read_bytes())
        self.raw = (ROOT / 'native-query-costs.csv').read_bytes()
        self.rows = list(csv.DictReader(io.StringIO(self.raw.decode())))

    def test_complete_native_batch_proof_does_not_promote_audit_or_row_model(self):
        result = self.result
        self.assertEqual(result['native_batch_proof'], 'PASS')
        self.assertEqual(result['all_time']['batches'], 489)
        self.assertEqual(result['all_time']['documents'], 2_000_001)
        self.assertEqual(result['day_seed']['matched_events'], 1_600_000_000)
        self.assertEqual(result['all_time']['matched_events'], 1_600_000_000)
        self.assertEqual(result['all_time']['peak_query_memory'], 565_711_161)
        self.assertGreater(result['all_time']['inventory']['read_rows'], 1_600_000_000)
        self.assertEqual(result['original_stage_outcomes']['decomposition'], 'INCOMPLETE')
        self.assertEqual(result['composition_acceptance'], 'OPEN_STATEMENT_AUDIT_STOP')
        self.assertEqual(result['row_model'], 'NOT_RUN')
        self.assertFalse(result['p95'] or result['whole_arm_pass'] or result['automatic_retry'])

    def test_csv_digest_unique_query_identity_and_sample_stage_totals_reconcile(self):
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(), self.result['csv']['sha256'])
        self.assertEqual(len(self.raw), self.result['csv']['bytes'])
        self.assertEqual(len({r['query_id'] for r in self.rows}), len(self.rows))
        self.assertEqual(sum(r['scope']=='captured' for r in self.rows), 410)
        self.assertEqual(sum(r['scope']=='request_tagged_auxiliary' for r in self.rows), 78)
        self.assertTrue(all(int(r['exception_code']) == 0 for r in self.rows))
        for sample in self.result['samples']:
            rows = [r for r in self.rows if r['cell']==sample['cell'] and r['phase']==sample['phase']]
            captured = [r for r in rows if r['scope']=='captured']
            auxiliary = [r for r in rows if r['scope']=='request_tagged_auxiliary']
            self.assertEqual(len(captured), sample['captured_queries'])
            self.assertEqual(sum(int(r['read_bytes']) for r in captured), sample['captured_read_bytes'])
            self.assertEqual(sum(int(r['read_rows']) for r in captured), sample['captured_read_rows'])
            self.assertEqual(sum(s['read_bytes'] for s in sample['stages'].values()), sample['captured_read_bytes'])
            self.assertEqual(sum(int(r['read_bytes']) for r in auxiliary), sample['auxiliary']['read_bytes'])
            self.assertEqual(sum(int(r['written_bytes']) for r in auxiliary), sample['auxiliary']['written_bytes'])

    def test_raw_delivery_read_stays_captured_and_every_original_unknown_query_gets_an_identity(self):
        self.assertEqual(len(self.result['samples']), 6)
        for sample in self.result['samples']:
            rows = [r for r in self.rows if r['cell']==sample['cell'] and r['phase']==sample['phase']]
            raw = [r for r in rows if r['audit_violation']]
            self.assertEqual(len(raw), 1)
            self.assertEqual(raw[0]['scope'], 'captured')
            self.assertEqual(raw[0]['audit_violation'], 'raw_events_table')
            self.assertEqual(raw[0]['diagnostic_name'], 'delivery_history_max_timestamp')
            self.assertEqual(raw[0]['sql_sha256'], sample['audit_violations'][0]['sql_sha256'])
            unknown = [r for r in rows if r['captured_stage']=='unclassified']
            self.assertEqual(len(unknown), 11)
            self.assertTrue(all(r['diagnostic_name'] in ('current_group_membership', 'current_app_contract_permissions')
                and len(r['sql_sha256'])==64 and r['captured_sql_file'].endswith(r['sql_sha256']+'.sql') for r in unknown))
            self.assertEqual(sample['parity'], 'PASS')
            self.assertEqual(sample['budget'], 'FAIL')

    def test_original_custody_cleanup_and_closed_admission_are_not_invented_success(self):
        value = self.result
        self.assertEqual(value['source_commit'], 'ffa4b5066ba164519b9be0a5a2e32e87bf0e4755')
        self.assertEqual(value['droplet_id'], 621754971)
        self.assertTrue(value['custody']['checkpoint']['off_host_verified'])
        self.assertTrue(value['custody']['native']['off_host_verified'])
        self.assertFalse(value['custody']['native']['engine_restarted'])
        for key in ('droplet_absent','firewall_absent','ssh_key_absent','tag_absent','snapshot_retained','before_deadline'):
            self.assertTrue(value['cleanup'][key])
        self.assertFalse(value['cleanup']['invoice'])
        self.assertTrue(value['cleanup']['storage_separate'])


if __name__ == '__main__':
    unittest.main()
