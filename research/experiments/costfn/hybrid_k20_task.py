"""RD4 task continuation over one retained, source- and host-verified store."""
from pathlib import Path

from arm_f_native import save
from costfn_task import Task, digest, read
import engagement_cells as cells
import engagement_certificates as certificates
import engagement_composition as contract
import engagement_composition_setup as setup
import engagement_composition_verify as verify
import engagement_modern as modern
import hybrid_k20_baseline as baseline
import hybrid_k20_projected as projected
import hybrid_k20_run_current as current
import hybrid_k20_run_projected as comparison
import hybrid_k20_slice as fixed_slice


class Actions(current.Actions):
    def __init__(self, root, task):
        super().__init__(root)
        self.task = task

    def setup_step(self, name, action, *, tables=(), validate=None):
        def parts():
            session = modern.Session(self.root)
            return {table: setup.parts(session, table)[0] for table in tables}

        def reuse(stored):
            if validate is not None:
                validate()
            if stored['parts'] != parts():
                raise ValueError('retained preparation differs: ' + name)

        return self.task.step('prepare:' + name, lambda: dict(result=action(), parts=parts()), reuse)['result']

    def require_furniture(self, stored):
        certificate = certificates.verify(self.root)
        session = modern.Session(self.root)
        fingerprint = certificates.fingerprint(session)
        frozen = read(self.root / 'before-projection-fingerprint.json')
        if (frozen['canonical_content_sha256'] != fingerprint['canonical_content_sha256']
                or certificate['canonical_generation'] != fingerprint['canonical_generation']):
            raise ValueError('retained canonical bytes or generation differ')
        if stored['artifact_digests'] != furniture_artifacts(self.root):
            raise ValueError('retained furniture receipts differ')
        for name in ('tallies', 'pairs', 'pin-index'):
            record = self.task.state['steps']['prepare:' + name]['evidence']['parts']
            if record != {table: setup.parts(session, table)[0] for table in record}:
                raise ValueError('retained furniture parts differ: ' + name)
        live_copy = setup.parts(session, 'engagement_documents')[0]
        if live_copy != read(self.root / 'copy-proof.json')['parts_sha256']:
            raise ValueError('retained engagement copy differs')


def furniture_artifacts(root):
    return {name: digest(root / name) for name in ('before-projection-fingerprint.json', 'copy-proof.json',
        'certification.json', 'composition-aggregate-build.json', 'billboards/build.json')}


def fixture_artifacts(root):
    return {name: digest(root / name) for name in ('billboards/build.json',
        'reference-ordinary/expected-billboards.json', 'reference-fixture/expected-billboards.json')}


def require_digest(path, sha):
    if digest(path) != sha:
        raise ValueError('retained task artifact differs: ' + path.name)


def prep(actions):
    task, root = actions.task, actions.root
    actions.setup_step('restore', actions.restore, validate=lambda: modern.Session(root).verify_envelope())
    manifest = root / 'hybrid-k20-slice.json'
    names = ('ordinary', 'fixture')

    def slice_work():
        fixed_slice.prepare(actions)
        return dict(manifest_sha256=digest(manifest), oracle_files={name: digest(root / f'reference-{name}/expected.json')
            for name in names})

    def validate_slice(record):
        require_digest(manifest, record['manifest_sha256'])
        for name, sha in record['oracle_files'].items():
            require_digest(root / f'reference-{name}/expected.json', sha)

    slice_receipt = task.step('prepare:slice', slice_work, validate_slice)
    value = read(manifest)
    if (value['status'] != 'SOURCE_ORACLE_PARITY' or int(value['host']) != actions.approval['droplet_id']
            or int(value['tables']['content_events']['census']['n']) != comparison.BANKED_EVENT_COUNT):
        raise ValueError('same-host fixed slice with original event census and parity required')
    actions.expected = {name: read(root / f'reference-{name}/expected.json') for name in names}
    task.step('prepare:migration', lambda: actions.stage('migrate', {}))

    def fixtures():
        value = actions.stage('billboard-fixtures', {})
        return dict(result=value, artifacts=fixture_artifacts(root))

    def validate_fixtures(stored):
        for name, sha in stored['artifacts'].items():
            require_digest(root / name, sha)

    task.step('prepare:fixtures', fixtures, validate_fixtures)
    actions.expected = {name: read(root / f'reference-{name}/expected-billboards.json') for name in names}

    def furniture():
        value = actions.stage('furniture', {})
        return dict(result=value, artifact_digests=furniture_artifacts(root))

    task.step('prepare:furniture', furniture, actions.require_furniture)
    actions.aggregate_ready = True
    return slice_receipt


def gates(actions):
    task = actions.task
    sources = verify.binding()
    changed = [name for name in contract.GATES if (stored := task.state['steps'].get('gate:' + name))
        and stored['evidence']['source_binding'] != sources]
    if changed:
        task.restart('gate:' + name for name in contract.GATES)
    progress = {}
    for name in contract.GATES:
        stage = 'verify-' + name
        def evaluate():
            value = actions.stage(stage, progress)
            contract.gate(name, value)
            return value
        value = task.step('gate:' + name, evaluate, lambda stored: contract.gate(name, stored))
        progress[stage] = dict(evidence=value, outcome='PASS')


def measure(task, arm, attempt, expected):
    parent = task.root
    arm_name = baseline.CELL if arm == 'indexed' else comparison.CELL
    cell_name = f"{arm_name}-attempt-{attempt['number']}"

    def execute():
        cells.run_complete(parent, cell_name, 'ordinary', 'uniform', expected, aggregate=True,
            projected=arm == 'projected', serving_mode=baseline.CELL_SERVING_MODES[baseline.CELL_NAME])
        cell = parent / 'cells' / cell_name
        return dict(cell=cell_name, receipts={phase: digest(cell / (phase + '.json')) for phase in baseline.PHASES})

    def validate(stored):
        cell = parent / 'cells' / stored['cell']
        for phase, sha in stored['receipts'].items():
            require_digest(cell / (phase + '.json'), sha)
        baseline.audit_cell(cell)

    stored = task.step('measure:' + arm, execute, validate)
    return parent / 'cells' / stored['cell']


def run(root, approval, source, *, repair_note=None, restart_measurement=None):
    root = Path(root)
    task = Task(root, approval, source)
    with task.attempt(repair_note) as attempt:
        if restart_measurement:
            if not repair_note or attempt['number'] == 1:
                raise ValueError('record the treatment-changing repair before restarting a measurement')
            arms = ('indexed', 'projected') if restart_measurement == 'both' else (restart_measurement,)
            task.restart('measure:' + arm for arm in arms)
        modern.install_sessions()
        actions = Actions(root, task)
        try:
            slice_receipt = prep(actions)
            gates(actions)
            session = modern.Session(root)
            schema, _ = session.rows('k20_payload_version_schema', "SELECT type FROM system.columns WHERE database=currentDatabase() "
                "AND table='engagement_documents' AND name='updated_at'")
            if schema != [{'type': 'DateTime64(3)'}]:
                raise ValueError('K20 exact version seek requires the pinned millisecond schema')
            locations = {arm: measure(task, arm, attempt, actions.expected['ordinary']) for arm in ('indexed', 'projected')}
            result = dict(status='EVIDENCE_COLLECTED', **task.identity, source_end=source, **slice_receipt,
                hybrid='NOT_RUN', fault_suite='NOT_RUN')
            result.update({arm: baseline.audit_cell(directory) for arm, directory in locations.items()})
            result['measured_comparison'] = comparison.compare(locations['indexed'], locations['projected'],
                result['indexed'][-1], result['projected'][-1])
            result['indexed_plans'] = comparison.plans(session, locations['indexed'], result['indexed'][-1],
                ('preparation', 'counts_embedded_in_resolution'))
            result['projected_plans'] = comparison.plans(session, locations['projected'], result['projected'][-1], projected.STAGES)
            result['column_evidence'] = comparison.pruning(result['projected_plans'])
            save(root / 'hybrid-k20-projected-comparison.json', result)
            return result
        finally:
            if (root / 'restore.json').exists():
                cells.stop(root)
