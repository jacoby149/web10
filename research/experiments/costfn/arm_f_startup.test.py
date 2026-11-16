"""Fail-fast actual-process/boot-receipt controls; no native proof claimed."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import arm_f_hooks as hooks
import arm_f_startup as startup


class StartupTests(unittest.TestCase):
    def root(self, directory):
        root = Path(directory)
        (root / 'fanout-state').mkdir()
        (root / 'admission.json').write_text(json.dumps({'scope': 'F_GATES_ONLY'}))
        receipt = dict(authorized_membership_routes=sorted(hooks.MEMBERSHIP_PATHS),
            authorized_document_routes=sorted(hooks.DOCUMENT_PATHS), boot_id='current',
            production_source_modified=False,
            adapter_sha256=hashlib.sha256(Path(startup.__file__).with_name('arm_f_api.py').read_bytes()).hexdigest(),
            installer_sha256=hashlib.sha256(Path(hooks.__file__).read_bytes()).hexdigest())
        (root / 'fanout-state/hook-install.json').write_text(json.dumps(receipt))
        return root

    def command(self, status='running'):
        return Mock(side_effect=[b'container', json.dumps({'Status': status}).encode(), b'private log'])

    def test_exited_process_fails_immediately_and_is_rehearsal_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.root(directory)
            with patch.object(startup.restore, 'command', self.command('exited')), patch.object(startup.time, 'sleep') as sleep:
                with self.assertRaisesRegex(startup.StartupFailure, 'exited'):
                    startup.ready(root, [], {}, 'current')
            sleep.assert_not_called()
            self.assertEqual(json.loads((root / 'F-startup-failure.json').read_bytes())['classification'], 'rehearsal_escape')
            self.assertFalse((root / 'F-api-ready.json').exists())

    def test_http_ready_with_stale_or_missing_hook_never_passes(self):
        for fault in ['stale', 'missing', 'wrong-source', 'missing-route']:
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as directory:
                root = self.root(directory)
                path = root / 'fanout-state/hook-install.json'
                d = json.loads(path.read_bytes())
                if fault == 'stale':
                    d['boot_id'] = 'old'
                elif fault == 'wrong-source':
                    d['adapter_sha256'] = '0' * 64
                elif fault == 'missing-route':
                    d['authorized_membership_routes'].pop()
                path.write_text(json.dumps(d))
                if fault == 'missing':
                    path.unlink()
                response = Mock()
                response.__enter__ = Mock(return_value=Mock(status=200))
                response.__exit__ = Mock(return_value=False)
                with patch.object(startup.restore, 'command', self.command()), patch.object(startup.urllib.request, 'urlopen', return_value=response), patch.object(startup.time, 'sleep') as sleep:
                    with self.assertRaises((startup.StartupFailure, FileNotFoundError)):
                        startup.ready(root, [], {}, 'current')
                sleep.assert_not_called()
                self.assertFalse((root / 'F-api-ready.json').exists())

    def test_ready_requires_current_source_hooks_and_actual_http(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.root(directory)
            response = Mock()
            response.__enter__ = Mock(return_value=Mock(status=200))
            response.__exit__ = Mock(return_value=False)
            with patch.object(startup.restore, 'command', self.command()), patch.object(startup.urllib.request, 'urlopen', return_value=response):
                startup.ready(root, [], {}, 'current')
            self.assertEqual(json.loads((root / 'F-api-ready.json').read_bytes())['outcome'], 'PASS')


if __name__ == '__main__':
    unittest.main()
