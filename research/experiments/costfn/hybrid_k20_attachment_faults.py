"""Native faults of the immutable Step 3 attachment reader, not live writers."""
import argparse
from pathlib import Path
from uuid import uuid4

from arm_f_native import save
from costfn_task import Task, read, digest
import engagement_cells as cells
import engagement_modern as modern
import hybrid_k20_attachment as links
import hybrid_k20_projected as projected
import hybrid_k20_run_current as current


def refuses(action, message):
    try:
        action()
    except ValueError as error:
        if message in str(error):
            return
        raise
    raise ValueError('fault did not refuse: ' + message)


class Lab:
    def __init__(self, root, session):
        self.session = session
        stem = 'hybrid_k20_fault_' + uuid4().hex[:12]
        self.source, self.satellite, self.payload_store = (stem + suffix for suffix in ('_source', '_satellite', '_payload'))
        self.path = root / (stem + '.json')
        self.publication = root / (stem + '-publication.json')
        self.result = dict(scope='IMMUTABLE_ATTACHMENT_AND_CANONICAL_PAYLOAD_FENCES', cases=[], statements=[], status='RUNNING')

    def query(self, sql, *, rows=False):
        execute = self.session.rows if rows else self.session.query
        value, identity = execute('hybrid_fault_' + str(len(self.result['statements'])), sql)
        native = self.session.native(identity)
        if int(native['exception_code']):
            raise ValueError('fault probe did not finish natively')
        self.result['statements'].append(dict(query_id=identity, native=native))
        save(self.path, self.result)
        return value

    def rows(self, sql):
        return self.query(sql, rows=True)

    def record(self, name):
        self.result['cases'].append(dict(name=name, verdict='PASS'))
        save(self.path, self.result)

    def check(self, proof):
        links.verify_parts(self.rows, proof, source=self.source, table=self.satellite)

    def build_cases(self):
        for table in (self.source, self.satellite):
            self.query(links.DDL.replace(links.TABLE, table))
            self.query(f'SYSTEM STOP MERGES {table}')
        for table in (self.source, self.satellite):
            self.query(f"INSERT INTO {table} VALUES ('d','group','2026-11-01 00:00:00',0)")
        scope = self.rows("SELECT cityHash64('d')%32 AS bucket")[0]
        bucket = int(scope['bucket'])
        exact = links.census(bucket, source=self.source, table=self.satellite)
        stamp = "('d','group','2026-11-02 00:00:00',1)"
        self.query(f'INSERT INTO {self.source} VALUES {stamp}')
        mismatch = int(self.rows(exact)[0]['mismatches'])
        if mismatch != 1 or self.publication.exists():
            raise ValueError('expected uncommitted missing staged tombstone')
        refuses(lambda: links.publish(self.publication, dict(parity='PASS', checks=[dict(mismatches=mismatch, ties=0)])),
            'not publishable')
        assert not self.publication.exists()
        self.record('crash_before_publication_and_dropped_staged_row')

        self.query(f'INSERT INTO {self.satellite} VALUES {stamp}')
        self.query(f'SYSTEM START MERGES {self.satellite}')
        self.query(f'OPTIMIZE TABLE {self.satellite} FINAL')
        self.query(f'SYSTEM STOP MERGES {self.satellite}')
        actual = int(self.rows(exact)[0]['mismatches'])
        ties = int(self.rows(links.tie_census(bucket, table=self.satellite))[0]['ties'])
        proof = dict(parity='PASS', checks=[dict(mismatches=actual, ties=ties)],
            parts=links.fingerprints(self.rows, self.source, self.satellite))
        links.publish(self.publication, proof)  # Result deliberately discarded, as with a lost acknowledgement.
        saved = digest(self.publication)
        if links.publish(self.publication, proof) != proof or digest(self.publication) != saved:
            raise ValueError('identical publication retry did not resolve the original immutable record')
        self.record('lost_publication_ack_then_identical_retry')

        self.query(f'DETACH TABLE {self.satellite}')
        try:
            refuses(lambda: self.check(proof), 'parts absent')
        finally:
            self.query(f'ATTACH TABLE {self.satellite}')
        self.check(proof)
        self.record('committed_satellite_missing_then_reattached')

        self.query(f"INSERT INTO {self.source} VALUES ('d','group','2026-11-03 00:00:00',0)")
        refuses(lambda: self.check(proof), 'not the published canonical generation')
        self.record('stale_satellite_refused_after_canonical_edit')

        self.query(f'TRUNCATE TABLE {self.satellite}')
        self.query(f'INSERT INTO {self.satellite} SELECT {links.FIELDS} FROM {self.source}')
        if int(self.rows(exact)[0]['mismatches']):
            raise ValueError('exact satellite rebuild failed')
        recovered = dict(parts=links.fingerprints(self.rows, self.source, self.satellite))
        self.check(recovered)
        self.record('satellite_loss_and_exact_rebuild')

    def payload_cases(self):
        table = self.payload_store
        self.query(f'CREATE TABLE {table} (author_key String,doc_id String,updated_at DateTime64(3),'
            'body String,deleted UInt8,collection_name String) ENGINE=MergeTree ORDER BY (author_key,doc_id,updated_at)')
        key = ('author', 'd', 1793491200000)  # 2026-11-01T00:00:00Z
        def materialize(sql):
            rows = self.rows(sql.replace('FROM engagement_documents', 'FROM ' + table))
            return ([*projected.KEY, 'body'], [tuple(row[field] for field in (*projected.KEY, 'body')) for row in rows])
        def fetch():
            return projected.payload(materialize, [key], service='posts', kind='resolution')
        refuses(fetch, 'missing exact K20 payload version')
        self.record('missing_exact_winner_payload')
        self.query(f"INSERT INTO {table} VALUES ('author','d','2026-11-01 00:00:00','original',0,'posts')")
        if fetch() != {key: 'original'}:
            raise ValueError('winner payload fixture mismatch')
        self.query(f"INSERT INTO {table} VALUES ('author','d','2026-11-01 00:00:00','corrupt',0,'posts')")
        refuses(fetch, 'conflicting K20 payload version')
        self.record('conflicting_same_version_payload')


def run(root):
    root = Path(root).resolve()
    approval = read(root / 'admission.json')
    sha = current.source_guard(approval)
    task = Task(root, approval, sha)
    step2 = root / 'hybrid-k20-projected-comparison.json'
    task.next_phase('hybrid', step2)
    task.next_phase('faults', root / 'hybrid-k20-attachment-comparison.json')
    with task.attempt('Native faults of the frozen Step 3 attachment and payload fences; no measurement replay'):
        modern.install_sessions()
        cells.stop(root)
        session = modern.Session(root)
        before = read(root / 'hybrid-attachment-proof.json')
        lab = Lab(root, session)
        links.verify_parts(lab.rows, before)
        lab.build_cases()
        lab.payload_cases()
        links.verify_parts(lab.rows, before)
        lab.result.update(status='PASS', dynamic_publication_and_concurrent_cleanup='NOT_PROVEN',
            original_measured_store_unchanged=True)
        save(lab.path, lab.result)
        save(root / 'hybrid-k20-attachment-faults.json', lab.result)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    run(parser.parse_args().root)
