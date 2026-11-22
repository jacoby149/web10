"""Diagnose raw event counting, then construct the insert-maintained primitive.

The aggregate has no grants or cached attachment decisions. Readability is a
live winners-only attachment predicate supplied by the existing request gate.
No raw events move to documents. No projections are created here.
"""
import sqlglot
from sqlglot import exp

from arm_satellite_sql import literal as q
from engagement_ref import targets


DDL = """CREATE TABLE content_events_aggregated (
    doc_id String, service String, event_type String, day Date,
    impressions AggregateFunction(count), reach AggregateFunction(uniqExact,String)
) ENGINE=AggregatingMergeTree
ORDER BY (doc_id,event_type,service,day)"""
STATES = ('SELECT doc_id,service,event_type,toDate(seen_at) AS day,'
    'countState() AS impressions,uniqExactState(reader_key) AS reach '
    'FROM content_events GROUP BY doc_id,service,event_type,day')
MV = 'CREATE MATERIALIZED VIEW content_events_aggregated_insert TO content_events_aggregated AS ' + STATES
SEED = 'INSERT INTO content_events_aggregated ' + STATES
ALL_TIME_DDL = """CREATE TABLE content_events_aggregated_all_time (
    doc_id String, service String, event_type String,
    impressions AggregateFunction(count), reach AggregateFunction(uniqExact,String)
) ENGINE=AggregatingMergeTree ORDER BY (doc_id,event_type,service)"""
ALL_TIME_STATES = ('SELECT doc_id,service,event_type,countState() AS impressions,uniqExactState(reader_key) AS reach '
    'FROM content_events GROUP BY doc_id,event_type,service')
# Both views listen to RAW inserts. Day seeding must not also populate all-time
# before its single derivation, which would double count the frozen population.
ALL_TIME_MV = ('CREATE MATERIALIZED VIEW content_events_aggregated_all_time_insert '
    'TO content_events_aggregated_all_time AS ' + ALL_TIME_STATES)
ALL_TIME_SEED = ('INSERT INTO content_events_aggregated_all_time SELECT doc_id,service,event_type,'
    'countMergeState(impressions) AS impressions,uniqExactMergeState(reach) AS reach '
    'FROM content_events_aggregated GROUP BY doc_id,event_type,service SETTINGS optimize_aggregation_in_order=1')


def integer_counts(rows):
    """ClickHouse JSON quotes UInt64; normalize only declared count columns."""
    result = []
    for row in rows:
        row = dict(row)
        for key in ('n', 'likes', 'dislikes', 'impressions', 'reach'):
            if key not in row:
                continue
            value = row[key]
            if type(value) is not int and not (isinstance(value, str) and value.isascii() and value.isdigit()):
                raise ValueError('exact nonnegative integer count required')
            row[key] = int(value)
            if row[key] < 0:
                raise ValueError('negative count')
        result.append(row)
    return result


def diagnostic(sql, native, true_event_count, returned_impressions):
    """Classify only what exact SQL + counts establish, not stage labels.

    read_rows includes index-granule overread and subqueries. It is not itself
    evidence of join multiplication or the number of events aggregated.
    """
    tree = sqlglot.parse_one(sql, read='clickhouse')
    if (not isinstance(tree, exp.Select) or 'content_events' not in {t.name for t in tree.find_all(exp.Table)}
            or not list(tree.find_all(exp.Count))):
        raise ValueError('exact raw event count query required')
    values = (native['read_rows'], native['read_bytes'], native['exception_code'],
              true_event_count, returned_impressions)
    if any(type(value) is not int or value < 0 for value in values) or native['exception_code']:
        raise ValueError('successful native receipt and nonnegative exact counts required')
    joins = tree.args.get('joins') or []
    if joins:
        cause = 'JOIN_REQUIRES_MULTIPLICITY_DIAGNOSTIC'
    elif true_event_count != returned_impressions:
        cause = 'INVALID_EVENT_PARITY'
    elif true_event_count == 0:
        cause = 'NO_POSITIVE_EVENT_EVIDENCE'
    else:
        cause = 'RAW_EVENT_AGGREGATION'
    return dict(cause=cause, true_event_count=true_event_count, returned_impressions=returned_impressions,
        native_read_rows=native['read_rows'], native_read_bytes=native['read_bytes'],
        excess_rows_not_automatically_join_fanout=max(0, native['read_rows'] - true_event_count),
        top_level_join_count=len(joins), projection_only_views='UNAFFECTED')


def build(diagnosis, *, writers_stopped, seed_completed=False):
    if diagnosis.get('cause') != 'RAW_EVENT_AGGREGATION' or writers_stopped is not True or seed_completed:
        raise ValueError('confirmed raw counting and one quiescent initial seed required')
    # No IF NOT EXISTS / POPULATE: refuse partial/repeated seeds. Install MV
    # before seeding while writers are fenced, then resume inserts only after
    # parity. Re-running a failed build must use a new separately labelled store.
    return [DDL, MV, SEED]


def authorized_ids(ids, groups):
    """Latest attachment first; deletion wins timestamp ties. IN never fans out."""
    return ('SELECT doc_id FROM (SELECT doc_id,group_id,deleted,row_number() OVER '
        '(PARTITION BY doc_id,group_id ORDER BY updated_at DESC,deleted DESC) AS rn FROM doc_groups '
        'WHERE doc_id IN (' + targets(ids) + ') AND group_id IN (' + targets(groups)
        + ')) WHERE rn=1 AND deleted=0')


def read(ids, service, groups, *, aggregate=True):
    scope = 'doc_id IN (' + targets(ids) + ') AND doc_id IN (' + authorized_ids(ids, groups) + ')'
    if aggregate:
        return ('SELECT doc_id,countMerge(impressions) AS impressions,uniqExactMerge(reach) AS reach '
            'FROM content_events_aggregated_all_time WHERE service=' + q(service)
            + " AND event_type='delivery' AND " + scope + ' GROUP BY doc_id')
    return ('SELECT doc_id,count() AS impressions,uniqExact(reader_key) AS reach FROM content_events '
        'WHERE service=' + q(service) + " AND event_type='delivery' AND " + scope + ' GROUP BY doc_id')


def read_daily(ids, service, groups, *, aggregate=True):
    scope = 'doc_id IN (' + targets(ids) + ') AND doc_id IN (' + authorized_ids(ids, groups) + ')'
    select = ('SELECT doc_id,day,countMerge(impressions) AS impressions,uniqExactMerge(reach) AS reach '
        'FROM content_events_aggregated' if aggregate else
        'SELECT doc_id,toDate(seen_at) AS day,count() AS impressions,uniqExact(reader_key) AS reach FROM content_events')
    return select + ' WHERE service=' + q(service) + " AND event_type='delivery' AND " + scope + ' GROUP BY doc_id,day'
