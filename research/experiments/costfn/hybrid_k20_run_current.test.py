"""No-engine stage-order and stop controls for the baseline-only runner."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import hybrid_k20_run_current as runner
from arm_f_reference import legacy_ads


class BaselineOnly(unittest.TestCase):
    def test_tally_fingerprint_is_banked_before_binding_and_matches_fresh_slice(self):
        with tempfile.TemporaryDirectory() as directory:
            actions = runner.Actions.__new__(runner.Actions)
            actions.root = Path(directory)
            manifest = actions.root / 'hybrid-k20-slice.json'
            manifest.write_text('{"status":"SOURCE_ORACLE_PARITY"}')
            fingerprint = dict(canonical_generation='sliced-generation', canonical_content_sha256='sliced-content',
                canonical_parts=[{'table': 'documents', 'rows': '59'}], base_files=[{'table': 'documents', 'files': []}])
            target = actions.root / 'before-projection-fingerprint.json'

            def bind(root, session, generation, provenance):
                self.assertEqual(json.loads(target.read_bytes()), fingerprint)
                self.assertEqual(provenance['canonical_content_sha256'], fingerprint['canonical_content_sha256'])
                self.assertEqual(generation, fingerprint['canonical_generation'])

            with (patch.object(runner.setup, 'infrastructure', return_value='wrong-generation') as infrastructure,
                    patch.object(runner.modern, 'Session'),
                    patch.object(runner.certificates, 'fingerprint', return_value=fingerprint),
                    patch.object(runner.certificates, 'bind', side_effect=bind) as binder,
                    patch.object(runner.certificates, 'verify', return_value='verified')):
                with self.assertRaisesRegex(ValueError, 'slice generation changed'):
                    actions.base_infrastructure()
                self.assertFalse(target.exists())
                binder.assert_not_called()
                infrastructure.return_value = fingerprint['canonical_generation']
                self.assertEqual(actions.base_infrastructure(), 'verified')
                self.assertEqual(json.loads(target.read_bytes()), fingerprint)
                binder.assert_called_once()

    def test_legacy_oracle_pool_is_stable_under_native_row_permutations(self):
        entries = [dict(author_key=a, doc_id=d) for a, d in [('B', '1'), ('A', '2'), ('A', '1')]]
        ordered = legacy_ads(entries, runner.LEGACY_AD_FULL_KEY_ORDER)
        self.assertEqual(ordered, legacy_ads(list(reversed(entries)), runner.LEGACY_AD_FULL_KEY_ORDER))
        self.assertEqual([(a['author_key'], a['doc_id']) for a in ordered], [('A', '1'), ('A', '2'), ('B', '1')])
        self.assertIs(legacy_ads(entries, None), entries)
        with self.assertRaisesRegex(ValueError, 'duplicate legacy creative identity'):
            legacy_ads(entries + entries[:1], runner.LEGACY_AD_FULL_KEY_ORDER)

    def test_both_setup_oracles_use_same_order(self):
        actions = runner.Actions.__new__(runner.Actions)
        actions.root = Path('/bound/root')
        profile = dict(reader='synthetic')
        with patch.object(runner.reads, 'reference') as reference:
            for name in ('reference-ordinary', 'slice-reference-ordinary'):
                actions.reference(profile, name)
                reference.assert_called_with(actions.root, profile=profile, name=name,
                    legacy_node_ad_order=runner.LEGACY_AD_FULL_KEY_ORDER)

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
