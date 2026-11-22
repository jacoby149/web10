"""One sorted raw-events rebuild, value census before atomic exchange; research only."""
from pathlib import Path
import json
import time

from arm_f_failure import details
from arm_f_native import save
from engagement_event_seed import native
import engagement_window as window

TABLE = 'content_events_by_day'
DDL = ('CREATE TABLE ' + TABLE + ' AS content_events ENGINE=MergeTree '
    'PARTITION BY toDate(seen_at) ORDER BY (doc_id,reader_key)')


def columns(schema):
    names = [row['name'] for row in schema]
    if (len(set(names)) != len(names) or not {'doc_id', 'reader_key', 'seen_at'} <= set(names)
            or any(row.get('default_type') in ('ALIAS', 'MATERIALIZED', 'EPHEMERAL') for row in schema)):
        raise ValueError('complete ordinary live event columns required')
    return ','.join('`' + name.replace('`', '\\`') + '`' for name in names)


def census(table, schema):
    if table not in ('content_events', TABLE):
        raise ValueError('owned event table required')
    values = 'tuple(' + columns(schema) + ')'
    return ('SELECT toString(toDate(seen_at)) AS day,count() AS n,'
        'sumWithOverflow(cityHash64(' + values + ')) AS city_sum,'
        'sumWithOverflow(sipHash64(' + values + ')) AS sip_sum,'
        'groupBitXor(sipHash64(' + values + ')) AS sip_xor FROM ' + table + ' GROUP BY day ORDER BY day')


def identity(rows, expected_events):
    result = {}
    for row in rows:
        day = row['day']
        if day in result or int(row['n']) <= 0:
            raise ValueError('unique nonempty census days required')
        result[day] = {key: int(row[key]) for key in ('n', 'city_sum', 'sip_sum', 'sip_xor')}
    if not result or sum(r['n'] for r in result.values()) != expected_events:
        raise ValueError('event census population differs from frozen events')
    return result


def rebuild(session, root, *, writers_stopped, expected_events=1_600_000_000):
    if writers_stopped is not True:
        raise ValueError('stopped API writers required before event rebuild')
    output = Path(root) / 'events-layout'
    output.mkdir(mode=0o700, exist_ok=False)  # A failed attempt is never replayed.
    started = time.perf_counter()
    record = dict(outcome='BUILDING', expected_events=expected_events, statements=[], writers_stopped=True)

    def execute(label, sql, *, rows=False):
        item = dict(label=label, sql=sql, outcome='STARTED')
        record['statements'].append(item)
        save(output / 'build.json', record)
        print('[events-layout]', label, 'start', flush=True)
        try:
            kwargs = {'setup_seconds': window.SECONDS} if label == 'events_layout_rebuild' else {}
            value, query_id = session.rows(label, sql) if rows else session.query(label, sql, **kwargs)
        except BaseException:
            if getattr(session, 'ledger', None) and Path(session.ledger).exists():
                starts = [json.loads(line) for line in Path(session.ledger).read_text().splitlines()]
                found = next((r for r in reversed(starts) if r.get('label') == label and r.get('phase') == 'start'), None)
                if found:
                    item['query_id'] = found['query_id']
                    try:
                        item['native'] = native(session, found['query_id'])
                    except Exception as collection:
                        item['native_collection_error'] = details(collection)
            item['outcome'] = 'INCOMPLETE'
            raise
        item.update(query_id=query_id, native=native(session, query_id))
        if item['native']['type'] != 'QueryFinish' or int(item['native']['exception_code']):
            raise ValueError('event rebuild requires original successful native completion')
        item['outcome'] = 'PASS'
        save(output / 'build.json', record)
        print('[events-layout]', label, 'PASS', flush=True)
        return value

    try:
        tables = execute('events_layout_preflight', "SELECT name,engine FROM system.tables WHERE database='web10' "
            "AND name IN ('content_events','content_events_by_day','content_events_aggregated',"
            "'content_events_aggregated_all_time','content_events_aggregated_insert','content_events_aggregated_all_time_insert')", rows=True)
        database = execute('events_layout_database', "SELECT engine FROM system.databases WHERE name='web10'", rows=True)
        if tables != [dict(name='content_events', engine='MergeTree')] or database != [dict(engine='Atomic')]:
            raise ValueError('quiescent original events only and Atomic database required before rebuild')
        schema = execute('events_layout_old_schema', 'DESCRIBE TABLE content_events', rows=True)
        names = columns(schema)
        record['schema'] = schema
        old = execute('events_layout_old_census', census('content_events', schema), rows=True)
        save(output / 'old-census.json', old)
        expected = identity(old, expected_events)
        execute('events_layout_create', DDL)
        new_schema = execute('events_layout_new_schema', 'DESCRIBE TABLE ' + TABLE, rows=True)
        if new_schema != schema:
            raise ValueError('rebuilt event schema differs from the live table')
        # Exactly ONE source INSERT. Never per-day SELECTs on the old layout.
        execute('events_layout_rebuild', 'INSERT INTO ' + TABLE + ' (' + names + ') SELECT ' + names
            + ' FROM content_events ORDER BY toDate(seen_at),doc_id,reader_key')
        new = execute('events_layout_new_census', census(TABLE, schema), rows=True)
        save(output / 'new-census.json', new)
        if identity(new, expected_events) != expected:
            raise ValueError('old/new per-day event value census differs; no swap')
        record.update(identity='PASS', total_count=expected_events, day_count=len(expected),
            all_event_columns_hashed=True, hash_algorithms=['cityHash64/sumWithOverflow', 'sipHash64/sumWithOverflow', 'sipHash64/groupBitXor'])
        save(output / 'identity.json', record)
        # Both tables exist in Atomic; a single exchange changes the visible name.
        execute('events_layout_swap', 'EXCHANGE TABLES content_events AND ' + TABLE)
        record['swapped'] = True
        execute('events_layout_retire_old', 'DROP TABLE ' + TABLE + ' SYNC')
        record.update(outcome='PASS', old_table_retired=True)
        return record
    except BaseException as error:
        record.update(outcome='INCOMPLETE', **details(error))
        raise
    finally:
        record['wall_seconds'] = time.perf_counter() - started
        save(output / 'build.json', record)
