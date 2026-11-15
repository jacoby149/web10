"""Ship the verified source/private archive read capabilities to the admitted host.

No provisioning and no management/S3 credential transfer. The independent Mac
watchdog is already armed; host/container timers are verified before engine work.
"""
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import tarfile
import time

import arm_f_cloud as cloud
import arm_t


def deploy():
    state = json.loads(Path('.context/fanout-run.json').read_bytes())
    private = Path(state['root'])
    lease = json.loads(Path(state['lease']).read_bytes())
    cloud.validate(lease)
    cloud.tick(state['lease'])
    lease = json.loads(Path(state['lease']).read_bytes())
    host = json.loads((private / 'host.json').read_bytes())
    if lease.get('cancelled') or lease['droplet_id'] != host['id'] or time.time() > lease['deadline'] - 1800:
        raise ValueError('closed or mismatched guarded host')
    options = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=yes',
               '-o', 'UserKnownHostsFile=' + str(private / 'known_hosts'), '-i', str(private / 'client-key')]
    destination = 'root@' + host['ip']

    def ssh(command, timeout=300):
        return subprocess.run(['ssh', *options, destination, command], check=True, timeout=timeout,
                              capture_output=True).stdout

    status = ssh('cloud-init status --wait || test "$?" = 2', timeout=600)
    (private / 'cloud-init-status.txt').write_bytes(status)
    ssh('systemctl is-active docker fanout-hard-stop.timer')
    ssh('install -d -m 700 /opt/fanout')
    files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z']).decode().split('\0')
    prefixes = ('api/', 'sdk/src/', 'clickhouse-init/', 'research/experiments/costfn/', 'marketing/web10-social/src/data/')
    files = sorted({name for name in files if name.startswith(prefixes) and Path(name).is_file() and not Path(name).is_symlink()})
    with tarfile.open(private / 'source.tar.gz', 'w:gz') as archive:
        for name in files:
            archive.add(name, arcname='repo/' + name, recursive=False)
    source_hashes = {name: hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in files}
    cloud.save(private / 'source-manifest.json', source_hashes)
    admission = dict(configuration='F', approved_by='Jacob', dataset_id=arm_t.DATASET,
        droplet_id=host['id'], budget_usd=2, watchdog_verified=True,
        approved_utc=datetime.fromtimestamp(lease['created_epoch'], UTC).isoformat(),
        deadline_utc=datetime.fromtimestamp(lease['deadline'], UTC).isoformat(),
        full_canonical_membership_pass=True, append_only_publication=True, read_cap=200,
        cutoff=2000, R_plus_W_required=True, T7_admitted=False, sort_order_arm_admitted=False)
    cloud.save(private / 'admission.json', admission)
    transfer = [('source.tar.gz', private / 'source.tar.gz'), ('admission.json', private / 'admission.json'),
                ('source-manifest.json', private / 'source-manifest.json'),
                ('archive-urls.json', Path('.context/fanout-preflight/archive-urls.json'))]
    for name, source in transfer:
        subprocess.run(['scp', *options, str(source), destination + ':/opt/fanout/' + name],
                       check=True, capture_output=True, timeout=180)
    ssh('tar -xzf /opt/fanout/source.tar.gz -C /opt/fanout')
    # No shell credential assignments or management keys on the node.
    ssh('python3 -m venv /opt/fanout/venv')
    ssh('/opt/fanout/venv/bin/pip install httpx==0.28.1 sqlglot==30.18.0 pydantic==2.13.4 fastapi==0.139.0 '
        '-r /opt/fanout/repo/research/experiments/costfn/realism-requirements.txt', timeout=600)
    ssh('chmod 600 /opt/fanout/archive-urls.json /opt/fanout/admission.json')
    verify = "import hashlib,json;from pathlib import Path;root=Path('/opt/fanout'); files=json.loads((root/'source-manifest.json').read_bytes()); "
    verify += "assert all(hashlib.sha256((root/'repo'/p).read_bytes()).hexdigest()==v for p,v in files.items()); print('source hashes verified',len(files))"
    print(ssh('/opt/fanout/venv/bin/python -c ' + shlex.quote(verify)).decode(), flush=True)
    stop = datetime.fromtimestamp(lease['deadline'] - 240, UTC).strftime('%Y-%m-%d %H:%M:%S UTC')
    here = '/opt/fanout/repo/research/experiments/costfn/'
    stop_command = ['systemd-run', '--unit=fanout-container-stop', '--on-calendar=' + stop,
        '/usr/bin/env', 'API_PORT=6098', 'COSTFN_RESEARCH_DIR=' + here, 'COSTFN_REPO_DIR=/opt/fanout/repo',
        '/usr/bin/docker', 'compose', '-f', here + 'compose.yml', '-f', here + 'research.compose.yml',
        '-f', here + 'realism.compose.yml', '-p', 'web10-costfn-frozen-satellite-fstep0', 'stop']
    ssh(shlex.join(stop_command))
    ssh('systemctl is-active fanout-container-stop.timer fanout-hard-stop.timer')
    remaining = int(lease['deadline'] - time.time()) - 300
    if remaining < 1800:
        raise ValueError('insufficient remaining original admission before restore')
    command = ['systemd-run', '--unit=fanout-step0', '--property=RuntimeMaxSec=' + str(remaining),
        '--property=WorkingDirectory=/opt/fanout/repo', '--wait', '--pipe',
        '/opt/fanout/venv/bin/python', '-u', here + 'arm_f_run.py', '/opt/fanout']
    print('[arm-f] guarded archive restore and P setup starting; deadline=' + admission['deadline_utc'], flush=True)
    with (private / 'step0-stream.log').open('wb') as log:
        proc = subprocess.Popen(['ssh', *options, destination, shlex.join(command)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        for line in proc.stdout:
            log.write(line)
            log.flush()
            print(line.decode(errors='replace').rstrip(), flush=True)
        code = proc.wait()
    print('[arm-f] step0 process exited', code, flush=True)
    # Receipt collection happens separately; do not erase the host/store here.
    if code:
        raise SystemExit(code)


if __name__ == '__main__':
    deploy()
