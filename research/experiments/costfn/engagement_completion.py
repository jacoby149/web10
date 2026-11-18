"""Nov18 fix-and-finish: only the missing complete reads, one explicitly admitted lease."""
import argparse
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


def programme(actions, output):
    output = Path(output)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    results = {}
    baseline_stopped = False
    for name in ORDER:
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


def run(root):
    modern.install_sessions()
    root = Path(root)
    actions = Actions(root)
    try:
        return programme(actions, root / 'programme-completion')
    finally:
        if (root / 'restore.json').exists():
            full.cells.stop(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    run(parser.parse_args().root)
