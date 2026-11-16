"""Actual deploy rehearsal, then separately admitted F gates; banked P is cited."""
import argparse
import asyncio
from datetime import UTC, datetime
import json
from pathlib import Path
import shutil
import tempfile

import arm_f_banked as banked
import arm_f_environment as environment
from arm_f_gates import Programme, SCOPED_ORDER, digest
from arm_f_http import HTTP
import arm_f_lifecycle as lifecycle
from arm_f_programme import Actions
from arm_f_run import download, save
from arm_f_runtime import admitted
import arm_t
from arm_satellite_reconcile_native import run as native_rehearsal
from arm_satellite_sql import literal as q


def sources():
    here = Path(__file__).parent
    return {path.name: digest(path) for path in sorted([*here.glob('arm_f*.py'), here / 'arm_satellite_api.py'])}


def rehearsal_proof(root, approval):
    path = Path(root) / 'deploy-rehearsal.json'
    value = json.loads(path.read_bytes())
    if (digest(path) != approval.get('rehearsal_sha256') or value.get('outcome') != 'PASS'
            or value.get('source_sha256') != sources() or value.get('banked_P_sha256') != banked.ARCHIVE_SHA256
            or value.get('actual_authorized_publish') is not True or value.get('hook_readiness') != 'PASS'
            or value.get('droplet_id') == approval.get('droplet_id')
            or not value.get('request_id') or value.get('recipient_pointers') != 10
            or datetime.fromisoformat(value['completed_utc']) >= datetime.fromisoformat(approval['approved_utc'])):
        raise ValueError('source-bound actual-deploy authorized-publish rehearsal required before gates admission')
    return value


def initialize(scope, banked_archive, *, state, rehearsal=None, ssh_source_cidr=None):
    """Validate offline inputs/rehearsal BEFORE cloud.initialize starts any clock."""
    import arm_f_cloud as cloud
    with tempfile.TemporaryDirectory(prefix='f-scoped-') as directory:
        root = Path(directory)
        (root / 'banked-P.tar.gz').symlink_to(Path(banked_archive).resolve())
        banked.load(root)
        if scope == 'F_GATES_ONLY':
            if rehearsal is None:
                raise ValueError('no gates admission clock without a real rehearsal receipt')
            shutil.copyfile(rehearsal, root / 'deploy-rehearsal.json')
            rehearsal_proof(root, dict(rehearsal_sha256=digest(rehearsal), approved_utc=datetime.now(UTC).isoformat()))
        elif scope != 'F_DEPLOY_REHEARSAL':
            raise ValueError('explicit scoped purpose required')
        cloud.initialize(state=Path(state), scope=scope, ssh_source_cidr=ssh_source_cidr)
        controller = json.loads(Path(state).read_bytes())
        private = Path(controller['root'])
        shutil.copyfile(banked_archive, private / 'banked-P.tar.gz')
        if rehearsal is not None:
            shutil.copyfile(rehearsal, private / 'deploy-rehearsal.json')
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
        await http.close()
        environment.stop(root, engine=True)


def run(root):
    actions = ScopedActions(root)
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
        methods = (actions.publish, actions.parity, actions.quiet, actions.follow,
            actions.population, actions.populated, actions.rebuild, actions.stale, actions.boundaries, actions.load)
        for gate, action in zip(SCOPED_ORDER[2:], methods, strict=True):
            stage = gate
            runner.run(gate, action)
        return runner.results
    except BaseException as error:
        save(actions.root / 'scoped-stop.json', dict(outcome='STOP', failure_class=type(error).__name__,
            failed_stage=stage, classification=getattr(error, 'classification', 'gate_or_setup_failure'),
            scope=actions.approval['scope'], completed_gates=list(runner.results),
            unreached=[gate for gate in SCOPED_ORDER if gate not in runner.results]))
        raise
    finally:
        if actions.active_root:
            environment.stop(actions.active_root, engine=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path, nargs='?')
    parser.add_argument('--plan', action='store_true')
    args = parser.parse_args()
    if args.plan:
        print(json.dumps(dict(order=SCOPED_ORDER, P='PR#1572 CITED_NOT_REMEASURED', T7_admitted=False), indent=2))
    elif args.root:
        run(args.root)
    else:
        parser.error('ROOT or --plan required')
