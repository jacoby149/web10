"""Skinny typed ClickHouse layouts and exact row-ID seeks. No engine side effects.

This cell asks assembly/address questions: tables sort by immutable row ID.
Range/prefix query-planner/layout claims are not inferred from assembly costs.
No SQL below extracts JSON or casts stored strings into typed values.
"""
from arm_satellite_sql import literal as q
from row_model import TYPES, encode_path

VALUE_TYPES = dict(text='String', integers='Int256', floats='Float64', timestamps="DateTime64(6,'UTC')",
    booleans='Bool', nulls='UInt8', objects='UInt64', arrays='UInt64')

DDL = (
    'CREATE TABLE row_documents (value_row_id FixedString(64),author_key String,doc_id String) ENGINE=MergeTree ORDER BY value_row_id',
    'CREATE TABLE row_document_versions (document_row_id FixedString(64),version UInt64,deleted Bool,'
    'pointer_count UInt64,pointer_digest FixedString(64)) ENGINE=MergeTree ORDER BY (document_row_id,version)',
    'CREATE TABLE row_pointers (document_row_id FixedString(64),version UInt64,key LowCardinality(String),'
    'type LowCardinality(String),value_row_id String,deleted Bool) ENGINE=MergeTree ORDER BY (document_row_id,version,key)',
    *("CREATE TABLE row_" + kind + ' (value_row_id FixedString(64),value ' + native
        + ') ENGINE=MergeTree ORDER BY value_row_id' for kind, native in VALUE_TYPES.items()),
)


def literals(values):
    values = sorted(set(values))
    if not values or any(not isinstance(value, str) or not value for value in values):
        raise ValueError('explicit nonempty immutable row IDs required')
    return ','.join(q(value) for value in values)


def nodes(identities):
    ids = literals(identity.row_id for identity in identities)
    return ('SELECT document_row_id,version,deleted,pointer_count,pointer_digest FROM row_document_versions '
        'WHERE document_row_id IN (' + ids + ') AND (document_row_id,version) IN '
        '(SELECT document_row_id,max(version) FROM row_document_versions WHERE document_row_id IN ('
        + ids + ') GROUP BY document_row_id) GROUP BY document_row_id,version,deleted,pointer_count,pointer_digest')


def pointers(versions, *, paths=None):
    keys = sorted({(node.identity.row_id, node.version) for node in versions})
    if not keys:
        raise ValueError('explicit current full-key document versions required')
    selected = ','.join('(' + q(owner) + ',' + str(version) + ')' for owner, version in keys)
    predicate = '(document_row_id,version) IN (' + selected + ')'
    if paths is not None:
        if not paths or any(not path for path in paths):
            raise ValueError('nonempty displayed-key paths required')
        exact, subtrees = set(), set()
        for path in paths:
            subtrees.add(encode_path(path))
            exact.update(encode_path(path[:length]) for length in range(1, len(path) + 1))
        predicate += ' AND (key IN (' + literals(exact) + ') OR ' + ' OR '.join(
            'startsWith(key,' + q(value) + ')' for value in sorted(subtrees)) + ')'
    return ('SELECT document_row_id,version,key,type,value_row_id,deleted FROM row_pointers WHERE '
        + predicate + ' GROUP BY document_row_id,version,key,type,value_row_id,deleted')


def values(kind, ids):
    if kind not in TYPES:
        raise ValueError('unknown typed value table')
    columns = 'value_row_id,author_key,doc_id' if kind == 'documents' else 'value_row_id,value'
    return 'SELECT ' + columns + ' FROM row_' + kind + ' WHERE value_row_id IN (' + literals(ids) + ')'
