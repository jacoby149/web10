"""Owned fresh trial stores and API modes. Original Step0 and frozen files stay put."""
import asyncio
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path
import re
import shutil
import urllib.request

import arm_f_native
import arm_f_guard
from arm_f_runtime import Session, admitted
import arm_f_run as setup
import arm_satellite_metadata as metadata
import arm_satellite_presence as presence
import arm_satellite_verify as parity
import arm_t
import restore_dataset
import restore_realism as restore


def stop(root, *, engine=False):
    root = Path(root)
    if (root / 'fresh-trial.json').is_file():
        # Cleanup must work before restore.json exists and after admission
        # expires. The private trial registration still fences exact ownership;
        # this does not authorize another query, restore or measurement.
        return arm_f_guard.stop(root, api_only=not engine)
    session = Session(root)
    restore.command(session.compose, session.env, 'stop', *(['api', 'clickhouse', 'minio'] if engine else ['api']), timeout=120)


def boot(root, mode='F_DOCUMENT_STREAM_V1'):
    if mode not in ('F_DOCUMENT_STREAM_V1', 'P_DOCUMENT_STREAM_V1'):
        raise ValueError('only declared identical-contract P/F modes')
    root = Path(root)
    session = Session(root)
    stages = root / 'F-stages'
    stages.mkdir(mode=0o700, exist_ok=True)
    overlay = root / 'F-api.overlay.json'
    overlay.write_text(json.dumps({'services': {'api': {'volumes': [str(root / 'fanout-state') + ':/fanout-state',
        str(stages) + ':/fanout-stages'], 'environment': {'FANOUT_CONFIG_F': '1', 'FANOUT_STATE': '/fanout-state',
        'FANOUT_SERVING_MODE': mode, 'FANOUT_STAGE_DIR': '/fanout-stages'},
        'command': ['uv', 'run', 'uvicorn', 'arm_f_api:application', '--host', '0.0.0.0', '--port', '80', '--no-access-log']}}}))
    here = Path(__file__).parent
    compose = session.compose[:-2] + ['-f', str(here / 'arm_satellite_serve.compose.yml'), '-f', str(overlay), *session.compose[-2:]]
    env = {**session.env, 'SATELLITE_SERVE_STATE': str(root / 'serve-state')}
    restore.command(compose, env, 'up', '-d', 'clickhouse', 'minio', timeout=120)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'owned trial engine')
    session.verify_envelope()
    restore.command(compose, env, 'up', '-d', '--no-deps', 'api', timeout=180)
    restore_dataset.wait_for(lambda: urllib.request.urlopen('http://127.0.0.1:6098/docs', timeout=3).status == 200, 'F trial API')
    return session


def serving_state(root):
    root = Path(root)
    directory = root / 'serve-state'
    directory.mkdir(mode=0o700, exist_ok=True)
    for name, relative in {'operation': 'evidence/operation.json', 'counts': 'counts-batch-p2/result.json',
        'metadata': 'metadata/result.json', 'parity': 'metadata-parity/result.json',
        'profile': 'profile/inventory.json', 'presence': 'presence/result.json'}.items():
        shutil.copyfile(root / relative, directory / (name + '.json'))


def prepare(root, parent, *, profile=None):
    """Synchronous programme entry point; async trials use prepare_async."""
    return asyncio.run(prepare_async(root, parent, profile=profile))


async def prepare_async(root, parent, *, profile=None):
    """Build unchanged P materializations in the caller's existing event loop."""
    root, parent = Path(root), Path(parent)
    session = Session(root)
    if profile is None:
        print('[F-setup] scope start', root.name, flush=True)
        profile = await setup.setup_scopes(root, session)
        print('[F-setup] scope complete', root.name, flush=True)
    else:
        (root / 'profile').mkdir(mode=0o700)
        setup.save(root / 'profile/inventory.json', profile)
    setup.build_p_counts(root, session, profile)
    metadata.build(root, counts_receipt=root / 'counts-batch-p2/result.json')
    parity.verify(root)
    presence.build(root)
    serving_state(root)
    arm_f_native.build(root, step0_root=parent)
    return root


def fresh(parent, name):
    """Each performance trial is a NEW full restore, not another warm-cache loop."""
    parent = Path(parent)
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,24}', name):
        raise ValueError('bounded fresh trial name required')
    approval = json.loads((parent / 'admission.json').read_bytes())
    deadline = admitted(approval, arm_t.digitalocean_id())
    if (deadline - datetime.now(UTC)).total_seconds() < 1800:
        raise TimeoutError('not enough original lease for another full restore; gate UNREACHED')
    free = shutil.disk_usage(parent).free
    if free < 150 * 1024**3:
        raise ValueError('fresh-trial150GiB reserve not available; no deletion or capacity guess')
    # One engine at a time. Keep the original Step0 store and its receipts intact.
    stop(parent, engine=True)
    root = parent / 'trials' / name
    root.mkdir(parents=True, mode=0o700, exist_ok=False)
    shutil.copyfile(parent / 'admission.json', root / 'admission.json')
    setup.operation(root)
    (root / 'input').symlink_to(parent / 'input', target_is_directory=True)
    setup.save(root / 'evidence/archive.json', json.loads((parent / 'evidence/archive.json').read_bytes()))
    project = 'web10-costfn-frozen-satellite-f-' + str(approval['droplet_id']) + '-' + name
    setup.save(root / 'fresh-trial.json', dict(free_bytes_before=free, project=project, fresh=True,
        archive_receipt_sha256=hashlib.sha256((parent / 'evidence/archive.json').read_bytes()).hexdigest()))
    setup.save(root / 'container-guard.json', arm_f_guard.arm(root))
    try:
        restore.restore(root / 'input', root / 'input/validation.json', arm_t.DATASET, arm_t.VALIDATION,
                        project, 6098, root / 'restore.json')
    except BaseException as error:
        failure = {'failure_class': type(error).__name__, 'project': project}
        try:
            arm_f_guard.stop(root)
            failure['containers_stopped'] = True
        except BaseException as cleanup_error:
            failure.update(containers_stopped=False, cleanup_failure_class=type(cleanup_error).__name__)
        setup.save(root / 'fresh-trial-failure.json', failure)
        print('[F-setup] restore stopped', root.name, failure, flush=True)
        raise
    return root


def discard_trial(root):
    """Only this registered disposable trial's containers/volumes; never parent."""
    root = Path(root)
    if root.parent.name != 'trials' or not (root / 'fresh-trial.json').is_file():
        raise ValueError('refuse cleanup of any non-trial store')
    session = Session(root)
    registered = json.loads((root / 'fresh-trial.json').read_bytes())
    restored = json.loads((root / 'restore.json').read_bytes())
    if registered['project'] != restored['project']:
        raise ValueError('trial cleanup identity mismatch')
    stop(root, engine=True)
    restore.command(session.compose, session.env, 'down', '--volumes', timeout=120)
