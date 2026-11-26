"""Immutable attachment-history satellite for the measured K20 key scans."""
import hashlib
import json

import sqlglot
from sqlglot import exp

from arm_f_native import save
from arm_satellite_sql import literal as q
from costfn_seed_resume import setup_writes
from costfn_task import read


SOURCE = 'doc_groups'
TABLE = 'hybrid_k20_attachment_history'
FIELDS = 'doc_id,group_id,updated_at,deleted'
BUCKETS = 32
DDL = (f'CREATE TABLE {TABLE} (doc_id String,group_id String,updated_at DateTime64(3),deleted UInt8) '
    'ENGINE=MergeTree ORDER BY (doc_id,group_id,updated_at,deleted) SETTINGS index_granularity=256')
KEY_STAGES = ('resolution', 'preparation')


def parts_sql(table):
    return ("SELECT name,toString(rows) AS rows,toString(data_version) AS data_version,hash_of_all_files AS content "
        "FROM system.parts WHERE database='web10' AND active AND table=" + q(table) + ' ORDER BY name')


def parts_digest(rows):
    if not rows:
        raise ValueError('hybrid attachment parts absent')
    return hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()


def fingerprints(execute, source=SOURCE, table=TABLE):
    return {name: parts_digest(execute(parts_sql(name))) for name in (source, table)}


def verify_parts(execute, proof, *, source=SOURCE, table=TABLE):
    if fingerprints(execute, source, table) != proof['parts']:
        raise ValueError('hybrid attachment history is not the published canonical generation')


def census(bucket, *, source=SOURCE, table=TABLE):
    if type(bucket) is not int or not 0 <= bucket < BUCKETS:
        raise ValueError('complete owned attachment hash subdivision required')
    key = 'tuple(' + FIELDS + ')'
    scope = f' WHERE cityHash64(doc_id)%{BUCKETS}={bucket}'
    return ('SELECT count() AS mismatches FROM (SELECT item,sum(delta) AS balance FROM ('
        + f'SELECT {key} AS item,toInt64(1) AS delta FROM {source}{scope} UNION ALL '
        + f'SELECT {key} AS item,toInt64(-1) AS delta FROM {table}{scope}'
        + ') GROUP BY item HAVING balance!=0)')


def tie_census(bucket, *, table=TABLE):
    return ('SELECT count() AS ties FROM (SELECT doc_id,group_id,updated_at FROM ' + table
        + f' WHERE cityHash64(doc_id)%{BUCKETS}={bucket} GROUP BY doc_id,group_id,updated_at '
        'HAVING min(deleted)!=max(deleted))')


def marker(sql):
    return next((kind for kind in KEY_STAGES if '/* projected_' + kind + '_keys */' in sql), None)


def rewrite(sql):
    kind = marker(sql)
    if kind is None:
        return sql
    tree = sqlglot.parse_one(sql, read='clickhouse')
    tables = [node for node in tree.find_all(exp.Table) if node.name == SOURCE]
    if not tables:
        raise ValueError('hybrid attachment rewrite did not exercise the canonical boundary')
    for table in tables:
        table.set('this', exp.to_identifier(TABLE))
    return tree.sql(dialect='clickhouse')


def build(session, root, *, chunked=False):
    path = root / 'hybrid-attachment-proof.json'
    execute = lambda sql: session.rows('hybrid_attachment_fence', sql)[0]  # noqa: E731
    if path.is_file():
        proof = read(path)
        verify_parts(execute, proof)
        return proof
    before = parts_digest(execute(parts_sql(SOURCE)))
    session = setup_writes(session, root / 'hybrid-attachment-setup', SOURCE)
    writes = []
    _, query_id = session.query('hybrid_attachment_create', DDL)
    writes.append(dict(stage='create', query_id=query_id, native=session.native(query_id)))
    if chunked:
        # Full-store scale: one receipted INSERT per owned hash subdivision,
        # so no single statement carries the whole canonical history. The
        # copy is still the same exact tuple projection of every row.
        for bucket in range(BUCKETS):
            scope = f' WHERE cityHash64(doc_id)%{BUCKETS}={bucket}'
            sql = f'INSERT INTO {TABLE} SELECT {FIELDS} FROM {SOURCE}{scope}'
            _, query_id = session.query('hybrid_attachment_copy_' + str(bucket), sql)
            writes.append(dict(stage='copy', bucket=bucket, query_id=query_id,
                native=session.native(query_id)))
        copies = BUCKETS
    else:
        _, query_id = session.query('hybrid_attachment_copy', f'INSERT INTO {TABLE} SELECT {FIELDS} FROM {SOURCE}')
        writes.append(dict(stage='copy', query_id=query_id, native=session.native(query_id)))
        copies = 1
    _, query_id = session.query('hybrid_attachment_settle', f'OPTIMIZE TABLE {TABLE} FINAL')
    writes.append(dict(stage='settle', query_id=query_id, native=session.native(query_id)))
    session.query('hybrid_attachment_freeze', f'SYSTEM STOP MERGES {TABLE}')
    checks = []
    for bucket in range(BUCKETS):
        exact, query_id = session.rows('hybrid_attachment_census_' + str(bucket), census(bucket))
        ties, tie_id = session.rows('hybrid_attachment_ties_' + str(bucket), tie_census(bucket))
        checks.append(dict(bucket=bucket, mismatches=int(exact[0]['mismatches']), ties=int(ties[0]['ties']),
            census_id=query_id, tie_id=tie_id))
        save(root / 'hybrid-attachment-census.json', checks)
        if checks[-1]['mismatches'] or checks[-1]['ties']:
            raise ValueError('hybrid attachment mismatch or unstable canonical tombstone tie; not published')
    parts = fingerprints(execute)
    if parts[SOURCE] != before:
        raise ValueError('canonical attachment generation changed during hybrid build')
    proof = dict(parity='PASS', host=session.host_id, parts=parts, checks=checks, writes=writes,
        table=TABLE, copy_chunks=copies, historical_multiplicity_preserved=True)
    return publish(path, proof)


def publish(path, proof):
    if proof['parity'] != 'PASS' or any(row['mismatches'] or row['ties'] for row in proof['checks']):
        raise ValueError('unverified attachment history is not publishable')
    if path.exists():
        existing = read(path)
        if existing != proof:
            raise ValueError('conflicting immutable attachment publication')
        return existing
    save(path, proof)
    return proof
