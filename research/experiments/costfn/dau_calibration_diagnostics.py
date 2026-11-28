"""Opt-in utilization and concurrency observations; no serving policy changes."""

import json
import os
from pathlib import Path
import time

from arm_f_native import save
from arm_satellite_sql import literal as q
from dau_sustain_native_audit import native_finishes


SERVER = ('max_concurrent_queries', 'max_concurrent_select_queries', 'max_concurrent_insert_queries',
    'max_connections', 'background_pool_size', 'background_merges_mutations_concurrency_ratio',
    'background_schedule_pool_size', 'background_move_pool_size', 'background_fetches_pool_size',
    'background_common_pool_size', 'background_buffer_flush_schedule_pool_size', 'max_server_memory_usage')
QUERY = ('max_threads', 'max_execution_time', 'max_memory_usage', 'max_concurrent_queries_for_user',
    'max_concurrent_queries_for_all_users', 'max_insert_threads', 'max_threads_min_free_memory_per_thread')


def cpu_ticks(proc=Path('/proc')):
    values = {}
    for line in (proc / 'stat').read_text().splitlines():
        fields = line.split()
        if fields and (fields[0] == 'cpu' or fields[0].startswith('cpu') and fields[0][3:].isdigit()):
            # guest/guest_nice are included in user/nice; don't double count.
            values[fields[0]] = list(map(int, fields[1:9]))
    if 'cpu' not in values or len(values) < 2:
        raise ValueError('per-logical-CPU proc counters required')
    return values


def process_ticks(pid, proc=Path('/proc')):
    path = proc / str(pid) / 'stat'
    # The command field may contain spaces or a close parenthesis.
    fields = path.read_text().rsplit(') ', 1)[1].split()
    return dict(user=int(fields[11]), system=int(fields[12]), start_ticks=int(fields[19]))


def host_probe(engine_pid, api_pid, workers=None):
    return dict(clock_ns=time.monotonic_ns(), ticks_per_second=os.sysconf('SC_CLK_TCK'),
        cpu=cpu_ticks(), engine_ticks=process_ticks(engine_pid), api_ticks=process_ticks(api_pid),
        api_worker_ticks={port: process_ticks(pid) for port, pid in (workers or {}).items()})


def inventory(session, output, *, serving_bundle=False):
    settings, ids = {}, []
    for table, fields in (('server_settings', SERVER),):
        rows, identity = session.rows('dau_utilization_' + table, 'SELECT name,value,changed FROM system.' + table
            + ' WHERE name IN (' + ','.join(map(q, fields)) + ') ORDER BY name')
        settings[table] = {'rows': rows, 'absent': sorted(set(fields) - {row['name'] for row in rows})}
        ids.append(identity)
    save(output / 'utilization-inventory.json', dict(settings=settings, native_finishes=native_finishes(session, ids),
        measured_workload_settings_unchanged=not serving_bundle))


def engine_queue(session):
    sql = ('SELECT count() AS active, sum(length(thread_ids)) AS participating_threads, '
        'sum(memory_usage) AS bytes FROM system.processes WHERE query_id != currentQueryID() '
        "AND query_id NOT LIKE 'fanout-f-%' AND NOT startsWith(query,'SYSTEM FLUSH LOGS')")
    rows, identity = session.rows('dau_utilization_active_queries', sql)
    return dict(query_id=identity, **rows[0])


def append(path, row):
    with path.open('a') as stream:
        stream.write(json.dumps(row, sort_keys=True) + '\n')


def api_observer(root, client, *, port=None):
    """Sample the existing AnyIO queue and client pool from the serving process."""
    import anyio.to_thread

    state = dict(last=0, inventory=False, manager=None)
    output = root / 'utilization-queues.jsonl'

    def observe():
        now = time.monotonic_ns()
        if state['inventory'] and now - state['last'] < 1_000_000_000:
            return
        state['last'] = now
        limiter = anyio.to_thread.current_default_thread_limiter().statistics()
        fields = dict(host_monotonic_ns=now, pid=os.getpid(), total_tokens=limiter.total_tokens,
            borrowed_tokens=limiter.borrowed_tokens, tasks_waiting=limiter.tasks_waiting, worker_port=port)
        if not state['inventory']:
            connection = client()
            manager = connection.http
            state['manager'] = manager
            kwargs = manager.connection_pool_kw
            fields['client_pool'] = {key: kwargs[key] for key in ('maxsize', 'block') if key in kwargs}
            fields['client_pool']['num_pools'] = manager.pools._maxsize
            # No setup probe overrides: these are the actual API client's
            # defaults. Measurement-wrapper overrides are inventoried separately.
            sql = 'SELECT name,value,changed FROM system.settings WHERE name IN (' + ','.join(map(q, QUERY)) + ') ORDER BY name'
            rows = list(connection.query(sql).named_results())
            fields['api_client_query_settings'] = dict(rows=rows,
                absent=sorted(set(QUERY) - {row['name'] for row in rows}))
            if port is not None:
                from dau_serving_bundle import ENGINE_THREADS, POOL_KEEPALIVE, worker_layout

                expected_tokens = {number: tokens for number, _, tokens in worker_layout()}[port]
                actual_threads = next(row['value'] for row in rows if row['name'] == 'max_threads')
                if (limiter.total_tokens != expected_tokens or int(actual_threads) != ENGINE_THREADS or
                        kwargs.get('maxsize') != POOL_KEEPALIVE or kwargs.get('block') is not False):
                    raise ValueError('effective DAU worker thread/connection configuration differs from the bundle')
            state['inventory'] = True
        if port is not None:
            pools = state['manager'].pools
            with pools.lock:
                current = [pools[key] for key in pools.keys()]
            observations = []
            for pool in current:
                queue = pool.pool
                if queue is not None:
                    with queue.mutex:
                        retained = sum(connection is not None for connection in queue.queue)
                    observations.append(dict(idle_connections=retained, connections_created=pool.num_connections,
                        requests_sent=pool.num_requests))
            fields['engine_pool_counters'] = observations
        append(output, fields)

    return observe
