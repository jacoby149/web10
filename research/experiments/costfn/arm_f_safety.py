"""Off-Mac cleanup/receipt guardian. Uses credentials ALREADY on its controller.

Never install provider credentials on the measured node or production gateway.
No provisioning, renewal, engine query, broad deletion or workload retry here.
The controller must be separately provisioned/reviewed; missing setup fails shut.
"""
import argparse
from contextlib import contextmanager
from datetime import UTC, datetime
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

# -I -S deliberately omits the working directory and site packages. Only the
# installed, private guardian source directory supplies these stdlib-only peers.
if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import arm_f_checkpoint as checkpoint
import arm_f_cloud as cloud

PERIOD = 300
NAMES = ('arm_f_safety.py', 'arm_f_checkpoint.py', 'arm_f_cloud.py', 'arm_f_sink.py',
    'arm_f_provider.py', 'arm_f_guardian.py')
IMMUTABLE = ('name', 'tag', 'configuration', 'region', 'size', 'max_usd',
    'hourly_usd', 'account_uuid', 'created_epoch', 'deadline', 'scope', 'ssh_source_cidr')
BINDINGS = ('droplet_id', 'ssh_key_id', 'key_fingerprint', 'firewall_id')
CLIENT_FIELDS = (*IMMUTABLE, *BINDINGS, 'creation_uncertain')
ARCHIVE_BUDGET = 4 * 1024**3
DISK_RESERVE = 1024**3


def hashes():
    return {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in NAMES}


STARTUP_SOURCES = hashes()


@contextmanager
def locked(root, *, blocking=True):
    with (root / 'guardian.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
        yield


def note(path, value):
    """Diagnostics must never prevent provider cleanup, even with a full disk."""
    try:
        cloud.save(path, value)
    except OSError:
        pass


def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def private_root(root):
    root = Path(root).resolve(strict=True)
    if root.stat().st_mode & 0o077 or root.stat().st_uid != os.getuid():
        raise ValueError('guardian state must be private and owned by its controller user')
    return root


def status(root):
    value = json.loads((private_root(root) / 'guardian.json').read_bytes())
    # A file alone is not proof of a live supervisor. The kernel-held singleton
    # lock must still be held by the independent process, including during RPCs.
    with (root / 'supervisor.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            pass
        else:
            raise ValueError('independent guardian process is not running')
    if time.time() - value['heartbeat_epoch'] > 90 or value['sources'] != hashes() or value.get('degraded'):
        raise ValueError('guardian heartbeat/source binding is stale')
    return value


def rpc(root, action, payload):
    root = private_root(root)
    live = status(root)
    if time.time() - live['heartbeat_epoch'] > 10:
        raise ValueError('guardian is busy/stale; no mutation or blocking RPC lock wait')
    if live.get('offsite_ready') is not True:
        raise ValueError('actual off-controller private write/readback proof required before F registration')
    lease = payload['lease']
    cloud.validate(lease)
    if lease['deadline'] > live['controller_deadline'] - 600:
        raise ValueError('F lease must fit the original controller deadline with cleanup margin')
    if (lease['account_uuid'] != live['account_uuid']
            or lease.get('ssh_source_cidr') != live['ssh_source_cidr']):
        raise ValueError('guardian cloud account/direct collection ingress differs')
    if lease.get('cancelled') or lease.get('cleanup_verified'):
        raise ValueError('cleanup state is guardian-owned, never accepted from a client')
    cloud.account(lease)  # Live provider readback, not a claimed account string.
    with locked(root, blocking=False):
        target = root / lease['name']
        if action == 'register':
            if lease.get('droplet_id') or time.time() >= lease['deadline'] - 1800:
                raise ValueError('register before paid creation, inside original admission')
            target.mkdir(mode=0o700, exist_ok=False)
            cloud.save(target / 'lease.json', {k: lease[k] for k in CLIENT_FIELDS if k in lease})
            fsync_directory(root)
        elif action == 'sync':
            previous = json.loads((target / 'lease.json').read_bytes())
            if (any(previous.get(k) != lease.get(k) for k in IMMUTABLE)
                    or any(previous.get(k) is not None and previous[k] != lease.get(k) for k in BINDINGS)
                    or previous.get('cancelled') or previous.get('cleanup_verified')
                    or time.time() >= lease['deadline'] - 600):
                raise ValueError('guardian refuses changed/expired/closed lease or resource adoption')
            # Never overwrite cleanup/progress with an editable client snapshot.
            merged = {**previous, **{k: lease[k] for k in CLIENT_FIELDS if k in lease}}
            cloud.save(target / 'lease.json', merged)
            if 'transport' in payload:
                transport = payload['transport']
                if (transport.get('droplet_id') != lease['droplet_id'] or not transport.get('source_manifest')
                        or transport.get('host_public_key', '').split(' ')[0] != 'ssh-ed25519'):
                    raise ValueError('exact pinned receipt transport required')
                # Only the run's disposable SSH key, NEVER a provider/S3 token.
                cloud.save(target / 'transport.json', transport)
                (target / 'client-key').write_text(transport['client_key'])
                (target / 'client-key').chmod(0o600)
                ip = str(ipaddress.IPv4Address(transport['ip']))
                (target / 'known_hosts').write_text(ip + ' ' + transport['host_public_key'].strip() + '\n')
                # Read back and fsync a real off-node checkpoint BEFORE allowing
                # the measured worker to start. An RPC ack alone proves nothing.
                collect(target, lease)
        elif action != 'check':
            raise ValueError('unknown guardian RPC')
        stored = json.loads((target / 'lease.json').read_bytes())
        if (target / 'supervision-error.json').exists():
            raise ValueError('guardian has not successfully supervised this lease')
        if any(stored.get(k) != lease.get(k) for k in (*IMMUTABLE, *BINDINGS)):
            raise ValueError('guardian lease/resource binding differs')
        if stored.get('cancelled') or stored.get('cleanup_verified'):
            raise ValueError('independent guardian has closed this lease')
        return dict(**status(root), name=lease['name'], deadline=lease['deadline'],
            lease_sha256=hashlib.sha256((target / 'lease.json').read_bytes()).hexdigest())


def collect(target, lease):
    """Pull files over pinned SSH; verify/fsync before publishing an immutable receipt."""
    retained = sum(p.stat().st_size for p in target.parent.glob('*/checkpoints/*.tar.gz') if not p.is_symlink())
    if (retained + checkpoint.MAX_BYTES > ARCHIVE_BUDGET
            or shutil.disk_usage(target).free < DISK_RESERVE + checkpoint.MAX_BYTES):
        raise OSError('guardian archive budget/reserved cleanup capacity exhausted; no evidence eviction')
    transport = json.loads((target / 'transport.json').read_bytes())
    source = 'research/experiments/costfn/arm_f_checkpoint.py'
    script = '/opt/fanout/repo/' + source
    code = ('import hashlib,runpy,sys;from pathlib import Path;'
        f'assert hashlib.sha256(Path({script!r}).read_bytes()).hexdigest()=={transport["source_manifest"][source]!r};'
        f'sys.argv=[{script!r},"--root","/opt/fanout"];runpy.run_path({script!r},run_name="__main__")')
    command = ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10',
        '-o', 'IPQoS=none', '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=2',
        '-o', 'UserKnownHostsFile=' + str(target / 'known_hosts'), '-i', str(target / 'client-key'),
        'root@' + transport['ip'], shlex.join(['python3', '-I', '-S', '-c', code])]
    directory = target / 'checkpoints'
    directory.mkdir(mode=0o700, exist_ok=True)
    # stdout goes straight to disk, not unbounded controller memory. RLIMIT_FSIZE
    # in the child bounds even an unexpected/malicious SSH response.
    with tempfile.NamedTemporaryFile(dir=directory) as stream:
        import resource
        def bound():
            resource.setrlimit(resource.RLIMIT_FSIZE, (checkpoint.MAX_BYTES, checkpoint.MAX_BYTES))
        result = subprocess.run(command, stdout=stream, stderr=subprocess.DEVNULL, timeout=20, preexec_fn=bound)
        if result.returncode:
            raise RuntimeError('private checkpoint SSH transfer failed; transport stderr withheld')
        stream.flush()
        os.fsync(stream.fileno())
        verify_archive(stream.name, dict(droplet_id=lease['droplet_id'],
            deadline_utc=datetime.fromtimestamp(lease['deadline'], UTC).isoformat(),
            source_manifest=transport['source_manifest']))
        stream.seek(0)
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        destination = directory / (str(time.time_ns()) + '-' + digest + '.tar.gz')
        os.link(stream.name, destination)  # Immutable name, no replacement.
        fsync_directory(directory)
    offsite = export_offsite(target, destination)
    value = dict(epoch=time.time(), archive=destination.name, sha256=digest,
        bytes=destination.stat().st_size, droplet_id=lease['droplet_id'], deadline=lease['deadline'], offsite=offsite)
    cloud.save(target / 'checkpoint-receipt.json', value)
    return value


def export_offsite(target, archive):
    """Reserve each exact-key slot once; never acknowledge a guardian-only copy."""
    root = target.parent
    config = json.loads((root / 'sink.json').read_bytes())
    claims = root / 'sink-claims'
    claims.mkdir(mode=0o700, exist_ok=True)
    for index, slot in enumerate(config['slots']):
        try:
            fd = os.open(claims / str(index), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            continue
        with os.fdopen(fd, 'w') as stream:
            stream.write(archive.name)
            stream.flush()
            os.fsync(stream.fileno())
        fsync_directory(claims)
        result = subprocess.run([sys.executable, '-I', '-S', str(Path(__file__).with_name('arm_f_sink.py')), str(archive)],
            input=json.dumps(slot).encode(), capture_output=True, timeout=20)
        if result.returncode:
            raise RuntimeError('off-controller export failed; no checkpoint acknowledgement')
        return json.loads(result.stdout)
    raise ValueError('off-controller checkpoint slots exhausted; no new work')


def verify_archive(path, expected):
    """Even parsing untrusted compressed headers cannot hold cleanup hostage."""
    import resource
    def limits():
        resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
        if sys.platform == 'linux':  # The deployed guardian is Linux; Darwin rejects this limit.
            resource.setrlimit(resource.RLIMIT_AS, (512 * 1024**2, 512 * 1024**2))
    result = subprocess.run([sys.executable, '-I', '-S', str(Path(checkpoint.__file__).resolve()), '--verify', str(path)],
        input=json.dumps(expected).encode(), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        timeout=10, preexec_fn=limits)
    if result.returncode:
        raise ValueError('bounded private checkpoint verification failed')


def supervise(target):
    path = target / 'lease.json'
    lease = json.loads(path.read_bytes())
    cloud.validate(lease)
    if lease.get('cleanup_verified'):
        return
    due = time.time() >= lease['deadline'] - 600 or lease.get('cancelled')
    prior = target / 'checkpoint-receipt.json'
    # Corrupt collection bookkeeping is not permission to skip due cleanup.
    last = 0
    try:
        try:
            last = json.loads(prior.read_bytes())['epoch'] if prior.exists() else 0
        except (OSError, ValueError, KeyError):
            pass
        if (target / 'transport.json').exists() and (due or time.time() - last >= PERIOD):
            collect(target, lease)
    except Exception as error:
        note(target / 'collection-error.json', dict(epoch=time.time(), failure_class=type(error).__name__))
        if time.time() - max(last, lease['created_epoch']) >= 2 * PERIOD:
            due = True
    finally:
        if due:
            cloud.tick(path, stop=True)


def cycle(root):
    """Errors are isolated per lease; a bad old record cannot starve the next."""
    errors = []
    with locked(root):
        for target in sorted(root.glob('web10-fanout-f-*')):
            if not target.is_dir() or target.is_symlink():
                continue
            try:
                supervise(target)
                (target / 'supervision-error.json').unlink(missing_ok=True)
            except Exception as error:
                errors.append(target.name)
                note(target / 'supervision-error.json', dict(epoch=time.time(), failure_class=type(error).__name__))
    return errors


def serve(root, doctl, account_uuid, ssh_source_cidr):
    root = private_root(root)
    if sys.platform != 'linux' or not Path(doctl).is_absolute():
        raise ValueError('independent Linux controller with its own existing doctl configuration required')
    cloud.DOCTL = doctl
    cloud.API_TIMEOUT = 20
    cloud.account({'account_uuid': account_uuid})
    from arm_f_guardian import identity
    controller = json.loads((root.parent / 'controller-lease.json').read_bytes())
    with urllib.request.urlopen('http://169.254.169.254/metadata/v1/id', timeout=3) as response:
        controller_id = int(response.read(32))
    identity(controller, controller_id)
    source = str(ipaddress.IPv4Network(ssh_source_cidr, strict=True))
    with urllib.request.urlopen('https://api.ipify.org?format=json', timeout=10) as response:
        actual_source = str(ipaddress.IPv4Address(json.load(response)['ip'])) + '/32'
    if source != actual_source:
        raise ValueError('guardian direct collection egress must equal the sole admitted SSH ingress')
    with (root / 'supervisor.lock').open('a') as singleton:
        fcntl.flock(singleton, fcntl.LOCK_EX | fcntl.LOCK_NB)
        while True:
            try:
                errors = cycle(root)
                proof_path = root / 'offsite-proof.json'
                offsite = json.loads(proof_path.read_bytes()) if proof_path.is_file() else {}
                cloud.save(root / 'guardian.json', dict(heartbeat_epoch=time.time(), sources=STARTUP_SOURCES,
                    degraded=bool(errors),
                    offsite_ready=offsite.get('controller_droplet_id') == controller_id and offsite.get('independently_read_back') is True,
                    controller_droplet_id=controller_id, controller_deadline=controller['deadline'],
                    ssh_source_cidr=source, account_uuid=account_uuid, doctl=doctl, hostname=socket.gethostname(),
                    controller_id=hashlib.sha256(Path('/etc/machine-id').read_bytes()).hexdigest()))
            except Exception as error:
                note(root / 'guardian-error.json', dict(epoch=time.time(), failure_class=type(error).__name__))
            time.sleep(5)


def remote(action, lease, config_path, *, transport=None):
    """Live SSH RPC, not an editable local PASS file or an exported cloud token."""
    config = json.loads(Path(config_path).read_bytes())
    if not config.get('host') or not Path(config['root']).is_absolute() or not Path(config['script']).is_absolute():
        raise ValueError('explicit independent controller SSH configuration required')
    command = ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10',
        '-o', 'IPQoS=none', '-o', 'UserKnownHostsFile=' + config['known_hosts'], '-i', config['identity'],
        *(['-F', config['ssh_config']] if config.get('ssh_config') else []),
        config['host'], shlex.join(['python3', '-I', '-S', config['script'], 'rpc', '--root', config['root'], '--action', action])]
    result = subprocess.run(command, input=json.dumps(dict(lease=lease, **({'transport': transport} if transport else {}))).encode(),
        capture_output=True, timeout=95)
    if result.returncode:
        raise ValueError('independent cleanup guardian unavailable/unconfigured; no paid launch')
    proof = json.loads(result.stdout)
    if (proof.get('hostname') == socket.gethostname() or proof.get('sources') != hashes()
            or proof.get('account_uuid') != lease['account_uuid'] or proof.get('name') != lease['name']
            or proof.get('ssh_source_cidr') != lease.get('ssh_source_cidr')
            or proof.get('deadline') != lease['deadline'] or not proof.get('controller_id')
            or proof.get('controller_droplet_id') != config['controller']['droplet_id']
            or not 0 <= time.time() - proof.get('heartbeat_epoch', 0) < 90):
        raise ValueError('independent guardian identity/source/deadline/heartbeat differs')
    return proof


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('serve', 'rpc'))
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--doctl')
    parser.add_argument('--account-uuid')
    parser.add_argument('--ssh-source-cidr')
    parser.add_argument('--action', choices=('register', 'sync', 'check'))
    args = parser.parse_args()
    if args.mode == 'serve':
        serve(args.root, args.doctl, args.account_uuid, args.ssh_source_cidr)
    else:
        live = status(args.root)
        cloud.DOCTL = live['doctl']
        cloud.API_TIMEOUT = 20
        print(json.dumps(rpc(args.root, args.action, json.load(sys.stdin))))
