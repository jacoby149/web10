"""Exact, doc-id-disjoint setup checks. No engine/network work on import.

Hash the same stable identity in every input, including canonical histories.
Every version/author/attachment sharing doc_id remains in one batch. This bounds
join working sets, not the total scan cost or whole-server memory by assertion.
"""
import hashlib
import json
import os
from pathlib import Path
import re

import sqlglot
from sqlglot import exp

DEFAULT_BATCHES = 8
MAX_BATCHES = 256


def require_batched(batches):
    if type(batches) is not int or not 2 <= batches <= MAX_BATCHES:
        raise ValueError('full-store reconciliation must be born batched')


def partition(sql, index, batches, tables):
    if (type(batches) is not int or not 1 <= batches <= MAX_BATCHES
            or type(index) is not int or not 0 <= index < batches):
        raise ValueError('valid bounded batch index/count required')
    tree = sqlglot.parse_one(sql, read='clickhouse')
    sources = list(tree.find_all(exp.Table))
    if {table.name for table in sources} != set(tables):
        raise ValueError('exact source-table set required; refuse unpartitioned source drift')
    predicate = sqlglot.parse_one('SELECT 1 WHERE cityHash64(doc_id)%' + str(batches) + '=' + str(index),
                                 read='clickhouse').args['where'].this
    for table in sources:
        node = table.parent if isinstance(table.parent, exp.Final) else table
        original = node.copy()
        alias = table.alias or table.name
        if isinstance(original, exp.Final):
            original.this.set('alias', None)
        else:
            original.set('alias', None)
        selected = exp.select('*').from_(original).where(predicate.copy())
        node.replace(exp.Subquery(this=selected, alias=exp.TableAlias(this=exp.to_identifier(alias))))
    return tree.sql(dialect='clickhouse')


def complete(indices, batches):
    if (type(batches) is not int or not 2 <= batches <= MAX_BATCHES
            or any(type(index) is not int for index in indices)
            or len(indices) != batches or set(indices) != set(range(batches))):
        raise ValueError('all batches must finish exactly once; no duplicate/partial acceptance')


def uint(value):
    if type(value) is int and value >= 0:
        return value
    if isinstance(value, str) and re.fullmatch(r'0|[1-9][0-9]*', value):
        return int(value)
    raise ValueError('exact nonnegative native integer required')


def totals(rows, batches):
    complete([row['batch'] for row in rows], batches)
    fields = ('expected', 'stored', 'matched', 'mismatched', 'duplicate_keys')
    total = {field: sum(uint(row[field]) for row in rows) for field in fields}
    if any(uint(row['expected']) != uint(row['stored']) or uint(row['expected']) != uint(row['matched'])
           or uint(row['mismatched']) or uint(row['duplicate_keys']) for row in rows):
        raise ValueError('exact transpose reconciliation mismatch; no cancellation across batches')
    return total


def persist(path, value):
    path = Path(path)
    temporary = path.with_suffix('.tmp')
    with temporary.open('w') as stream:
        json.dump(value, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def canonical_keys(session):
    """Uniqueness premise for the original join check plus duplicate-key gate."""
    rows, _ = session.rows('reconcile_canonical_keys', "SELECT name,engine,sorting_key,partition_key,uuid "
        "FROM system.tables WHERE database='web10' AND name IN ('documents','doc_groups','doc_groups_t') ORDER BY name")
    expected = {'documents': 'author_key,doc_id', 'doc_groups': 'doc_id,group_id', 'doc_groups_t': 'group_id,created_at,doc_id'}
    if {row['name'] for row in rows} != set(expected):
        raise ValueError('canonical table identity missing')
    for row in rows:
        key = re.sub(r'\s+', '', row['sorting_key'])
        wanted = expected[row['name']]
        engine = 'MergeTree' if row['name'] == 'doc_groups_t' else 'ReplacingMergeTree'
        if (row['engine'] != engine or key not in (wanted, '(' + wanted + ')', 'tuple(' + wanted + ')')
                or row['partition_key'] not in ('', 'tuple()')):
            raise ValueError('canonical FINAL uniqueness premise differs from approved schema')
    return rows


def transpose(session, output, original_check, *, batches=DEFAULT_BATCHES):
    require_batched(batches)
    output = Path(output)
    output.mkdir(mode=0o700, exist_ok=False)
    result = dict(kind='BATCHED_EXACT_TRANSPOSE_RECONCILIATION', outcome='CHECKING', batches=batches,
        rows=[], source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        original_failed_query_sha256=hashlib.sha256((original_check + ' FORMAT JSON').encode()).hexdigest(),
        partition='cityHash64(doc_id)%batches on all three inputs; never group/body/ref/version',
        no_sampling=True, native_performance_claim=False)
    persist(output / 'result.json', result)
    expected = ('SELECT count() AS n FROM (SELECT doc_id FROM doc_groups FINAL WHERE deleted=0) AS g '
                'INNER JOIN (SELECT doc_id FROM documents FINAL WHERE deleted=0) AS d ON g.doc_id=d.doc_id')
    stored = 'SELECT count() AS n FROM doc_groups_t'
    duplicates = ('SELECT count() AS n FROM (SELECT group_id,author_key,doc_id,count() AS copies '
                  'FROM doc_groups_t GROUP BY group_id,author_key,doc_id HAVING copies>1)')
    def execute(label, sql):
        (output / (label + '.sql')).write_text(sql + '\n')
        values, query_id = session.rows(label, sql, setup_seconds=900)
        if len(values) != 1:
            raise ValueError('one exact aggregate row required')
        result.setdefault('queries', []).append({'label': label, 'query_id': query_id, 'native': session.native(query_id)})
        persist(output / 'result.json', result)
        return values[0]
    try:
        result['canonical_keys'] = canonical_keys(session)
        for index in range(batches):
            label = 'transpose_batch_' + str(index)
            row = {'batch': index}
            row['expected'] = uint(execute(label + '_expected', partition(expected, index, batches,
                {'documents', 'doc_groups'}))['n'])
            row['stored'] = uint(execute(label + '_stored', partition(stored, index, batches, {'doc_groups_t'}))['n'])
            checked = execute(label + '_fields', partition(original_check, index, batches,
                {'doc_groups_t', 'documents', 'doc_groups'}))
            row.update(matched=uint(checked['matched']), mismatched=uint(checked['mismatched']))
            row['duplicate_keys'] = uint(execute(label + '_duplicates', partition(duplicates, index, batches, {'doc_groups_t'}))['n'])
            result['rows'].append(row)
            persist(output / 'result.json', result)
            if row['expected'] != row['stored'] or row['expected'] != row['matched'] or row['mismatched'] or row['duplicate_keys']:
                raise ValueError('transpose exact batch mismatch; stop before next batch')
        result['totals'] = totals(result['rows'], batches)
        result['outcome'] = 'PASS'
    except Exception as error:
        result.update(outcome='STOP', failure_class=type(error).__name__)
        raise
    finally:
        persist(output / 'result.json', result)
    total = result['totals']
    return ([{'n': total['expected']}], [{'n': total['stored']}],
            [{'matched': total['matched'], 'mismatched': total['mismatched']}], result)
