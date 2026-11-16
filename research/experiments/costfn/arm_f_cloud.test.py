"""No-network controls for transient provider readiness; no paid resources."""
import json
from pathlib import Path
import tempfile
import time
import subprocess
import sys
import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace

import arm_f_cloud as cloud
import arm_f_deploy as deploy


class HostReadinessTests(unittest.TestCase):
    def test_watchdog_program_survives_removal_of_launcher_virtualenv(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            environment = root / 'temporary-uv-environment'
            (environment / 'bin').mkdir(parents=True)
            launcher = environment / 'bin/python'
            launcher.symlink_to(Path(sys.executable).resolve())
            probe = root / 'watchdog-probe.py'
            probe.write_text('import argparse,datetime,fcntl,ipaddress,json,os,pathlib,plistlib,re,shutil,subprocess,sys,time,traceback,uuid\n'
                'assert sys.flags.isolated and sys.flags.no_site\nprint("stdlib watchdog survived")\n')
            command = cloud.watchdog_program(probe, root / 'lease.json', executable=launcher)
            old_program = [str(launcher), str(probe), 'tick', '--lease', str(root / 'lease.json')]
            self.assertEqual(Path(command[0]), Path(sys.executable).resolve())
            self.assertEqual(command[1:3], ['-I', '-S'])
            launcher.unlink()
            (environment / 'bin').rmdir()
            environment.rmdir()
            with self.assertRaises(FileNotFoundError):
                subprocess.run(old_program, capture_output=True, check=True, timeout=10)
            result = subprocess.run(command, capture_output=True, text=True, check=True, timeout=10)
            self.assertEqual(result.stdout.strip(), 'stdlib watchdog survived')

    def test_watchdog_program_rejects_missing_or_temporary_real_interpreters(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises((ValueError, FileNotFoundError)):
                cloud.watchdog_program(root / 'watchdog.py', root / 'lease.json', executable=root / 'missing')
            temporary = root / 'builds-v0/.tmp-failing/bin/python'
            temporary.parent.mkdir(parents=True)
            temporary.write_text('not a durable interpreter')
            temporary.chmod(0o700)
            with self.assertRaisesRegex(ValueError, 'temporary'):
                cloud.watchdog_program(root / 'watchdog.py', root / 'lease.json', executable=temporary)

    def test_watchdog_defaults_to_base_not_ephemeral_uv_sys_executable(self):
        base = str(Path(getattr(sys, '_base_executable', sys.executable)).resolve())
        with (patch.object(cloud.sys, 'executable', '/missing/uv/builds-v0/.tmp-vanished/bin/python'),
              patch.object(cloud.sys, '_base_executable', base)):
            command = cloud.watchdog_program('/private/watchdog.py', '/private/lease.json')
        self.assertEqual(command[0], base)
        self.assertEqual(command[1:3], ['-I', '-S'])

    def setup_lease(self, root):
        created = int(time.time())
        lease = dict(name='web10-fanout-f-123456abcdef', tag='web10-fanout-f-123456abcdef',
            configuration='F', region='nyc3', size='s-8vcpu-32gb-amd', max_usd=2,
            hourly_usd=.25, created_epoch=created, deadline=created + 14400,
            account_uuid='synthetic-account', droplet_id=123, cancelled=False)
        path = root / 'lease.json'
        path.write_text(json.dumps(lease))
        (root / 'host-key.pub').write_text('ssh-ed25519 synthetic-preinstalled-key\n')
        row = dict(id=123, name=lease['name'], tags=[lease['tag']], size_slug=lease['size'],
            region={'slug': lease['region']}, status='new', networks={})
        return path, row

    def test_missing_v4_is_waited_for_without_recreating_or_weakening_host_key(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path, initial = self.setup_lease(root)
            active_without_ip = {**initial, 'status': 'active', 'networks': {}}
            ready = {**initial, 'status': 'active', 'networks': {'v4': [
                {'type': 'private', 'ip_address': '10.0.0.1'}, {'type': 'public', 'ip_address': '192.0.2.1'}]}}
            with patch.object(cloud, 'api', side_effect=[[initial], [active_without_ip], [ready]]) as api, patch.object(cloud.time, 'sleep'):
                value = cloud.bind_ready_host(path)
            self.assertEqual(value['ip'], '192.0.2.1')
            self.assertEqual(api.call_count, 3)
            self.assertTrue(all(call.args == ('compute', 'droplet', 'get', '123') for call in api.call_args_list))
            self.assertEqual((root / 'known_hosts').read_text(), '192.0.2.1 ssh-ed25519 synthetic-preinstalled-key\n')
            self.assertEqual(json.loads(path.read_bytes())['deadline'], json.loads(path.read_bytes())['created_epoch'] + 14400)
            with self.assertRaisesRegex(ValueError, 'already exists'):
                cloud.bind_ready_host(path)

    def test_ownership_change_and_closed_lease_refuse_before_binding(self):
        for closed in (False, True):
            with self.subTest(closed=closed), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                path, row = self.setup_lease(root)
                if closed:
                    lease = json.loads(path.read_bytes())
                    lease['cancelled'] = True
                    path.write_text(json.dumps(lease))
                else:
                    row['name'] = 'not-our-host'
                with patch.object(cloud, 'api', return_value=[row]):
                    with self.assertRaises(ValueError):
                        cloud.bind_ready_host(path)
                self.assertFalse((root / 'host.json').exists())
                self.assertFalse((root / 'known_hosts').exists())

    def test_bounded_wait_times_out_without_creation_or_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path, row = self.setup_lease(root)
            with (patch.object(cloud, 'api', return_value=[row]) as api,
                  patch.object(cloud.time, 'monotonic', side_effect=[0, 0, 2]),
                  patch.object(cloud.time, 'sleep', Mock())):
                with self.assertRaises(TimeoutError):
                    cloud.bind_ready_host(path, seconds=1)
            api.assert_called_once_with('compute', 'droplet', 'get', '123')
            self.assertFalse((root / 'host.json').exists())

    def test_cleanup_does_not_trust_early_single_absence_and_reappearance_revokes_it(self):
        with tempfile.TemporaryDirectory() as directory:
            path, row = self.setup_lease(Path(directory))
            lease = json.loads(path.read_bytes())
            lease['created_epoch'] = 1000
            with patch.object(cloud, 'account'), patch.object(cloud, 'api', return_value=[]):
                for now in (1005, 1016):
                    with patch.object(cloud.time, 'time', return_value=now):
                        cloud.cleanup(lease)
                    self.assertFalse(lease['cleanup_verified'])
                with patch.object(cloud.time, 'time', return_value=1091):
                    cloud.cleanup(lease)
                self.assertTrue(lease['cleanup_verified'])
            with patch.object(cloud, 'account'), patch.object(cloud, 'api', side_effect=[[row], None, [row]]):
                cloud.cleanup(lease)
            self.assertFalse(lease['cleanup_verified'])
            self.assertNotIn('cleanup_absence_first_epoch', lease)

    def test_explicit_cleanup_rechecks_even_a_previously_verified_lease(self):
        with tempfile.TemporaryDirectory() as directory:
            path, _ = self.setup_lease(Path(directory))
            lease = json.loads(path.read_bytes())
            lease['cleanup_verified'] = True
            path.write_text(json.dumps(lease))
            with patch.object(cloud, 'account'), patch.object(cloud, 'cleanup') as cleanup:
                cloud.tick(path, stop=True)
            cleanup.assert_called_once()

    def test_reappearing_host_resets_settling_even_if_delete_immediately_hides_it(self):
        with tempfile.TemporaryDirectory() as directory:
            path, row = self.setup_lease(Path(directory))
            lease = json.loads(path.read_bytes())
            lease.update(created_epoch=1000, cleanup_absence_first_epoch=1100, cleanup_verified=True)
            with (patch.object(cloud, 'account'),
                  patch.object(cloud, 'api', side_effect=[[row], None, [], [], [], [], []]),
                  patch.object(cloud.time, 'time', return_value=1200)):
                cloud.cleanup(lease)
            self.assertFalse(lease['cleanup_verified'])
            self.assertEqual(lease['cleanup_absence_first_epoch'], 1200)

    def test_incomplete_list_requires_exact_id_full_ownership_before_delete(self):
        for wrong in (False, True):
            with self.subTest(wrong=wrong), tempfile.TemporaryDirectory() as directory:
                path, full = self.setup_lease(Path(directory))
                lease = json.loads(path.read_bytes())
                partial = {'id': 123, 'tags': lease['tag'], 'name': lease['name']}
                if wrong:
                    full['name'] = 'foreign'
                def api(*args):
                    if args == ('compute', 'droplet', 'get', '123'):
                        return [full]
                    if args == ('compute', 'droplet', 'list'):
                        return [partial]
                    return []
                with patch.object(cloud, 'account'), patch.object(cloud, 'api', side_effect=api) as mock:
                    if wrong:
                        with self.assertRaisesRegex(ValueError, 'exact readback'):
                            cloud.cleanup(lease)
                    else:
                        cloud.cleanup(lease)
                deletes = [call.args for call in mock.call_args_list if call.args[:3] == ('compute', 'droplet', 'delete')]
                self.assertEqual(deletes, [] if wrong else [('compute', 'droplet', 'delete', '123', '--force')])

    def test_ssh_readiness_retries_only_probe_and_preserves_pins_on_both_hops(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.setup_lease(root)
            with (patch.object(deploy.subprocess, 'run', side_effect=[
                    SimpleNamespace(returncode=255, stdout=b'', stderr=b'boot not ready'),
                    SimpleNamespace(returncode=0, stdout=b'', stderr=b'')]) as run,
                  patch.object(deploy.time, 'sleep')):
                deploy.wait_for_ssh(root, 'root@192.0.2.1', jump='operator@gateway')
            self.assertEqual(run.call_count, 2)
            for call in run.call_args_list:
                command = call.args[0]
                self.assertEqual(command[-1], 'true')
                self.assertIn('StrictHostKeyChecking=yes', command)
                proxy = next(value for value in command if value.startswith('ProxyCommand='))
                self.assertIn('StrictHostKeyChecking=yes', proxy)


if __name__ == '__main__':
    unittest.main()
