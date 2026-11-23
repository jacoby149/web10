"""Baseline-only RD4 runner; never provisions or executes challenger arms."""
import argparse
from pathlib import Path
import re
import subprocess
import time

from arm_f_failure import details
from arm_f_native import save
import engagement_cells as cells
import engagement_certificates as certificates
import engagement_composition as contract
import engagement_composition_run as original
import engagement_modern as modern
import engagement_pin_index as pins
import engagement_restore as restore
import engagement_setup as setup
import engagement_window as window
import hybrid_k20_baseline as baseline
import hybrid_k20_slice as slice


PREFLIGHT = 'fbec6962ead87d6f51d1616b480bf47be11698d4'
STAGES = ('restore', 'slice', 'migrate', 'billboard-fixtures', 'furniture',
    *('verify-' + name for name in contract.GATES), 'uniform-K20')


def source_guard(approval):
    expected = approval.get('hybrid_k20_source_commit', '')
    if (approval.get('hybrid_k20_directive') != slice.DIRECTIVE
            or approval.get('restored_snapshot_id') != '255003176'
            or not pins.enabled(approval) or window.enabled(approval)
            or approval.get('row_model_admitted') is not False
            or not re.fullmatch(r'[0-9a-f]{40}', expected) or expected == PREFLIGHT):
        raise ValueError('explicit baseline-only source/snapshot binding required')
    repo = Path(__file__).resolve().parents[3]
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
    if actual != expected:
        raise ValueError('running source differs from bound baseline-only source')
    subprocess.run(['git', 'merge-base', '--is-ancestor', PREFLIGHT, actual], cwd=repo, check=True)
    subprocess.run(['git', 'diff', '--quiet', 'HEAD'], cwd=repo, check=True)


class Actions(original.Actions):
    def restore(self):
        # Snapshot-only: the full-store fallback can download/setup other inputs.
        modern.operation(self.root)
        started = time.perf_counter()
        value = restore.snapshot(self.root)
        value['restore_seconds'] = time.perf_counter() - started
        save(self.root / 'modern-restore.json', value)
        return dict(snapshot_id=value['snapshot_id'], restore_seconds=value['restore_seconds'],
            engine=value['envelope']['engine'])

    def base_infrastructure(self):
        # Snapshot certificates name the unsliced parts. Rebuild for the new
        # generation without OPTIMIZE FINAL dropping retained history.
        generation = setup.infrastructure(self.root, 'hybrid-k20-slice', initial=True, settle=False)
        session = modern.Session(self.root)
        state = certificates.fingerprint(session)
        if state['canonical_generation'] != generation:
            raise ValueError('slice generation changed during infrastructure build')
        provenance = dict(kind='K20_FIXED_SLICE_REBUILT',
            slice_sha256=certificates.digest(self.root / 'hybrid-k20-slice.json'),
            canonical_content_sha256=state['canonical_content_sha256'])
        certificates.bind(self.root, session, generation, provenance)
        return certificates.verify(self.root)

    def expected_events(self):
        value = baseline.read(self.root / 'hybrid-k20-slice.json')
        if value['status'] != 'SOURCE_ORACLE_PARITY':
            raise ValueError('fixed slice source oracle gate missing')
        return int(value['tables']['content_events']['census']['n'])


def run(root):
    root = Path(root).resolve()
    source_guard(baseline.read(root / 'admission.json'))
    report = root / 'hybrid-k20-baseline-only.json'
    if report.exists():
        raise FileExistsError(report)
    modern.install_sessions()
    actions = Actions(root)
    result = dict(status='RUNNING', stages={}, source_commit=actions.approval['hybrid_k20_source_commit'],
        droplet_id=actions.approval['droplet_id'], deadline_utc=actions.approval['deadline_utc'],
        challengers='NOT_RUN', fault_suite='NOT_RUN')
    try:
        for stage in STAGES:
            print('[hybrid-k20-current] start', stage, flush=True)
            result['active_stage'] = stage
            save(report, result)
            if stage == 'slice':
                restored = result['stages']['restore']['evidence']
                if restored.get('snapshot_id') != '255003176':
                    raise ValueError('baseline-only runner refuses fallback restore')
                evidence = slice.prepare(actions)
            elif stage == 'uniform-K20':
                evidence = baseline.run_current(actions)
            else:
                evidence = actions.stage(stage, result['stages'])
                if stage.startswith('verify-'):
                    contract.gate(stage.removeprefix('verify-'), evidence)
            result['stages'][stage] = dict(outcome='PASS', evidence=evidence)
            save(report, result)
        result.update(status='BASELINE_REPRODUCED', active_stage=None)
        return result
    except BaseException as error:
        result.update(status='STOP', failure=details(error))
        raise
    finally:
        save(report, result)
        if (root / 'restore.json').exists():
            cells.stop(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    run(parser.parse_args().root)
