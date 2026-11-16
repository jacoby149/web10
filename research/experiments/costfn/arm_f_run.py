"""Config F admitted experiment: fresh archive restore -> attributed P first.

No provisioning here. Runs only on the already guarded isolated DO host. Keeps
existing P implementations/oracles intact; stop/receipt on any setup failure.
"""
import argparse
import asyncio
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.request
import uuid

import httpx

import arm_t
import arm_satellite_batch as batch
import arm_satellite_batch_fixture as fixture
import arm_satellite_batch_run as batching
import arm_satellite_counts as counts
import arm_satellite_metadata as metadata
import arm_satellite_presence as presence
import arm_satellite_runtime as runtime
import arm_satellite_sql as typed
import arm_satellite_verify as verify
import core_feed
import restore_dataset
import restore_realism as restore


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix('.tmp')
    with temporary.open('w') as stream:
        json.dump(value, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def operation(root):
    admission = json.loads((root / 'admission.json').read_bytes())
    host = arm_t.digitalocean_id()
    start, deadline = (datetime.fromisoformat(admission[name]) for name in ('approved_utc', 'deadline_utc'))
    if (admission.get('configuration') != 'F' or admission.get('approved_by') != 'Jacob'
            or admission.get('droplet_id') != host or admission.get('dataset_id') != arm_t.DATASET
            or admission.get('budget_usd') != 2 or (deadline - start).total_seconds() != 14400
            or not start <= datetime.now(UTC) < deadline or admission.get('watchdog_verified') is not True):
        raise ValueError('current exact Config F admission required')
    # Explicit subordinate P-only baseline operation on the F lease. Not F build
    # approval disguised as a P receipt, and never reuse the historic lease.
    baseline = {**admission, 'kind': 'SATELLITE_CONFIG_P_OPERATION_APPROVAL', 'configuration': 'P',
                'fanout': False, 'canonical_sources_approved': True, 'scope_qualified_counts_approved': True,
                'purpose': 'Step0 P-only reproduction inside the separately admitted F programme',
                 'parent_admission_sha256': hashlib.sha256((root / 'admission.json').read_bytes()).hexdigest()}
    if admission.get('scope') in ('F_GATES_ONLY', 'F_DEPLOY_REHEARSAL'):
        baseline['purpose'] = 'P satellites as infrastructure only; PR#1572 comparator cited, no Step0 measurements'
    save(root / 'evidence/operation.json', baseline)
    return admission


def download(root):
    """Private read capabilities only. Never print URLs or exceptions containing one."""
    approved = json.loads((Path(__file__).parent / 'evidence/realism-1m-minio-publication-20261113.json').read_bytes())
    urls = json.loads((root / 'archive-urls.json').read_bytes())
    target = root / 'input'
    target.mkdir(mode=0o700, exist_ok=False)
    for item in approved['objects']:
        name = item['key'].rsplit('/', 1)[1]
        if name not in urls or '/' in name:
            raise ValueError('missing exact archive capability')
        print('[arm-f] archive read start', name, item['bytes'], flush=True)
        digest, size = hashlib.sha256(), 0
        try:
            with urllib.request.urlopen(urls[name], timeout=120) as response, (target / name).open('xb') as stream:
                while data := response.read(4 * 1024**2):
                    stream.write(data)
                    digest.update(data)
                    size += len(data)
                    if size > item['bytes']:
                        raise ValueError('archive exceeded declared bytes')
        except Exception:
            raise RuntimeError('archive read failed: ' + name) from None
        if size != item['bytes'] or digest.hexdigest() != item['sha256']:
            raise ValueError('archive exact byte/hash mismatch: ' + name)
        print('[arm-f] archive verified', name, flush=True)
    # verified_input independently verifies manifest identity and every file again.
    restore.verified_input(target, target / 'validation.json', arm_t.DATASET, arm_t.VALIDATION)
    readonly_input(target)
    save(root / 'evidence/archive.json', dict(dataset_id=arm_t.DATASET, validation_sha256=arm_t.VALIDATION,
        objects=approved['objects'], all_size_sha256_verified=True, source='canonical MinIO archive'))


def readonly_input(directory):
    """The read-only bind's unprivileged CH uid must be able to traverse it.

    Only already verified synthetic input files, never parent credentials or
    archive capabilities. Mode changes preserve every frozen byte/digest.
    """
    directory = Path(directory).resolve()
    names = [row['key'].rsplit('/', 1)[1] for row in json.loads((Path(__file__).parent /
        'evidence/realism-1m-minio-publication-20261113.json').read_bytes())['objects']]
    for name in names:
        path = directory / name
        if path.is_symlink() or not path.is_file():
            raise ValueError('verified regular archive file required')
        os.chmod(path, 0o444)
    os.chmod(directory, 0o555)


async def setup_scopes(root, session, *, reader_override=None, groups_override=None):
    """Exercise the real read gates with LIMIT0, not an untreated 361M-row cell."""
    output = root / 'profile'
    output.mkdir(mode=0o700, exist_ok=False)
    manifest = json.loads((root / 'input/manifest.json').read_bytes())
    reader = reader_override or manifest['readers'][1]
    q = typed.literal
    rows, _ = session.rows('setup_memberships', 'SELECT group_id,role FROM group_members FINAL WHERE member_key='
        + q(reader) + " AND deleted=0 AND endsWith(group_id,'/followers') ORDER BY group_id", setup_seconds=120)
    groups = [r['group_id'] for r in rows]
    if groups_override is None and sum(r['role'] == 'member' for r in rows) != 20:
        raise ValueError('ordinary K20 reader differs')
    if groups_override is not None:
        if not groups_override or len(groups_override) != len(set(groups_override)):
            raise ValueError('explicit distinct fixture group scope required')
        groups = list(groups_override)
    expected, _ = session.rows('setup_reference_ids', "SELECT doc_id,author_key FROM documents FINAL WHERE "
        "collection_name='posts' AND deleted=0 AND NOT has(tags,'ad') AND NOT has(tags,'product') AND doc_id IN "
        "(SELECT doc_id FROM doc_groups FINAL WHERE deleted=0 AND group_id IN ("
        + ','.join(q(g) for g in groups) + ')) ORDER BY created_at DESC,doc_id LIMIT 21', setup_seconds=900)
    if len(expected) != 21:
        raise ValueError('expected full ordinary page')
    scopes = root / 'scope-observer'
    scopes.mkdir(mode=0o700, exist_ok=False)
    here = Path(__file__).parent
    env = {**session.env, 'SATELLITE_OPERATION': str(root / 'evidence/operation.json'), 'SATELLITE_SCOPES_DIR': str(scopes)}
    compose = session.compose[:-2] + ['-f', str(here / 'arm_satellite_profile.compose.yml'), *session.compose[-2:]]
    restore.command(compose, env, 'up', '-d', '--no-deps', 'api', timeout=180)
    restore_dataset.wait_for(lambda: urllib.request.urlopen('http://127.0.0.1:6098/docs', timeout=3).status == 200, 'scope setup API')
    capture, actual = core_feed.wire(), {}
    async with httpx.AsyncClient(base_url='http://127.0.0.1:6098', timeout=120, trust_env=False) as client:
        login = await client.post('/v3/login', json={'username': reader, 'password': manifest['password'], 'site': 'costfn'})
        login.raise_for_status()
        token = login.json()['token']
        for item, kind in zip(capture['requests'][:3], ('main', 'reactions', 'comments')):
            value = core_feed.payload(item['payload'], token, groups,
                None if kind == 'main' else [row['doc_id'] for row in expected])
            import sqlglot
            value['sql'] = sqlglot.parse_one(value['sql'], read='clickhouse').limit(0).sql(dialect='clickhouse')
            request_id = uuid.uuid4().hex
            response = await client.post(item['path'], json=value, headers={'Origin': manifest['origin'], 'X-Research-ID': request_id})
            response.raise_for_status()
            observed = [json.loads(line) for line in (scopes / (request_id + '.jsonl')).read_text().splitlines()]
            if len(observed) != 1 or observed[0]['reader'] != reader:
                raise ValueError('actual scope observer missing/ambiguous')
            actual[kind] = observed[0]['readable']
    restore.command(session.compose, session.env, 'stop', 'api', timeout=60)
    profile = dict(dataset_id=arm_t.DATASET, droplet_id=session.host_id, reader=reader, groups=groups,
        reference_page=expected, actual_readable_by_kind=actual, satellite_builds_started=False,
        scope='real authenticated gate/compiler LIMIT0 setup; not untreated/performance evidence',
        fixture_scope=groups_override is not None)
    save(output / 'inventory.json', profile)
    return profile


def build_p_counts(root, session, profile):
    """Use unchanged p2 constructors/fixtures; no fabricated failed p1 prerequisite."""
    output = root / 'counts-batch-p2'
    output.mkdir(exist_ok=False)
    session.query('settle_documents', 'OPTIMIZE TABLE documents FINAL', setup_seconds=900)
    session.query('settle_links', 'OPTIMIZE TABLE doc_groups FINAL', setup_seconds=900)
    generation, parts = counts.generation(session)
    result = dict(kind='SATELLITE_BATCH_COUNT_BUILD_T1', outcome='BUILDING', T1='NOT_RUN',
        droplet_id=session.host_id, dataset_id=arm_t.DATASET, final_table=batching.FINAL, partial_table=batching.PARTS,
        canonical_generation=generation, canonical_parts=parts, scopes=[], build_queries=[], fanout=False,
        setup='fresh admitted Step0, unchanged batched p2 constructors; not a retry or reused old receipt')
    batching.save(output, result)
    try:
        session.query('count_parts_ddl', batch.partial_ddl(batching.PARTS))
        session.query('count_final_ddl', batch.count_ddl(batching.FINAL))
        fixture.verify(session, output, result, 8)
        high, _ = session.rows('setup_stratified_targets', "SELECT ref_value,count() AS n FROM documents FINAL "
            "WHERE collection_name='reactions' AND deleted=0 AND ref_value!='' GROUP BY ref_value ORDER BY n DESC,ref_value LIMIT 5",
            setup_seconds=900)
        ids = sorted({row['doc_id'] for row in profile['reference_page']} | {row['ref_value'] for row in high})
        result['stratified_targets'] = {'all_ids': ids, 'high_engagement': high}
        for label in ('main', 'reactions', 'comments'):
            readable = profile['actual_readable_by_kind'][label]
            recipes = [counter for counter in counts.RECIPES if counter.service in readable]
            mapping = {counter.service: readable[counter.service] for counter in recipes}
            scope = typed.scope_key(profile['reader'], mapping, generation, recipes)
            boundaries = {service: counts.canonical_boundary(service, groups, profile['reader']) for service, groups in mapping.items()}
            info = batching.build_scope(session, output, result, label, scope, boundaries, recipes, 8)
            info['groups_by_service'] = mapping
            info['comparisons'] = batching.compare(session, scope, ids, recipes, generation, mapping, profile['reader'])
            info['complete'] = True
            batching.save(output, result)
        if counts.generation(session)[0] != generation:
            raise ValueError('canonical generation changed during P count setup')
        result.update(outcome='BATCH_COUNTS_BUILT_T1_PASS', T1='PASS')
    except Exception as error:
        result.update(outcome='STOP', failure_class=type(error).__name__)
        raise
    finally:
        batching.save(output, result)
    return result


def baseline(root, *, verified_input=None, project='web10-costfn-frozen-satellite-fstep0'):
    root = Path(root).resolve()
    admission = operation(root)
    result = dict(kind='CONFIG_F_PROGRAMME_STEP0', outcome='PREPARING', stage='archive',
                  droplet_id=admission['droplet_id'], deadline_utc=admission['deadline_utc'], native_F_gates='NOT_RUN')
    if admission.get('full_population_backfill_required'):
        result.update(full_population_backfill='UNREACHED', seeded_population_fraction=0,
            population_prerequisites=['T4', 'T2-F', 'T6-F', 'T3-F'],
            later_gates=['T6-F-populated', 'T5-F-full-population', 'R+W-full-population'])
    save(root / 'result.json', result)
    session = None
    try:
        result['stage'] = 'checker_native_fixture'
        save(root / 'result.json', result)
        from arm_satellite_reconcile_native import run as check_fixture
        result['checker_native_fixture'] = check_fixture(root)['outcome']
        result['stage'] = 'archive'
        save(root / 'result.json', result)
        if verified_input is None:
            download(root)
        else:
            verified_input = Path(verified_input).resolve()
            prior = verified_input.parent / 'evidence/archive.json'
            receipt = json.loads(prior.read_bytes())
            if receipt.get('all_size_sha256_verified') is not True or receipt.get('source') != 'canonical MinIO archive':
                raise ValueError('actual archive receipt required; no retained-volume substitution')
            restore.verified_input(verified_input, verified_input / 'validation.json', arm_t.DATASET, arm_t.VALIDATION)
            readonly_input(verified_input)
            (root / 'input').symlink_to(verified_input, target_is_directory=True)
            save(root / 'evidence/archive.json', {**receipt, 'reused_verified_archive': True,
                'original_archive_receipt_sha256': hashlib.sha256(prior.read_bytes()).hexdigest()})
        result['stage'] = 'fresh_restore'
        save(root / 'result.json', result)
        restored = restore.restore(root / 'input', root / 'input/validation.json', arm_t.DATASET, arm_t.VALIDATION,
            project, 6098, root / 'restore.json')
        session = runtime.Session(root)
        session.verify_envelope()
        result['stage'] = 'scope_setup'
        save(root / 'result.json', result)
        profile = asyncio.run(setup_scopes(root, session))
        result['stage'] = 'P_satellite_setup'
        save(root / 'result.json', result)
        build_p_counts(root, session, profile)
        metadata.build(root, counts_receipt=root / 'counts-batch-p2/result.json')
        verify.verify(root)
        presence.build(root)
        result['stage'] = 'P_reference_and_serving'
        save(root / 'result.json', result)
        from arm_f_step0 import run
        verdict = run(root)
        result.update(stage='P_stage_report_ready', outcome='P_STEP0_COMPLETE', restore_project=restored['project'],
                      P_T2=verdict['T2'], P_observations=verdict.get('performance_observations'))
    except Exception as error:
        result.update(outcome='STOP', failure_class=type(error).__name__)
        print('[arm-f] STOP', result['stage'], type(error).__name__, flush=True)
        raise
    finally:
        result['updated_utc'] = datetime.now(UTC).isoformat()
        save(root / 'result.json', result)
        if session:
            restore.command(session.compose, session.env, 'stop', 'api', 'clickhouse', 'minio', timeout=120)
        else:
            # A failed restore may have created containers before restore.json.
            # Never leave them working until the provider deadline on that path.
            ids = subprocess.check_output(['docker', 'ps', '-q', '--filter',
                'label=com.docker.compose.project=' + project]).decode().split()
            if ids:
                subprocess.run(['docker', 'stop', '-t', '20', *ids], check=True, timeout=120)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--verified-input', type=Path, help='Explicit new restore attempt reusing fully verified archive bytes')
    parser.add_argument('--project', default='web10-costfn-frozen-satellite-fstep0')
    parser.add_argument('--programme', action='store_true', help='continue through all real F gates after Step0; no T7')
    args = parser.parse_args()
    baseline(args.root, verified_input=args.verified_input, project=args.project)
    if args.programme:
        from arm_f_programme import run
        run(args.root)
