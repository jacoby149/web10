"""Closed native composition and row-ID STOP integrity; no engine or network."""
import csv
import hashlib
import io
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).parent / 'evidence/all-fixes-reconciled-20261122'


class ReconciledReceiptTests(unittest.TestCase):
    def setUp(self):
        self.result = json.loads((ROOT / 'results.json').read_bytes())
        self.raw = (ROOT / 'native-query-costs.csv').read_bytes()
        self.rows = list(csv.DictReader(io.StringIO(self.raw.decode())))

    def test_native_composition_gates_and_audit_pass_without_promoting_row_cell(self):
        result = self.result
        self.assertEqual(result['source_commit'], '52233c8b9036cd7d314bae7d84a0011aec700307')
        self.assertEqual(result['source_bundle']['deployed_files'], 1506)
        self.assertTrue(result['composition']['native_controller_inventory'])
        self.assertTrue(all(v=='PASS' for v in result['composition']['original_stage_outcomes'].values()))
        self.assertEqual(result['construction']['day']['matched_events'], 1_600_000_000)
        self.assertEqual(result['construction']['all_time']['batches'], 489)
        self.assertEqual(result['construction']['all_time']['matched_events'], 1_600_000_000)
        self.assertEqual(result['construction']['all_time']['peak_query_memory'], 541_247_833)
        self.assertFalse(result['whole_arm_pass'] or result['p95'] or result['automatic_retry'])

    def test_all_captured_and_auxiliary_costs_reconcile_with_native_inventory(self):
        manifest = self.result['csv']['captured']
        self.assertEqual(len(self.raw), manifest['bytes'])
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(), manifest['sha256'])
        self.assertEqual(len({r['query_id'] for r in self.rows}), len(self.rows))
        self.assertEqual(sum(r['scope']=='captured' for r in self.rows), 410)
        self.assertEqual(sum(r['scope']=='request_tagged_auxiliary' for r in self.rows), 78)
        for sample in self.result['composition']['samples']:
            rows = [r for r in self.rows if r['cell']==sample['cell'] and r['phase']==sample['phase']]
            captured = [r for r in rows if r['scope']=='captured']
            auxiliary = [r for r in rows if r['scope']=='request_tagged_auxiliary']
            self.assertEqual(sum(int(r['read_rows']) for r in captured), sample['read_rows'])
            self.assertEqual(sum(int(r['read_bytes']) for r in captured), sample['read_bytes'])
            self.assertEqual(sum(int(r['read_bytes']) for r in auxiliary), sample['auxiliary']['read_bytes'])
            stages = sample['reconciled_inventory_stages']
            self.assertEqual(sum(s['read_bytes'] for s in stages.values()), sample['read_bytes'])
            dedup = [r for r in captured if r['inventory_stage']=='delivery_dedup_raw_read']
            self.assertEqual(len(dedup), 1)
            self.assertEqual(dedup[0]['previous_stage'], 'views')
            self.assertEqual(int(dedup[0]['read_bytes']), stages['delivery_dedup_raw_read']['read_bytes'])
            self.assertEqual(sample['parity'], 'PASS')
            self.assertEqual(sample['budget'], 'FAIL')

    def test_row_client_completions_are_not_misrepresented_as_native_acceptance(self):
        row = self.result['row_model']
        self.assertEqual(row['observed_outcome'], 'AGENT_SUPERVISED_STOP')
        self.assertEqual(row['original_worker_outcome'], 'RUNNING')
        self.assertEqual(row['claimed_client_outcomes'], {'CLIENT_COMPLETE':39})
        self.assertEqual(row['actual_native_query_ids'], 57)
        self.assertEqual(row['claimed_query_ids_matching_native'], 0)
        self.assertEqual(row['active_data_queries_at_stop'], 0)
        self.assertFalse(row['native_ids_remapped'] or row['source_repaired'] or row['build_progress_emitted'])
        self.assertEqual(row['full_family_build'], 'NOT_BANKED')
        self.assertEqual(row['assembly_measurements'], 'NOT_RUN')
        raw = (ROOT / 'row-native-id-diagnostic.csv').read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), self.result['csv']['row_setup_diagnostic']['sha256'])
        actual = list(csv.DictReader(io.StringIO(raw.decode())))
        self.assertEqual(len(actual), 57)
        self.assertEqual(len({r['actual_query_id'] for r in actual}), 57)
        self.assertTrue(all(r['claimed_id_equals_actual']=='False' and r['native_type']=='QueryFinish'
            and r['exception_code']=='0' and r['native_time_bound']=='600' for r in actual))

    def test_pinned_driver_request_plan_reproduces_the_recorded_wrong_field_not_a_fix(self):
        from clickhouse_connect.driver._backend.httpcommon import QueryRuntime, plan_command_request
        proof = self.result['row_model']['transport_diagnostic']
        plan = plan_command_request('SELECT 1', {}, None, None,
            QueryRuntime(database='web10', settings={'max_execution_time':'600'}), proof['supplied_transport_settings'])
        self.assertEqual(plan.headers, proof['actual_http_headers'])
        self.assertEqual(plan.params, proof['actual_url_params'])
        self.assertNotIn('query_id', plan.params)
        self.assertFalse(proof['engine_executed'] or proof['network_used'] or proof['source_fix_applied'])

    def test_off_host_custody_and_owned_cleanup_are_verified_before_deadline(self):
        result = self.result
        self.assertTrue(result['custody']['checkpoint']['off_host_verified'])
        self.assertTrue(result['custody']['native']['off_host_verified'])
        self.assertFalse(result['custody']['native']['engine_restarted'])
        for key in ('droplet_absent','firewall_absent','ssh_key_absent','tag_absent','snapshot_retained','before_deadline'):
            self.assertTrue(result['cleanup'][key])
        self.assertFalse(result['cleanup']['invoice'])
        self.assertTrue(result['cleanup']['storage_separate'])


if __name__ == '__main__':
    unittest.main()
