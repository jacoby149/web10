"""Bounded historical MergeState backfill; live raw-insert MVs stay unchanged."""
from arm_satellite_sql import literal as q
import engagement_events as events

DOCUMENTS_PER_BATCH = 4096


def inventory(lower, limit=DOCUMENTS_PER_BATCH):
    if type(limit) is not int or not 1 <= limit <= DOCUMENTS_PER_BATCH:
        raise ValueError('bounded positive all-time document batch required')
    if lower is not None and not isinstance(lower, str):
        raise ValueError('document-key lower bound must be a string')
    predicate = '' if lower is None else ' WHERE doc_id>=' + q(lower)
    return ('SELECT DISTINCT doc_id FROM content_events_aggregated' + predicate
        + ' ORDER BY doc_id LIMIT ' + str(limit + 1)
        + ' SETTINGS optimize_read_in_order=1,optimize_distinct_in_order=1')


def batch(rows, lower, limit=DOCUMENTS_PER_BATCH):
    inventory(lower, limit)  # Validate the same bounds used to obtain these keys.
    keys = [row['doc_id'] for row in rows]
    if (not keys or len(keys) > limit + 1 or any(not isinstance(key, str) for key in keys)
            or keys != sorted(set(keys)) or (lower is not None and keys[0] != lower)):
        raise ValueError('ordered distinct nonempty all-time key page required')
    return dict(lower_inclusive=lower, upper_exclusive=keys[limit] if len(keys) > limit else None,
        distinct_documents=min(len(keys), limit), outcome='PLANNED')


def statement(value):
    lower, upper = value['lower_inclusive'], value['upper_exclusive']
    count = value['distinct_documents']
    if (type(count) is not int or not 1 <= count <= DOCUMENTS_PER_BATCH
            or any(bound is not None and not isinstance(bound, str) for bound in (lower, upper))
            or (lower is not None and upper is not None and lower >= upper)):
        raise ValueError('increasing complete-document range required')
    predicates = []
    if lower is not None:
        predicates.append('doc_id>=' + q(lower))
    if upper is not None:
        predicates.append('doc_id<' + q(upper))
    select, group = events.ALL_TIME_SEED.split(' GROUP BY ', 1)
    return select + (' WHERE ' + ' AND '.join(predicates) if predicates else '') + ' GROUP BY ' + group


def derive(execute, record, checkpoint, *, limit=DOCUMENTS_PER_BATCH):
    """One owner per complete doc_id, including all its dates/services/kinds."""
    lower = None
    record.update(outcome='BUILDING', document_limit=limit, batches=[], inventory=[],
        group_key=['doc_id', 'event_type', 'service'], complete_document_ranges=True)
    while True:
        index = len(record['batches'])
        page = {}
        record['inventory'].append(page)
        rows = execute('composition_aggregate_all_time_keys_' + str(index),
            inventory(lower, limit), rows=True, entry=page)
        current = batch(rows, lower, limit)
        record['batches'].append(current)
        checkpoint()
        print('[all-time-seed] batch', index, 'documents', current['distinct_documents'], 'start', flush=True)
        execute('composition_aggregate_all_time_batch_' + str(index), statement(current), entry=current)
        print('[all-time-seed] batch', index, 'PASS', flush=True)
        lower = current['upper_exclusive']
        if lower is None:
            break
    record.update(batches_complete=True,
        distinct_documents=sum(item['distinct_documents'] for item in record['batches']),
        native_read_rows=sum(int(item['native']['read_rows']) for item in record['batches']),
        native_read_bytes=sum(int(item['native']['read_bytes']) for item in record['batches']))
    checkpoint()
