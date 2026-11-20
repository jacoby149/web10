"""The new clock passes each real admission seam; old windows remain exact."""
from datetime import UTC, datetime, timedelta
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import arm_f_cloud as cloud
import arm_f_deploy as deploy
import arm_f_runtime as runtime
import arm_f_run as run
import arm_satellite_runtime as subordinate
import engagement_composition as composition
import engagement_limits as limits
import engagement_modern as modern
import engagement_window as window
import engagement_native as native


class WindowTests(unittest.TestCase):
    def approval(self):
        start = datetime.now(UTC) - timedelta(hours=5)
        return dict(configuration='F', approved_by='Jacob', droplet_id=123, dataset_id=modern.arm_t.DATASET,
            budget_usd=window.PROGRAMME_USD, approved_utc=start.isoformat(),
            deadline_utc=(start+timedelta(hours=24)).isoformat(), cutoff=2000, T7_admitted=False,
            sort_order_arm_admitted=False, cleanup_model='agent-supervised-self-kill', host_self_kill_verified=True,
            scope='F_GATES_ONLY', layout_clock_directive=window.DIRECTIVE, composition_admitted=True,
            row_model_admitted=True, purpose='ENGAGEMENT_ALL_FIXES', run_directive=composition.DIRECTIVE,
            measurement_limits_directive=limits.DIRECTIVE, engagement_engine=modern.ENGINE, engagement_directive=modern.DIRECTIVE,
            engagement_ref_admitted=True, tally_wiring_admitted=True, initial_k20_count_build_admitted=True,
            engagement_completion_admitted=True, stages_b_d_admitted=False)

    def test_after_four_hours_parent_modern_and_generated_subordinate_still_accept_original_24h(self):
        value = self.approval()
        modern.admitted(value, 123)
        runtime.admitted(value, 123)
        with tempfile.TemporaryDirectory() as directory, patch.object(run.arm_t, 'digitalocean_id', return_value=123):
            root = Path(directory)
            (root/'admission.json').write_text(json.dumps(value))
            run.operation(root)
            generated = json.loads((root/'evidence/operation.json').read_bytes())
            subordinate.admitted(generated, 123)
            self.assertEqual(generated['deadline_utc'], value['deadline_utc'])
        command = deploy.worker_command(85000, '/research/', layout_clock=True)
        self.assertIn('--property=RuntimeMaxSec=85000', command)
        with self.assertRaises(ValueError):
            deploy.worker_command(85000, '/research/')

    def test_window_refuses_missing_explicit_fields_extension_wrong_host_or_expiry(self):
        value = self.approval()
        for key, replacement in (('layout_clock_directive','old'), ('composition_admitted',False),
                ('row_model_admitted',False), ('budget_usd',2), ('droplet_id',124),
                ('deadline_utc',(datetime.fromisoformat(value['approved_utc'])+timedelta(hours=25)).isoformat())):
            with self.subTest(key=key), self.assertRaises(ValueError):
                runtime.admitted({**value,key:replacement}, 123)
        with self.assertRaises(ValueError):
            runtime.admitted(value, 123, now=datetime.fromisoformat(value['deadline_utc']))

    def test_new_one_statement_rebuild_setup_uses_backstop_but_seed_and_measurements_keep_600s(self):
        value = self.approval()
        session = object.__new__(modern.Session)
        session.operation, session.host_id = value, 123
        session.compose, session.env = ['docker','compose'], {}
        session.record = lambda row: None
        for label, measured, expected in (('events_layout_rebuild',False,68000),
                ('composition_aggregate_seed_slice_0',False,600), ('events_layout_rebuild',True,600)):
            with patch.object(native,'await_query',return_value=b'') as execute, patch.object(modern,'remaining',return_value=68000):
                session.query(label,'INSERT INTO owned SELECT 1',measured=measured,setup_seconds=86400)
            self.assertEqual(execute.call_args.args[3], expected)
            command = execute.call_args.args[1]
            self.assertIn('--max_memory_usage='+str(22*1024**3), command)
            self.assertIn('--max_rows_to_read=0', command)

    def test_fresh_cloud_initialization_binds_24h_without_guardian_and_legacy_stays_four_hours(self):
        for enabled in (False, True):
            with tempfile.TemporaryDirectory() as directory:
                home = Path(directory)
                (home/'.local/state/web10-research').mkdir(parents=True)
                shape = dict(slug='s-8vcpu-32gb-amd', memory=32768, vcpus=8, disk=400,
                    price_hourly=.25, available=True, regions=['nyc3'])
                state = home/'state.json'
                with patch.object(cloud.Path,'home',return_value=home), patch.object(cloud,'api',side_effect=[[{'uuid':'test'}],[shape],[]]):
                    cloud.initialize(state=state, scope='F_GATES_ONLY', layout_clock=enabled)
                value = json.loads(Path(json.loads(state.read_bytes())['lease']).read_bytes())
                cloud.validate(value)
                self.assertEqual(value['deadline']-value['created_epoch'], 86400 if enabled else 14400)
                self.assertFalse(value['guardian_required'])
                with self.assertRaises(ValueError):
                    cloud.validate({**value,'deadline':value['deadline']+1})


if __name__ == '__main__':
    unittest.main()
