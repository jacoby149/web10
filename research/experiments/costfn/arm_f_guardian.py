"""Absolute self-cleanup for the dedicated, cleanup-only research controller."""
import json
from pathlib import Path
import sys
import time
import urllib.request

if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).resolve().parent))
import arm_f_cloud as cloud


def validate(lease):
    import re
    if (not re.fullmatch(r'web10-f-guardian-[a-f0-9]{12}', lease.get('name', ''))
            or lease.get('tag') != lease['name'] or lease.get('size') != 's-1vcpu-1gb'
            or lease.get('region') != 'nyc3' or lease.get('deadline', 0) - lease.get('created_epoch', 0) != 21600
            or lease.get('hourly_usd') != .00893 or lease.get('max_usd') != .10
            or not lease.get('account_uuid')):
        raise ValueError('exact separately bounded guardian lease required')


def identity(lease, identifier):
    validate(lease)
    rows = cloud.api('compute', 'droplet', 'get', str(identifier))
    row = rows[0] if isinstance(rows, list) else rows
    if not (row.get('id') == identifier and row.get('name') == lease['name']
            and lease['tag'] in row.get('tags', []) and row.get('size_slug') == lease['size']
            and row.get('region', {}).get('slug') == lease['region']):
        raise ValueError('controller self-cleanup ownership differs')


def finish(lease, identifier, *, stop=False):
    validate(lease)
    if not stop and time.time() < lease['deadline'] - 300:
        raise ValueError('controller self-cleanup cannot run before its absolute deadline')
    cloud.account(lease)
    identity(lease, identifier)
    for kind, key in (('ssh-key', 'ssh_key_id'), ('firewall', 'firewall_id')):
        try:
            for item in cloud.api('compute', kind, 'list') or []:
                if item['id'] == lease[key]:
                    if item.get('name') != lease['name'] or (kind == 'firewall' and item.get('tags') != [lease['tag']]) or (
                            kind == 'ssh-key' and item.get('fingerprint') != lease['key_fingerprint']):
                        raise ValueError('controller auxiliary ownership differs')
                    cloud.api('compute', kind, 'delete', str(item['id']), '--force')
        except Exception as error:
            # Nonbillable auxiliary failures never hold the owned billable host
            # hostage. Never delete a mismatched auxiliary to "fix" this.
            print('[guardian] auxiliary cleanup deferred', kind, type(error).__name__, flush=True)
    # Destroy this caller last; its receipts must already be off-controller.
    cloud.api('compute', 'droplet', 'delete', str(identifier), '--force')


if __name__ == '__main__':
    root = Path('/opt/web10-guardian')
    cloud.DOCTL, cloud.API_TIMEOUT = '/opt/web10-guardian/code/arm_f_provider.py', 20
    with urllib.request.urlopen('http://169.254.169.254/metadata/v1/id', timeout=3) as response:
        identifier = int(response.read(32))
    finish(json.loads((root / 'controller-lease.json').read_bytes()), identifier)
