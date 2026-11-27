"""Receipt-side native write and stable view reconciliation for sustained DAU."""

from contextlib import closing
from datetime import datetime
import json
from pathlib import Path
import sqlite3
import uuid

from arm_satellite_sql import literal as q
from costfn_task import ParityDivergence
from dau_sustain_parity import writer_ledger


def committed_publications(path, first_sequence, issued):
    """Resolve *all* intents for the window; incomplete commits are not absent."""
    by_operation = {str(uuid.UUID(row['operation_id'])) + ':publish': row for row in issued}
    if len(by_operation) != len(issued):
        raise ValueError('distinct scheduled publication operation IDs required')
    path = Path(path).resolve()
    with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)) as source:
        intents = source.execute('SELECT sequence,operation_id,actor_key,operation,state,result_json '
            'FROM intents WHERE sequence>? ORDER BY sequence', (first_sequence,)).fetchall()
    rows = []
    for sequence, operation_id, actor, operation, state, raw in intents:
        if operation != 'publish' or operation_id not in by_operation or state != 'complete' or not raw:
            raise ValueError('unissued or unresolved native publication intent')
        planned = by_operation.pop(operation_id)
        result = json.loads(raw)
        # The F journal marks complete only after re-reading canonical targets
        # and applying/reconciling each target's index and pointer maintenance.
        if (actor, result['author_key'], result['doc_id']) != (planned['actor'], planned['actor'], planned['doc_id']):
            raise ParityDivergence('publication acknowledgment differs from the native intent result')
        rows.append(dict(slot=planned['slot'], actor=actor, doc_id=result['doc_id'],
            committed_groups=result['groups'], reconciled=True, journal_sequence=sequence,
            request_id=planned['request_id'], operation_id=operation_id))
    if by_operation:
        raise ValueError('acknowledged publications lack exact native intent records')
    return rows


def attachment_sql(rows):
    keys = ','.join('(' + q(row['actor']) + ',' + q(row['doc_id']) + ')' for row in rows)
    return ('SELECT d.author_key,d.doc_id,d.collection_name, arraySort(groupUniqArray(g.group_id)) AS groups '
        "FROM (SELECT author_key,doc_id,collection_name,deleted FROM documents WHERE (author_key,doc_id) IN ("
        + keys + ') ORDER BY updated_at DESC,deleted DESC LIMIT 1 BY author_key,doc_id) d '
        'INNER JOIN (SELECT doc_id,group_id,deleted FROM doc_groups WHERE doc_id IN ('
        + ','.join(q(row['doc_id']) for row in rows)
        + ') ORDER BY updated_at DESC,deleted DESC LIMIT 1 BY doc_id,group_id) g USING (doc_id) '
        'WHERE d.deleted=0 AND g.deleted=0 GROUP BY d.author_key,d.doc_id,d.collection_name')


def reconcile_publications(session, path, first_sequence, issued, writer_groups, following):
    rows = committed_publications(path, first_sequence, issued)
    writer_ledger(rows, writer_groups, following, {row['slot'] for row in issued})
    native = []
    for offset in range(0, len(rows), 256):
        batch = rows[offset:offset + 256]
        found, query_id = session.rows(f'dau_write_census_{offset}', attachment_sql(batch))
        expected = {(row['actor'], row['doc_id'], 'posts'): sorted(row['committed_groups']) for row in batch}
        actual = {(row['author_key'], row['doc_id'], row['collection_name']): row['groups'] for row in found}
        if len(found) != len(actual) or expected != actual:
            raise ParityDivergence('current canonical publication/attachment census differs from journal')
        native.append(dict(query_id=query_id, finish=native_finish(session, query_id), publications=len(batch)))
    return dict(commits=rows, canonical_census=native)


def raw_views_sql(ids, groups):
    """Original rows and exact distinct count; no aggregate tables or API outputs."""
    if not ids or not groups:
        raise ValueError('non-empty raw view scope required')
    ids_sql = ','.join(q(doc) for doc in sorted(set(ids)))
    group_sql = ','.join(q(group) for group in sorted(set(groups)))
    return ("SELECT doc_id,count() AS impressions,uniqExact(reader_key) AS reach,"
        "toString(min(toDateTime(seen_at) + INTERVAL 1 YEAR),'UTC') AS first_expiry_utc "
        "FROM content_events WHERE service='posts' AND event_type='delivery' AND doc_id IN ("
        + ids_sql + ') AND doc_id IN (SELECT doc_id FROM (SELECT doc_id,group_id,deleted FROM doc_groups '
        'WHERE doc_id IN (' + ids_sql + ') AND group_id IN (' + group_sql + ') ORDER BY updated_at DESC,deleted DESC '
        'LIMIT 1 BY doc_id,group_id) WHERE deleted=0) GROUP BY doc_id ORDER BY doc_id')


def views_bookend(session, packets, label):
    result, queries, cache = {}, [], {}
    for index, packet in packets.items():
        scope = tuple(sorted(set(packet['ids']))), tuple(sorted(set(packet['views_readable_groups'])))
        if scope not in cache:
            if all(scope):
                rows, query_id = session.rows(f'dau_views_{label}_{index}', raw_views_sql(*scope))
                queries.append(dict(query_id=query_id, finish=native_finish(session, query_id)))
            else:
                rows = []
            cache[scope] = rows
        result[str(index)] = cache[scope]
    return dict(rows=result, queries=queries)


def native_finish(session, query_id):
    value = session.native(query_id)
    if (value['query_id'], value['type'], int(value['exception_code'])) != (query_id, 'QueryFinish', 0):
        raise ValueError('exact successful native census finish required')
    return value


def settled_views(before, after, measured_end, *, append_only_verified):
    """Prove invariance, not just equality of a serving response and an aggregate.

    If a relevant input can expire or grow in the measured interval, this
    oracle cannot establish that interval's view snapshots. The caller must
    withhold figures, not compare to a looser range or claim a response mismatch.
    """
    if not append_only_verified or before['rows'] != after['rows']:
        raise ValueError('raw delivery state not proven invariant over the measured windows')
    values = {}
    for index, rows in before['rows'].items():
        expected = {}
        for row in rows:
            expiry = datetime.fromisoformat(row['first_expiry_utc'].replace(' ', 'T') + '+00:00')
            if expiry <= measured_end:
                raise ValueError('an in-scope raw delivery can expire during the measured windows')
            expected[row['doc_id']] = dict(impressions=int(row['impressions']), reach=int(row['reach']))
        values[int(index)] = expected
    return values
