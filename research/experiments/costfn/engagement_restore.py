"""Restore the admitted prepared snapshot on26.x, or use untouched Parquet."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
import time

from arm_f_failure import details
from arm_f_native import save
from arm_f_run import download
import engagement_modern as modern
import restore_dataset
import restore_realism as restore
import arm_t

SNAPSHOT = '255003176'
SNAPSHOT_ROOT = Path('/opt/fanout/trials/rf0')
RESTORE_SHA = '1b5f656912da151e41452f4f8345a984b6486d19f3f2e98022381898faf6e0b9'
FIXTURE_SHA = '2cfe0fc4191c3013adec0f75650f30e46dbc7599147acbc9d8fe3df8de72a807'


class IsolationError(RuntimeError):
    pass


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def snapshot(root):
    root = Path(root)
    for identifier in subprocess.check_output(['docker', 'ps', '-q']).decode().split():
        info = json.loads(subprocess.check_output(['docker', 'inspect', identifier]))[0]
        if info['Config']['Labels'].get('com.docker.compose.project') != 'web10-costfn-frozen-satellite-f-620121703-rf0':
            raise IsolationError('unexpected running snapshot container; no adoption or second engine')
        subprocess.run(['docker', 'stop', '-t', '20', identifier], check=True, capture_output=True, timeout=60)
    if sha(SNAPSHOT_ROOT / 'restore.json') != RESTORE_SHA or sha(SNAPSHOT_ROOT / 'fixture.json') != FIXTURE_SHA:
        raise ValueError('snapshot restore/fixture artifact binding differs')
    original = json.loads((SNAPSHOT_ROOT / 'restore.json').read_bytes())
    old_overlay = json.loads(Path(original['overlay']).read_bytes())
    overlay = deepcopy(old_overlay)
    overlay['services']['clickhouse']['image'] = modern.IMAGE
    save(root / 'restore.overlay.json', overlay)
    restored = {**original, 'overlay': str(root / 'restore.overlay.json'), 'engine': modern.ENGINE,
        'restore_source': 'PREPARED_PROVIDER_SNAPSHOT', 'snapshot_id': SNAPSHOT,
        'source_restore_sha256': RESTORE_SHA, 'source_fixture_sha256': FIXTURE_SHA}
    save(root / 'restore.json', restored)
    session = modern.Session(root)
    # Snapshot-owned containers only. Do not start any unrelated old project.
    restore.command(session.compose, session.env, 'stop', 'api', timeout=60)
    restore.command(session.compose, session.env, 'up', '-d', 'clickhouse', 'minio', timeout=180)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'snapshot on modern engine')
    envelope = session.verify_envelope()
    values, _ = session.rows('snapshot_canonical_counts', 'SELECT (SELECT count() FROM documents) AS documents,'
        '(SELECT count() FROM content_events) AS events')
    if int(values[0]['documents']) != 88_200_363 or int(values[0]['events']) != 1_600_000_000:
        raise ValueError('prepared snapshot canonical counts differ from its frozen+fixture binding')
    source_input = (SNAPSHOT_ROOT / 'input').resolve()
    restore.verified_input(source_input, source_input / 'validation.json', arm_t.DATASET, arm_t.VALIDATION)
    (root / 'input').symlink_to(source_input, target_is_directory=True)
    save(root / 'evidence/archive.json', dict(dataset_id=arm_t.DATASET, all_size_sha256_verified=True,
        source='verified frozen files retained in provider snapshot', original_snapshot=SNAPSHOT))
    return dict(envelope=envelope, snapshot_id=SNAPSHOT, counts=values,
        fixture=json.loads((SNAPSHOT_ROOT / 'fixture.json').read_bytes()), source='PREPARED_PROVIDER_SNAPSHOT')


def run(root):
    root = Path(root)
    modern.operation(root)
    started = time.perf_counter()
    approval = json.loads((root / 'admission.json').read_bytes())
    if approval.get('restored_snapshot_id') == SNAPSHOT:
        try:
            result = snapshot(root)
            result['restore_seconds'] = time.perf_counter() - started
            save(root / 'modern-restore.json', result)
            return result
        except IsolationError:
            raise
        except Exception as error:
            save(root / 'snapshot-restore-stop.json', dict(outcome='STOP', **details(error)))
            if (root / 'restore.json').exists():
                try:
                    session = modern.Session(root)
                    restore.command(session.compose, session.env, 'stop', timeout=120)
                finally:
                    (root / 'restore.json').rename(root / 'snapshot-failed-restore.json')
                    if (root / 'restore.overlay.json').exists():
                        (root / 'restore.overlay.json').rename(root / 'snapshot-failed-overlay.json')
            if (root / 'input').is_symlink():
                (root / 'input').rename(root / 'snapshot-failed-input')
    # A different fresh project/store, not mutation or re-seeding of the failed
    # snapshot store. Keep every failed artifact and the original source image.
    download(root)
    restore.restore(root / 'input', root / 'input/validation.json', arm_t.DATASET, arm_t.VALIDATION,
        'web10-costfn-frozen-satellite-engagement26', 6098, root / 'restore.json', engine=modern.ENGINE)
    result = dict(source='ARCHIVED_PARQUET', restore_seconds=time.perf_counter() - started,
        envelope=modern.Session(root).verify_envelope(), snapshot_failure_preserved=(root / 'snapshot-restore-stop.json').exists())
    save(root / 'modern-restore.json', result)
    return result
