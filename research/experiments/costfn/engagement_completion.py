"""Nov18 fix-and-finish: only the missing complete reads, one explicitly admitted lease."""
import argparse
import hashlib
import json
from pathlib import Path
import time

from arm_f_failure import details, operation
from arm_f_native import save
import engagement_certificates as certificates
import engagement_full as full
import engagement_modern as modern
import engagement_prepared as prepared
import engagement_projection as projection
import engagement_restore as restore

ORDER = ('restore', 'read-setup', 'initial-prepared', 'A-baseline', 'A-projection', 'A-certified',
    'A-treated', 'A-decomposition', 'C-migration', 'C-certified', 'C-complete', 'C-paired')
DEPENDENCIES = {'restore': (), 'read-setup': ('restore',), 'initial-prepared': ('read-setup',),
    'A-baseline': ('initial-prepared',), 'A-projection': ('A-baseline',), 'A-certified': ('A-projection',),
    'A-treated': ('A-certified',), 'A-decomposition': ('A-certified',),
    'C-migration': ('A-certified',), 'C-certified': ('C-migration',),
    'C-complete': ('C-certified',), 'C-paired': ('C-certified',)}


class Actions(full.Actions):
    def baseline(self):
        if getattr(self, 'prepared_continuation', False):
            value = self.complete('A-baseline-encoding', 'baseline')
            path = self.root / 'A-baseline-complete.json'
            if path.exists():
                raise ValueError('a banked baseline cannot be overwritten')
            save(path, value)
            return value
        return super().baseline()

    def stage(self, name, results):
        if self.approval.get('purpose') != 'ENGAGEMENT_COMPLETION_ONLY':
            raise ValueError('separate Nov18 completion admission required')
        if modern.remaining(self.approval) < 120:
            raise TimeoutError('unchanged lease cleanup margin reached')
        with operation(self.root, stage=name):
            return {'restore': self.restore, 'read-setup': self.read_setup,
                'initial-prepared': lambda: prepared.run(self.root), 'A-baseline': self.baseline,
                'A-projection': self.projection, 'A-certified': lambda: self.certify('projection'),
                'A-treated': self.projected, 'A-decomposition': self.decompose,
                'C-migration': self.migrate, 'C-certified': lambda: self.certify('copy'),
                'C-complete': self.uniform, 'C-paired': self.paired}[name]()

    def restore(self):
        modern.operation(self.root)
        started = time.perf_counter()
        value = restore.snapshot(self.root)  # Snapshot-only. No Parquet fallback/rehearsal/B/D.
        value['restore_seconds'] = time.perf_counter() - started
        save(self.root / 'modern-restore.json', value)
        return value

    def projection(self):
        full.cells.stop(self.root)
        session = modern.Session(self.root)
        before = certificates.fingerprint(session)
        save(self.root / 'before-projection-fingerprint.json', before)
        return projection.install_rebuild(session, 'documents', self.root)

    def certify(self, name):
        before = json.loads((self.root / 'before-projection-fingerprint.json').read_bytes())
        return certificates.refresh(self.root, before, name)


def programme(actions, output, *, prepared=None):
    output = Path(output)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    results = {}
    baseline_stopped = False
    for name in ORDER:
        if prepared is not None and name in ('restore', 'read-setup', 'initial-prepared'):
            result = {**prepared['stages'][name], 'reused_prepared_setup_no_rebuild': True}
            results[name] = result
            save(output / (name + '.json'), result)
            continue
        blocked = [dep for dep in DEPENDENCIES[name] if results[dep]['outcome'] != 'PASS']
        if baseline_stopped or blocked:
            result = dict(outcome='BLOCKED', blocked_by=['A-baseline'] if baseline_stopped else blocked)
        else:
            try:
                value = actions.stage(name, results)
                result = dict(outcome='PASS', evidence=value)
            except Exception as error:
                result = dict(outcome='STOP', **details(error))
                baseline_stopped = name == 'A-baseline'
        results[name] = result
        save(output / (name + '.json'), result)
        save(output / 'summary.json', dict(stages=results, stages_B_D='BANKED_NOT_REPEATED',
            baseline_stop_is_terminal=baseline_stopped, complete_feed_pass=False))
        actions.checkpoint(name, result)
        print('[engagement-completion]', name, result['outcome'], flush=True)
    return results


def run(root, *, prepared=False):
    modern.install_sessions()
    root = Path(root)
    actions = Actions(root)
    try:
        previous = None
        if prepared:
            path = root / 'programme-completion/summary.json'
            previous = json.loads(path.read_bytes())
            if (previous['stages']['A-baseline']['outcome'] != 'STOP'
                    or previous['stages']['A-projection']['outcome'] != 'BLOCKED'
                    or any(previous['stages'][name]['outcome'] != 'PASS' for name in ('restore', 'read-setup', 'initial-prepared'))):
                raise ValueError('only stopped pre-projection baseline may reuse the prepared setup')
            session = modern.Session(root)
            projection_rows, _ = session.rows('continuation_no_projection',
                "SELECT count() AS n FROM system.projections WHERE database='web10' AND table='documents'")
            if int(projection_rows[0]['n']) or (root / 'A-baseline-complete.json').exists():
                raise ValueError('untreated store and no previously banked complete baseline required')
            before = json.loads((root / 'before-projection-fingerprint.json').read_bytes())
            certificates.refresh(root, before, 'encoding')
            for profile in ('ordinary', 'fixture'):
                actions.expected[profile] = json.loads((root / ('reference-' + profile) / 'expected.json').read_bytes())
            actions.prepared_continuation = True
            save(root / 'encoding-continuation.json', dict(original_summary_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                original_deadline_utc=actions.approval['deadline_utc'], original_failure_preserved=True,
                native_setup_repeated=False, counter_rebuild=False, projection_added_before_baseline=False))
        return programme(actions, root / ('programme-completion-encoding' if prepared else 'programme-completion'), prepared=previous)
    finally:
        if (root / 'restore.json').exists():
            full.cells.stop(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--prepared', action='store_true')
    args = parser.parse_args()
    run(args.root, prepared=args.prepared)
