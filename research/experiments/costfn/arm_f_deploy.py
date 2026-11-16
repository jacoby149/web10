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


def ssh_options(private, jump=None):
    options = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=yes',
        '-o', 'IPQoS=none', '-o', 'UserKnownHostsFile=' + str(private / 'known_hosts'), '-i', str(private / 'client-key')]
    if jump:
        # ProxyJump does not propagate the outer IPQoS option to its nested SSH
        # process; this network otherwise times out during banner exchange.
        proxy = shlex.join(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
            '-o', 'StrictHostKeyChecking=yes', '-o', 'IPQoS=none', '-W', '%h:%p', jump])
        options += ['-o', 'ProxyCommand=' + proxy]
    return options


def wait_for_ssh(private, destination, *, jump=None, seconds=120):
    """Bounded authenticated readiness only; never loosen the pinned host key."""
    if type(seconds) is not int or not 1 <= seconds <= 120:
        raise ValueError('bounded SSH readiness wait required')
    private = Path(private)
    lease = json.loads((private / 'lease.json').read_bytes())
    cloud.validate(lease)
    command = ['ssh', *ssh_options(private, jump), destination, 'true']
    started = time.monotonic()
    last = None
    while time.monotonic() - started < seconds:
        if lease.get('cancelled') or time.time() >= lease['deadline'] - 300:
            raise ValueError('SSH readiness admission closed')
        try:
            result = subprocess.run(command, capture_output=True, timeout=15)
            if result.returncode == 0:
                return
            last = subprocess.CalledProcessError(result.returncode, command,
                output=result.stdout, stderr=result.stderr)
        except subprocess.TimeoutExpired as error:
            last = error
        time.sleep(2)
        lease = json.loads((private / 'lease.json').read_bytes())
    from arm_f_failure import persist
    error = TimeoutError('pinned authenticated SSH did not become ready within bounded wait')
    if last is not None:
        persist(private, last, stage='SSH_readiness', operation='authenticated_true')
    persist(private, error, stage='SSH_readiness', operation='authenticated_true')
    raise error from last


def worker_command(remaining, here, *, detach=False, scoped=False):
    if type(remaining) is not int or not 300 <= remaining <= 14100:
        raise ValueError('worker must fit the original four-hour lease and cleanup margin')
    return ['systemd-run', '--unit=fanout-step0', '--property=RuntimeMaxSec=' + str(remaining),
        '--property=WorkingDirectory=/opt/fanout/repo',
        *(['--property=StandardOutput=append:/opt/fanout/step0-service.log',
           '--property=StandardError=append:/opt/fanout/step0-service.log'] if detach else ['--wait', '--pipe']),
        '/opt/fanout/venv/bin/python', '-u', here + ('arm_f_scoped.py' if scoped else 'arm_f_run.py'), '/opt/fanout',
        *([] if scoped else ['--programme'])]


def bundle(private, stem='source'):
    files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z']).decode().split('\0')
    prefixes = ('api/', 'sdk/src/', 'clickhouse-init/', 'research/experiments/costfn/', 'marketing/web10-social/src/data/')
    files = sorted({name for name in files if name.startswith(prefixes) and Path(name).is_file() and not Path(name).is_symlink()})
    with tarfile.open(private / (stem + '.tar.gz'), 'w:gz') as archive:
        for name in files:
            archive.add(name, arcname='repo/' + name, recursive=False)
    hashes = {name: hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in files}
    cloud.save(private / (stem + '-manifest.json'), hashes)
    return hashes


def deploy(*, detach=False, state_path=Path('.context/fanout-run.json')):
    state = json.loads(Path(state_path).read_bytes())
    private = Path(state['root'])
    lease = json.loads(Path(state['lease']).read_bytes())
    cloud.validate(lease)
    cloud.tick(state['lease'])
    lease = json.loads(Path(state['lease']).read_bytes())
    host = json.loads((private / 'host.json').read_bytes())
    if lease.get('cancelled') or lease['droplet_id'] != host['id'] or time.time() > lease['deadline'] - 1800:
        raise ValueError('closed or mismatched guarded host')
    options = ssh_options(private, state.get('ssh_jump'))
    destination = 'root@' + host['ip']

    def ssh(command, timeout=300):
        return subprocess.run(['ssh', *options, destination, command], check=True, timeout=timeout,
                              capture_output=True).stdout

    status = ssh('cloud-init status --wait || test "$?" = 2', timeout=600)
    (private / 'cloud-init-status.txt').write_bytes(status)
    ssh('systemctl is-active docker fanout-hard-stop.timer')
    ssh('install -d -m 700 /opt/fanout')
    bundle(private)
    admission = dict(configuration='F', approved_by='Jacob', dataset_id=arm_t.DATASET,
        droplet_id=host['id'], budget_usd=2, watchdog_verified=True,
        approved_utc=datetime.fromtimestamp(lease['created_epoch'], UTC).isoformat(),
        deadline_utc=datetime.fromtimestamp(lease['deadline'], UTC).isoformat(),
        full_canonical_membership_pass=True, append_only_publication=True, read_cap=200,
        cutoff=2000, R_plus_W_required=True, T7_admitted=False, sort_order_arm_admitted=False,
        full_population_backfill_required=True,
        population_gate_order=['T4', 'T2-F', 'T6-F', 'T3-F', 'population', 'T6-F-populated', 'T5-F', 'R+W'])
    scoped = state.get('scope') in ('F_GATES_ONLY', 'F_DEPLOY_REHEARSAL')
    if scoped:
        import arm_f_banked
        arm_f_banked.load(private)
        admission.update(scope=state['scope'], banked_P_sha256=arm_f_banked.ARCHIVE_SHA256)
        if state['scope'] == 'F_GATES_ONLY':
            from arm_f_scoped import rehearsal_proof
            if state.get('trim_native_sha256'):
                admission['trim_native_sha256'] = state['trim_native_sha256']
            admission['rehearsal_sha256'] = hashlib.sha256((private / 'deploy-rehearsal.json').read_bytes()).hexdigest()
            rehearsal_proof(private, admission)
    prior_stop = Path(__file__).parent / 'evidence/arm-f-20261115/P-setup-stop/stop.json'
    if prior_stop.is_file():
        admission.update(operator_online_retry=True, reconciliation_batches=8,
            prior_stop_receipt_sha256=hashlib.sha256(prior_stop.read_bytes()).hexdigest())
    cloud.save(private / 'admission.json', admission)
    transfer = [('source.tar.gz', private / 'source.tar.gz'), ('admission.json', private / 'admission.json'),
                ('source-manifest.json', private / 'source-manifest.json'),
                 ('archive-urls.json', Path('.context/fanout-preflight/archive-urls.json'))]
    if scoped:
        transfer.append(('banked-P.tar.gz', private / 'banked-P.tar.gz'))
        if state['scope'] == 'F_GATES_ONLY':
            transfer.append(('deploy-rehearsal.json', private / 'deploy-rehearsal.json'))
            if state.get('trim_native_sha256'):
                transfer.append(('trim-native-proof.json', private / 'trim-native-proof.json'))
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
    command = worker_command(remaining, here, detach=detach, scoped=scoped)
    print('[arm-f] guarded archive restore and P setup starting; deadline=' + admission['deadline_utc'], flush=True)
    if detach:
        # A VPN/SSH disconnect must not tear down the worker's stdout pipe.
        # Its systemd lifetime/container/host/provider guards are unchanged.
        ssh(shlex.join(command), timeout=30)
        status = ssh('systemctl show fanout-step0 --property=ActiveState --property=SubState --property=MainPID')
        (private / 'detached-start.txt').write_bytes(status)
        print(status.decode(), flush=True)
        return
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


def repair_rehearsal(*, state_path, approval_name='rehearsal-repair-approval.json'):
    """Ship a separately approved checker repair, preserving the stopped tree.

    Same owned rehearsal lease only. This never launches/resumes measured gates.
    """
    state = json.loads(Path(state_path).read_bytes())
    if approval_name not in ('rehearsal-repair-approval.json', 'rehearsal-ready-approval.json', 'rehearsal-startup-approval.json'):
        raise ValueError('unknown rehearsal repair checkpoint')
    startup = approval_name == 'rehearsal-startup-approval.json'
    ready = approval_name in ('rehearsal-ready-approval.json', 'rehearsal-startup-approval.json')
    private = Path(state['root'])
    cloud.tick(state['lease'])
    lease = json.loads(Path(state['lease']).read_bytes())
    cloud.validate(lease)
    approval = json.loads((private / approval_name).read_bytes())
    if (state.get('scope') != 'F_DEPLOY_REHEARSAL' or lease.get('cancelled')
            or approval.get('droplet_id') != lease['droplet_id']
            or approval.get('deadline_utc') != datetime.fromtimestamp(lease['deadline'], UTC).isoformat()
            or time.time() >= lease['deadline'] - 900):
        raise ValueError('explicit same-lease rehearsal repair only, never gates/renewal')
    host = json.loads((private / 'host.json').read_bytes())
    if host['id'] != lease['droplet_id']:
        raise ValueError('owned rehearsal host differs')
    options = ssh_options(private, state.get('ssh_jump'))
    destination = 'root@' + host['ip']
    def ssh(command, timeout=120):
        return subprocess.run(['ssh', *options, destination, command], check=True, timeout=timeout, capture_output=True).stdout
    stage = '/opt/fanout/' + ('rehearsal-startup-source' if startup else 'rehearsal-ready-source' if ready else 'rehearsal-repair-source')
    ssh('mkdir -m 700 ' + stage)  # Refuse an existing attempt, no overwrite/retry.
    stem = 'rehearsal-startup-source' if startup else 'rehearsal-ready-source' if ready else 'rehearsal-repair1-source'
    bundle(private, stem)
    for source, name in [(private / (stem + '.tar.gz'), 'source.tar.gz'),
            (private / (stem + '-manifest.json'), 'source-manifest.json'),
            (private / approval_name, approval_name)]:
        target = '/opt/fanout/' + name if name == approval_name else stage + '/' + name
        subprocess.run(['scp', *options, str(source), destination + ':' + target], check=True, capture_output=True, timeout=180)
    ssh('tar -xzf ' + stage + '/source.tar.gz -C ' + stage)
    check = "import hashlib,json;from pathlib import Path;r=Path(" + repr(stage) + ");d=json.loads((r/'source-manifest.json').read_bytes());assert all(hashlib.sha256((r/'repo'/p).read_bytes()).hexdigest()==v for p,v in d.items());print('repair source hashes verified',len(d))"
    print(ssh('/opt/fanout/venv/bin/python -c ' + shlex.quote(check)).decode(), flush=True)
    remaining = int(lease['deadline'] - time.time()) - 300
    unit = 'fanout-rehearsal-startup' if startup else 'fanout-rehearsal-ready' if ready else 'fanout-rehearsal-repair'
    logfile = '/opt/fanout/' + ('rehearsal-startup-service.log' if startup else 'rehearsal-ready-service.log' if ready else 'rehearsal-repair-service.log')
    command = ['systemd-run', '--unit=' + unit, '--property=RuntimeMaxSec=' + str(remaining),
        '--property=WorkingDirectory=' + stage + '/repo',
        '--property=StandardOutput=append:' + logfile,
        '--property=StandardError=append:' + logfile,
        '/opt/fanout/venv/bin/python', '-u', stage + '/repo/research/experiments/costfn/arm_f_scoped.py',
        '/opt/fanout', '--repair-rehearsal', '--repair-approval', approval_name]
    ssh(shlex.join(command), timeout=30)
    print(ssh('systemctl show ' + unit + ' --property=ActiveState,SubState,MainPID').decode(), flush=True)


def retry_permission_setup():
    """Explicit fresh setup attempt after the receipted pre-import permission stop.

    Never resumes a partial imported store, repeats a measured cell, replaces a
    host, changes resource limits or renews the original admission clock.
    """
    state = json.loads(Path('.context/fanout-run.json').read_bytes())
    private = Path(state['root'])
    lease = json.loads(Path(state['lease']).read_bytes())
    cloud.validate(lease)
    cloud.tick(state['lease'])
    lease = json.loads(Path(state['lease']).read_bytes())
    if lease.get('cancelled') or time.time() > lease['deadline'] - 1800:
        raise ValueError('original admission closed/too short')
    host = json.loads((private / 'host.json').read_bytes())
    options = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12', '-o', 'StrictHostKeyChecking=yes',
               '-o', 'UserKnownHostsFile=' + str(private / 'known_hosts'), '-i', str(private / 'client-key')]
    if state.get('ssh_jump'):
        options += ['-J', state['ssh_jump']]
    destination = 'root@' + host['ip']
    def ssh(command, timeout=180):
        return subprocess.run(['ssh', *options, destination, command], check=True, timeout=timeout,
                              capture_output=True).stdout
    previous = json.loads(ssh('cat /opt/fanout/result.json'))
    if previous.get('outcome') != 'STOP' or previous.get('stage') != 'fresh_restore':
        raise ValueError('only receipted pre-import setup failure is covered by this repair')
    if ssh('docker ps -q --filter label=com.docker.compose.project=web10-costfn-frozen-satellite-fstep0').strip():
        raise ValueError('old owned containers still running')
    (private / 'initial-restore-result.json').write_text(json.dumps(previous, indent=2))
    (private / 'initial-restore-journal.log').write_bytes(ssh('journalctl -u fanout-step0 --no-pager'))
    (private / 'initial-executing-arm_f_run.py').write_bytes(ssh('cat /opt/fanout/repo/research/experiments/costfn/arm_f_run.py'))
    ssh('install -d -m 700 /opt/fanout/attempt2')
    if ssh('find /opt/fanout/attempt2 -mindepth 1 -maxdepth 1 -print').strip():
        raise ValueError('fresh attempt directory required; no automatic retry')
    files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z']).decode().split('\0')
    prefixes = ('api/', 'sdk/src/', 'clickhouse-init/', 'research/experiments/costfn/', 'marketing/web10-social/src/data/')
    files = sorted({name for name in files if name.startswith(prefixes) and Path(name).is_file() and not Path(name).is_symlink()})
    bundle = private / 'attempt2-source.tar.gz'
    with tarfile.open(bundle, 'w:gz') as archive:
        for name in files:
            archive.add(name, arcname='repo/' + name, recursive=False)
    hashes = {name: hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in files}
    cloud.save(private / 'attempt2-source-manifest.json', hashes)
    for source, name in [(bundle, 'source.tar.gz'), (private / 'attempt2-source-manifest.json', 'source-manifest.json'),
                         (private / 'admission.json', 'admission.json')]:
        subprocess.run(['scp', *options, str(source), destination + ':/opt/fanout/attempt2/' + name],
                       check=True, capture_output=True, timeout=180)
    ssh('tar -xzf /opt/fanout/attempt2/source.tar.gz -C /opt/fanout/attempt2')
    verify = "import hashlib,json;from pathlib import Path;root=Path('/opt/fanout/attempt2'); files=json.loads((root/'source-manifest.json').read_bytes()); "
    verify += "assert all(hashlib.sha256((root/'repo'/p).read_bytes()).hexdigest()==v for p,v in files.items()); print('attempt2 sources verified',len(files))"
    print(ssh('/opt/fanout/venv/bin/python -c ' + shlex.quote(verify)).decode(), flush=True)
    project = 'web10-costfn-frozen-satellite-fstep0a2'
    here = '/opt/fanout/attempt2/repo/research/experiments/costfn/'
    stop = datetime.fromtimestamp(lease['deadline'] - 240, UTC).strftime('%Y-%m-%d %H:%M:%S UTC')
    stop_command = ['systemd-run', '--unit=fanout-container-stop2', '--on-calendar=' + stop,
        '/usr/bin/env', 'API_PORT=6098', 'COSTFN_RESEARCH_DIR=' + here, 'COSTFN_REPO_DIR=/opt/fanout/attempt2/repo',
        '/usr/bin/docker', 'compose', '-f', here + 'compose.yml', '-f', here + 'research.compose.yml',
        '-f', here + 'realism.compose.yml', '-p', project, 'stop']
    ssh(shlex.join(stop_command))
    ssh('systemctl is-active fanout-container-stop2.timer fanout-hard-stop.timer')
    remaining = int(lease['deadline'] - time.time()) - 300
    command = ['systemd-run', '--unit=fanout-step0a2', '--property=RuntimeMaxSec=' + str(remaining),
        '--property=WorkingDirectory=/opt/fanout/attempt2/repo', '--wait', '--pipe', '/opt/fanout/venv/bin/python',
        '-u', here + 'arm_f_run.py', '/opt/fanout/attempt2', '--verified-input', '/opt/fanout/input', '--project', project]
    print('[arm-f] separate fresh restore attempt2, verified archive bytes reused; original deadline unchanged', flush=True)
    with (private / 'attempt2-stream.log').open('wb') as log:
        proc = subprocess.Popen(['ssh', *options, destination, shlex.join(command)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        for line in proc.stdout:
            log.write(line)
            log.flush()
            print(line.decode(errors='replace').rstrip(), flush=True)
        code = proc.wait()
    print('[arm-f] attempt2 process exited', code, flush=True)
    if code:
        raise SystemExit(code)


if __name__ == '__main__':
    import sys
    if sys.argv[1:] == ['--retry-permission-setup']:
        retry_permission_setup()
    elif sys.argv[1:] == ['--detach']:
        deploy(detach=True)
    elif sys.argv[1:]:
        raise SystemExit('only --detach, --retry-permission-setup or initial deploy accepted')
    else:
        deploy()
