"""Fresh per-cell serving state over one owned store, no failed-state erasure."""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import urllib.request
import uuid

from arm_f_http import HTTP
from arm_f_native import save
import arm_f_reads as reads
import arm_f_startup
from costfn_task import exact, ParityDivergence
import engagement_modern as modern
import engagement_queries as queries
import restore_dataset
import restore_realism as restore


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def root(parent, name):
    parent = Path(parent)
    target = parent / 'cells' / name
    target.mkdir(mode=0o700, parents=True, exist_ok=False)
    for item in ('input', 'restore.json', 'banked-P.tar.gz'):
        (target / item).symlink_to((parent / item).resolve(), target_is_directory=(parent / item).is_dir())
    (target / 'admission.json').write_bytes((parent / 'admission.json').read_bytes())
    modern.operation(target)
    return target


def serving_state(parent, cell, profile_name):
    parent, cell = Path(parent), Path(cell)
    profile = json.loads((parent / ('profile-' + profile_name + '.json')).read_bytes())
    counts_path = parent / ('counts-' + profile_name + '.json')
    presence_path = parent / ('presence-' + profile_name + '.json')
    directory = cell / 'serve-state'
    directory.mkdir(mode=0o700)
    copies = {'operation': cell / 'evidence/operation.json', 'counts': counts_path,
        'profile': parent / ('profile-' + profile_name + '.json'), 'presence': presence_path}
    for name, path in copies.items():
        shutil.copyfile(path, directory / (name + '.json'))
    metadata = json.loads((parent / 'metadata/result.json').read_bytes())
    metadata.update(count_receipt_sha256=digest(directory / 'counts.json'),
        profile_receipt_derivation='actually built profile-specific scopes; unchanged global physical metadata')
    save(directory / 'metadata.json', metadata)
    parity = json.loads((parent / 'metadata-parity/result.json').read_bytes())
    parity['metadata_sha256'] = digest(directory / 'metadata.json')
    save(directory / 'parity.json', parity)
    (cell / 'profile').mkdir()
    save(cell / 'profile/inventory.json', profile)
    (cell / 'counts-batch-p2').mkdir()
    shutil.copyfile(counts_path, cell / 'counts-batch-p2/result.json')
    shutil.copytree(parent / 'fanout-template', cell / 'fanout-state')
    (cell / 'fanout-state/admission.json').write_bytes((cell / 'admission.json').read_bytes())
    return profile


def boot(parent, name, profile_name, mode, *, serving_mode='F_DOCUMENT_STREAM_V1', aggregate=False, projected=False,
         hybrid=False, dau=False):
    parent = Path(parent)
    approval = json.loads((parent / 'admission.json').read_bytes())
    import dau_serving_bundle as serving
    bundle_active = dau and serving.enabled(approval)
    completion = approval.get('engagement_completion_admitted') is True
    if dau:
        from dau_sustain_cell_policy import validate
        if (name, profile_name, mode, serving_mode, aggregate, projected, hybrid) != (
                'dau-sustain', 'ordinary', 'uniform', 'F_DOCUMENT_STREAM_V1', True, False, False):
            raise ValueError('DAU overlay requires the admitted indexed uniform cell')
        bundle_path = parent / 'dau-cell-bundle.json'
        bundle = json.loads(bundle_path.read_bytes())
        validate(approval, bundle['scope_proof'], bundle['writers'])
    if projected:
        from hybrid_k20_projected import enabled
        pattern = r'hybrid-K20-r[12]-attempt-[1-9][0-9]*' if hybrid else r'projected-K20(?:-attempt-[1-9][0-9]*)?'
        if (not enabled(approval) or approval.get('composition_admitted') is not True
                or not re.fullmatch(pattern, name)
                or (profile_name, mode, serving_mode, aggregate) != ('ordinary', 'uniform', 'F_DOCUMENT_STREAM_V1', True)):
            raise ValueError('projected overlay is limited to the admitted fixed K20 cell')
    elif hybrid:
        raise ValueError('hybrid requires projected canonical resolution')
    if completion:
        from engagement_certificates import verify
        verify(parent)
    cell = root(parent, name)
    serving_state(parent, cell, profile_name)
    session = modern.Session(cell)
    stages = cell / 'F-stages'
    stages.mkdir(mode=0o700)
    boot_id = uuid.uuid4().hex
    env = dict(FANOUT_CONFIG_F='1', FANOUT_STATE='/fanout-state', FANOUT_STAGE_DIR='/fanout-stages',
        FANOUT_SERVING_MODE=serving_mode, FANOUT_BOOT_ID=boot_id, ENGAGEMENT_READ_MODE=mode,
        ENGAGEMENT_VIEWS_AGGREGATED='1' if aggregate else '0', ENGAGEMENT_COPY_PROOF='/copy-proof.json')
    if projected:
        env['HYBRID_K20_PROJECTED'] = '1'
    volumes = [str(cell / 'fanout-state') + ':/fanout-state', str(stages) + ':/fanout-stages']
    if hybrid:
        env['HYBRID_K20_ATTACHMENT_PROOF'] = '/hybrid-attachment-proof.json'
        volumes.append(str(parent / 'hybrid-attachment-proof.json') + ':/hybrid-attachment-proof.json:ro')
    if mode == 'uniform':
        volumes.append(str(parent / 'copy-proof.json') + ':/copy-proof.json:ro')
    overlay = cell / 'api.overlay.json'
    entry = ('engagement_tally_api' if json.loads((parent / 'admission.json').read_bytes()).get('tally_wiring_admitted') is True
        else 'engagement_api')
    if json.loads((parent / 'admission.json').read_bytes()).get('composition_admitted') is True:
        entry = 'hybrid_k20_attachment_api' if hybrid else 'engagement_composition_api'
        env['ENGAGEMENT_COMPOSITION_PROOF'] = '/composition-proof.json'
        volumes.append(str(parent / 'composition-proof.json') + ':/composition-proof.json:ro')
    if dau:
        entry = 'dau_sustain_cell'
        env['DAU_CELL_BUNDLE'] = '/dau-cell-bundle.json'
        volumes.append(str(bundle_path) + ':/dau-cell-bundle.json:ro')
    settings = {'volumes': volumes, 'environment': env,
        'command': ['uv', 'run', 'uvicorn', entry + ':application', '--host', '0.0.0.0', '--port', '80', '--no-access-log']}
    if dau:
        from dau_sustain_memory import DAU_API_NOFILE
        settings['ulimits'] = {'nofile': {'soft': DAU_API_NOFILE, 'hard': DAU_API_NOFILE}}
    if bundle_active:
        settings['command'] = ['uv', 'run', 'python', '/research/dau_serving_workers.py']
        settings['ports'] = [f'127.0.0.1:{port}:{index}' for index, port in enumerate(serving.READ_PORTS, 81)]
        settings['stop_grace_period'] = '610s'
    save(overlay, {'services': {'api': settings}})
    here = Path(__file__).parent
    compose = session.compose[:-2] + ['-f', str(here / 'arm_satellite_serve.compose.yml'), '-f', str(overlay), *session.compose[-2:]]
    environment = {**session.env, 'SATELLITE_SERVE_STATE': str(cell / 'serve-state')}
    restore.command(compose, environment, 'up', '-d', '--no-deps', 'api', timeout=180)
    arm_f_startup.ready(cell, compose, environment, boot_id)
    if bundle_active:
        from restore_dataset import wait_for
        for index, port in enumerate(serving.READ_PORTS, 1):
            wait_for(lambda port=port: urllib.request.urlopen(f'http://127.0.0.1:{port}/docs', timeout=3).status == 200,
                f'owned DAU read worker {index}')
            arm_f_startup.verify_hooks(cell, boot_id, receipt_path=f'fanout-state/read-workers/{index}/hook-install.json')
    if completion:
        verify(parent)
    return cell


def boot_views(parent, name, mode, *, module='engagement_views_api', extra=None):
    cell = root(parent, name)
    session = modern.Session(cell)
    stages, state = cell / 'F-stages', cell / 'fanout-state'
    stages.mkdir(mode=0o700)
    state.mkdir(mode=0o700)
    shutil.copyfile(cell / 'admission.json', state / 'admission.json')
    env = dict(ENGAGEMENT_CELL_STATE='/cell-state', ENGAGEMENT_READ_MODE=mode, FANOUT_STAGE_DIR='/cell-stages', **(extra or {}))
    overlay = cell / 'api.overlay.json'
    save(overlay, {'services': {'api': {'volumes': [str(state) + ':/cell-state', str(stages) + ':/cell-stages'],
        'environment': env, 'command': ['uv', 'run', 'uvicorn', module + ':application', '--host', '0.0.0.0', '--port', '80', '--no-access-log']}}})
    compose = session.compose[:-2] + ['-f', str(overlay), *session.compose[-2:]]
    restore.command(compose, session.env, 'up', '-d', '--no-deps', 'api', timeout=180)
    restore_dataset.wait_for(lambda: urllib.request.urlopen('http://127.0.0.1:6098/docs', timeout=3).status == 200, 'independent modern cell')
    return cell


def stop(parent):
    # Stopping an owned service is cleanup, including after admission expiry;
    # it is not permission for a new query or measurement.
    value = json.loads((Path(parent) / 'restore.json').read_bytes())
    compose = restore.commands(value['project'], value['api_port'], value['overlay'])
    env = {**os.environ, 'API_PORT': str(value['api_port']), 'COSTFN_RESEARCH_DIR': str(Path(__file__).parent),
        'COSTFN_REPO_DIR': str(Path(__file__).resolve().parents[3])}
    restore.command(compose, env, 'stop', 'api', timeout=60)


def harvest(parent, cell, http):
    """Collect failed queries by native request tag before any stage shutdown."""
    ids = [row['request_id'] for row in http.records if row['path'] != '/v3/login']
    if not ids:
        return
    from arm_satellite_sql import literal as q
    session = modern.Session(parent)
    session.query('cell_flush_failure_evidence', 'SYSTEM FLUSH LOGS')
    comments = [prefix + value for value in ids for prefix in ('F_READ:', 'F_WRITE:')]
    rows, _ = session.rows('cell_all_native', 'SELECT query_id,toString(type) AS type,log_comment,query_duration_ms,read_rows,read_bytes,'
        'written_rows,written_bytes,memory_usage,exception_code,exception FROM system.query_log WHERE log_comment IN ('
        + ','.join(q(value) for value in comments) + ") AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing') LIMIT 10000")
    save(Path(cell) / 'all-native-including-failures-and-writes.json', rows)


async def complete(parent, cell, profile, expected, *, uniform=False, serving_mode='F_DOCUMENT_STREAM_V1'):
    session = modern.Session(parent)
    http = HTTP(cell, session, Path(cell) / 'http')
    http.capture = queries.capture(http.capture, uniform)
    samples = []
    try:
        token = await http.login(profile['reader'])
        if session.operation.get('engagement_completion_admitted') is True:
            from engagement_certificates import verify
            verify(parent)
        for phase in ('warmup', 'measured'):
            before = reads.views(session, expected['ids'], phase + '_raw_delivery_before')
            sample = await http.sequence(token, profile['groups'], phase=phase)
            if sample['path_mode'] != serving_mode:
                raise ValueError('complete read silently fell back from the declared path')
            observation = http.observation(sample['request_ids'][-1])
            reads.compare(sample, expected, observation)
            if session.operation.get('composition_admitted') is True:
                from engagement_billboards import compare
                exact(compare, sample['rows'], expected['rows'], expected['billboard_setup'])
            actual = sample['followups'][2]
            after = reads.views(session, expected['ids'], phase + '_raw_delivery_after')
            raw = reads.visible_views(session, expected['ids'], expected['views_readable_groups'], phase + '_raw_canonical')
            save(Path(cell) / (phase + '-views-audit.json'), dict(before=before, after=after, scoped_expected=raw, actual=actual))
            for doc in expected['ids']:
                previous = before.get(doc, dict(impressions=0, reach=0))
                current = after.get(doc, dict(impressions=0, reach=0))
                if not (0 <= current['reach'] - previous['reach'] <= 1
                        and 0 <= current['impressions'] - previous['impressions'] <= expected['ids'].count(doc)):
                    raise ValueError('raw canonical delivery delta exceeds returned multiplicity')
            if actual != raw:
                raise ParityDivergence('complete HTTP view values differ from independent raw canonical events')
            sample['native'] = http.native(sample['request_ids'], phase)
            sample['parity'] = 'PASS'
            samples.append(sample)
            save(Path(cell) / (phase + '.json'), sample)
        return samples
    finally:
        try:
            harvest(parent, cell, http)
        except Exception as error:
            save(Path(cell) / 'native-collection-failure.json', __import__('arm_f_failure').details(error))
        await http.close()
        stop(parent)


def run_complete(parent, name, profile_name, mode, expected, *, serving_mode='F_DOCUMENT_STREAM_V1', aggregate=False,
                 projected=False, hybrid=False):
    options = dict(hybrid=True) if hybrid else {}
    cell = boot(parent, name, profile_name, mode, serving_mode=serving_mode, aggregate=aggregate, projected=projected, **options)
    profile = json.loads((Path(parent) / ('profile-' + profile_name + '.json')).read_bytes())
    return asyncio.run(complete(parent, cell, profile, expected, uniform=mode == 'uniform', serving_mode=serving_mode))
