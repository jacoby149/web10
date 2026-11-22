"""Same-lease transport repair; preserve first boot failures and reuse setup."""
import argparse
import hashlib
import json
from pathlib import Path

from arm_f_native import save
import engagement_certificates as certificates
import engagement_finish as finish
import engagement_full as full
import engagement_modern as modern

ORDER = ('A-treated', 'A-decomposition', 'C-complete', 'C-paired')


def prepared(root):
    path = Path(root) / 'programme-finish/summary.json'
    previous = json.loads(path.read_bytes())
    for name in ('banked', 'restore', 'read-setup', 'initial-prepared', 'A-projection', 'A-certified', 'C-migration', 'C-certified'):
        if previous['stages'][name]['outcome'] != 'PASS':
            raise ValueError('only fully constructed/certified original store may continue: ' + name)
    for name in ('A-treated', 'C-complete', 'C-paired'):
        if previous['stages'][name]['outcome'] != 'INCOMPLETE':
            raise ValueError('transport continuation must preserve original failed cells')
    return dict(original_summary_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        no_restore_or_seed=True, no_counter_rebuild=True, no_materialization_repeat=True)


class Actions(finish.Actions):
    def paired(self):
        result = {}
        for mode in ('P_DOCUMENT_STREAM_V1', 'F_DOCUMENT_STREAM_V1'):
            try:
                result[mode] = dict(outcome='PASS', samples=self.complete('C-paired-' + mode,
                    'uniform', profile='fixture', serving=mode))
            except Exception as error:
                result[mode] = dict(outcome='INCOMPLETE', **__import__('arm_f_failure').details(error))
        save(self.root / 'C-paired-transport-comparison.json', result)
        if any(row['outcome'] != 'PASS' for row in result.values()):
            raise ValueError('paired transport comparison incomplete; original failed comparison preserved')
        return result

    def complete(self, name, mode, **kwargs):
        # A failed cell directory is never reused or overwritten.
        result = super().complete(name + '-transport-repair', mode, **kwargs)
        path = self.root / (name + '-complete.json')
        if path.exists():
            raise ValueError('existing complete response cannot be overwritten')
        save(path, result)
        return result

    def decompose(self):
        # Only the actual new mixed query supplies components. No prior failure
        # is replayed as a decomposition sample or renamed into a success.
        import engagement_queries as queries
        session = modern.Session(self.root)
        records, seen = [], set()
        directory = self.root / 'cells/A-projection-old-semantics-transport-repair/F-stages'
        for path in sorted(directory.glob('*.jsonl')):
            for line in path.read_text().splitlines():
                row = json.loads(line)
                if row.get('stage') != 'counts_embedded_in_resolution' or row['sql_sha256'] in seen:
                    continue
                seen.add(row['sql_sha256'])
                sql = (directory / (row['sql_sha256'] + '.sql')).read_text()
                for sql in queries.mixed_components(sql)['components']:
                    record = dict(statement_sha256=hashlib.sha256(sql.encode()).hexdigest(), sql=sql)
                    try:
                        values, query_id = session.rows('transport_count_component_' + str(len(records)), sql, measured=True)
                        record.update(outcome='COMPLETE', returned_rows=len(values), native=session.native(query_id))
                    except Exception as error:
                        record.update(outcome='INCOMPLETE', **__import__('arm_f_failure').details(error))
                    records.append(record)
                    save(self.root / 'mixed-decomposition-transport.json', dict(components=records, additive=False))
        if not records or any(row['outcome'] != 'COMPLETE' for row in records):
            raise ValueError('nonempty complete decomposition required; partial receipts retained')
        return dict(components=records, additive=False)


def run(root):
    root = Path(root)
    modern.install_sessions()
    binding = prepared(root)
    certificates.verify(root)
    actions = Actions(root)
    for profile in ('ordinary', 'fixture'):
        actions.expected[profile] = json.loads((root / ('reference-' + profile) / 'expected.json').read_bytes())
    save(root / 'transport-continuation.json', binding)
    results = {}
    output = root / 'programme-transport-repair'
    output.mkdir(mode=0o700, exist_ok=False)
    try:
        for name in ORDER:
            try:
                value = actions.stage(name, results)
                result = dict(outcome='PASS', evidence=value)
            except Exception as error:
                result = dict(outcome='INCOMPLETE', **__import__('arm_f_failure').details(error))
            results[name] = result
            save(output / (name + '.json'), result)
            save(output / 'summary.json', dict(stages=results, binding=binding, complete_feed_pass=False))
            actions.checkpoint(name, result)
            print('[engagement-transport]', name, result['outcome'], flush=True)
        return results
    finally:
        full.cells.stop(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    run(parser.parse_args().root)
