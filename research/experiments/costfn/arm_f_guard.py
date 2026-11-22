"""Earlier container stop for each exact registered disposable trial project."""
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys


def registered(root):
    root = Path(root)
    approval = json.loads((root / 'admission.json').read_bytes())
    value = json.loads((root / 'fresh-trial.json').read_bytes())
    prefix = 'web10-costfn-frozen-satellite-f-' + str(approval['droplet_id']) + '-'
    if (root.parent.name != 'trials' or not value.get('fresh') or not value['project'].startswith(prefix)
            or not re.fullmatch(r'[a-z0-9-]+', value['project']) or approval.get('configuration') != 'F'):
        raise ValueError('exact owned registered disposable trial required')
    return approval, value['project']


def stop(root, *, api_only=False):
    _, project = registered(root)
    filters = ['--filter', 'label=com.docker.compose.project=' + project]
    if api_only:
        filters += ['--filter', 'label=com.docker.compose.service=api']
    identifiers = subprocess.check_output(['docker', 'ps', '-q', *filters]).decode().split()
    if identifiers:
        subprocess.run(['docker', 'stop', '-t', '20', *identifiers], check=True, timeout=90)


def arm(root):
    approval, project = registered(root)
    deadline = datetime.fromisoformat(approval['deadline_utc']).timestamp()
    when = datetime.fromtimestamp(deadline - 240, UTC).strftime('%Y-%m-%d %H:%M:%S UTC')
    unit = 'fanout-trial-stop-' + hashlib.sha256(project.encode()).hexdigest()[:12]
    subprocess.run(['systemd-run', '--unit=' + unit, '--on-calendar=' + when,
        sys.executable, str(Path(__file__).resolve()), '--stop-project', str(Path(root).resolve())],
        check=True, capture_output=True, timeout=30)
    subprocess.run(['systemctl', 'is-active', unit + '.timer'], check=True, capture_output=True, timeout=10)
    return {'unit': unit, 'project': project, 'stop_utc': when, 'verified': True}


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stop-project', type=Path, required=True)
    stop(parser.parse_args().stop_project)
