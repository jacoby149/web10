"""Disposable app-shaped pin candidates; canonical history remains authoritative."""
from collections import Counter

from arm_satellite_sql import literal as q

TABLE = 'billboard_pin_refs'
DIRECTIVE = 'Jacob Hoffman 2026-11-22 skinny app-shaped billboard pin lookup then rerun'


def enabled(admission):
    return admission.get('pin_index_directive') == DIRECTIVE


DDL = (f'CREATE TABLE {TABLE} (author_key String,ref_value String,doc_id String) '
    'ENGINE=MergeTree ORDER BY (author_key,ref_value,doc_id)')


def source():
    # The table represents one type, so no redundant per-row type string. Keep
    # historical edges, including tombstones; never use them as current authority.
    return ('SELECT DISTINCT author_key,ref_value,doc_id FROM engagement_documents '
        "WHERE collection_name='placements' AND ref_value!=''")


def census():
    columns = 'author_key,ref_value,doc_id'
    # Signed multiset equality rejects missing, extra, and duplicate edges.
    return ('SELECT count() AS mismatches FROM (SELECT ' + columns + ',sum(delta) AS balance FROM ('
        f'SELECT {columns},toInt64(1) AS delta FROM ({source()}) UNION ALL '
        f'SELECT {columns},toInt64(-1) AS delta FROM {TABLE}) GROUP BY {columns} HAVING balance!=0)')


def lookup(keys):
    values = ','.join('(' + q(author) + ',' + q(post) + ')' for author, post in sorted(keys))
    return (f'SELECT author_key,ref_value,doc_id FROM {TABLE} WHERE (author_key,ref_value) IN ('
        + values + ') ORDER BY author_key,ref_value,doc_id')


def candidates(docs, execute):
    keys = {(d['author_key'], d['doc_id']) for d in docs}
    if not keys:
        return []
    rows = execute(lookup(keys))
    edges = []
    for row in rows:
        if set(row) != {'author_key', 'ref_value', 'doc_id'} or (row['author_key'], row['ref_value']) not in keys:
            raise ValueError('unexpected billboard pin candidate edge')
        edges.append((row['author_key'], row['ref_value'], row['doc_id']))
    if edges != sorted(set(edges)):
        raise ValueError('duplicate or unordered billboard pin candidate edge')
    # A pin can have historically pointed at two posts on this page. Resolve
    # its complete full-key history once; allow either selected root to win.
    counts = Counter((author, doc) for author, _, doc in edges)
    print('[billboards] indexed candidates edges=', len(edges), 'full_keys=', len(counts), flush=True)
    return rows
