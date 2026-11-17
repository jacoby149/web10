"""Nov16 read-first directive. Bank P/writes; preserve every STOP, no retries.

One provider snapshot rendezvous, driven by the supervising agent, not a new
controller. Snapshot retention is separate from droplet cleanup. Native coverage
is checked before the expensive infrastructure build and again before serving.
"""
import asyncio
from datetime import UTC, datetime
import json
from pathlib import Path
import shutil
import time

import arm_f_environment as environment
import arm_f_failure as failure
import arm_f_fixtures as fixtures
from arm_f_gates import digest
import arm_f_reads as reads
import arm_f_population as population
import arm_f_lifecycle as lifecycle
import arm_f_load as load
from arm_f_run import save, setup_scopes
from arm_f_runtime import Session
from arm_f_scoped import ScopedActions
import restore_dataset
import restore_realism as restore

DIRECTIVE = 'Jacob Hoffman 2026-11-16 read-first/prepared-snapshot'
ORDER = ('Banked-P', 'Banked-writes', 'Setup', 'Prepared-snapshot', 'T2-F', 'T6-F',
         'Population', 'T6-F-populated', 'R+W', 'T3-F', 'T5-F', 'T8-F', 'Boundaries')


def snapshot(actions):
    """Stop engines, request ONE account-private provider snapshot, await receipt."""
    root = actions.active_root
    environment.stop(root, engine=True)
    request = dict(directive=DIRECTIVE, droplet_id=actions.host, root=str(root),
        dataset_id=actions.approval['dataset_id'], restore_sha256=digest(root / 'restore.json'),
        fixture_sha256=digest(root / 'fixture.json'),
        coverage_sha256=digest(root / 'fixture-coverage.json'),
        F_build_sha256=digest(root / 'F-build/result.json'), engines_stopped=True,
        requested_utc=datetime.now(UTC).isoformat())
    path = actions.root / 'prepared-snapshot-request.json'
    save(path, request)
    print('[F-read-first] PREPARED_SNAPSHOT_REQUEST; engines stopped, agent action required', flush=True)
    receipt = actions.root / 'prepared-snapshot.json'
    while not receipt.exists():
        actions.check()
        time.sleep(2)
    value = json.loads(receipt.read_bytes())
    if (value.get('request_sha256') != digest(path) or value.get('droplet_id') != actions.host
            or value.get('outcome') != 'COMPLETED' or not value.get('snapshot_id')
            or value.get('provider_action_status') != 'completed'):
        raise ValueError('prepared provider snapshot incomplete or incorrectly bound')
    session = Session(root)
    restore.command(session.compose, session.env, 'up', '-d', 'clickhouse', 'minio', timeout=120)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'prepared snapshot engine')
    session.verify_envelope()
    return value


def prepare_page(actions, name):
    """Real authorized creates, independent oracle, unchanged coverage refusal."""
    actions.check()
    root = environment.fresh(actions.root, name)
    actions.active_root = root
    fixture = asyncio.run(fixtures.parity_fixture(root))
    profile = asyncio.run(setup_scopes(root, Session(root), reader_override=fixture['reader'],
        groups_override=fixture['groups']))
    expected = reads.reference(root)
    # Keep the private expected rows even when this raises. Never re-seed/retry.
    coverage = reads.fixture_coverage(fixture, expected)
    coverage.update(fixture_sha256=digest(root / 'fixture.json'),
        oracle_sha256=digest(root / 'F-reference/expected.json'),
        oracle_summary_sha256=digest(root / 'F-reference/summary.json'),
        fixture_clock_sha256=digest(root / 'fixture-clock.json'))
    save(root / 'fixture-coverage.json', coverage)
    print('[F-read-first] NATIVE_FIXTURE_COVERAGE_PASS', flush=True)
    environment.prepare(root, actions.root, profile=profile)
    return root, expected


def comparison(modes):
    result = {}
    for mode, samples in modes.items():
        result[mode] = [dict(phase=row['phase'], elapsed_ms=row['elapsed_ms'],
            read_rows=sum(int(q['read_rows']) for q in row['native']),
            read_bytes=sum(int(q['read_bytes']) for q in row['native']), parity=row['parity'],
            below_500ms=row['elapsed_ms'] < 500,
            below_25MB=sum(int(q['read_bytes']) for q in row['native']) < 25_000_000)
            for row in samples]
    return dict(observed_complete_sequences=result, formal_T6=False,
        comparators=dict(baseline_rows=361_000_000, baseline_bytes=24_320_000_000,
            Arm_T_rows=1_720_000, Arm_T_bytes=156_500_000, Arm_T_scope='MAIN_ONLY',
            P_complete_ms_approx=3300, P_complete_bytes_approx=484_000_000,
            P_status='BANKED_CITED_NOT_REMEASURED'), research_only=True)


def prepared_setup(actions, previous):
    """Same-lease pre-import name repair only; never resume a fixture/treatment."""
    previous = Path(previous)
    stopped = previous / 'read-first-stop.json'
    value = json.loads(stopped.read_bytes())
    original = json.loads((previous / 'admission.json').read_bytes())
    if (value.get('failed_stage') != 'Setup' or value.get('failure_message') != 'dedicated disposable project required'
            or value.get('completed') != ['Banked-P', 'Banked-writes']
            or original != actions.approval or list((previous / 'trials').glob('*/restore.json'))
            or list((previous / 'trials').glob('*/fixture.json'))):
        raise ValueError('only preserved pre-import project-name setup stop may reuse verified download')
    archive = json.loads((previous / 'evidence/archive.json').read_bytes())
    if archive.get('all_size_sha256_verified') is not True or archive.get('dataset_id') != actions.approval['dataset_id']:
        raise ValueError('verified frozen archive receipt required')
    (actions.root / 'input').symlink_to(previous / 'input', target_is_directory=True)
    save(actions.root / 'evidence/archive.json', archive)
    shutil.copytree(previous / 'orchestration-preflight', actions.root / 'orchestration-preflight')
    actions.rehearsal = actions.root / 'orchestration-preflight/population-native-fixture'
    save(actions.root / 'setup-continuation.json', dict(original_stop_sha256=digest(stopped),
        original_root=str(previous), same_admission=True, pre_import_only=True,
        original_failed_attempt_preserved=True, failed_fixture_or_treatment_retried=False))


def resume_fixture_page(actions, previous, trial):
    """Persisted pre-serving oracle repair, same canonical fixtures/restore/lease."""
    previous, trial = Path(previous).resolve(), Path(trial).resolve()
    stopped = previous / 'read-first-stop.json'
    value = json.loads(stopped.read_bytes())
    if (value.get('failed_stage') != 'Setup' or value.get('failure_class') != 'CalledProcessError'
            or '403: ambiguous canonical prepare identity' not in value.get('failure_stderr', '')
            or json.loads((previous / 'admission.json').read_bytes()) != actions.approval
            or trial != previous / 'trials/rf0' or (trial / 'F-build').exists()
            or (trial / 'F-reference/expected.json').exists() or (trial / 'F.stop').exists()):
        raise ValueError('only unchanged pre-serving full-key oracle failure may reuse fixture store')
    fixture = json.loads((trial / 'fixture.json').read_bytes())
    profile = json.loads((trial / 'profile/inventory.json').read_bytes())
    (actions.root / 'input').symlink_to(previous / 'input', target_is_directory=True)
    save(actions.root / 'evidence/archive.json', json.loads((previous / 'evidence/archive.json').read_bytes()))
    shutil.copytree(previous / 'orchestration-preflight', actions.root / 'orchestration-preflight')
    actions.rehearsal = actions.root / 'orchestration-preflight/population-native-fixture'
    actions.active_root = trial
    save(actions.root / 'fixture-store-continuation.json', dict(original_stop_sha256=digest(stopped),
        fixture_sha256=digest(trial / 'fixture.json'), restore_sha256=digest(trial / 'restore.json'),
        original_failed_oracle_preserved=True, fixture_reseeded=False, fresh_restore=False,
        before_serving=True, same_admission=True))
    session = Session(trial)
    restore.command(session.compose, session.env, 'up', '-d', 'clickhouse', 'minio', timeout=120)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'retained fixture store')
    session.verify_envelope()
    expected = reads.reference(trial, name='F-reference-fullkey')
    coverage = reads.fixture_coverage(fixture, expected)
    coverage.update(fixture_sha256=digest(trial / 'fixture.json'),
        oracle_sha256=digest(trial / 'F-reference-fullkey/expected.json'),
        oracle_summary_sha256=digest(trial / 'F-reference-fullkey/summary.json'),
        fixture_clock_sha256=digest(trial / 'fixture-clock.json'))
    save(trial / 'fixture-coverage.json', coverage)
    print('[F-read-first] NATIVE_FIXTURE_COVERAGE_PASS on retained unchanged fixture store', flush=True)
    environment.prepare(trial, actions.root, profile=profile)
    return trial, expected


def repair_generation_page(actions, previous, trial):
    """New source-bound attempt; preserve the failed fallback and rebuild caches."""
    import arm_f_infrastructure as infrastructure
    import arm_satellite_batch_run as batching
    import sqlite3
    previous, trial = Path(previous), Path(trial)
    stopped = json.loads((previous / 'read-first-stop.json').read_bytes())
    failed = json.loads((previous / 'read-first/T2-F/P_DOCUMENT_STREAM_V1/failure.json').read_bytes())
    if (stopped.get('failed_stage') != 'T2-F' or failed.get('completed_samples')
            or not any(r.get('path_mode') == 'canonical_fallback' and r.get('stop') for r in failed['requests'])
            or json.loads((trial / 'admission.json').read_bytes()) != actions.approval
            or not (trial / 'fanout-state/F.stop').exists()):
        raise ValueError('only preserved failed canonical-fallback setup may rebuild retained quiet store')
    environment.stop(trial, engine=True)
    with sqlite3.connect('file:' + str(trial / 'fanout-state/journal/intents.sqlite') + '?mode=ro', uri=True) as database:
        intents = database.execute('SELECT operation_id,state FROM intents').fetchall()
    if intents != [('canonical-bootstrap', 'complete')]:
        raise ValueError('generation setup repair cannot reset a served/mutating journal')
    actions.active_root = trial
    archive = trial / 'before-generation-repair'
    archive.mkdir(mode=0o700, exist_ok=False)
    for name in ('counts-batch-p2', 'metadata', 'metadata-parity', 'presence', 'serve-state', 'F-build',
                 'fanout-state', 'F-api-ready.json', 'F-api.overlay.json', 'fixture-coverage.json'):
        path = trial / name
        if path.exists():
            path.rename(archive / name)
    (actions.root / 'input').symlink_to(trial / 'input', target_is_directory=True)
    save(actions.root / 'evidence/archive.json', json.loads((trial / 'evidence/archive.json').read_bytes()))
    shutil.copytree(previous / 'orchestration-preflight', actions.root / 'orchestration-preflight')
    actions.rehearsal = actions.root / 'orchestration-preflight/population-native-fixture'
    session = Session(trial)
    restore.command(session.compose, session.env, 'up', '-d', 'clickhouse', 'minio', timeout=120)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'generation repair engine')
    # Only disposable derived tables created by the preserved build, never
    # canonical documents/grants/attachments, input archive or a retained Volume.
    for table in (batching.PARTS, batching.FINAL, 'strings', 'timestamps', 'doc_groups_t', 'fanout'):
        session.query('repair_drop_derived_' + table, 'DROP TABLE IF EXISTS ' + table, setup_seconds=120)
    profile = json.loads((trial / 'profile/inventory.json').read_bytes())
    environment.prepare(trial, actions.root, profile=profile)
    expected = reads.reference(trial, name='F-reference-settled')
    fixture = json.loads((trial / 'fixture.json').read_bytes())
    coverage = reads.fixture_coverage(fixture, expected)
    coverage.update(fixture_sha256=digest(trial / 'fixture.json'),
        oracle_sha256=digest(trial / 'F-reference-settled/expected.json'),
        oracle_summary_sha256=digest(trial / 'F-reference-settled/summary.json'),
        fixture_clock_sha256=digest(trial / 'fixture-clock.json'))
    save(trial / 'fixture-coverage.json', coverage)
    save(actions.root / 'generation-repair.json', dict(original_stop_sha256=digest(previous / 'read-first-stop.json'),
        original_failed_state_preserved=str(archive), fixture_reseeded=False, fresh_restore=False,
        canonical_tables_consolidated=list(infrastructure.CANONICAL_TABLES), derived_tables_rebuilt=True,
        measured_caps_unchanged=True, original_prepared_snapshot_cited=True))
    return trial, expected


def resume_prepared_views(actions, previous, trial):
    """Keep prepared data/caches; repair the evidenced view binding/check only."""
    previous, trial = Path(previous), Path(trial)
    stop = json.loads((previous / 'read-first-stop.json').read_bytes())
    failed = json.loads((previous / 'read-first/T2-F/P_DOCUMENT_STREAM_V1/failure.json').read_bytes())
    if (stop.get('failed_stage') != 'T2-F' or stop.get('failure_message') != 'quiet independent canonical views mismatch'
            or failed.get('completed_samples') or not failed.get('requests')
            or any(row.get('status') != 200 or row.get('stop') for row in failed['requests'])
            or (trial / 'fanout-state/F.stop').exists()
            or json.loads((trial / 'admission.json').read_bytes()) != actions.approval):
        raise ValueError('only the preserved successful-HTTP scoped-view check failure may reuse prepared store')
    actions.active_root = trial
    (actions.root / 'input').symlink_to(trial / 'input', target_is_directory=True)
    save(actions.root / 'evidence/archive.json', json.loads((trial / 'evidence/archive.json').read_bytes()))
    shutil.copytree(previous / 'orchestration-preflight', actions.root / 'orchestration-preflight')
    actions.rehearsal = actions.root / 'orchestration-preflight/population-native-fixture'
    session = Session(trial)
    restore.command(session.compose, session.env, 'up', '-d', 'clickhouse', 'minio', timeout=120)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'prepared view repair store')
    session.verify_envelope()
    environment.verify_generation(trial, session)
    expected = reads.reference(trial, name='F-reference-scoped-views')
    fixture = json.loads((trial / 'fixture.json').read_bytes())
    coverage = reads.fixture_coverage(fixture, expected)
    coverage.update(fixture_sha256=digest(trial / 'fixture.json'),
        oracle_sha256=digest(trial / 'F-reference-scoped-views/expected.json'),
        oracle_summary_sha256=digest(trial / 'F-reference-scoped-views/summary.json'),
        fixture_clock_sha256=digest(trial / 'fixture-clock.json'))
    (trial / 'fixture-coverage.json').rename(trial / 'fixture-coverage-before-scoped-views.json')
    save(trial / 'fixture-coverage.json', coverage)
    save(actions.root / 'views-repair.json', dict(original_stop_sha256=digest(previous / 'read-first-stop.json'),
        fixture_reseeded=False, fresh_restore=False, infrastructure_rebuilt=False,
        original_view_scope_preserved=True, raw_delivery_audit_retained=True, same_snapshot_audit_retained=True))
    return trial, expected


def run(root, *, prepared_from=None, fixture_store=None, generation_repair=False, views_repair=False):
    actions = ScopedActions(root)
    if actions.approval.get('run_directive') != DIRECTIVE:
        raise ValueError('explicit fresh read-first admission required')
    stage, completed = 'Banked-P', {}
    try:
        output = actions.root / 'read-first'
        output.mkdir(mode=0o700, exist_ok=False)
        completed[stage] = actions.cite(output)
        stage = 'Banked-writes'
        banked = json.loads((actions.root / 'banked-writes.json').read_bytes())
        if (digest(actions.root / 'banked-writes.json') != actions.approval.get('banked_writes_sha256')
                or banked.get('T4') != 'PASS'):
            raise ValueError('banked T4 validation receipt missing; never rerun writes')
        completed[stage] = dict(status='CITED_NOT_REMEASURED', sha256=digest(actions.root / 'banked-writes.json'))
        stage = 'Setup'
        if views_repair:
            trial_root, expected = resume_prepared_views(actions, prepared_from, fixture_store)
        elif generation_repair:
            trial_root, expected = repair_generation_page(actions, prepared_from, fixture_store)
        elif fixture_store is not None:
            trial_root, expected = resume_fixture_page(actions, prepared_from, fixture_store)
        elif prepared_from is None:
            actions.setup()
            trial_root, expected = prepare_page(actions, 'rf0')
        else:
            prepared_setup(actions, prepared_from)
            trial_root, expected = prepare_page(actions, 'rf0')
        completed[stage] = dict(root=str(trial_root), coverage_sha256=digest(trial_root / 'fixture-coverage.json'))
        stage = 'Prepared-snapshot'
        if generation_repair or views_repair:
            image = actions.root / 'prepared-snapshot.json'
            if not image.exists():
                image = Path(prepared_from) / 'prepared-snapshot.json'
            completed[stage] = {**json.loads(image.read_bytes()),
                'status': 'CITED_PREVIOUS_PREPARED_IMAGE_NOT_A_NEW_REPAIR_IMAGE'}
        else:
            completed[stage] = snapshot(actions)
        stage = 'T2-F'
        parity = asyncio.run(reads.identical_contract(trial_root, output / stage, expected=expected))
        completed[stage] = parity
        save(output / 'completed.json', completed)
        save(output / 'feed-read-comparison.json', comparison(parity['modes']))
        print('[F-read-first] COMPLETE_SEQUENCE_COMPARISON_RECORDED', flush=True)
        stage = 'T6-F'
        # T2's mixed/collision page is the diagnostic P/F comparison. Formal T6
        # keeps the ORIGINAL ordinary K20 workload and three fresh restores;
        # never promote a three-fixture-group cell to a K20 performance PASS.
        environment.discard_trial(trial_root)
        actions.active_root = None
        completed[stage] = asyncio.run(reads.performance(actions.root, output / stage))
        actions.active_root = Path(completed[stage]['final_root'])
        trial_root = actions.active_root
        save(output / 'read-gates.json', completed)
        early = dict(directive=DIRECTIVE, droplet_id=actions.host,
            dataset_id=actions.approval['dataset_id'], T2='PASS', T6='PASS',
            read_gates_path=str(output / 'read-gates.json'), read_gates_sha256=digest(output / 'read-gates.json'),
            banked_writes_path=str(actions.root / 'banked-writes.json'),
            banked_writes_sha256=actions.approval['banked_writes_sha256'])

        def seed(target):
            target = Path(target)
            save(target / 'read-first-early.json', early)
            shutil.copytree(actions.rehearsal, target / 'population-native-fixture')
            environment.stop(target)
            return population.build(target)

        def finish(gate, value):
            if value.get('verified') is not True:
                raise ValueError('later gate driver did not verify ' + gate)
            completed[gate] = value
            save(actions.root / 'F-gates' / gate / 'result.json', dict(gate=gate, outcome='PASS',
                droplet_id=actions.host, dataset_id=actions.approval['dataset_id'], evidence=value,
                **({'population_receipt_sha256': value['population_receipt_sha256']}
                   if 'population_receipt_sha256' in value else {})))
            save(output / 'completed.json', completed)

        stage = 'Population'
        actions.check()
        value = seed(trial_root)
        if value.get('seeded_fraction') != 1 or value.get('independent_sample_parity') != 'PASS':
            raise ValueError('full-population seed incomplete')
        finish(stage, dict(verified=True, population_receipt_sha256=digest(trial_root / 'F-population/result.json')))
        stage = 'T6-F-populated'
        actions.check()
        environment.discard_trial(trial_root)
        actions.active_root = None
        value = asyncio.run(reads.performance(actions.root, output / stage, populated=True, seed=seed))
        actions.active_root = Path(value['final_root'])
        value['population_receipt_sha256'] = digest(actions.active_root / 'F-population/result.json')
        finish(stage, value)
        for stage, operation in (
                ('R+W', lambda path: asyncio.run(load.run(actions.active_root, path))),
                ('T3-F', lambda path: asyncio.run(lifecycle.follow(actions.active_root, path))),
                ('T5-F', actions.rebuild), ('T8-F', actions.stale), ('Boundaries', actions.boundaries)):
            actions.check()
            path = output / stage
            path.mkdir(mode=0o700)
            finish(stage, operation(path))
        return completed
    except BaseException as error:
        failure.persist(actions.root, error, stage=stage, operation='read_first')
        save(actions.root / 'read-first-stop.json', dict(outcome='STOP', directive=DIRECTIVE,
            failed_stage=stage, **failure.details(error), completed=list(completed),
            unreached=[gate for gate in ORDER if gate not in completed],
            active_root=str(actions.active_root) if actions.active_root else None))
        raise
    finally:
        if actions.active_root:
            failure.before_cleanup(actions.root, stage=stage, operation='read_first')
            environment.stop(actions.active_root, engine=True)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--prepared-setup-from', type=Path)
    parser.add_argument('--fixture-store', type=Path)
    parser.add_argument('--generation-repair', action='store_true')
    parser.add_argument('--views-repair', action='store_true')
    args = parser.parse_args()
    run(args.root, prepared_from=args.prepared_setup_from, fixture_store=args.fixture_store,
        generation_repair=args.generation_repair, views_repair=args.views_repair)
