"""Actual deploy rehearsal, then separately admitted F gates; banked P is cited."""
import argparse
import asyncio
from datetime import UTC, datetime
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile

import arm_f_banked as banked
import arm_f_failure as failure
import arm_f_environment as environment
from arm_f_gates import Programme, SCOPED_ORDER, digest
from arm_f_http import HTTP
import arm_f_lifecycle as lifecycle
import arm_f_trim
from arm_f_trim_native import TRIM_SOURCES
from arm_f_programme import Actions
from arm_f_run import download, save
from arm_f_runtime import admitted
import arm_t
from arm_satellite_reconcile_native import run as native_rehearsal
from arm_satellite_sql import literal as q


def sources():
    here = Path(__file__).parent
    return {path.name: digest(path) for path in sorted([*here.glob('arm_f*.py'), here / 'arm_satellite_api.py'])}


BANKED_REHEARSAL_SHA256 = 'a47e4c2bc1781e8cd1c818a6540752b5f66ccd0beba24a9baf304d0d3e722133'


def trim_proof(root, approval):
    path = Path(root) / 'trim-native-proof.json'
    value = json.loads(path.read_bytes())
    native = value.get('native', [])
    if (digest(path) != approval.get('trim_native_sha256') or value.get('outcome') != 'PASS'
            or value.get('readers') != 2 or value.get('publications') != 205 or value.get('logical_cap') != 200
            or value.get('overlap_observed') is not True or value.get('journal_pending') != []
            or value.get('old_capture_failure', {}).get('failure_class') != 'ProgrammingError'
            or not value.get('old_capture_failure', {}).get('failure_traceback')
            or 'concurrent queries within the same session' not in value.get('old_capture_failure', {}).get('failure_message', '')
            or not native or any(int(row['exception_code']) or int(row['read_rows']) > 10_000_000 for row in native)
            or value.get('source_sha256') != {name: digest(Path(__file__).with_name(name)) for name in TRIM_SOURCES}
            or type(value.get('droplet_id')) is not int or value['droplet_id'] == approval.get('droplet_id')
            or not value.get('completed_utc')
            or datetime.fromisoformat(value['completed_utc']) >= datetime.fromisoformat(approval['approved_utc'])
            or value.get('engine') != '24.8.14.39'):
        raise ValueError('source-bound native publish/overflow/trim proof required before gates admission')
    return value


def rehearsal_proof(root, approval):
    path = Path(root) / 'deploy-rehearsal.json'
    value = json.loads(path.read_bytes())
    continuation = approval.get('trim_native_sha256') is not None
    if continuation:
        trim_proof(root, approval)
    source_valid = (digest(path) == BANKED_REHEARSAL_SHA256 if continuation else value.get('source_sha256') == sources())
    if (digest(path) != approval.get('rehearsal_sha256') or value.get('outcome') != 'PASS'
            or not source_valid or value.get('banked_P_sha256') != banked.ARCHIVE_SHA256
            or value.get('actual_authorized_publish') is not True or value.get('hook_readiness') != 'PASS'
            or value.get('droplet_id') == approval.get('droplet_id')
            or not value.get('request_id') or value.get('recipient_pointers') != 10
            or datetime.fromisoformat(value['completed_utc']) >= datetime.fromisoformat(approval['approved_utc'])):
        raise ValueError('source-bound actual-deploy authorized-publish rehearsal required before gates admission')
    return value


def initialize(scope, banked_archive, *, state, rehearsal=None, ssh_source_cidr=None, trim_native=None):
    """Validate offline inputs/rehearsal BEFORE cloud.initialize starts any clock."""
    import arm_f_cloud as cloud
    from arm_f_native import authorized_sources
    authorized_sources()  # Check every approved runtime pin BEFORE any clock.
    with tempfile.TemporaryDirectory(prefix='f-scoped-') as directory:
        root = Path(directory)
        (root / 'banked-P.tar.gz').symlink_to(Path(banked_archive).resolve())
        banked.load(root)
        if scope == 'F_GATES_ONLY':
            if rehearsal is None:
                raise ValueError('no gates admission clock without a real rehearsal receipt')
            shutil.copyfile(rehearsal, root / 'deploy-rehearsal.json')
            approval = dict(rehearsal_sha256=digest(rehearsal), approved_utc=datetime.now(UTC).isoformat())
            if trim_native is not None:
                shutil.copyfile(trim_native, root / 'trim-native-proof.json')
                approval['trim_native_sha256'] = digest(trim_native)
            rehearsal_proof(root, approval)
        elif scope != 'F_DEPLOY_REHEARSAL':
            raise ValueError('explicit scoped purpose required')
        cloud.initialize(state=Path(state), scope=scope, ssh_source_cidr=ssh_source_cidr)
        controller = json.loads(Path(state).read_bytes())
        private = Path(controller['root'])
        shutil.copyfile(banked_archive, private / 'banked-P.tar.gz')
        if rehearsal is not None:
            shutil.copyfile(rehearsal, private / 'deploy-rehearsal.json')
        if trim_native is not None:
            shutil.copyfile(trim_native, private / 'trim-native-proof.json')
            controller['trim_native_sha256'] = digest(trim_native)
            __import__('arm_f_failure').save(state, controller)
        return controller


class ScopedActions(Actions):
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.host = arm_t.digitalocean_id()
        self.approval = json.loads((self.root / 'admission.json').read_bytes())
        admitted(self.approval, self.host)
        if (self.approval.get('scope') not in ('F_GATES_ONLY', 'F_DEPLOY_REHEARSAL')
                or self.approval.get('banked_P_sha256') != banked.ARCHIVE_SHA256):
            raise ValueError('explicit scoped admission with immutable P citation required')
        banked.load(self.root)  # Before native work or any archive transfer.
        __import__('arm_f_native').authorized_sources()
        if self.approval['scope'] == 'F_GATES_ONLY':
            rehearsal_proof(self.root, self.approval)
        self.active_root = None
        self.rehearsal = None

    def cite(self, output):
        reference = banked.citation(self.root)
        save(output / 'P-cited-stage-table.json', reference)
        print('[F-scoped] PR#1572 baseline CITED; Step0 measurements=0', flush=True)
        return reference

    def setup(self):
        # Tiny pinned-engine population controls remain distinct from a real
        # deploy rehearsal and from full-store P parity, neither is implied here.
        context = self.root / 'orchestration-preflight'
        context.mkdir(mode=0o700)
        shutil.copyfile(self.root / 'admission.json', context / 'admission.json')
        native_rehearsal(context)
        self.rehearsal = context / 'population-native-fixture'
        download(self.root)  # Full manifest/byte/SHA verification, no regeneration.


async def one_publish(actions, output):
    root = actions.active_root
    session = environment.boot(root)
    http = HTTP(root, session, output)
    try:
        writer = http.manifest['readers'][0]
        token = await http.login(writer)
        await http.consent(token, lifecycle.ORIGIN)
        fixture = (await lifecycle.fixture_groups(http, writer, token, [10], prefix='deploy-rehearsal'))[0]
        doc, record = await lifecycle.checked_publish(http, token, fixture['group_id'])
        pointers, _ = session.rows('rehearsal_stored_pointers', 'SELECT reader_key,author_key FROM fanout WHERE doc_id='
            + q(doc['doc_id']) + ' AND deleted=0 ORDER BY reader_key LIMIT 11')
        if (len(pointers) != 10 or {row['reader_key'] for row in pointers} != set(fixture['members'])
                or any(row['author_key'] != writer for row in pointers)):
            raise ValueError('real rehearsal stored recipient pointers differ')
        observation = http.observation(record['request_id'])
        if not observation.get('fanout_publications'):
            raise ValueError('real authorized publication hook not observed')
        session.query('rehearsal_flush', 'SYSTEM FLUSH LOGS')
        native, _ = session.rows('rehearsal_real_publish_native', 'SELECT query_id,exception_code,read_rows,written_rows '
            'FROM system.query_log WHERE log_comment=' + q('F_WRITE:' + record['request_id'])
            + " AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
        if not native or any(int(row['exception_code']) or int(row['read_rows']) > 10_000_000 for row in native):
            raise ValueError('real rehearsal publish native failure/stop')
        return dict(outcome='PASS', actual_authorized_publish=True, hook_readiness='PASS',
            request_id=record['request_id'], operation_id=record['operation_id'], doc_id=doc['doc_id'],
            recipient_pointers=10, native=native, api_ready_sha256=digest(root / 'F-api-ready.json'))
    finally:
        failure.before_cleanup(output, operation='one_publish')
        await http.close()
        environment.stop(root, engine=True)


def run(root):
    try:
        actions = ScopedActions(root)
    except BaseException as error:
        failure.persist(root, error, stage='initialization', operation='ScopedActions')
        raise
    is_rehearsal = actions.approval['scope'] == 'F_DEPLOY_REHEARSAL'
    runner = Programme(root, actions.host, scoped=True)
    stage = 'Banked-P'
    try:
        runner.run('Banked-P', actions.cite)
        stage = 'archive_restore_or_fixture_preflight'
        actions.setup()
        stage = 'Build'
        runner.run('Build', actions.build)
        if is_rehearsal:
            stage = 'actual_deploy_rehearsal'
            output = actions.root / 'deploy-publish'
            output.mkdir(mode=0o700)
            result = asyncio.run(one_publish(actions, output))
            result.update(source_sha256=sources(), droplet_id=actions.host,
                banked_P_sha256=banked.ARCHIVE_SHA256, completed_utc=datetime.now(UTC).isoformat(),
                gates_run=False, F_performance_claim=False)
            save(actions.root / 'deploy-rehearsal.json', result)
            print('[F-scoped] ACTUAL_DEPLOY_REHEARSAL_PASS; no gates lease started', flush=True)
            return result
        if actions.approval.get('trim_native_sha256'):
            stage = 'trim-first'
            asyncio.run(arm_f_trim.run(actions.active_root, actions.root / 'trim-first'))
        methods = (actions.publish, actions.parity, actions.quiet, actions.follow,
            actions.population, actions.populated, actions.rebuild, actions.stale, actions.boundaries, actions.load)
        for gate, action in zip(SCOPED_ORDER[2:], methods, strict=True):
            stage = gate
            runner.run(gate, action)
        return runner.results
    except BaseException as error:
        failure.persist(actions.root, error, stage=stage, operation='scoped_run')
        save(actions.root / 'scoped-stop.json', dict(outcome='STOP', **failure.details(error),
            failed_stage=stage, classification=getattr(error, 'classification', 'gate_or_setup_failure'),
            scope=actions.approval['scope'], completed_gates=list(runner.results),
            unreached=[gate for gate in SCOPED_ORDER if gate not in runner.results]))
        raise
    finally:
        if actions.active_root:
            environment.stop(actions.active_root, engine=True)


def recover_unserved_startup_state(trial, approval):
    """A new rehearsal-only boot state; never erase a failed/served worker."""
    trial = Path(trial)
    admission = json.loads((trial / 'admission.json').read_bytes())
    state = trial / 'fanout-state'
    if (admission.get('scope') != 'F_DEPLOY_REHEARSAL' or state.is_symlink()
            or (trial / 'F-api-ready.json').exists() or list((state / 'requests').glob('*.jsonl'))
            or digest(state / 'F.stop') != approval.get('startup_marker_sha256')
            or digest(trial / 'F-startup-failure.json') != approval.get('startup_failure_sha256')
            or digest(trial / 'F-startup-api.log') != approval.get('startup_log_sha256')):
        raise ValueError('only exact never-ready/never-served rehearsal startup recovery allowed')
    with sqlite3.connect('file:' + str(state / 'journal/intents.sqlite') + '?mode=ro', uri=True) as database:
        intents = database.execute('SELECT operation_id,state FROM intents').fetchall()
    if intents != [('canonical-bootstrap', 'complete')]:
        raise ValueError('served/pending workload journal cannot be reset for rehearsal')
    previous = trial / 'fanout-state-stopped-startup'
    if previous.exists():
        raise ValueError('startup recovery attempt already exists')
    state.rename(previous)
    shutil.copyfile(trial / 'F-startup-failure.json', previous / 'startup-failure.json')
    shutil.copyfile(trial / 'F-startup-api.log', previous / 'startup-api.log')
    shutil.copytree(previous, state, ignore=shutil.ignore_patterns('F.stop', 'hook-install.json'))
    return dict(old_marker_sha256=approval['startup_marker_sha256'], original_failed_state_preserved=True,
        never_served=True, fresh_performance_trial=False)


def repair_rehearsal(root, *, approval_name='rehearsal-repair-approval.json'):
    """Explicitly approved checker-only repair on rehearsal infrastructure.

    Does not resume/overwrite a stopped Programme, restore receipt or gate.
    Gates trials cannot enter this path and still require their fresh restores.
    """
    import arm_f_infrastructure as infrastructure
    import arm_f_native
    from arm_f_runtime import Session
    import arm_satellite_counts as counts
    import restore_dataset
    import restore_realism as restore
    actions = ScopedActions(root)
    if actions.approval['scope'] != 'F_DEPLOY_REHEARSAL':
        raise ValueError('repair reuse is never a gates trial')
    root = actions.root
    if approval_name not in ('rehearsal-repair-approval.json', 'rehearsal-ready-approval.json', 'rehearsal-startup-approval.json'):
        raise ValueError('unknown rehearsal repair checkpoint')
    approval_path = root / approval_name
    approval = json.loads(approval_path.read_bytes())
    startup = approval_name == 'rehearsal-startup-approval.json'
    ready = approval_name in ('rehearsal-ready-approval.json', 'rehearsal-startup-approval.json')
    forensic = root / 'forensics/transpose-spot-20261116/rows.json'
    if (approval.get('approved_by') != 'Jacob' or approval.get('droplet_id') != actions.host
            or approval.get('original_stop_sha256') != digest(root / 'scoped-stop.json')
            or approval.get('forensic_sha256') != digest(forensic)
            or approval.get('deadline_utc') != actions.approval['deadline_utc']
            or approval.get('reason') != ('LIFESPAN_SCHEMA_WARNING_ONLY' if startup else
                'AUTHORIZED_SCOPED_ADAPTER_PIN_REBIND' if ready else 'EXPLICIT_SQL_OUTPUT_ALIASES_ONLY')):
        raise ValueError('exact stopped-rehearsal forensic repair approval required')
    evidence = json.loads(forensic.read_bytes())['queries']
    canonical = evidence['infra_transpose_canonical']['rows']
    stored = evidence['infra_transpose_stored']['rows']
    # This proves the *cause* of the old STOP; live checking below uses explicit
    # SQL aliases and unchanged strict equality, not runtime key normalization.
    renamed = [{({'g.updated_at': 'updated_at', 'g.deleted': 'deleted'}.get(key, key)): value
                for key, value in row.items()} for row in canonical]
    if not canonical or renamed != stored:
        raise ValueError('forensics did not prove an output-label-only checker defect')
    if ready:
        required = {'counts-batch-p2/result.json', 'metadata-repaired/result.json',
                    'metadata-parity-repaired/result.json', 'presence/result.json'}
        bound = approval.get('completed_infrastructure_sha256', {})
        trial = root / 'trials/write'
        if (set(bound) != required or any(digest(trial / name) != checksum for name, checksum in bound.items())
                or approval.get('previous_repair_stop_sha256') != digest(root / ('rehearsal-repair-2/stop.json' if startup else 'rehearsal-repair-1/stop.json'))
                or (not startup and (trial / 'F-build').exists())):
            raise ValueError('ready checkpoint requires exact completed infrastructure and pre-DDL STOP')
        states = [json.loads((trial / name).read_bytes()) for name in sorted(required)]
        if any(row.get('outcome') not in ('INFRASTRUCTURE_BUILT_SPOTS_PASS', 'BOUNDED_SPOT_PASS') for row in states):
            raise ValueError('unfinished infrastructure cannot be reused')
    output = root / ('rehearsal-repair-3' if startup else 'rehearsal-repair-2' if ready else 'rehearsal-repair-1')
    output.mkdir(mode=0o700)
    actions.active_root = root / 'trials/write'
    trial = actions.active_root
    session = Session(trial)
    try:
        if startup:
            if restore.command(session.compose, session.env, 'ps', '-q', 'api', timeout=10).strip():
                raise ValueError('failed API must already be stopped')
            if digest(trial / 'F-build/result.json') != approval.get('F_build_sha256'):
                raise ValueError('existing native F build receipt differs')
            recovery = recover_unserved_startup_state(trial, approval)
            save(output / 'startup-state-recovery.json', recovery)
        restore.command(session.compose, session.env, 'up', '-d', '--no-deps', 'clickhouse', 'minio', timeout=120)
        restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'owned rehearsal repair engine')
        session.verify_envelope()
        generation = json.loads((trial / 'counts-batch-p2/result.json').read_bytes())['canonical_generation']
        if counts.generation(session)[0] != generation:
            raise ValueError('canonical generation changed; no rehearsal infrastructure reuse')
        profile = json.loads((trial / 'profile/inventory.json').read_bytes())
        if ready:
            paths = {'metadata': trial / 'metadata-repaired/result.json', 'parity': trial / 'metadata-parity-repaired/result.json'}
        else:
            paths = infrastructure.build_metadata(trial, session, profile, generation, reuse=trial / 'metadata')
            ids = json.loads((trial / 'counts-batch-p2/result.json').read_bytes())['stratified_targets']['all_ids']
            infrastructure.build_presence(trial, session, profile, generation, banked.load(root), ids, False)
        if counts.generation(session)[0] != generation:
            raise ValueError('canonical generation changed during rehearsal repair')
        environment.serving_state(trial, overrides=paths)
        if startup:
            build = json.loads((trial / 'F-build/result.json').read_bytes())
            actual_ddl, _ = session.query('rehearsal_existing_F_ddl', 'SHOW CREATE TABLE fanout')
            if build.get('outcome') != 'F_BUILD_READY_FOR_T4' or actual_ddl != build['actual_ddl']:
                raise ValueError('existing native F DDL differs; no startup-only recovery')
        else:
            arm_f_native.build(trial, step0_root=root)
        result = asyncio.run(one_publish(actions, output))
        result.update(source_sha256=sources(), droplet_id=actions.host, banked_P_sha256=banked.ARCHIVE_SHA256,
            completed_utc=datetime.now(UTC).isoformat(), gates_run=False, F_performance_claim=False,
            original_STOP_sha256=digest(root / 'scoped-stop.json'), repair_approval_sha256=digest(approval_path),
            rehearsal_infrastructure_reused=True, fresh_performance_trial=False,
            original_restore_sha256=digest(trial / 'restore.json'))
        save(root / 'deploy-rehearsal.json', result)
        print('[F-scoped] ACTUAL_DEPLOY_REHEARSAL_PASS_AFTER_CHECKER_REPAIR; original STOP retained', flush=True)
        return result
    except BaseException as error:
        failure.persist(output, error, operation='repair_rehearsal')
        save(output / 'stop.json', dict(outcome='STOP', **failure.details(error), original_STOP_preserved=True))
        raise
    finally:
        environment.stop(trial, engine=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path, nargs='?')
    parser.add_argument('--plan', action='store_true')
    parser.add_argument('--repair-rehearsal', action='store_true')
    parser.add_argument('--repair-approval', default='rehearsal-repair-approval.json')
    args = parser.parse_args()
    if args.plan:
        print(json.dumps(dict(order=SCOPED_ORDER, P='PR#1572 CITED_NOT_REMEASURED', T7_admitted=False), indent=2))
    elif args.root:
        repair_rehearsal(args.root, approval_name=args.repair_approval) if args.repair_rehearsal else run(args.root)
    else:
        parser.error('ROOT or --plan required')
