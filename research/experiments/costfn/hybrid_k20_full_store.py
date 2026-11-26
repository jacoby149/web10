"""RD4 full-store hybrid K20: the missing two-by-two cell on the frozen store.

Contract: FULL-STORE-HYBRID.md. One task admission; the 24-hour host timer is
a failsafe, not a deadline. The indexed baseline is cited from the banked
PR #1618 receipt, never re-measured.
"""
import argparse
from pathlib import Path

from arm_f_native import save
from costfn_task import Task, read, digest
import arm_f_infrastructure as infrastructure
import engagement_cells as cells
import engagement_certificates as certificates
import engagement_composition as contract
import engagement_composition_setup as setup
import engagement_modern as modern
import engagement_prepared as prepared
import hybrid_k20_attachment as attachment
import hybrid_k20_baseline as baseline
import hybrid_k20_projected as projected
import hybrid_k20_run_current as current
import hybrid_k20_run_projected as comparison
import hybrid_k20_task as hybrid_task


HOT_TABLES = tuple(infrastructure.CANONICAL_TABLES)
EVENT_TABLE = 'content_events'

BANKED_BASELINE = dict(
    pr='#1618',
    receipt='research/experiments/costfn/evidence/skinny-pin-20261122/RESULTS.md',
    arm='indexed',
    parity='PASS',
    logical_bytes=123_119_689,
    http_wall_ms=7_017.152,
    cited_not_remeasured=True,
    note='banked same-store indexed uniform K20; the standing pattern (cited banked baseline, no repeat)')

CLAIM_BOUNDARY = ('the measured full-store hybrid demand replaces the arithmetic row; the measured ratio '
    'is reported, not assumed from the slice; no live-maintenance, supply or production claim follows')

SLICE_TRANSIENT_REFERENCE = dict(
    logical_bytes='620.85 MB -> 182.34 MB captured (-70.6%), exact ordered parity, both orders',
    regime='transient pre-merge regime; banked as-is and not relabelled')


def source_guard(approval):
    # Same explicit binding as the baseline-only runner: exact snapshot, no
    # layout-clock admission, no row model, named source commit.
    sha = current.source_guard(approval)
    return sha


def parts_census(session, table):
    rows, query_id = session.rows('full_store_census_' + table,
        "SELECT count() AS parts,toString(coalesce(sum(rows),0)) AS rows,"
        "toString(coalesce(sum(data_compressed_bytes),0)) AS compressed_bytes,"
        "toString(coalesce(sum(data_uncompressed_bytes),0)) AS uncompressed_bytes "
        "FROM system.parts WHERE database='web10' AND active AND table='" + table + "'")
    value = dict(table=table, query_id=query_id, **rows[0])
    value['parts'] = int(value['parts'])
    return value


def steady_state(root):
    """Declared post-merge regime, stated not assumed: OPTIMIZE the version-
    carrying canonical hot tables, bank the parts census before and after.
    content_events is an append-only event log: its merge regime is banked as
    parts, never OPTIMIZED here."""
    session = modern.Session(root)
    before = {table: parts_census(session, table) for table in (*HOT_TABLES, EVENT_TABLE)}
    optimizes = []
    for table in HOT_TABLES:
        _, query_id = session.query('full_store_optimize_' + table, 'OPTIMIZE TABLE ' + table + ' FINAL',
            setup_seconds=900)
        optimizes.append(dict(table=table, query_id=query_id, native=session.native(query_id)))
    after = {table: parts_census(session, table) for table in (*HOT_TABLES, EVENT_TABLE)}
    receipt = dict(
        regime='POST_MERGE_STEADY_STATE_STATED_NOT_ASSUMED',
        declaration='The canonical tables are ReplacingMergeTree(updated_at); one-version-per-key is the '
            'engine steady state. content_events is an append-only event log, banked as parts only.',
        cost_reference='slice run banked OPTIMIZE receipt 61.7 s native / ~1.4 GB peak; this receipt states its own',
        before=before, optimizes=optimizes, after=after,
        event_parts_before=before[EVENT_TABLE], event_parts_after=after[EVENT_TABLE])
    save(root / 'full-store-steady-state.json', receipt)
    return receipt


class Actions(hybrid_task.Actions):
    def __init__(self, root, task):
        super().__init__(root, task)
        value = self.approval.get('aggregate_seed_day_buckets')
        if type(value) is int:
            # The banked seed planner owns a {day: buckets} dict (one slice per
            # owned day by default) and the all-time backfill its own bounded
            # batches; an int is a malformed value, not a workload. Normalize to
            # the banked default and record the repair in the admission copy the
            # task receipt carries — the admitted document itself is unchanged.
            self.approval['aggregate_seed_day_buckets_repaired_from'] = value
            self.approval['aggregate_seed_day_buckets'] = None

    def base_infrastructure(self):
        # The banked full-store adoption path: settle canonical, stop merges,
        # the initial K20 count setup, adopt the prepared snapshot receipts,
        # rebuild the fanout template and bind the physical certificate.
        return prepared.run(self.root)

    def expected_events(self):
        return 1_600_000_000


def validate_furniture(stored, root):
    session = modern.Session(root)
    certificates.verify(root)
    live_copy = setup.parts(session, 'engagement_documents')[0]
    if live_copy != stored['copy_parts']:
        raise ValueError('retained engagement copy differs after furniture reuse')
    aggregates, _ = session.rows('furniture_validate_aggregates',
        "SELECT count() AS n FROM system.tables WHERE database='web10' AND name IN "
        "('content_events_aggregated','content_events_aggregated_all_time')")
    if int(aggregates[0]['n']) != 2:
        raise ValueError('both aggregate grains required after furniture reuse')


def load_expected(root, actions):
    """The gates verify against the billboard-applied references. When the
    read-setup step is reused, its in-memory profiles never ran in this
    attempt, so the persisted receipts are the authority."""
    if not actions.expected:
        actions.expected = {name: read(root / ('reference-' + name) / 'expected-billboards.json')
            for name in ('ordinary', 'fixture')}
    return actions.expected


def gate_stage(actions, name, progress):
    value = actions.stage('verify-' + name, progress)
    contract.gate(name, value)
    return value


def satellite_stage(root):
    session = modern.Session(root)
    proof = attachment.build(session, root, chunked=True)
    return proof


def validate_satellite(stored, root):
    session = modern.Session(root)
    attachment.verify_parts(lambda sql: session.rows('hybrid_attachment_revalidate', sql)[0], stored)


def measure(task, root, trial, attempt, expected):
    def execute():
        cell_name = f"hybrid-K20-r{trial}-attempt-{attempt['number']}"
        cells.run_complete(root, cell_name, 'ordinary', 'uniform', expected,
            aggregate=True, projected=True, hybrid=True,
            serving_mode=baseline.CELL_SERVING_MODES[baseline.CELL_NAME])
        cell = root / 'cells' / cell_name
        return dict(cell=cell_name, audit=baseline.audit_cell(cell))

    def validate(stored):
        baseline.audit_cell(root / 'cells' / stored['cell'])

    stored = task.step(f'r{trial}:hybrid:capture', execute, validate=validate)
    return root / 'cells' / stored['cell'], stored['audit']


def run(root, *, note=None):
    root = Path(root).resolve()
    approval = read(root / 'admission.json')
    sha = source_guard(approval)
    task = Task(root, approval, sha)
    with task.attempt(note) as attempt:
        modern.install_sessions()
        actions = Actions(root, task)
        try:
            task.step('restore', lambda: actions.restore(),
                validate=lambda stored: modern.Session(root).verify_envelope())
            task.step('steady-state', lambda: steady_state(root))
            task.step('read-setup', lambda: actions.stage('read-setup', {}))
            task.step('migrate', lambda: actions.stage('migrate', {}))
            task.step('billboard-fixtures', lambda: actions.stage('billboard-fixtures', {}))

            def furniture_work():
                value = actions.stage('furniture', {})
                value['copy_parts'] = setup.parts(modern.Session(root), 'engagement_documents')[0]
                return value

            task.step('furniture', furniture_work,
                validate=lambda stored: validate_furniture(stored, root))
            load_expected(root, actions)
            progress = {}
            for name in contract.GATES:
                value = task.step('gate:' + name,
                    (lambda name=name: gate_stage(actions, name, progress)),
                    (lambda stored, name=name: contract.gate(name, stored)))
                progress['verify-' + name] = dict(outcome='PASS', evidence=value)
            expected = read(root / 'reference-ordinary/expected-billboards.json')
            satellite = task.step('satellite', lambda: satellite_stage(root),
                validate=lambda stored: validate_satellite(stored, root))
            rounds = []
            session = modern.Session(root)
            for trial in (1, 2):
                cell, audit = measure(task, root, trial, attempt, expected)
                rounds.append(dict(trial=trial, cell=cell.name, phases=audit,
                    plans=comparison.plans(session, cell, audit[-1], projected.STAGES),
                    measured_captured_totals=audit[-1]['captured_totals'],
                    measured_http_wall_ms=audit[-1]['complete_http_wall_ms']))
            derived = dict(
                per_read_logical_bytes={str(r['trial']):
                    r['measured_captured_totals']['logical_read_bytes'] for r in rounds},
                steady_state_ratio_vs_cited_indexed={
                    str(r['trial']): round(r['measured_captured_totals']['logical_read_bytes']
                        / BANKED_BASELINE['logical_bytes'], 4) for r in rounds},
                label='derived arithmetic on measured captured logical bytes; reported, not assumed')
            result = dict(status='EVIDENCE_COLLECTED', **task.identity, source_end=sha,
                started_utc=str(attempt['started_utc']),
                steady_state_sha256=digest(root / 'full-store-steady-state.json'),
                composition_proof_sha256=digest(root / 'composition-proof.json'),
                satellite_sha256=digest(root / 'hybrid-attachment-proof.json'),
                satellite=dict(copy_chunks=satellite['copy_chunks'], setup_writes=satellite['writes']),
                rounds=rounds, derived=derived,
                indexed_baseline=BANKED_BASELINE,
                slice_transient_reference=SLICE_TRANSIENT_REFERENCE,
                claim_boundary=CLAIM_BOUNDARY,
                fault_suite='NOT_RUN', six_case='NOT_ADMITTED',
                live_maintenance='NOT_ADMITTED', production='NOT_ADMITTED')
            save(root / 'hybrid-k20-full-store.json', result)
            return result
        finally:
            if (root / 'restore.json').exists():
                cells.stop(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--repair-note')
    args = parser.parse_args()
    run(args.root, note=args.repair_note)
