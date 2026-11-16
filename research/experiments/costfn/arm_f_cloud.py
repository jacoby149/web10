"""One explicitly admitted Config F lease. CLI only; no import-time side effects.

Management credentials stay in doctl on the Mac. No volume operations, broad
cleanup, automatic provisioning retries, larger SKU or lease extension.
"""
import argparse
from datetime import UTC, datetime
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import time
import uuid

DOCTL = '/opt/homebrew/bin/doctl'


def api(*args):
    result = subprocess.run([DOCTL, '--http-retry-max', '0', '--output', 'json', *args],
                            capture_output=True, timeout=100)
    if result.returncode:
        raise RuntimeError('DO operation failed: ' + ' '.join(args[:3]))
    return json.loads(result.stdout) if result.stdout.strip() else None


def save(path, value):
    path = Path(path)
    temporary = path.with_suffix('.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def validate(lease):
    if (not re.fullmatch(r'web10-fanout-f-[a-f0-9]{12}', lease.get('name', ''))
            or lease.get('tag') != lease['name'] or lease.get('configuration') != 'F'
            or lease.get('region') != 'nyc3' or lease.get('size') != 's-8vcpu-32gb-amd'
            or lease.get('max_usd') != 2 or lease.get('hourly_usd') != .25
            or lease.get('deadline', 0) - lease.get('created_epoch', 0) != 14400
            or not lease.get('account_uuid')):
        raise ValueError('exact granted Config F four-hour/$2 lease required')
    if lease.get('ssh_source_cidr'):
        source = ipaddress.ip_network(lease['ssh_source_cidr'], strict=True)
        if source.version != 4 or source.prefixlen != 32:
            raise ValueError('one pinned SSH source, never broad ingress')


def account(lease):
    rows = api('account', 'get')
    row = rows[0] if isinstance(rows, list) else rows
    if row.get('uuid') != lease['account_uuid']:
        raise ValueError('cloud account changed')


def owned(row, lease):
    return (row.get('name') == lease['name'] and lease['tag'] in row.get('tags', [])
            and row.get('size_slug', row.get('size', {}).get('slug')) == lease['size']
            and row.get('region', {}).get('slug') == lease['region']
            and (not lease.get('droplet_id') or row['id'] == lease['droplet_id']))


def firewall_verified(row, lease):
    if row.get('name') != lease['name'] or row.get('tags') != [lease['tag']]:
        raise ValueError('owned firewall identity differs')
    outbound = {rule['protocol']: rule for rule in row.get('outbound_rules', [])}
    for protocol in ('tcp', 'udp'):
        rule = outbound.get(protocol, {})
        if rule.get('ports') != '1-65535' or rule.get('destinations', {}).get('addresses') != ['0.0.0.0/0']:
            raise ValueError('firewall port range readback differs; ports:all can silently become port0')
    rules = row.get('inbound_rules', [])
    if len(rules) != 1 or rules[0].get('protocol') != 'tcp' or rules[0].get('ports') != '22':
        raise ValueError('only declared SSH ingress allowed')
    addresses = rules[0].get('sources', {}).get('addresses', [])
    if len(addresses) != 1 or not addresses[0].endswith('/32'):
        raise ValueError('one pinned operator source required')


def cleanup(lease):
    lease['cancelled'] = True
    account(lease)
    for row in api('compute', 'droplet', 'list') or []:
        if row['id'] == lease.get('droplet_id') or lease['tag'] in row.get('tags', []):
            if not owned(row, lease):
                raise ValueError('droplet ownership mismatch; no broad cleanup')
            api('compute', 'droplet', 'delete', str(row['id']), '--force')
    if any(row['id'] == lease.get('droplet_id') or lease['tag'] in row.get('tags', [])
           for row in api('compute', 'droplet', 'list') or []):
        return
    for kind, id_key in (('firewall', 'firewall_id'), ('ssh-key', 'ssh_key_id')):
        for row in api('compute', kind, 'list') or []:
            if row['id'] == lease.get(id_key) or row.get('name') == lease['name']:
                if row.get('name') != lease['name'] or (kind == 'firewall' and row.get('tags') != [lease['tag']]) or (
                        kind == 'ssh-key' and row.get('fingerprint') != lease.get('key_fingerprint')):
                    raise ValueError('auxiliary ownership mismatch')
                api('compute', kind, 'delete', str(row['id']), '--force')
        if any(row['id'] == lease.get(id_key) or row.get('name') == lease['name']
               for row in api('compute', kind, 'list') or []):
            return
    if lease.get('creation_uncertain'):
        lease['cleanup_pending'] = 'uncertain creation: watchdog remains armed'
        return
    lease.update(cleanup_verified=True, cleanup_epoch=time.time())


def tick(path, stop=False):
    path = Path(path)
    with path.with_suffix('.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        lease = json.loads(path.read_bytes())
        validate(lease)
        try:
            account(lease)
            lease.update(watchdog_seen_epoch=time.time(), watchdog_api_verified=True)
            if not lease.get('cleanup_verified') and (stop or lease.get('cancelled') or time.time() >= lease['deadline']):
                cleanup(lease)
        except Exception as error:
            lease['watchdog_error_class'] = type(error).__name__
            raise
        finally:
            save(path, lease)


def initialize(*, state=Path('.context/fanout-run.json'), scope=None):
    state = Path(state)
    if scope not in (None, 'F_DEPLOY_REHEARSAL', 'F_GATES_ONLY'):
        raise ValueError('unknown F admission scope')
    if state.exists():
        raise FileExistsError('existing F run; no adoption/extension')
    rows = api('account', 'get')
    account_row = rows[0] if isinstance(rows, list) else rows
    shape = next(row for row in api('compute', 'size', 'list') if row['slug'] == 's-8vcpu-32gb-amd')
    if (shape['memory'] != 32768 or shape['vcpus'] != 8 or shape['disk'] < 400
            or shape['price_hourly'] != .25 or not shape['available'] or 'nyc3' not in shape['regions']):
        raise ValueError('approved exact SKU unavailable; no replacement')
    if api('compute', 'droplet', 'list'):
        raise ValueError('another host exists; isolation preflight required')
    name = 'web10-fanout-f-' + uuid.uuid4().hex[:12]
    root = Path.home() / '.local/state/web10-research' / name
    root.mkdir(mode=0o700)
    created = int(time.time())
    lease = dict(name=name, tag=name, configuration='F', size=shape['slug'], region='nyc3',
                 account_uuid=account_row['uuid'], max_usd=2, hourly_usd=.25, created_epoch=created,
                  deadline=created + 14400, approved_by='Jacob', cancelled=False)
    if scope:
        lease['scope'] = scope
    path = root / 'lease.json'
    save(path, lease)
    shutil.copyfile(__file__, root / 'watchdog.py')
    label = 'app.web10.fanout.' + name.rsplit('-', 1)[1]
    plist = Path.home() / 'Library/LaunchAgents' / (label + '.plist')
    with plist.open('wb') as stream:
        plistlib.dump(dict(Label=label, ProgramArguments=[sys.executable, str(root / 'watchdog.py'),
            'tick', '--lease', str(path)], RunAtLoad=True, StartInterval=30,
            StandardOutPath=str(root / 'watchdog.out'), StandardErrorPath=str(root / 'watchdog.err')), stream)
    subprocess.run(['launchctl', 'bootstrap', 'gui/' + str(os.getuid()), str(plist)], check=True, capture_output=True)
    tick(path)
    subprocess.run(['launchctl', 'print', 'gui/' + str(os.getuid()) + '/' + label], check=True, capture_output=True)
    save(state, dict(root=str(root), lease=str(path), label=label, **({'scope': scope} if scope else {})))
    print(json.dumps({'state_root': str(root), 'deadline_utc': datetime.fromtimestamp(lease['deadline'], UTC).isoformat(),
                      'watchdog_loaded': True}))


def create(path):
    path = Path(path)
    root = path.parent
    with path.with_suffix('.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        lease = json.loads(path.read_bytes())
        validate(lease)
        account(lease)
        if (lease.get('cancelled') or lease.get('droplet_id') or lease.get('creation_uncertain')
                or not lease.get('watchdog_api_verified') or time.time() - lease.get('watchdog_seen_epoch', 0) > 90
                or time.time() >= lease['deadline'] - 1800):
            raise ValueError('closed/existing/unguarded admission; no creation')
        if api('compute', 'droplet', 'list'):
            raise ValueError('another host exists')
        for name in ('client-key', 'host-key'):
            subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(root / name)], check=True, capture_output=True)
        public = (root / 'client-key.pub').read_text().strip()
        row = api('compute', 'ssh-key', 'create', lease['name'], '--public-key', public)
        row = row[0] if isinstance(row, list) else row
        lease.update(ssh_key_id=row['id'], key_fingerprint=row['fingerprint'])
        save(path, lease)
        source = lease.get('ssh_source_cidr')
        if not source:
            address = json.loads(subprocess.check_output(['curl', '-fsS', '--max-time', '10', 'https://api.ipify.org?format=json']))['ip']
            source = str(ipaddress.IPv4Address(address)) + '/32'
        api('compute', 'tag', 'create', lease['tag'])
        row = api('compute', 'firewall', 'create', '--name', lease['name'], '--tag-names', lease['tag'],
            '--inbound-rules', 'protocol:tcp,ports:22,address:' + source,
            '--outbound-rules', 'protocol:tcp,ports:1-65535,address:0.0.0.0/0 protocol:udp,ports:1-65535,address:0.0.0.0/0 protocol:icmp,address:0.0.0.0/0')
        row = row[0] if isinstance(row, list) else row
        lease['firewall_id'] = row['id']
        save(path, lease)
        checked = api('compute', 'firewall', 'get', str(row['id']))
        firewall_verified(checked[0] if isinstance(checked, list) else checked, lease)
        halt = datetime.fromtimestamp(lease['deadline'] - 120, UTC).strftime('%Y-%m-%d %H:%M:%S UTC')
        cloud = {'ssh_deletekeys': False, 'ssh_genkeytypes': [], 'ssh_pwauth': False, 'disable_root': False,
            'ssh_keys': {'ed25519_private': (root / 'host-key').read_text(),
                         'ed25519_public': (root / 'host-key.pub').read_text().strip()},
            'users': [{'name': 'root', 'lock_passwd': True, 'ssh_authorized_keys': [public]}],
            'packages': ['docker.io', 'docker-compose-v2', 'python3-venv', 'git'],
            'runcmd': [['systemctl', 'enable', '--now', 'docker'],
                       ['systemd-run', '--unit=fanout-hard-stop', '--on-calendar=' + halt, '/sbin/poweroff']]}
        cloud_path = root / 'cloud-init.yaml'
        cloud_path.write_text('#cloud-config\n' + json.dumps(cloud))
        os.chmod(cloud_path, 0o600)
        lease['creation_uncertain'] = True
        save(path, lease)
        row = api('compute', 'droplet', 'create', lease['name'], '--region', lease['region'], '--size', lease['size'],
                  '--image', 'ubuntu-24-04-x64', '--ssh-keys', str(lease['ssh_key_id']), '--tag-names', lease['tag'],
                  '--user-data-file', str(cloud_path))
        row = row[0] if isinstance(row, list) else row
        lease.update(droplet_id=row['id'], creation_uncertain=False)
        save(path, lease)
        print(json.dumps({'droplet_id': row['id'], 'deadline_utc': datetime.fromtimestamp(lease['deadline'], UTC).isoformat()}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['init', 'create', 'tick', 'stop'])
    parser.add_argument('--lease', type=Path)
    args = parser.parse_args()
    if args.action == 'init':
        initialize()
    elif args.action == 'create':
        create(args.lease)
    else:
        tick(args.lease, args.action == 'stop')
