"""Disjoint group-key slices of the unchanged event STATES select; no import I/O."""
from datetime import date, timedelta
import json
from pathlib import Path
import time

from arm_f_failure import details
from arm_f_native import save
from arm_satellite_sql import literal as q
import engagement_events as events


def plan(first, end, buckets_by_day=None):
    """[first,end), one owner per day/(optional doc_id hash bucket) group key."""
    first, end = date.fromisoformat(first), date.fromisoformat(end)
    if first >= end:
        raise ValueError('nonempty increasing day interval required')
    buckets_by_day = dict(buckets_by_day or {})
    if any(not first <= date.fromisoformat(day) < end or type(n) is not int or n < 1
            for day, n in buckets_by_day.items()):
        raise ValueError('positive bucket counts on owned days only')
    result = []
    day = first
    while day < end:
        next_day = day + timedelta(days=1)
        count = buckets_by_day.get(day.isoformat(), 1)
        result.extend(dict(day_start=day.isoformat(), day_end=next_day.isoformat(), bucket=bucket, buckets=count)
            for bucket in range(count))
        day = next_day
    return result


def statement(slice):
    start, end = (date.fromisoformat(slice[key]) for key in ('day_start', 'day_end'))
    bucket, count = slice['bucket'], slice['buckets']
    if (end != start + timedelta(days=1) or type(bucket) is not int or type(count) is not int
            or not 0 <= bucket < count):
        raise ValueError('one day and a valid group-key bucket required')
    predicate = ('toDate(seen_at)>=toDate(' + q(start.isoformat()) + ') AND toDate(seen_at)<toDate('
        + q(end.isoformat()) + ')')
    if count > 1:
        predicate += ' AND cityHash64(doc_id)%' + str(count) + '=' + str(bucket)
    select, group = events.STATES.split(' GROUP BY ', 1)
    return 'INSERT INTO content_events_aggregated ' + select + ' WHERE ' + predicate + ' GROUP BY ' + group


def native(session, query_id):
    # The live bridge already awaited this exact original native verdict. Reuse
    # its metadata, including memory, rather than adding two polls per day.
    path = Path(session.root) / 'native-operations' / query_id / 'receipt.json'
    value = json.loads(path.read_bytes()).get('native') if path.exists() else session.native(query_id)
    if not value or any(key not in value for key in ('memory_usage', 'read_rows', 'read_bytes', 'exception_code')):
        raise ValueError('native slice memory and I/O actuals required')
    return value


def install(session, root, *, writers_stopped, expected_events=1_600_000_000, buckets_by_day=None):
    if writers_stopped is not True:
        raise ValueError('API writers must be stopped before DDL/MV/seed')
    root = Path(root)
    output = root / 'aggregate-seed'
    output.mkdir(mode=0o700, exist_ok=False)  # No implicit resume or partial reseed.
    started = time.perf_counter()
    record = dict(outcome='BUILDING', expected_events=expected_events, slices=[], setup=[],
        writers_stopped=True, group_key=['doc_id', 'service', 'event_type', 'day'],
        native_scan_rows_are_not_matched_events=True, full_source_layout_unchanged=True)
    def checkpoint():
        save(output / 'build.json', record)
        save(root / 'composition-aggregate-build.json', record)
    def execute(label, sql, *, rows=False, entry=None):
        item = entry if entry is not None else {}
        item.update(label=label, outcome='STARTED')
        checkpoint()
        query_id = None
        try:
            value, query_id = (session.rows(label, sql) if rows else session.query(label, sql))
            item.update(query_id=query_id, native=native(session, query_id))
            if item['native']['exception_code'] or item['native'].get('type') != 'QueryFinish':
                raise ValueError('original seed statement did not finish successfully')
            item['outcome'] = 'PASS'
            return value
        except Exception as error:
            item.update(outcome='INCOMPLETE', **details(error))
            if query_id is None and getattr(session, 'ledger', None):
                starts = [json.loads(line) for line in Path(session.ledger).read_text().splitlines()]
                found = next((r for r in reversed(starts) if r.get('label') == label and r.get('phase') == 'start'), None)
                query_id = found['query_id'] if found else None
            if query_id is not None:
                item['query_id'] = query_id
                try:
                    item['native'] = native(session, query_id)
                except Exception as collection:
                    item['native_collection_error'] = details(collection)
            raise
        finally:
            checkpoint()
    try:
        for index, sql in enumerate((events.DDL, events.MV)):
            item = {}
            record['setup'].append(item)
            execute('composition_aggregate_setup_' + str(index), sql, entry=item)
        inventory = {}
        record['inventory'] = inventory
        days = execute('composition_aggregate_seed_days',
            'SELECT toDate(seen_at) AS day,count() AS n FROM content_events GROUP BY day ORDER BY day',
            rows=True, entry=inventory)
        expected = {row['day']: int(row['n']) for row in days}
        if (len(expected) != len(days) or not expected or any(n <= 0 for n in expected.values())
                or sum(expected.values()) != expected_events):
            raise ValueError('frozen raw day counts must reconcile exactly to the admitted event population')
        first = min(expected)
        end = (date.fromisoformat(max(expected)) + timedelta(days=1)).isoformat()
        record['expected_day_events'] = expected
        record['slices'] = [dict(slice, outcome='PLANNED') for slice in plan(first, end, buckets_by_day)]
        checkpoint()
        for index, slice in enumerate(record['slices']):
            print('[aggregate-seed] slice', index, slice['day_start'], slice['bucket'], slice['buckets'], 'start', flush=True)
            execute('composition_aggregate_seed_slice_' + str(index), statement(slice), entry=slice)
            print('[aggregate-seed] slice', index, 'PASS', flush=True)
        reconciliation = {}
        record['reconciliation'] = reconciliation
        counts = execute('composition_aggregate_seed_reconcile',
            'SELECT day,countMerge(impressions) AS n FROM content_events_aggregated GROUP BY day ORDER BY day',
            rows=True, entry=reconciliation)
        actual = {row['day']: int(row['n']) for row in counts}
        if len(actual) != len(counts) or {day: n for day, n in actual.items() if n} != expected:
            raise ValueError('seed impression states differ from the frozen per-day event census')
        record.update(outcome='PASS', matched_events=sum(actual.values()),
            native_seed_read_rows=sum(int(s['native']['read_rows']) for s in record['slices']),
            native_seed_read_bytes=sum(int(s['native']['read_bytes']) for s in record['slices']))
        return record
    except Exception as error:
        record.update(outcome='INCOMPLETE', **details(error))
        raise
    finally:
        record['wall_seconds'] = time.perf_counter() - started
        checkpoint()
