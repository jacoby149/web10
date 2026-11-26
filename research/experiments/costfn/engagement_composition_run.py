"""One source-bound all-fixes lease. Invocation never provisions another host."""
import argparse
import json
from pathlib import Path

from arm_f_native import save
import engagement_cells as cells
import engagement_composition as contract
import engagement_composition_setup as setup
import engagement_composition_verify as verify
import engagement_event_seed as event_seed
import engagement_event_layout as event_layout
import engagement_window as window
import engagement_finish as finish
import engagement_modern as modern
import engagement_pairs as pairs
import engagement_pin_index as pin_index
import engagement_prepared as prepared
import engagement_tally_build as tallies


class Actions(finish.Actions):
    def stage(self, name, results):
        if (self.approval.get('composition_admitted') is not True
                or self.approval.get('run_directive') != contract.DIRECTIVE):
            raise ValueError('one explicitly bound all-fixes lease required')
        if modern.remaining(self.approval) < 120:
            raise TimeoutError('original lease cleanup margin reached')
        if name == 'banked':
            value = finish.banked()
            return dict(baseline_status='CITED_NOT_REMEASURED', baseline_receipt_sha256=setup.digest(finish.BANKED),
                baseline=value['baseline'], stages_B_D='BANKED_NOT_REPEATED')
        if name == 'restore':
            return self.restore()
        if name == 'read-setup':
            return self.read_setup()
        session = modern.Session(self.root)
        if name == 'migrate':
            cells.stop(self.root)
            return setup.migrate(session, self.root)
        if name == 'billboard-fixtures':
            return setup.fixtures(session, self.root, self.expected,
                node_ratio=self.approval['billboard_node_ratio'], seed=self.approval['billboard_seed'])
        if name == 'furniture':
            return self.furniture(session)
        if name.startswith('verify-'):
            kind = name.removeprefix('verify-')
            value = {'refs': lambda: verify.refs(session, self.root),
                'paired-tallies': lambda: verify.tallies(self.root, self.expected),
                'views': lambda: verify.views(session, self.root, self.expected),
                'ads': lambda: verify.billboards(session, self.root, self.expected)}[kind]()
            if kind == 'ads':
                gates = {key: results['verify-' + key]['evidence'] for key in contract.GATES if key != 'ads'}
                gates['ads'] = value
                for key in contract.GATES:
                    contract.gate(key, gates[key])
                copy = json.loads((self.root / 'copy-proof.json').read_bytes())
                tables = [pairs.TABLE, pin_index.TABLE] if pin_index.enabled(self.approval) else [pairs.TABLE]
                save(self.root / 'composition-proof.json', dict(droplet_id=session.host_id, gates=gates,
                    copy_parts_sha256=copy['parts_sha256'],
                    immutable_parts={table: setup.parts(session, table)[0] for table in tables}))
            return value
        if name in contract.CELLS:
            return self.complete('all-fixes-' + name, 'uniform',
                profile='ordinary' if name == 'uniform-K20' else 'fixture',
                serving=contract.CELL_SERVING_MODES[name])
        if name == 'decomposition':
            return self.decomposition()
        raise ValueError('unknown composition stage')

    def checkpoint(self, name, result):
        save(self.root / 'checkpoint.json', dict(stage=name, outcome=result['outcome'],
            directive=contract.DIRECTIVE, deadline_utc=self.approval['deadline_utc']))

    def base_infrastructure(self):
        return prepared.run(self.root)

    def expected_events(self):
        return 1_600_000_000

    def setup_step(self, name, action, *, tables=(), validate=None):
        return action()

    def furniture(self, session):
        # All canonical fixture writes precede initial infrastructure/fingerprints.
        # No obsolete ref projection is constructed on either table.
        initial = self.setup_step('infrastructure', self.base_infrastructure,
            validate=lambda: __import__('engagement_certificates').verify(self.root))
        session.query('composition_freeze_copy', 'SYSTEM STOP MERGES engagement_documents')
        projections, _ = session.rows('composition_no_ref_projection', "SELECT count() AS n FROM system.projections "
            "WHERE database='web10' AND table IN ('documents','engagement_documents')")
        if int(projections[0]['n']):
            raise ValueError('retired projection remains on treated store')
        digest, query_id = setup.parts(session, 'engagement_documents')
        prior = finish.banked()['migration']['copy_proof']
        proof = dict(parity=prior['parity'], batches=prior['batches'], parts_sha256=digest,
            lossless_proof='CITED_BANKED_NOT_REPEATED', fixtures=setup.digest(self.root / 'billboards/build.json'),
            current_parts_query_id=query_id, constructor_sha256=finish.CONSTRUCTOR)
        save(self.root / 'copy-proof.json', proof)
        tally = self.setup_step('tallies', lambda: tallies.run(self.root), tables=('counting_numbers_tally',
            'tally_verify_documents', 'tally_verify_links'))
        satellite = self.setup_step('pairs', lambda: setup.build_pairs(session, self.root),
            tables=('pairs_refs', 'pairs_refs_fat'))
        pins = (self.setup_step('pin-index', lambda: setup.build_pin_index(session, self.root), tables=(pin_index.TABLE,))
            if pin_index.enabled(self.approval) else None)
        # Setup build is explicitly admitted; banked Stage B timings/diagnosis
        # are cited, not rerun. Install MV before disjoint day seeds, writers down.
        cells.stop(self.root)
        layout = None
        if window.enabled(self.approval):
            layout = event_layout.rebuild(session, self.root, writers_stopped=True)
        receipts = event_seed.install(session, self.root, writers_stopped=True,
            expected_events=self.expected_events(),
            buckets_by_day=self.approval.get('aggregate_seed_day_buckets'))
        self.aggregate_ready = True
        if setup.parts(session, 'engagement_documents')[0] != digest:
            raise ValueError('canonical copy changed during furniture build')
        return dict(initial=initial, tally_rows=tally.get('table'), pairs=satellite, pin_index=pins, event_layout=layout, aggregate=receipts,
            live_maintenance_implemented=False, no_stage_B_timing_rerun=True)

    def decomposition(self):
        result = {}
        for cell in sorted((self.root / 'cells').glob('all-fixes-*')):
            stages, native = {}, {}
            for path in (cell / 'F-stages').glob('*.jsonl'):
                for line in path.read_text().splitlines():
                    row = json.loads(line)
                    if row.get('query_id'):
                        stages[row['query_id']] = row
            for phase in ('warmup', 'measured'):
                path = cell / (phase + '.json')
                if not path.exists():
                    continue  # Failed cells retain their native failure archive.
                sample = json.loads(path.read_bytes())
                records = []
                for row in sample['native']:
                    identity = row['query_id']
                    if identity not in stages:
                        raise ValueError('native statement has no captured SQL identity')
                    records.append({**stages[identity], 'native': row})
                    native[identity] = row
                result[cell.name + ':' + phase] = contract.statement_inventory(cell / 'F-stages', records)
            # Request-tagged work not captured by the observer remains SEPARATE.
            all_native = json.loads((cell / 'all-native-including-failures-and-writes.json').read_bytes())
            auxiliary = [r for r in all_native if r['query_id'] not in stages]
            result[cell.name + ':auxiliary'] = dict(queries=len(auxiliary),
                read_rows=sum(int(r['read_rows']) for r in auxiliary), read_bytes=sum(int(r['read_bytes']) for r in auxiliary),
                query_ids=[r['query_id'] for r in auxiliary])
        if not result:
            raise ValueError('no real measured statement inventory available')
        save(self.root / 'all-fixes-statement-inventory.json', result)
        return result


def run(root, *, with_row_model=False):
    root = Path(root)
    if with_row_model:
        from row_model_run import source_ready
        source_ready(json.loads((root / 'admission.json').read_bytes()))
    modern.install_sessions()
    actions = Actions(root)
    try:
        result = contract.run(actions, root / 'programme-all-fixes')
        if with_row_model:
            from row_model_run import run as row_model
            return dict(composition=result, row_model=row_model(root))
        return result
    finally:
        if (root / 'restore.json').exists():
            cells.stop(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--with-row-model', action='store_true', help='require prepared/bound row source, bank all-fixes, then run assembly on the owned store')
    args = parser.parse_args()
    run(args.root, with_row_model=args.with_row_model)
