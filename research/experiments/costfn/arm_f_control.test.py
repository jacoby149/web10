"""Offline controls for cleanup-only OAuth and independent receipt retention."""
from datetime import UTC, datetime, timedelta
import hashlib
import io
import json
import runpy
import sys
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

import arm_f_cloud as cloud
import arm_f_guardian as guardian
import arm_f_provider as provider
import arm_f_sink as sink

PREFIX = ['--http-retry-max', '0', '--output', 'json']


class ControlTests(unittest.TestCase):
    def test_transport_denies_create_volumes_and_arbitrary_routes_before_credentials(self):
        for args in (['compute', 'droplet', 'create', 'x'], ['compute', 'volume', 'list'],
                ['compute', 'droplet', 'delete', '../123', '--force'], ['auth', 'token']):
            with self.subTest(args=args), patch.object(provider.Path, 'read_bytes') as read:
                with self.assertRaises(ValueError):
                    provider.invoke(PREFIX + args)
                read.assert_not_called()
        self.assertEqual(provider.route(PREFIX + ['compute', 'droplet', 'delete', '123', '--force']),
            ('DELETE', '/v2/droplets/123', None))

    def test_refresh_rotates_only_the_private_cleanup_context_and_keeps_scope_ceiling(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'auth.json'
            auth = dict(scope='account:read droplet:delete', access_token='old', refresh_token='private-old',
                client_id='synthetic', token_endpoint='https://cloud.digitalocean.com/v1/oauth/token',
                expires_at=(datetime.now(UTC) - timedelta(seconds=1)).isoformat())
            path.write_text(json.dumps(auth))
            with patch.object(provider, 'request', side_effect=[dict(access_token='new', refresh_token='private-new',
                    expires_in=3600, scope=auth['scope']), {'account': {'uuid': 'synthetic'}}]) as request:
                self.assertEqual(provider.invoke(PREFIX + ['account', 'get'], path), {'uuid': 'synthetic'})
            self.assertEqual(request.call_args.kwargs['token'], 'new')
            self.assertEqual(json.loads(path.read_bytes())['refresh_token'], 'private-new')
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            auth['scope'] = 'api:write'
            path.write_text(json.dumps(auth))
            with patch.object(provider, 'request') as request, self.assertRaises(ValueError):
                provider.invoke(PREFIX + ['account', 'get'], path)
            request.assert_not_called()

    def test_private_sink_requires_exact_host_scheme_and_same_key(self):
        for url in ('http://minio.web10.app/web10-media/research/costfn/guardian/x?a=b',
                'https://evil.example/web10-media/research/costfn/guardian/x?a=b',
                'https://minio.web10.app/other/x?a=b'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                sink.endpoint(url)

    def test_sink_ack_requires_actual_independent_bytes_and_hash_readback(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'receipt'
            path.write_bytes(b'private synthetic receipt')
            url = 'https://minio.web10.app/web10-media/research/costfn/guardian/synthetic/0?a=b'
            slot = dict(put=url, get=url)
            for body, passes in ((path.read_bytes(), True), (b'corrupt', False)):
                put, get = Mock(), Mock()
                put.getresponse.return_value.status = 200
                get.getresponse.return_value.status = 200
                get.getresponse.return_value.read.side_effect = io.BytesIO(body).read
                with patch.object(sink.http.client, 'HTTPSConnection', side_effect=[put, get]):
                    if passes:
                        result = sink.publish(path, slot)
                        self.assertEqual(result['sha256'], hashlib.sha256(body).hexdigest())
                        self.assertTrue(result['independently_read_back'])
                        self.assertEqual(put.request.call_args.kwargs['headers']['If-None-Match'], '*')
                    else:
                        with self.assertRaises(RuntimeError):
                            sink.publish(path, slot)

    def test_guardian_self_deletion_requires_absolute_deadline_and_exact_ownership(self):
        name = 'web10-f-guardian-123456abcdef'
        lease = dict(name=name, tag=name, size='s-1vcpu-1gb', region='nyc3', created_epoch=time.time(),
            deadline=time.time(), hourly_usd=.00893, max_usd=.10, account_uuid='synthetic')
        lease['deadline'] = lease['created_epoch'] + 21600
        with patch.object(cloud, 'api') as api, self.assertRaises(ValueError):
            guardian.finish(lease, 123)
        api.assert_not_called()
        row = dict(id=123, name='foreign', tags=[name], size_slug=lease['size'], region={'slug': 'nyc3'})
        with (patch.object(guardian.time, 'time', return_value=lease['deadline'] + 1),
              patch.object(cloud, 'account'), patch.object(cloud, 'api', return_value=[row]) as api,
              self.assertRaises(ValueError)):
            guardian.finish(lease, 123)
        self.assertFalse(any(call.args[2] == 'delete' for call in api.call_args_list))

    def test_each_auxiliary_failure_still_attempts_exact_owned_self_deletion(self):
        name='web10-f-guardian-123456abcdef'
        now=int(time.time())
        lease=dict(name=name,tag=name,size='s-1vcpu-1gb',region='nyc3',created_epoch=now-21600,
            deadline=now,hourly_usd=.00893,max_usd=.10,account_uuid='synthetic',
            ssh_key_id=456,firewall_id='12345678-1234-1234-1234-123456789abc',key_fingerprint='synthetic')
        row=dict(id=123,name=name,tags=[name],size_slug=lease['size'],region={'slug':'nyc3'})
        for failed_kind in ('ssh-key','firewall'):
            for failed_action in ('list','delete'):
                def api(*args):
                    if args[:3]==('compute','droplet','get'):
                        return [row]
                    if args[:3]==('compute',failed_kind,failed_action):
                        raise RuntimeError('synthetic auxiliary failure')
                    if args[2]=='list':
                        return [dict(id=lease['ssh_key_id' if args[1]=='ssh-key' else 'firewall_id'],name=name,
                            fingerprint='synthetic',tags=[name])]
                    return None
                with self.subTest(kind=failed_kind,action=failed_action), patch.object(cloud,'account'), patch.object(cloud,'api',side_effect=api) as mocked:
                    guardian.finish(lease,123)
                self.assertIn((('compute','droplet','delete','123','--force'),),[(c.args,) for c in mocked.call_args_list])

    def test_generated_bootstrap_expiry_does_not_depend_on_main_archive_extraction(self):
        # Exercise generated bootstrap wiring in CI, never by provisioning.
        script=Path(__file__).with_name('arm_f_guardian_setup.py')
        with patch.dict(sys.modules,{'yaml':Mock()}):
            module=runpy.run_path(str(script),run_name='guardian_bootstrap_control')
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory)
            (home/'Library/LaunchAgents').mkdir(parents=True)
            root=home/'private'
            root.mkdir(mode=0o700)
            for filename in ('client-key.pub','host-key.pub','host-key','cleanup-auth.json'):
                (root/filename).write_text('synthetic-private-fixture')
            state=home/'state.json'
            state.write_text(json.dumps(dict(root=str(root),name='web10-f-guardian-123456abcdef',phase='prepared',
                ssh_source_cidr='192.0.2.1/32',account_uuid='synthetic',sink_expires_epoch=time.time()+28800)))
            module['create'].__globals__['STATE']=state
            def api(*args):
                if args[:3]==('compute','droplet','list'):
                    return []
                if args[:3]==('compute','size','list'):
                    return [dict(slug='s-1vcpu-1gb',price_hourly=.00893,available=True,regions=['nyc3'])]
                if args[:3]==('compute','ssh-key','create'):
                    return dict(id=456,fingerprint='synthetic')
                if args[:3]==('compute','firewall','create'):
                    return dict(id='12345678-1234-1234-1234-123456789abc')
                if args[:3]==('compute','droplet','create'):
                    return dict(id=123)
                return None
            with (patch.object(Path,'home',return_value=home),patch.object(cloud,'api',side_effect=api),
                  patch.object(cloud,'firewall_verified'),patch.object(cloud,'watchdog_program',return_value=['synthetic-python']),
                  patch.object(module['subprocess'],'run')):
                module['create']()
            generated=json.loads((root/'cloud-init.yaml').read_text().split('\n',1)[1])
            files={row['path']:row for row in generated['write_files']}
            for name in ('arm_f_provider.py','arm_f_cloud.py','arm_f_guardian.py'):
                self.assertIn('/opt/web10-guardian/expiry/'+name,files)
            steps=generated['runcmd']
            enabled=next(i for i,s in enumerate(steps) if 'web10-guardian-expire.timer' in s)
            unpacked=next(i for i,s in enumerate(steps) if any('extractall' in token for token in s))
            self.assertLess(enabled,unpacked)


if __name__ == '__main__':
    unittest.main()
