"""No-network safety controls; real archives, child processes and crash recovery."""
from datetime import UTC, datetime
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

import arm_f_checkpoint as checkpoint
import arm_f_cloud as cloud
import arm_f_safety as safety


def lease():
    now = int(time.time())
    name = 'web10-fanout-f-123456abcdef'
    return dict(name=name, tag=name, configuration='F', region='nyc3',
        size='s-8vcpu-32gb-amd', max_usd=2, hourly_usd=.25,
        created_epoch=now, deadline=now + 14400, account_uuid='synthetic', cancelled=False,
        ssh_source_cidr='192.0.2.2/32')


class Checkpoints(unittest.TestCase):
    def fixture(self, root):
        value = lease()
        value['droplet_id'] = 123
        deadline = datetime.fromtimestamp(value['deadline'], UTC).isoformat()
        (root / 'admission.json').write_text(json.dumps(dict(droplet_id=123, deadline_utc=deadline)))
        (root / 'source-manifest.json').write_text(json.dumps({'source.py': 'synthetic-source'}))
        (root / 'F-gates/T4').mkdir(parents=True)
        (root / 'F-gates/T4/result.json').write_text('{"outcome":"STOP","failure_class":"SyntheticFailure"}')
        (root / 'input').mkdir()
        (root / 'input/manifest.json').write_text('{"password":"must-not-export"}')
        (root / 'archive-urls.json').write_text('{"capability":"must-not-export"}')
        (root / 'trials/write/input').mkdir(parents=True)
        (root / 'trials/write/input/data.json').write_text('not a receipt')
        (root / 'F-gates/T4/operation.json').write_text('not an exportable admission')
        return value, dict(droplet_id=123, deadline_utc=deadline, source_manifest={'source.py': 'synthetic-source'})

    def test_bound_private_archive_round_trip_excludes_inputs_keys_capabilities(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, expected = self.fixture(root)
            output = io.BytesIO()
            checkpoint.snapshot(root, output)
            archive = root / 'checkpoint.tar.gz'
            archive.write_bytes(output.getvalue())
            value = checkpoint.verify(archive, **expected)
            self.assertEqual(set(value['files']), {'F-gates/T4/result.json', 'source-manifest.json'})
            self.assertTrue(value['not_a_gate_verdict'])
            for key, changed in (('droplet_id', 456), ('deadline_utc', 'changed'), ('source_manifest', {})):
                with self.subTest(key=key), self.assertRaises(ValueError):
                    checkpoint.verify(archive, **{**expected, key: changed})

    def test_symlink_to_private_file_is_not_exported_or_followed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            (root / 'F-gates/T4/stolen.json').symlink_to(root / 'archive-urls.json')
            output = io.BytesIO()
            with self.assertRaises(OSError):
                checkpoint.snapshot(root, output)
            self.assertEqual(output.getvalue(), b'')

    def test_oversized_checkpoint_refuses_before_emitting_partial_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            output = io.BytesIO()
            with patch.object(checkpoint, 'MAX_BYTES', 5), self.assertRaises(ValueError):
                checkpoint.snapshot(root, output)
            self.assertEqual(output.getvalue(), b'')

    def test_parent_directory_swap_cannot_escape_the_pinned_directory_descriptor(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, expected = self.fixture(root)
            outside = root / 'private'
            outside.mkdir()
            (outside / 'result.json').write_text('PRIVATE OUTSIDE ROOT')
            original_open = os.open
            swapped = False

            def swap(path, flags, *args, **kwargs):
                nonlocal swapped
                if path == 'result.json' and 'dir_fd' in kwargs and not swapped:
                    (root / 'F-gates/T4').rename(root / 'original-T4')
                    (root / 'F-gates/T4').symlink_to(outside, target_is_directory=True)
                    swapped = True
                return original_open(path, flags, *args, **kwargs)

            output = io.BytesIO()
            with patch.object(checkpoint.os, 'open', side_effect=swap):
                checkpoint.snapshot(root, output)
            archive = root / 'pinned.tar.gz'
            archive.write_bytes(output.getvalue())
            self.assertTrue(swapped)
            checkpoint.verify(archive, **expected)
            with tarfile.open(archive) as data:
                self.assertNotIn(b'PRIVATE OUTSIDE ROOT', data.extractfile('F-gates/T4/result.json').read())

    def test_compressed_header_count_is_bounded_during_iteration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, expected = self.fixture(root)
            path = root / 'headers.tar.gz'
            with tarfile.open(path, 'w:gz') as data:
                for number in range(8):
                    info = tarfile.TarInfo(f'F-gates/{number}.json')
                    data.addfile(info, io.BytesIO())
            with patch.object(checkpoint, 'MAX_FILES', 3), self.assertRaisesRegex(ValueError, 'bounded'):
                checkpoint.verify(path, **expected)

    def test_tampered_bytes_duplicate_members_and_traversal_are_denied(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, expected = self.fixture(root)
            for names in (['../escape.json'], ['checkpoint.json', 'checkpoint.json']):
                path = root / 'bad.tar.gz'
                with tarfile.open(path, 'w:gz') as data:
                    for name in names:
                        value = b'{}'
                        info = tarfile.TarInfo(name)
                        info.size = len(value)
                        data.addfile(info, io.BytesIO(value))
                with self.assertRaises((ValueError, KeyError)):
                    checkpoint.verify(path, **expected)
            output = io.BytesIO()
            checkpoint.snapshot(root, output)
            with tarfile.open(fileobj=io.BytesIO(output.getvalue())) as original, tarfile.open(root / 'changed.tar.gz', 'w:gz') as changed:
                for member in original.getmembers():
                    raw = original.extractfile(member).read()
                    if member.name.endswith('result.json'):
                        raw = b'X' * len(raw)
                    changed.addfile(member, io.BytesIO(raw))
            with self.assertRaisesRegex(ValueError, 'digest'):
                checkpoint.verify(root / 'changed.tar.gz', **expected)


class Guardian(unittest.TestCase):
    def test_paid_initialization_refuses_missing_guardian_before_provider_actions(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(cloud, 'api') as api:
            with self.assertRaises(FileNotFoundError):
                cloud.initialize(state=Path(directory) / 'run.json', guardian_config=Path(directory) / 'missing.json')
            api.assert_not_called()

    def test_a_heartbeat_file_without_a_live_process_is_not_guardian_proof(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cloud.save(root / 'guardian.json', dict(heartbeat_epoch=time.time(), sources=safety.hashes()))
            with self.assertRaisesRegex(ValueError, 'not running'):
                safety.status(root)

    def test_live_process_lock_disappears_on_kill_even_with_a_fresh_heartbeat(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cloud.save(root / 'guardian.json', dict(heartbeat_epoch=time.time(), sources=safety.hashes()))
            program = ('import fcntl,pathlib,sys,time;'
                'f=pathlib.Path(sys.argv[1]).open("a");fcntl.flock(f,fcntl.LOCK_EX);'
                'print("LOCKED",flush=True);time.sleep(30)')
            process = subprocess.Popen([sys.executable, '-I', '-S', '-c', program, str(root / 'supervisor.lock')], stdout=subprocess.PIPE)
            try:
                self.assertEqual(process.stdout.readline(), b'LOCKED\n')
                self.assertEqual(safety.status(root)['sources'], safety.hashes())
            finally:
                process.kill()
                process.wait(timeout=5)
                process.stdout.close()
            with self.assertRaisesRegex(ValueError, 'not running'):
                safety.status(root)

    def test_registration_resource_binding_and_deadline_cannot_be_rewritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            current = lease()
            live = dict(account_uuid='synthetic', ssh_source_cidr=current['ssh_source_cidr'], heartbeat_epoch=time.time())
            with patch.object(safety, 'status', return_value=live), patch.object(cloud, 'account'):
                safety.rpc(root, 'register', {'lease': current})
                updated = {**current, 'droplet_id': 123}
                safety.rpc(root, 'sync', {'lease': updated})
                original = (root / current['name'] / 'lease.json').read_bytes()
                for change in ({'deadline': current['deadline'] + 1}, {'droplet_id': 456}, {'max_usd': 20},
                        {'cleanup_verified': True}, {'cancelled': True}):
                    with self.subTest(change=change), self.assertRaises(ValueError):
                        safety.rpc(root, 'sync', {'lease': {**updated, **change}})
                    self.assertEqual((root / current['name'] / 'lease.json').read_bytes(), original)
                saved = json.loads((root / current['name'] / 'lease.json').read_bytes())
                saved['cancelled'] = True
                cloud.save(root / current['name'] / 'lease.json', saved)
                with self.assertRaisesRegex(ValueError, 'closed'):
                    safety.rpc(root, 'sync', {'lease': updated})

    def test_wrong_collection_egress_refuses_before_registering_a_run(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            live = dict(account_uuid='synthetic', ssh_source_cidr='192.0.2.99/32', heartbeat_epoch=time.time())
            with patch.object(safety, 'status', return_value=live), patch.object(cloud, 'account') as account:
                with self.assertRaisesRegex(ValueError, 'ingress'):
                    safety.rpc(root, 'register', {'lease': lease()})
            account.assert_not_called()
            self.assertFalse(list(root.glob('web10-fanout-*')))

    def test_source_replacement_cannot_change_the_imported_supervisor_identity(self):
        imported = dict(safety.STARTUP_SOURCES)
        with patch.object(safety, 'hashes', return_value={'changed.py': 'new'}):
            self.assertEqual(safety.STARTUP_SOURCES, imported)

    def test_bad_earlier_lease_does_not_starve_a_later_due_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bad = root / 'web10-fanout-f-000000000000'
            bad.mkdir(mode=0o700)
            (bad / 'lease.json').write_text('not JSON')
            current = lease()
            current['created_epoch'] -= 14400
            current['deadline'] -= 14400
            good = root / current['name']
            good.mkdir(mode=0o700)
            cloud.save(good / 'lease.json', current)
            with patch.object(cloud, 'tick') as tick:
                safety.cycle(root)
            tick.assert_called_once_with(good / 'lease.json', stop=True)
            self.assertTrue((bad / 'supervision-error.json').exists())

    def test_archive_verification_wall_timeout_is_bounded(self):
        with patch.object(safety.subprocess, 'run', side_effect=subprocess.TimeoutExpired('verify', 10)) as run:
            with self.assertRaises(subprocess.TimeoutExpired):
                safety.verify_archive('/private/archive', {})
        self.assertEqual(run.call_args.kwargs['timeout'], 10)
        self.assertIsNotNone(run.call_args.kwargs['preexec_fn'])

    def test_full_disk_and_failed_diagnostics_never_starve_due_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            targets = []
            for suffix in ('000000000001', '000000000002'):
                current = lease()
                current['name'] = current['tag'] = 'web10-fanout-f-' + suffix
                current['created_epoch'] -= 14400
                current['deadline'] -= 14400
                target = root / current['name']
                target.mkdir(mode=0o700)
                cloud.save(target / 'lease.json', current)
                cloud.save(target / 'transport.json', {})
                targets.append(target)
            with (patch.object(safety, 'collect', side_effect=OSError('disk full')),
                  patch.object(cloud, 'save', side_effect=OSError('diagnostics full')),
                  patch.object(cloud, 'tick', side_effect=[RuntimeError('first provider failure'), None]) as tick):
                errors = safety.cycle(root)
            self.assertEqual([call.args[0] for call in tick.call_args_list], [t / 'lease.json' for t in targets])
            self.assertEqual(errors, [targets[0].name])

    def test_aggregate_archive_budget_refuses_without_evicting_old_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            with patch.object(safety, 'ARCHIVE_BUDGET', 1), patch.object(safety.subprocess, 'run') as run:
                with self.assertRaisesRegex(OSError, 'archive budget'):
                    safety.collect(target, lease())
            run.assert_not_called()

    def test_registration_fsyncs_the_parent_before_acknowledgement_and_lock_contention_fails_fast(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            current = lease()
            live = dict(account_uuid='synthetic', ssh_source_cidr=current['ssh_source_cidr'], heartbeat_epoch=time.time())
            with (patch.object(safety, 'status', return_value=live), patch.object(cloud, 'account'),
                  patch.object(safety, 'fsync_directory') as fsync):
                safety.rpc(root, 'register', {'lease': current})
                fsync.assert_called_once_with(root.resolve())
                with safety.locked(root), self.assertRaises(BlockingIOError):
                    safety.rpc(root, 'check', {'lease': current})

    def test_slow_successful_initial_checkpoint_returns_rechecked_live_proof(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            current = lease()
            live = dict(account_uuid='synthetic', ssh_source_cidr=current['ssh_source_cidr'], heartbeat_epoch=time.time())
            with patch.object(safety, 'status', return_value=live), patch.object(cloud, 'account'):
                safety.rpc(root, 'register', {'lease': current})
            current['droplet_id'] = 123
            clock = live['heartbeat_epoch']
            def account(*args):
                nonlocal clock
                clock += 20
            def collect(*args):
                nonlocal clock
                clock += 30  # Maximum SSH20 + verification10, not the old120.
            transport = dict(droplet_id=123, ip='192.0.2.1', source_manifest={'source': 'hash'},
                host_public_key='ssh-ed25519 synthetic', client_key='synthetic-disposable-key')
            with (patch.object(safety, 'status', return_value=live) as status,
                  patch.object(cloud, 'account', side_effect=account), patch.object(safety, 'collect', side_effect=collect),
                  patch.object(safety.time, 'time', side_effect=lambda: clock)):
                result = safety.rpc(root, 'sync', {'lease': current, 'transport': transport})
            self.assertEqual(status.call_count, 2)
            self.assertLess(clock - result['heartbeat_epoch'], 90)

    def test_checkpoint_failure_never_prevents_deadline_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            current = lease()
            current['created_epoch'] -= 14400
            current['deadline'] -= 14400
            target = root / current['name']
            target.mkdir(mode=0o700)
            cloud.save(target / 'lease.json', current)
            cloud.save(target / 'transport.json', {})
            with patch.object(safety, 'collect', side_effect=TimeoutError), patch.object(cloud, 'tick') as tick:
                safety.cycle(root)
            tick.assert_called_once_with(target / 'lease.json', stop=True)
            self.assertEqual(json.loads((target / 'collection-error.json').read_bytes())['failure_class'], 'TimeoutError')

    def test_stale_export_stops_work_before_original_deadline_without_extending_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            current = lease()
            current['created_epoch'] -= 601
            current['deadline'] -= 601
            target = root / current['name']
            target.mkdir(mode=0o700)
            cloud.save(target / 'lease.json', current)
            cloud.save(target / 'transport.json', {})
            with patch.object(safety, 'collect', side_effect=RuntimeError), patch.object(cloud, 'tick') as tick:
                safety.cycle(root)
            tick.assert_called_once_with(target / 'lease.json', stop=True)
            self.assertEqual(json.loads((target / 'lease.json').read_bytes())['deadline'], current['deadline'])

    def test_controller_interruption_leaves_verified_private_archive_recoverable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source'
            source.mkdir()
            current, expected = Checkpoints().fixture(source)
            raw = io.BytesIO()
            checkpoint.snapshot(source, raw)
            fixture = root / 'fixture.tar.gz'
            fixture.write_bytes(raw.getvalue())
            target = root / 'controller'
            target.mkdir(mode=0o700)
            cloud.save(target / 'transport.json', dict(ip='192.0.2.1',
                source_manifest={'research/experiments/costfn/arm_f_checkpoint.py': 'synthetic'}))
            # A real SSH child substitute emits an actual archive; no network,
            # provider, SQL or engine. Kill the separate collecting controller
            # after fsync, then read back its immutable archive from this process.
            child = '''import json,pathlib,subprocess,sys,time
from unittest.mock import patch
sys.path.insert(0,sys.argv[1])
import arm_f_safety as safety
real = subprocess.run
def emit(*args, **kwargs):
    if args[0][0] != 'ssh':
        return real(*args, **kwargs)
    return real([sys.executable, '-c',
        'import pathlib,sys;sys.stdout.buffer.write(pathlib.Path(sys.argv[1]).read_bytes())', sys.argv[3]], **kwargs)
with patch.object(safety.subprocess, 'run', side_effect=emit):
    safety.collect(pathlib.Path(sys.argv[2]), json.loads(sys.argv[4]))
print('EXPORTED', flush=True)
time.sleep(30)
'''
            transport = json.loads((target / 'transport.json').read_bytes())
            transport['source_manifest'] = expected['source_manifest']
            transport['source_manifest']['research/experiments/costfn/arm_f_checkpoint.py'] = 'synthetic'
            # The actual sink verifier still runs in the child; match the bound
            # source manifest in the fixture rather than mocking verification.
            (source / 'source-manifest.json').write_text(json.dumps(transport['source_manifest']))
            raw = io.BytesIO()
            checkpoint.snapshot(source, raw)
            fixture.write_bytes(raw.getvalue())
            cloud.save(target / 'transport.json', transport)
            process = subprocess.Popen([sys.executable, '-c', child, str(Path(__file__).parent),
                str(target), str(fixture), json.dumps(current)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                line = process.stdout.readline()
                if line != b'EXPORTED\n':
                    self.fail(process.stderr.read().decode())
            finally:
                process.kill()
                process.wait(timeout=5)
                process.stdout.close()
                process.stderr.close()
            receipt = json.loads((target / 'checkpoint-receipt.json').read_bytes())
            archive = target / 'checkpoints' / receipt['archive']
            self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), receipt['sha256'])
            self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
            self.assertTrue(checkpoint.verify(archive, **expected)['not_a_gate_verdict'])


if __name__ == '__main__':
    unittest.main()
