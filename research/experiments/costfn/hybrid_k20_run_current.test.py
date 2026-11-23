"""No-engine stage-order and stop controls for the baseline-only runner."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import hybrid_k20_run_current as runner


class BaselineOnly(unittest.TestCase):
    def exercise(self, fail=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            approval = dict(hybrid_k20_source_commit='a' * 40, droplet_id=17, deadline_utc='deadline')
            (root / 'admission.json').write_text(json.dumps(approval))
            stages = []

            def run_stage(stage, _):
                stages.append(stage)
                if stage == fail:
                    raise ValueError('test gate failed')
                return dict(snapshot_id='255003176') if stage == 'restore' else {}

            actions = Mock(approval=approval, stage=run_stage)
            with (patch.object(runner, 'source_guard'), patch.object(runner.modern, 'install_sessions'),
                    patch.object(runner, 'Actions', return_value=actions), patch.object(runner.contract, 'gate'),
                    patch.object(runner.slice, 'prepare', side_effect=lambda _: run_stage('slice', None)),
                    patch.object(runner.baseline, 'run_current', side_effect=lambda _: run_stage('uniform-K20', None))):
                if fail is not None:
                    with self.assertRaisesRegex(ValueError, 'test gate failed'):
                        runner.run(root)
                else:
                    runner.run(root)
            return stages, json.loads((root / 'hybrid-k20-baseline-only.json').read_bytes())

    def test_success_stops_after_original_k20(self):
        stages, result = self.exercise()
        self.assertEqual(stages, list(runner.STAGES))
        self.assertEqual(stages[-1], 'uniform-K20')
        self.assertEqual(result['status'], 'BASELINE_REPRODUCED')
        self.assertEqual((result['challengers'], result['fault_suite']), ('NOT_RUN', 'NOT_RUN'))

    def test_slice_oracle_stop_prevents_migration_or_measurement(self):
        stages, result = self.exercise(fail='slice')
        self.assertEqual(stages, ['restore', 'slice'])
        self.assertEqual(result['status'], 'STOP')


if __name__ == '__main__':
    unittest.main()
