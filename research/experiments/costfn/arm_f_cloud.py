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
import re
import subprocess
import sys
import time
import traceback
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
    if lease.get('ssh_source_cidr') and addresses != [lease['ssh_source_cidr']]:
        raise ValueError('actual SSH source differs from the pinned gateway')


def cleanup(lease):
    lease['cancelled'] = True
    lease['cleanup_verified'] = False
    account(lease)
    for row in api('compute', 'droplet', 'list') or []:
        if row['id'] == lease.get('droplet_id') or lease['tag'] in row.get('tags', []):
            lease.pop('cleanup_absence_first_epoch', None)
            if not owned(row, lease):
                # LIST can briefly omit metadata during provisioning/deletion.
                # Only our exact recorded ID may get a second, full GET check;
                # every original ownership predicate must still match.
                if row['id'] != lease.get('droplet_id'):
                    raise ValueError('droplet ownership mismatch; no broad cleanup')
                exact = api('compute', 'droplet', 'get', str(row['id']))
                exact = exact[0] if isinstance(exact, list) else exact
                if not owned(exact, lease):
                    raise ValueError('droplet ownership mismatch on exact readback; no cleanup')
            api('compute', 'droplet', 'delete', str(row['id']), '--force')
    if any(row['id'] == lease.get('droplet_id') or lease['tag'] in row.get('tags', [])
           for row in api('compute', 'droplet', 'list') or []):
        lease.pop('cleanup_absence_first_epoch', None)
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
    now = time.time()
    # A very early DELETE during provisioning can briefly disappear from LIST,
    # then reappear. Never unload the independent watchdog on that single read.
    first_absent = lease.setdefault('cleanup_absence_first_epoch', now)
    if now < lease['created_epoch'] + 90 or now - first_absent < 10:
        lease['cleanup_pending'] = 'provider creation/absence settling; watchdog remains armed'
        return
    lease.pop('cleanup_pending', None)
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
            if stop or (not lease.get('cleanup_verified') and (lease.get('cancelled') or time.time() >= lease['deadline'])):
                cleanup(lease)
        except Exception as error:
            lease['watchdog_error_class'] = type(error).__name__
            # This copied watchdog remains stdlib-only. api() already replaces
            # provider errors with fixed operation metadata, never response bodies.
            lease['watchdog_error_message'] = str(error)
            lease['watchdog_error_traceback'] = ''.join(traceback.format_exception(error))
            raise
        finally:
            save(path, lease)


def watchdog_program(script, lease, *, executable=None):
    """Launch outside the caller's disposable uv/venv, using stdlib only."""
    python = Path(executable or getattr(sys, '_base_executable', None) or sys.executable).resolve(strict=True)
    if any(part in ('builds-v0', 'environments-v2') or part.startswith('.tmp') for part in python.parts):
        raise ValueError('temporary interpreter cannot own the provider cleanup watchdog')
    if not python.is_file() or not os.access(python, os.X_OK):
        raise ValueError('executable durable base Python required for cleanup watchdog')
    probe = subprocess.run([str(python), '-I', '-S', '-c',
        'import argparse,datetime,fcntl,ipaddress,json,os,pathlib,plistlib,re,shutil,subprocess,sys,time,traceback,uuid;'
        'print("F_WATCHDOG_STDLIB_READY")'], capture_output=True, timeout=10)
    if probe.returncode or probe.stdout.strip() != b'F_WATCHDOG_STDLIB_READY':
        raise ValueError('durable isolated stdlib watchdog interpreter failed preflight')
    return [str(python), '-I', '-S', str(script), 'tick', '--lease', str(lease)]


def initialize(*, state=Path('.context/fanout-run.json'), scope=None, ssh_source_cidr=None):
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
                  deadline=created + 14400, approved_by='Jacob', cancelled=False,
                  cleanup_model='agent-supervised-self-kill', guardian_required=False)
    if scope:
        lease['scope'] = scope
    if ssh_source_cidr:
        lease['ssh_source_cidr'] = ssh_source_cidr
    validate(lease)
    path = root / 'lease.json'
    save(path, lease)
    save(state, dict(root=str(root), lease=str(path), **({'scope': scope} if scope else {})))
    print(json.dumps({'state_root': str(root), 'deadline_utc': datetime.fromtimestamp(lease['deadline'], UTC).isoformat(),
                      'cleanup_model': lease['cleanup_model'], 'watchdog_loaded': False}))


def create(path):
    path = Path(path)
    root = path.parent
    with path.with_suffix('.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        lease = json.loads(path.read_bytes())
        validate(lease)
        account(lease)
        if (lease.get('cancelled') or lease.get('droplet_id') or lease.get('creation_uncertain')
                or time.time() >= lease['deadline'] - 1800):
            raise ValueError('closed/existing admission; no creation')
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
            lease['ssh_source_cidr'] = source
            save(path, lease)
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
                        # This disposable four-hour benchmark must not be
                        # restarted mid-cell by unattended OS maintenance.
                        ['systemctl', 'stop', 'apt-daily.timer', 'apt-daily-upgrade.timer'],
                        ['systemctl', 'mask', '--runtime', 'apt-daily.service', 'apt-daily-upgrade.service'],
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


def bind_ready_host(path, *, seconds=120):
    """Observe one already-created owned host; never provision, adopt or renew.

    DigitalOcean can return networks={} while a fresh droplet is provisioning.
    Wait for active + one public IPv4, then pin the preinstalled host key. An
    incomplete response is readiness evidence, not a KeyError or a new lease.
    """
    path = Path(path)
    root = path.parent
    if type(seconds) is not int or not 1 <= seconds <= 120:
        raise ValueError('bounded host-readiness wait required')
    if (root / 'host.json').exists() or (root / 'known_hosts').exists():
        raise ValueError('host binding already exists; no adoption or overwrite')
    started = time.monotonic()
    while time.monotonic() - started < seconds:
        lease = json.loads(path.read_bytes())
        validate(lease)
        if (lease.get('cancelled') or lease.get('cleanup_verified') or not lease.get('droplet_id')
                or time.time() >= lease['deadline'] - 300):
            raise ValueError('closed/unguarded host-readiness admission')
        rows = api('compute', 'droplet', 'get', str(lease['droplet_id']))
        row = rows[0] if isinstance(rows, list) else rows
        if not owned(row, lease):
            raise ValueError('host-readiness ownership mismatch')
        addresses = [value['ip_address'] for value in (row.get('networks') or {}).get('v4', [])
                     if value.get('type') == 'public' and value.get('ip_address')]
        if row.get('status') == 'active' and len(addresses) == 1:
            address = str(ipaddress.IPv4Address(addresses[0]))
            public_key = (root / 'host-key.pub').read_text().strip()
            if not public_key.startswith('ssh-ed25519 ') or '\n' in public_key:
                raise ValueError('preinstalled exact host public key required')
            fd = os.open(root / 'known_hosts', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w') as stream:
                stream.write(address + ' ' + public_key + '\n')
                stream.flush()
                os.fsync(stream.fileno())
            value = dict(id=row['id'], ip=address, bound_utc=datetime.now(UTC).isoformat())
            save(root / 'host.json', value)
            return value
        time.sleep(2)
    raise TimeoutError('owned host did not become active with one public IPv4 within bounded wait')


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
