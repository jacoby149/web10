"""Complete Config F programme. Continue only after the reported original P Step0.

No provisioning, lease renewal, T7, production hooks, imported PASS files or paper
actions. Every stage executes its actual test; failure/time/cap stops the chain.
Run --plan without engine work, or ROOT on the currently admitted owned DO host.
"""
import argparse
import asyncio
from datetime import UTC, datetime
import json
from pathlib import Path
import shutil
import time

import arm_f_environment as environment
import arm_f_fixtures as fixtures
from arm_f_gates import Programme, ORDER, digest
import arm_f_lifecycle as lifecycle
import arm_f_load as load
import arm_f_population as population
import arm_f_reads as reads
from arm_f_run import save
from arm_f_runtime import Session, admitted
import arm_f_t4 as t4
from arm_satellite_reconcile_native import run as native_rehearsal
import arm_t
import restore_realism as restore


def wait_for_step0(root):
    root = Path(root)
    approval = json.loads((root / 'admission.json').read_bytes())
    host = arm_t.digitalocean_id()
    previous = None
    while True:
        deadline = admitted(approval, host)
        if (deadline - datetime.now(UTC)).total_seconds() < 180:
            raise TimeoutError('Step0 wait exhausted original cleanup margin')
        value = json.loads((root / 'result.json').read_bytes())
        if value.get('outcome') == 'P_STEP0_COMPLETE':
            return
        if value.get('outcome') == 'STOP':
            raise ValueError('original Step0 stopped; no automatic repair/restart/F continuation')
        if value.get('stage') != previous:
            print('[F-programme] waiting for original Step0:', value.get('stage'), flush=True)
            previous = value.get('stage')
        time.sleep(2)


class Actions:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.host = arm_t.digitalocean_id()
        self.approval = json.loads((self.root / 'admission.json').read_bytes())
        admitted(self.approval, self.host)
        if json.loads((self.root / 'result.json').read_bytes()).get('outcome') != 'P_STEP0_COMPLETE':
            raise ValueError('Step0 not complete; use --wait-for-step0, never create an early PASS/STOP gate')
        self.active_root = None
        self.rehearsal = None

    def check(self):
        deadline = admitted(self.approval, self.host)
        if (deadline - datetime.now(UTC)).total_seconds() < 180:
            raise TimeoutError('original cleanup margin reached; remaining gates UNREACHED')

    def step0(self, output):
        value = json.loads((self.root / 'result.json').read_bytes())
        parity = json.loads((self.root / 'serve-probe/config-p.json').read_bytes())
        stage = json.loads((self.root / 'step0-stage-table.json').read_bytes())
        if (value.get('outcome') != 'P_STEP0_COMPLETE' or value.get('droplet_id') != self.host
                or parity.get('T2') != 'PASS' or parity.get('droplet_id') != self.host
                or stage.get('complete_response_T2') != 'PASS' or not stage.get('per_request')):
            raise ValueError('original native Step0/parity/stage decomposition not complete; no F continuation')
        print('[F-programme] ORIGINAL_P_STAGE_TABLE=' + json.dumps(stage['per_request'], sort_keys=True), flush=True)
        save(self.root / 'evidence/step0-reported.json', dict(stage_table_sha256=digest(self.root / 'step0-stage-table.json'),
            reported_utc=datetime.now(UTC).isoformat(), source='original Step0, no relabelled F/oracle'))
        # Rehearse CURRENT builder/runtime sources after the old worker stops.
        # Original preflight and original Step0 files are never overwritten.
        environment.stop(self.root, engine=True)
        context = self.root / 'orchestration-preflight'
        context.mkdir(mode=0o700, exist_ok=False)
        shutil.copyfile(self.root / 'admission.json', context / 'admission.json')
        result = native_rehearsal(context)
        if result.get('outcome') != 'PASS':
            raise ValueError('new source native rehearsal failed')
        self.rehearsal = context / 'population-native-fixture'
        return dict(verified=True, original_parity_sha256=digest(self.root / 'serve-probe/config-p.json'),
            stage_table_sha256=digest(self.root / 'step0-stage-table.json'), new_rehearsal_sha256=digest(self.rehearsal / 'result.json'))

    def build(self, output):
        self.check()
        self.active_root = environment.fresh(self.root, 'write')
        environment.prepare(self.active_root, self.root)
        value = json.loads((self.active_root / 'F-build/result.json').read_bytes())
        if value.get('outcome') != 'F_BUILD_READY_FOR_T4' or not value.get('actual_ddl'):
            raise ValueError('actual F schema/canonical build unverified')
        environment.boot(self.active_root)  # Real installed hooks + ready API BEFORE entering T4.
        environment.stop(self.active_root)
        return dict(verified=True, root=str(self.active_root), build_sha256=digest(self.active_root / 'F-build/result.json'),
            api_ready_sha256=digest(self.active_root / 'F-api-ready.json'))

    def publish(self, output):
        self.check()
        value = asyncio.run(t4.run(self.active_root))
        if (value.get('T4') != 'PASS' or len(value.get('requests', [])) != 100
                or {row['members'] for row in value.get('groups', [])} != {10, 500, 999, 1999, 2000}
                or any(row.get('parity') != 'PASS' for row in value['requests'])):
            raise ValueError('real native T4 is incomplete')
        proof = digest(self.active_root / 'T4/result.json')
        environment.discard_trial(self.active_root)
        self.active_root = None
        return dict(verified=True, T4_sha256=proof, observations=value)

    def parity(self, output):
        self.check()
        self.active_root = environment.fresh(self.root, 'parity')
        fixture = asyncio.run(fixtures.parity_fixture(self.active_root))
        profile = asyncio.run(__import__('arm_f_run').setup_scopes(self.active_root, Session(self.active_root),
            reader_override=fixture['reader'], groups_override=fixture['groups']))
        if self.approval.get('scope') == 'F_GATES_ONLY':
            environment.prepare(self.active_root, self.root, profile=profile)
            value = asyncio.run(reads.identical_contract(self.active_root, output))
            environment.discard_trial(self.active_root)
            self.active_root = None
            return value
        # Scope capture already wrote profile; prepare must not fabricate it or
        # re-run group discovery as if this were the ordinary K20 trial.
        from arm_f_run import build_p_counts
        from arm_satellite_metadata import build as metadata
        from arm_satellite_verify import verify
        from arm_satellite_presence import build as presence
        from arm_f_native import build
        build_p_counts(self.active_root, Session(self.active_root), profile)
        metadata(self.active_root, counts_receipt=self.active_root / 'counts-batch-p2/result.json')
        verify(self.active_root)
        presence(self.active_root)
        environment.serving_state(self.active_root)
        build(self.active_root, step0_root=self.root)
        value = asyncio.run(reads.identical_contract(self.active_root, output))
        environment.discard_trial(self.active_root)
        self.active_root = None
        return value

    def quiet(self, output):
        self.check()
        value = asyncio.run(reads.performance(self.root, output))
        self.active_root = Path(value['final_root'])
        return value

    def follow(self, output):
        self.check()
        value = asyncio.run(lifecycle.follow(self.active_root, output))
        environment.discard_trial(self.active_root)
        self.active_root = None
        return value

    def seed(self, root):
        root = Path(root)
        gates = root / 'F-gates'
        gates.mkdir(mode=0o700, exist_ok=True)
        for gate in population.EARLY_GATES:
            destination = gates / gate
            destination.mkdir(mode=0o700, exist_ok=False)
            # These remain actual parent-programme proofs, with parent/source
            # hashes and original paths. Never call them fresh trial read results.
            shutil.copyfile(self.root / 'F-gates' / gate / 'result.json', destination / 'result.json')
        shutil.copytree(self.rehearsal, root / 'population-native-fixture')
        environment.stop(root)
        value = population.build(root)
        if value.get('seeded_fraction') != 1 or value.get('independent_sample_parity') != 'PASS':
            raise ValueError('full-population seed incomplete')
        return value

    def population(self, output):
        self.check()
        self.active_root = environment.fresh(self.root, 'population')
        environment.prepare(self.active_root, self.root)
        value = self.seed(self.active_root)
        return dict(verified=True, root=str(self.active_root), readers=value['readers_seeded'],
            population_receipt_sha256=digest(self.active_root / 'F-population/result.json'))

    def populated(self, output):
        self.check()
        environment.discard_trial(self.active_root)
        self.active_root = None
        value = asyncio.run(reads.performance(self.root, output, populated=True, seed=self.seed))
        self.active_root = Path(value['final_root'])
        value['population_receipt_sha256'] = digest(self.active_root / 'F-population/result.json')
        return value

    def rebuild(self, output):
        self.check()
        session = Session(self.active_root)
        restore.command(session.compose, session.env, 'up', '-d', 'clickhouse', 'minio', timeout=120)
        environment.stop(self.active_root)
        destination = self.active_root / 'F-gates/T6-F-populated'
        destination.mkdir(mode=0o700)
        shutil.copyfile(self.root / 'F-gates/T6-F-populated/result.json', destination / 'result.json')
        value = population.build(self.active_root, rebuild=True)
        if value.get('T5') != 'PASS':
            raise ValueError('actual full-population canonical rebuild failed')
        environment.boot(self.active_root)
        try:
            samples = asyncio.run(reads.sequences(self.active_root, output / 'read-spot', count=1,
                require_mode='F_DOCUMENT_STREAM_V1'))
            async def publication_spot():
                http = __import__('arm_f_http').HTTP(self.active_root, Session(self.active_root), output / 'publish-spot')
                try:
                    writer = http.manifest['readers'][0]
                    token = await http.login(writer)
                    await http.consent(token, fixtures.ORIGIN)
                    key = (await lifecycle.fixture_groups(http, writer, token, [10], prefix='T5-spot'))[0]['group_id']
                    await lifecycle.checked_publish(http, token, key)
                finally:
                    await http.close()
            asyncio.run(publication_spot())
        finally:
            environment.stop(self.active_root)
        return dict(verified=True, rebuild_sha256=digest(self.active_root / 'F-population-rebuild/result.json'), read_spot=samples,
            real_publish_spot='PASS')

    def stale(self, output):
        self.check()
        return asyncio.run(lifecycle.stale(self.active_root, output))

    def boundaries(self, output):
        self.check()
        return asyncio.run(lifecycle.boundaries(self.active_root, output))

    def load(self, output):
        self.check()
        return asyncio.run(load.run(self.active_root, output))


def run(root):
    actions = Actions(root)
    programme = Programme(root, actions.host)
    methods = (actions.step0, actions.build, actions.publish, actions.parity, actions.quiet, actions.follow,
               actions.population, actions.populated, actions.rebuild, actions.stale, actions.boundaries, actions.load)
    try:
        for gate, action in zip(ORDER, methods, strict=True):
            programme.run(gate, action)
    finally:
        if actions.active_root and (actions.active_root / 'restore.json').is_file():
            environment.stop(actions.active_root, engine=True)
    return programme.results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path, nargs='?')
    parser.add_argument('--plan', action='store_true', help='print exact executable gate order, no engine/network')
    parser.add_argument('--wait-for-step0', action='store_true', help='file-only bounded wait; original STOP is never retried')
    args = parser.parse_args()
    if args.plan:
        print(json.dumps({'order': ORDER, 'T6': '3 fresh restores x (1 warmup +100 measured)', 'T7_admitted': False}, indent=2))
    elif args.root:
        if args.wait_for_step0:
            wait_for_step0(args.root)
        run(args.root)
    else:
        parser.error('ROOT or --plan required')
