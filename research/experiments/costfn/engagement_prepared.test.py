"""Task-mode re-entry controls for the one-shot K20 count setup."""
import json
import unittest
from pathlib import Path
import tempfile
from unittest.mock import Mock

import engagement_prepared as prepared


class InitialK20Reentry(unittest.TestCase):
    def session(self):
        return Mock(operation={'initial_k20_count_build_admitted': True})

    def test_completed_setup_reenters_cleanly_and_refuses_generation_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / 'initial-k20-count-setup'
            output.mkdir()
            completed = dict(kind='INITIAL_K20_ONLY_OPERATOR_APPROVED',
                outcome='INFRASTRUCTURE_BUILT_SPOTS_PASS', canonical_generation='gen-1')
            (output / 'result.json').write_text(json.dumps(completed))
            (root / 'counts-ordinary.json').write_text('{}')
            (root / 'presence-ordinary.json').write_text('{}')
            prepared.initial_k20(root, self.session(), 'gen-1')
            (output / 'result.json').write_text(json.dumps(
                dict(completed, canonical_generation='gen-2')))
            with self.assertRaisesRegex(ValueError, 'generation changed'):
                prepared.initial_k20(root, self.session(), 'gen-1')

    def test_mid_build_or_unrecognized_output_is_refused(self):
        for value in (dict(kind='INITIAL_K20_ONLY_OPERATOR_APPROVED', outcome='BUILDING'),
                dict(kind='other', outcome='INFRASTRUCTURE_BUILT_SPOTS_PASS')):
            with self.subTest(value=value), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                output = root / 'initial-k20-count-setup'
                output.mkdir()
                (output / 'result.json').write_text(json.dumps(
                    dict(value, canonical_generation='gen-1')))
                with self.assertRaisesRegex(ValueError, 'Seed receipts'):
                    prepared.initial_k20(root, self.session(), 'gen-1')

    def test_fresh_root_still_builds_once(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, 'required'):
                prepared.initial_k20(root, Mock(operation={}), 'gen-1')
            self.assertFalse((root / 'initial-k20-count-setup').exists())


if __name__ == '__main__':
    unittest.main()
