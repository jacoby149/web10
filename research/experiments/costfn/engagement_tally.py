"""One admitted tally lease: canonical setup/verification, then count-only reads."""
import argparse
import hashlib
import json
from pathlib import Path

import sqlglot
from sqlglot import exp

from arm_f_failure import details
from arm_f_native import save
import engagement_completion as completion
import engagement_finish as finish
import engagement_limits as limits
import engagement_modern as modern
import engagement_tally_build as build
import engagement_queries
import engagement_tally_sql

ORDER = ('banked', 'restore', 'read-setup', 'initial-prepared', 'projection', 'migration', 'certified', 'tallies', 'uniform', 'count-components', 'projection-colour')


class Actions(finish.Actions):
    def checkpoint(self, name, result):
        save(self.root / 'checkpoint.json', dict(stage=name, outcome=result['outcome'], deadline=self.approval['deadline_utc']))

    def stage(self, name, results):
        if self.approval.get('run_directive') != limits.TALLY_RUN or not self.approval.get('tally_wiring_admitted'):
            raise ValueError('explicit tally lease admission required')
        return {'banked': lambda: dict(completion=finish.banked()['outcome'], baseline_B_D='CITED_NOT_REMEASURED'),
            'restore': self.restore, 'read-setup': self.read_setup,
            'initial-prepared': lambda: completion.prepared.run(self.root), 'projection': self.projection,
            'migration': self.migrate, 'certified': lambda: self.certify('copy'), 'tallies': lambda: build.run(self.root),
            'uniform': lambda: self.complete('C-tally-uniform', 'uniform'),
            'count-components': self.count_components,
            'projection-colour': lambda: self.complete('A-tally-projection', 'projection')}[name]()

    def count_components(self):
        folder = self.root / 'cells/C-tally-uniform/F-stages'
        session, result, seen = modern.Session(self.root), [], set()
        for path in sorted(folder.glob('*.jsonl')):
            for line in path.read_text().splitlines():
                record = json.loads(line)
                if record['stage'] != 'counts_embedded_in_resolution' or record['sql_sha256'] in seen:
                    continue
                seen.add(record['sql_sha256'])
                query = (folder / (record['sql_sha256'] + '.sql')).read_text()
                for component in engagement_queries.mixed_components(query)['components']:
                    tree = sqlglot.parse_one(component, read='clickhouse')
                    tree.set('with_', None)  # These are direct table SELECTs; unused canonical CTEs are not count work.
                    if {t.name for t in tree.find_all(exp.Table)} != {engagement_tally_sql.TABLE}:
                        raise ValueError('counter diagnostic unexpectedly depends on documents')
                    statement = tree.sql(dialect='clickhouse')
                    values, query_id = session.rows('tally_component_' + str(len(result)), statement, measured=True)
                    result.append(dict(sql_sha256=hashlib.sha256(statement.encode()).hexdigest(), returned_rows=len(values),
                        native=session.native(query_id), source_mixed_sha256=record['sql_sha256']))
                    save(self.root / 'tally-count-components.json', dict(components=result, additive=False))
        if not result:
            raise ValueError('nonempty real count-component measurements required')
        return dict(components=result, additive=False)


def run(root):
    root = Path(root)
    modern.install_sessions()
    actions = Actions(root)
    output = root / 'programme-tally'
    output.mkdir(mode=0o700, exist_ok=False)
    results = {}
    try:
        for name in ORDER:
            try:
                if name == 'projection-colour' and modern.remaining(actions.approval) < 900:
                    result = dict(outcome='NOT_RUN_OPTIONAL_CLOCK')
                elif any(v['outcome'] != 'PASS' for k,v in results.items() if k not in ('uniform','count-components','projection-colour')):
                    result = dict(outcome='BLOCKED_PRE_MEASUREMENT_VERIFICATION')
                else:
                    result = dict(outcome='PASS', evidence=actions.stage(name, results))
            except Exception as error:
                result = dict(outcome='INCOMPLETE', **details(error))
            results[name] = result
            save(output / (name + '.json'), result)
            save(output / 'summary.json', dict(stages=results, feed_pass=False, tally_verdict_requires_native_count_stages=True))
            actions.checkpoint(name, result)
            print('[tally]', name, result['outcome'], flush=True)
        return results
    finally:
        if (root / 'restore.json').exists():
            completion.full.cells.stop(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    run(parser.parse_args().root)
