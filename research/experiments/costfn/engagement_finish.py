"""Admitted treated completion; cite the baseline/B/D, never remeasure them."""
import argparse
import hashlib
import json
from pathlib import Path

from arm_f_failure import details, operation
from arm_f_native import save
import engagement_cells as cells
import engagement_completion as completion
import engagement_full as full
import engagement_limits as limits
import engagement_modern as modern
import engagement_projection as projection
import engagement_ref as refs

HERE = Path(__file__).parent
BANKED = HERE / 'evidence/engagement-completion-20261118/results.json'
CONSTRUCTOR = '1df04731a84ed972e240647fe43ac6186756c9306ce1b9e35c40f85e4034e32b'
ORDER = ('banked', 'restore', 'read-setup', 'initial-prepared', 'A-projection', 'A-certified',
    'A-treated', 'A-decomposition', 'C-migration', 'C-certified', 'C-complete', 'C-paired')
DEPS = {**completion.DEPENDENCIES, 'banked': (), 'restore': ('banked',),
    'A-projection': ('initial-prepared',)}


def banked():
    value = json.loads(BANKED.read_bytes())
    if (value['dataset_id'] != modern.arm_t.DATASET or value['engine'] != modern.ENGINE
            or value['baseline']['parity'] != 'PASS' or value['baseline']['budget'] != 'FAIL'
            or not value['migration']['current_copy_gates_pass']
            or hashlib.sha256((HERE / 'engagement_ref.py').read_bytes()).hexdigest() != CONSTRUCTOR):
        raise ValueError('banked baseline/migration or unchanged constructor binding differs')
    return value


class Actions(completion.Actions):
    def stage(self, name, results):
        if not limits.enabled(self.approval) or self.approval.get('run_directive') != limits.RUN:
            raise ValueError('new treated-completion and measurement-limits directives required')
        if name == 'banked':
            value = banked()
            # This is a cited input to the comparison table, never a new sample.
            save(self.root / 'A-baseline-complete.json', [dict(row, banked_not_remeasured=True,
                source_receipt_sha256=hashlib.sha256(BANKED.read_bytes()).hexdigest())
                for row in value['baseline']['samples']])
            return dict(baseline='CITED_NOT_REMEASURED', stages_B_D='BANKED_NOT_REPEATED',
                migration_design='BANKED_NOT_REPROVEN', source_sha256=hashlib.sha256(BANKED.read_bytes()).hexdigest())
        return super().stage(name, results)

    def migrate(self):
        """Reconstruct the copy and check prerequisites; cite banked lossless proof."""
        cells.stop(self.root)
        session = modern.Session(self.root)
        checks, statements = refs.migration()
        verdicts = {}
        for name, sql in checks.items():
            rows, query_id = session.rows('migration_' + name, sql, setup_seconds=900)
            verdicts[name] = dict(n=int(rows[0]['n']), query_id=query_id)
            save(self.root / 'migration-checks26.json', verdicts)
            if verdicts[name]['n']:
                raise ValueError('migration source check nonzero: ' + name)
        for index, sql in enumerate(statements[:-len(refs.projection('engagement_documents'))]):
            session.query('migration_setup_' + str(index), sql, setup_seconds=1200)
        projection.install_rebuild(session, 'engagement_documents', self.root)
        parts, _ = session.rows('copy_current_parts', "SELECT name,toString(rows) AS rows,toString(data_version) AS data_version FROM system.parts "
            "WHERE database='web10' AND table='engagement_documents' AND active ORDER BY name")
        previous = banked()['migration']['copy_proof']
        proof = dict(parity=previous['parity'], batches=previous['batches'],
            parts_sha256=hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest(),
            lossless_proof='CITED_BANKED_NOT_REPEATED', current_copy_checks=verdicts,
            constructor_sha256=CONSTRUCTOR, banked_receipt_sha256=hashlib.sha256(BANKED.read_bytes()).hexdigest())
        save(self.root / 'copy-proof.json', proof)
        return proof

    def decompose(self):
        """Keep each measured component, including timeouts; no empty/subtractive PASS."""
        import engagement_queries as queries
        session = modern.Session(self.root)
        records, seen = [], set()
        for path in sorted((self.root / 'cells/A-projection-old-semantics/F-stages').glob('*.jsonl')):
            for line in path.read_text().splitlines():
                row = json.loads(line)
                if row.get('stage') != 'counts_embedded_in_resolution' or row['sql_sha256'] in seen:
                    continue
                seen.add(row['sql_sha256'])
                sql = (path.parent / (row['sql_sha256'] + '.sql')).read_text()
                for component in queries.mixed_components(sql)['components']:
                    record = dict(statement_sha256=hashlib.sha256(component.encode()).hexdigest(), sql=component)
                    try:
                        values, query_id = session.rows('finish_count_component_' + str(len(records)), component, measured=True)
                        record.update(outcome='COMPLETE', returned_rows=len(values), native=session.native(query_id))
                    except Exception as error:
                        record.update(outcome='INCOMPLETE', **details(error))
                    records.append(record)
                    save(self.root / 'mixed-decomposition-finish.json', dict(components=records, additive=False))
        if not records or any(row['outcome'] != 'COMPLETE' for row in records):
            raise ValueError('decomposition incomplete; every available component receipt preserved')
        return dict(components=records, additive=False)


def programme(actions, output):
    output = Path(output)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    results = {}
    for name in ORDER:
        blocked = [key for key in DEPS[name] if results[key]['outcome'] != 'PASS']
        if blocked:
            result = dict(outcome='BLOCKED', blocked_by=blocked)
        else:
            try:
                with operation(actions.root, stage=name):
                    result = dict(outcome='PASS', evidence=actions.stage(name, results))
            except Exception as error:
                result = dict(outcome='INCOMPLETE', **details(error))
        results[name] = result
        save(output / (name + '.json'), result)
        save(output / 'summary.json', dict(stages=results, baseline='BANKED_NOT_REMEASURED',
            stages_B_D='BANKED_NOT_REPEATED', complete_feed_pass=False))
        actions.checkpoint(name, result)
        print('[engagement-finish]', name, result['outcome'], flush=True)
    return results


def run(root):
    modern.install_sessions()
    root = Path(root)
    actions = Actions(root)
    try:
        return programme(actions, root / 'programme-finish')
    finally:
        if (root / 'restore.json').exists():
            full.cells.stop(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    run(parser.parse_args().root)
