"""Bounded full-population seed, after the early F gates; never a publish path.

Snapshot only canonical small-group memberships. Seek through the verified time
index, rebind to canonical document/link winners, then retain 200 full identities
and ALL routes. No impression replay, copied bodies, saved authority or counters.
Every setup statement has tighter row/byte/memory limits than the parent lease.
"""
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path
import time
import re

import sqlglot
from sqlglot import exp

import arm_f as f
from arm_f_journal import Journal
from arm_f_native import save
from arm_f_runtime import Session
from arm_satellite_counts import generation
from arm_satellite_sql import literal as q
import restore_realism as restore

GROUP_BATCH = 128
READER_BATCH = 64
LIMITS = dict(max_memory_usage=4 * 1024**3, max_rows_to_read=8_000_000,
              max_bytes_to_read=2 * 1024**3, max_result_rows=1_000_000,
              max_bytes_before_external_sort=256 * 1024**2, max_bytes_before_external_group_by=256 * 1024**2)
MEMBERS_DDL = ('CREATE TABLE f_seed_members (reader_key String,group_id String) '
               'ENGINE=MergeTree ORDER BY (reader_key,group_id) SETTINGS index_granularity=64')
EARLY_GATES = ('T4', 'T2-F', 'T6-F', 'T3-F')


def literals(values):
    if not values or len(values) != len(set(values)) or any(not isinstance(v, str) or not v for v in values):
        raise ValueError('nonempty distinct bounded keys required')
    return ','.join(q(value) for value in values)


def current_members(groups):
    if len(groups) > GROUP_BATCH:
        raise ValueError('group batch exceeds declared bound')
    return ("SELECT group_id,member_key FROM (SELECT group_id,member_key,deleted,row_number() OVER "
        "(PARTITION BY group_id,member_key ORDER BY updated_at DESC,deleted DESC) AS rn FROM group_members "
        'WHERE group_id IN (' + literals(groups) + ")) WHERE rn=1 AND deleted=0 "
        "AND member_key NOT IN ('anyone','authenticated','anon')")


def membership_insert(groups):
    # A temporary setup relation, NOT a membership counter or publish shortcut.
    return ('INSERT INTO f_seed_members SELECT member_key,group_id FROM (SELECT *,count() OVER '
            '(PARTITION BY group_id) AS members FROM (' + current_members(groups)
            + ')) WHERE members<' + str(f.CUTOFF))


def window_sql(readers, version):
    if len(readers) > READER_BATCH or type(version) is not int or not 0 < version < 2**63:
        raise ValueError('bounded reader batch and committed coordinator revision required')
    selected = literals(readers)
    # The index narrows identities only. Latest canonical facts decide contents,
    # ordering time and link existence. No top-N before canonical revalidation.
    return ("WITH memberships AS (SELECT reader_key,group_id FROM f_seed_members WHERE reader_key IN (" + selected
        + ")), indexed AS (SELECT author_key,doc_id,group_id FROM doc_groups_t WHERE group_id IN "
        "(SELECT group_id FROM memberships)), docs AS (SELECT author_key,doc_id,created_at,deleted,"
        "row_number() OVER (PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn "
        "FROM documents WHERE (author_key,doc_id) IN (SELECT author_key,doc_id FROM indexed)), "
        "links AS (SELECT doc_id,group_id,deleted,row_number() OVER (PARTITION BY doc_id,group_id "
        "ORDER BY updated_at DESC,deleted DESC) AS rn FROM doc_groups WHERE (doc_id,group_id) IN "
        "(SELECT doc_id,group_id FROM indexed)), routes AS (SELECT m.reader_key AS reader_key,"
        "d.created_at AS created_at,d.author_key AS author_key,d.doc_id AS doc_id,g.group_id AS group_id "
        "FROM docs AS d INNER JOIN links AS g ON d.doc_id=g.doc_id INNER JOIN memberships AS m "
        "ON g.group_id=m.group_id WHERE d.rn=1 AND d.deleted=0 AND g.rn=1 AND g.deleted=0), "
        "ranked AS (SELECT *,dense_rank() OVER (PARTITION BY reader_key ORDER BY created_at DESC,"
        "doc_id DESC,author_key DESC) AS position FROM routes) SELECT reader_key,"
        "toUnixTimestamp64Milli(created_at) AS created_ms,author_key,doc_id,group_id,"
        + str(version) + ' AS version,0 AS deleted FROM ranked WHERE position<=' + str(f.CAP)
        + ' ORDER BY reader_key,created_ms DESC,doc_id DESC,author_key DESC,group_id')


def stored_sql(readers):
    return ("SELECT reader_key,toUnixTimestamp64Milli(created_at) AS created_ms,author_key,doc_id,group_id "
        "FROM (SELECT *,row_number() OVER (PARTITION BY reader_key,created_at,author_key,doc_id,group_id "
        "ORDER BY version DESC,deleted DESC) AS rn FROM fanout WHERE reader_key IN (" + literals(readers)
        + ')) WHERE rn=1 AND deleted=0 ORDER BY reader_key,created_ms DESC,doc_id DESC,author_key DESC,group_id')


def logical(rows):
    result, seen = [], set()
    for row in rows:
        item = (row['reader_key'], int(row['created_ms']), row['author_key'], row['doc_id'], row['group_id'])
        if item in seen:
            raise ValueError('duplicate seed route; refuse instead of DISTINCT')
        seen.add(item)
        result.append(item)
    return sorted(result)


def window(rows):
    """Logical cap, not an assertion that physical append-only history is capped."""
    ordered = sorted(logical(rows), key=lambda row: (row[0], f.key(
        dict(created_ms=row[1], doc_id=row[3], author_key=row[2], group_id=row[4]))))
    identities, retained = {}, []
    for row in ordered:
        seen = identities.setdefault(row[0], set())
        identity = row[2:4]
        if identity in seen or len(seen) < f.CAP:
            seen.add(identity)
            retained.append(row)
    return sorted(retained)


def reference_sql(authors, groups):
    """Independent canonical-only oracle slice; no time index/membership scratch."""
    return ('SELECT d.author_key AS author_key,d.doc_id AS doc_id,toUnixTimestamp64Milli(d.created_at) AS created_ms,'
        'g.group_id AS group_id FROM (SELECT author_key,doc_id,created_at,deleted,row_number() OVER '
        '(PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn FROM documents WHERE author_key IN ('
        + literals(authors) + ')) AS d INNER JOIN (SELECT doc_id,group_id,deleted,row_number() OVER '
        '(PARTITION BY doc_id,group_id ORDER BY updated_at DESC,deleted DESC) AS rn FROM doc_groups '
        'WHERE group_id IN (' + literals(groups) + ') AND doc_id IN (SELECT doc_id FROM documents WHERE author_key IN ('
        + literals(authors) + '))) AS g ON d.doc_id=g.doc_id WHERE d.rn=1 AND d.deleted=0 AND g.rn=1 AND g.deleted=0')


def independent_windows(builder, groups_by_reader):
    """Stream canonical author ranges. Keep only each sample's 200 identities."""
    groups = sorted({group for values in groups_by_reader.values() for group in values})
    retained = []
    if not groups:
        return retained
    cursor, index = '', 0
    while True:
        authors = builder.query('oracle_authors_' + str(index), 'SELECT DISTINCT author_key FROM documents WHERE author_key>'
            + q(cursor) + ' ORDER BY author_key LIMIT 128', rows=True)
        if not authors:
            return retained
        keys = [row['author_key'] for row in authors]
        if keys != sorted(set(keys)) or keys[0] <= cursor:
            raise ValueError('nonadvancing canonical oracle author range')
        rows = builder.query('oracle_slice_' + str(index), reference_sql(keys, groups), rows=True)
        candidates = [dict(reader_key=reader, **row) for row in rows
                      for reader, selected in groups_by_reader.items() if row['group_id'] in selected]
        previous = [dict(zip(('reader_key', 'created_ms', 'author_key', 'doc_id', 'group_id'), row)) for row in retained]
        retained = window(previous + candidates)
        cursor, index = keys[-1], index + 1


def require_early_gates(root):
    """Only the owned gate drivers' persisted results; absent is never PASS."""
    root = Path(root)
    admission = root / 'admission.json'
    if admission.exists():
        approval = json.loads(admission.read_bytes())
        if approval.get('run_directive') == 'Jacob Hoffman 2026-11-16 read-first/prepared-snapshot':
            # Explicit operator reorder: banked writes, T2/T6 BEFORE population;
            # T3 follows R+W. Do not fabricate old-order T3/T4 PASS files.
            value = json.loads((root / 'read-first-early.json').read_bytes())
            from arm_f_runtime import admitted
            admitted(approval, __import__('arm_t').digitalocean_id())
            paths = {key: Path(value[key + '_path']) for key in ('read_gates', 'banked_writes')}
            if (value.get('directive') != approval['run_directive']
                    or value.get('droplet_id') != approval['droplet_id']
                    or value.get('dataset_id') != approval['dataset_id']
                    or value.get('T2') != 'PASS' or value.get('T6') != 'PASS'
                    or value.get('banked_writes_sha256') != approval.get('banked_writes_sha256')
                    or any(hashlib.sha256(path.read_bytes()).hexdigest() != value[key + '_sha256']
                           for key, path in paths.items())):
                raise ValueError('source-bound read-first early proofs required')
            gates = json.loads(paths['read_gates'].read_bytes())
            from arm_f_gates import read_trials
            if gates['T2-F'].get('verified') is not True or json.loads(paths['banked_writes'].read_bytes()).get('T4') != 'PASS':
                raise ValueError('native parity/banked write proof incomplete')
            read_trials(gates['T6-F']['trials'])
            return {key: value[key + '_sha256'] for key in paths}
    result = {}
    for gate in EARLY_GATES:
        path = Path(root) / 'F-gates' / gate / 'result.json'
        value = json.loads(path.read_bytes())
        if (value.get('gate') != gate or value.get('outcome') != 'PASS'
                or value.get('dataset_id') != __import__('arm_t').DATASET
                or value.get('droplet_id') != __import__('arm_t').digitalocean_id()):
            raise ValueError('same-host early F gates required before population build')
        result[gate] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


class Builder:
    """Finite reader/group ranges, exact batch receipts, no implicit retry/resume."""
    def __init__(self, session, output, *, target='fanout'):
        if not re.fullmatch(r'fanout(?:_rebuild_[1-9][0-9]*)?', target):
            raise ValueError('owned fanout rebuild target required')
        self.target = target
        self.session, self.output = session, Path(output)
        self.output.mkdir(mode=0o700, exist_ok=False)
        self.queries = []

    def query(self, label, sql, *, rows=False):
        if self.target != 'fanout':
            tree = sqlglot.parse_one(sql, read='clickhouse')
            for table in tree.find_all(exp.Table):
                if table.name == 'fanout':
                    table.set('this', exp.to_identifier(self.target))
            sql = tree.sql(dialect='clickhouse')
        (self.output / (label + '.sql')).write_text(sql + '\n')
        print('[fanout-population] start', label, flush=True)
        raw, query_id = self.session.query(label, sql + (' FORMAT JSON' if rows else ''), setup_seconds=120, settings=LIMITS)
        # Native-log collection uses the parent envelope, but never changes these
        # tighter build-query limits. Failed statements propagate and stop.
        self.queries.append({'label': label, 'query_id': query_id, 'native': self.session.native(query_id)})
        save(self.output / 'queries.json', self.queries)
        print('[fanout-population] end', label, flush=True)
        return json.loads(raw)['data'] if rows else raw

    def members(self, sample_readers=()):
        self.sample_groups = {reader: [] for reader in sample_readers}
        self.query('members_ddl', MEMBERS_DDL.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ', 1))
        self.query('members_reset', 'TRUNCATE TABLE f_seed_members')
        cursor, batches = '', 0
        while True:
            groups = self.query('group_page_' + str(batches), 'SELECT DISTINCT group_id FROM group_members WHERE group_id>'
                + q(cursor) + ' ORDER BY group_id LIMIT ' + str(GROUP_BATCH), rows=True)
            if not groups:
                return batches
            keys = [row['group_id'] for row in groups]
            if keys != sorted(set(keys)) or keys[0] <= cursor:
                raise ValueError('nonadvancing/duplicate canonical group batch')
            # Unsupported principals stop, including in seek-lane groups. Do not
            # silently turn a group or foreign principal into a local human.
            invalid = self.query('member_principals_' + str(batches), 'SELECT count() AS n FROM ('
                + current_members(keys) + ') WHERE member_key NOT IN (SELECT username FROM users FINAL WHERE deleted=0)', rows=True)
            if int(invalid[0]['n']):
                raise ValueError('unsupported/nonlive recipient in canonical membership snapshot')
            if sample_readers:
                sample = self.query('sample_members_' + str(batches), 'SELECT member_key,group_id FROM (SELECT *,count() '
                    'OVER (PARTITION BY group_id) AS members FROM (' + current_members(keys)
                    + ')) WHERE members<' + str(f.CUTOFF) + ' AND member_key IN (' + literals(sample_readers) + ')', rows=True)
                for row in sample:
                    self.sample_groups[row['member_key']].append(row['group_id'])
            self.query('members_' + str(batches), membership_insert(keys))
            cursor, batches = keys[-1], batches + 1

    def expected(self, readers, version, label):
        duplicate = self.query(label + '_membership_duplicates', 'SELECT count() AS n FROM (SELECT reader_key,group_id '
            'FROM f_seed_members WHERE reader_key IN (' + literals(readers)
            + ') GROUP BY reader_key,group_id HAVING count()>1)', rows=True)
        if int(duplicate[0]['n']):
            raise ValueError('duplicate seed membership batch')
        rows = self.query(label + '_expected', window_sql(readers, version), rows=True)
        logical(rows)
        return rows

    def insert(self, readers, version, label):
        sql = window_sql(readers, version)
        # Native INSERT SELECT, not a multi-megabyte argv carrying result bodies.
        self.query(label + '_insert', 'INSERT INTO fanout (' + ','.join(f.COLUMNS) + ') SELECT reader_key,'
            'fromUnixTimestamp64Milli(created_ms),author_key,doc_id,group_id,version,deleted FROM (' + sql + ')')

    def reconcile(self, readers, version, label):
        # Keep desired existing routes; tombstone only obsolete complete keys.
        # Equal-revision tombstones must never compete with desired live rows.
        wanted = window_sql(readers, version)
        old = stored_sql(readers)
        self.query(label + '_remove_obsolete', 'INSERT INTO fanout (' + ','.join(f.COLUMNS)
            + ') SELECT reader_key,fromUnixTimestamp64Milli(created_ms),author_key,doc_id,group_id,'
            + str(version) + ',1 FROM (' + old + ') WHERE (reader_key,created_ms,author_key,doc_id,group_id) '
            'NOT IN (SELECT reader_key,created_ms,author_key,doc_id,group_id FROM (' + wanted + '))')
        self.insert(readers, version, label)


def build(root, *, rebuild=False):
    root = Path(root)
    gates = require_early_gates(root)
    session = Session(root)
    session.verify_envelope()
    if restore.command(session.compose, session.env, 'ps', '-q', 'api').strip():
        raise ValueError('stop the owned API before fencing population setup')
    rehearsal = json.loads((root / 'population-native-fixture/result.json').read_bytes())
    source = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    if (rehearsal.get('outcome') != 'PASS' or rehearsal.get('builder_sha256') != source
            or rehearsal.get('droplet_id') != session.host_id or rehearsal.get('engine') != '24.8.14.39'
            or any(rehearsal.get(key) != hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                   for key, name in [('fixture_sha256', 'arm_f_population_fixture.py'),
                                     ('primitives_sha256', 'arm_f.py'), ('runtime_sha256', 'arm_f_runtime.py')])):
        raise ValueError('this builder needs a passing tiny native rehearsal before full population')
    # No running API/coordinator while the seed boundary is fenced. The journal
    # exclusive lock below refuses a live or second maintenance writer.
    if rebuild:
        gate = json.loads((root / 'F-gates/T6-F-populated/result.json').read_bytes())
        if (gate.get('gate') != 'T6-F-populated' or gate.get('outcome') != 'PASS'
                or gate.get('droplet_id') != session.host_id or gate.get('dataset_id') != session.operation['dataset_id']
                or gate.get('population_receipt_sha256') != hashlib.sha256((root / 'F-population/result.json').read_bytes()).hexdigest()):
            raise ValueError('populated T6 must pass before T5 population rebuild')
    builder = Builder(session, root / ('F-population-rebuild' if rebuild else 'F-population'))
    journal = Journal(root / 'fanout-state/journal')
    started = time.monotonic()
    result = dict(kind='CONFIG_F_FULL_POPULATION_SEED', outcome='BUILDING', early_gates=gates,
        droplet_id=session.host_id, dataset_id=session.operation['dataset_id'], builder_sha256=source,
        reader_batch=READER_BATCH, group_batch=GROUP_BATCH, readers_seeded=0, readers_total=0,
        route_rows=0, batches=[], T5='NOT_RUN', population_T6='NOT_RUN', R_plus_W='NOT_RUN',
        logical_identity_cap=f.CAP, physical_route_ceiling='NOT_200M; all contributing routes/versions count')
    def persist():
        result['wall_seconds'] = time.monotonic() - started
        save(builder.output / 'result.json', result)
    persist()
    try:
        if journal.pending():
            raise ValueError('pending coordinator intents; no stable seed boundary')
        before, _ = generation(session)
        result['canonical_generation'] = before
        # The index is an accelerator, not a rebuild root. Its verified canonical
        # generation must still match. A mismatch cannot be waived by seeding.
        metadata = json.loads((root / 'metadata/result.json').read_bytes())
        if metadata['canonical_generation'] != before:
            raise ValueError('time index generation not certified; revalidate before population setup')
        profile = json.loads((root / 'profile/inventory.json').read_bytes())
        reader = profile['reader']
        manifest = json.loads((root / 'input/manifest.json').read_bytes())
        samples = list(dict.fromkeys([reader, manifest['readers'][2], manifest['readers'][-1]]))
        result['sample_readers'] = samples
        result['membership_batches'] = builder.members(samples)
        original = window(builder.query('test_reader_before', stored_sql([reader]), rows=True))
        save(builder.output / 'test-reader-window.json', original)
        result['test_reader_window_sha256'] = hashlib.sha256(json.dumps(original).encode()).hexdigest()
        if rebuild:
            prior = json.loads((root / 'F-population/result.json').read_bytes())
            if prior['canonical_generation'] != before or prior['outcome'] != 'SEEDED_PENDING_POPULATED_T6_T5_RW':
                raise ValueError('T5 requires unchanged fully seeded canonical boundary')
            builder.query('drop_only_fanout', 'DROP TABLE fanout')
            builder.query('recreate_fanout', f.DDL)
        def seed(sequence, payload):
            expected = builder.expected([reader], sequence, 'seed_invariance')
            if logical(expected) != original:
                raise ValueError('test reader seed invariant failed; stop before population writes')
            if rebuild:
                builder.insert([reader], sequence, 'rebuild_test_reader')
            total = builder.query('reader_total', 'SELECT count() AS n FROM users FINAL WHERE deleted=0', rows=True)
            result['readers_total'] = int(total[0]['n'])
            cursor, index, digest = '', 0, hashlib.sha256()
            while True:
                humans = builder.query('reader_page_' + str(index), 'SELECT username FROM users FINAL WHERE deleted=0 AND username>'
                    + q(cursor) + ' ORDER BY username LIMIT ' + str(READER_BATCH), rows=True)
                if not humans:
                    break
                keys = [row['username'] for row in humans]
                if keys != sorted(set(keys)) or keys[0] <= cursor:
                    raise ValueError('nonadvancing/duplicate reader batch')
                others = [key for key in keys if key != reader]
                if others:
                    expected = builder.expected(others, sequence, 'batch_' + str(index))
                    builder.reconcile(others, sequence, 'batch_' + str(index))
                    stored = builder.query('batch_' + str(index) + '_stored', stored_sql(others), rows=True)
                    if logical(stored) != logical(expected):
                        raise ValueError('population exact batch mismatch')
                    result['route_rows'] += len(stored)
                result['readers_seeded'] += len(keys)
                batch_rows = window(builder.query('batch_' + str(index) + '_logical_window', stored_sql(keys), rows=True))
                raw = json.dumps(batch_rows, separators=(',', ':')).encode()
                digest.update(raw)
                result['logical_serialized_bytes'] = result.get('logical_serialized_bytes', 0) + len(raw)
                result['batches'].append({'batch': index, 'readers': len(keys), 'through': keys[-1]})
                cursor, index = keys[-1], index + 1
                persist()
            result['logical_windows_sha256'] = digest.hexdigest()
            return {'revision': sequence, 'readers': result['readers_seeded']}
        revision = journal.run('full-population-rebuild' if rebuild else 'full-population-bootstrap', '__derived_setup__', 'bootstrap',
            {'canonical_generation': before, 'builder_sha256': source}, lambda: None, seed, lambda *a: None)
        result['coordinator_revision'] = revision['revision']
        after, _ = generation(session)
        if before != after or result['readers_seeded'] != result['readers_total']:
            raise ValueError('canonical drift or incomplete population')
        if window(builder.query('test_reader_after', stored_sql([reader]), rows=True)) != original:
            raise ValueError('population changed the test reader')
        independent = independent_windows(builder, builder.sample_groups)
        sampled = window(builder.query('sample_windows', stored_sql(samples), rows=True))
        if independent != sampled:
            raise ValueError('independent canonical sample differs from seeded windows')
        result['independent_sample_parity'] = 'PASS'
        result['sample_route_counts'] = {reader: sum(row[0] == reader for row in independent) for reader in samples}
        closing, _ = generation(session)
        if closing != before:
            raise ValueError('canonical sources changed during independent population verification')
        result['storage'] = builder.query('physical_storage', "SELECT sum(rows) AS rows,sum(bytes_on_disk) AS bytes,"
            "count() AS parts FROM system.parts WHERE database='web10' AND table='fanout' AND active", rows=True)
        result.update(outcome='SEEDED_PENDING_POPULATED_T6_T5_RW', seeded_fraction=1)
        if rebuild:
            # Exact logical digest and serialized-byte totals: declared tolerance0.
            # Physical bytes/parts vary with merges and are reported, not equated.
            for key in ('readers_seeded', 'logical_windows_sha256', 'logical_serialized_bytes'):
                if result[key] != prior[key]:
                    raise ValueError('T5 full-population logical rebuild mismatch')
            result.update(T5='PASS', logical_totals_tolerance=0)
    except Exception as error:
        result.update(outcome='STOP', **__import__('arm_f_failure').details(error),
            seeded_fraction=result['readers_seeded'] / result['readers_total'] if result['readers_total'] else 0)
        (root / 'F.stop').write_text('population_' + type(error).__name__ + '\n')
        raise
    finally:
        result['updated_utc'] = datetime.now(UTC).isoformat()
        persist()
        journal.close()
    return result


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--rebuild', action='store_true', help='T5 only, requires populated T6 receipt')
    args = parser.parse_args()
    print(json.dumps(build(args.root, rebuild=args.rebuild), indent=2))
