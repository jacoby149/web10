"""Step 3: compare the indexed control and an exact skinny attachment layout."""
import argparse
from pathlib import Path

from arm_f_native import save
from costfn_task import Task, read, digest
import engagement_cells as cells
import engagement_certificates as certificates
import engagement_composition_verify as verify
import engagement_modern as modern
import hybrid_k20_attachment as attachment
import hybrid_k20_baseline as baseline
import hybrid_k20_projected as projected
import hybrid_k20_run_current as current
import hybrid_k20_run_projected as comparison


ORDERS = (('indexed', 'hybrid'), ('hybrid', 'indexed'))


def validate_preparation(root, predecessor, session):
    if predecessor.get('status') != 'EVIDENCE_COLLECTED' or not all(predecessor['column_evidence'].values()):
        raise ValueError('banked Step 2 with exact parity, native plans and columns required')
    if digest(root / 'hybrid-k20-slice.json') != predecessor['manifest_sha256']:
        raise ValueError('Step 2 slice manifest changed')
    for name, sha in predecessor['oracle_files'].items():
        if digest(root / f'reference-{name}/expected.json') != sha:
            raise ValueError('Step 2 oracle differs before Step 3')
    certificate = certificates.verify(root)
    current_fingerprint = certificates.fingerprint(session)
    prior = read(root / 'before-projection-fingerprint.json')
    if (certificate['canonical_generation'] != current_fingerprint['canonical_generation']
            or prior['canonical_content_sha256'] != current_fingerprint['canonical_content_sha256']):
        raise ValueError('retained canonical byte fingerprint differs before Step 3')
    gate = read(root / 'composition-proof.json')
    if gate['droplet_id'] != session.host_id or any(contract['source_binding'] != verify.binding()
            for contract in gate['gates'].values()):
        raise ValueError('retained composition proof is not valid for this source')


def measure(task, root, trial, arm, attempt, expected):
    def execute():
        cell = f"{arm}-K20-r{trial}-attempt-{attempt['number']}"
        hybrid = arm == 'hybrid'
        cells.run_complete(root, cell, 'ordinary', 'uniform', expected, aggregate=True, projected=hybrid, hybrid=hybrid,
            serving_mode=baseline.CELL_SERVING_MODES[baseline.CELL_NAME])
        return cell

    cell = root / 'cells' / task.step(f'r{trial}:{arm}:capture', execute)
    return cell, baseline.audit_cell(cell)


def run(root, *, note=None):
    root = Path(root).resolve()
    approval = read(root / 'admission.json')
    sha = current.source_guard(approval)
    task = Task(root, approval, sha)
    predecessor_path = root / 'hybrid-k20-projected-comparison.json'
    predecessor = read(predecessor_path)
    task.next_phase('hybrid', predecessor_path)
    with task.attempt(note) as attempt:
        modern.install_sessions()
        session = modern.Session(root)
        cells.stop(root)
        validate_preparation(root, predecessor, session)
        proof = attachment.build(session, root)
        expected = read(root / 'reference-ordinary/expected-billboards.json')
        result = dict(status='EVIDENCE_COLLECTED', **task.identity, source_end=sha,
            attachment_proof_sha256=digest(root / 'hybrid-attachment-proof.json'), setup_writes=proof['writes'],
            fault_suite='NOT_RUN', six_case='NOT_ADMITTED', rounds=[])
        try:
            for trial, order in enumerate(ORDERS, 1):
                values = {arm: measure(task, root, trial, arm, attempt, expected) for arm in order}
                indexed, hybrid = (values[arm] for arm in ('indexed', 'hybrid'))
                costs = comparison.compare(indexed[0], hybrid[0], indexed[1][-1], hybrid[1][-1])
                result['rounds'].append(dict(order=order, indexed=indexed[1], hybrid=hybrid[1], costs=costs,
                    hybrid_plans=comparison.plans(session, hybrid[0], hybrid[1][-1], projected.STAGES)))
            save(root / 'hybrid-k20-attachment-comparison.json', result)
            return result
        finally:
            cells.stop(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--repair-note')
    args = parser.parse_args()
    run(args.root, note=args.repair_note)
