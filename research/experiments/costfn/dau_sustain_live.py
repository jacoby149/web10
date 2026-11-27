"""Host-side dispatcher and private native evidence collection for the DAU cell."""

import asyncio
from datetime import UTC, datetime
import json
from pathlib import Path
import shutil
import statistics

from arm_f_http import HTTP
from arm_f_native import save
from arm_satellite_sql import literal as q
from costfn_task import ParityDivergence, digest, read
from dau_sustain_dispatch import Dispatch
import dau_sustain_memory as memory
import dau_sustain_native_audit as native
import dau_sustain_parity as parity
import dau_sustain_timed as timed
import dau_sustain_workload as wl
import engagement_cells as cells
import engagement_modern as modern
import restore_realism as restore


CALIBRATION = (dict(name='CAL', duration_s=120, rate=2.9), dict(name='CAL-BURST', duration_s=60, rate=15.0))
MEASUREMENT = tuple(phase for phase in wl.PHASES if phase['rate'])


def private_packets(root):
    directory = root / 'dau-reader-oracles'
    index = read(directory / 'oracle-index.json')
    packets = {}
    for row in index['readers']:
        path = directory / f"reader-{row['index']:03d}" / 'oracle.json'
        if digest(path) != row['sha256']:
            raise ValueError('reader oracle changed after preparation')
        value = read(path)
        if row['reader'] != value['profile']['reader'] or row['index'] in packets:
            raise ValueError('reader oracle index has different or duplicate identities')
        packets[row['index']] = value
    if set(packets) != set(range(wl.READERS)):
        raise ValueError('indexed oracle population is incomplete')
    return packets


def record_to(path):
    def record(row):
        with path.open('a') as stream:
            stream.write(json.dumps(row, sort_keys=True) + '\n')
    return record


def classify(error):
    if isinstance(error, ParityDivergence):
        return 'parity', True
    if 'Memory limit' in str(error) or 'code 241' in str(error):
        return 'engine_memory_refusal', True
    if 'No space left on device' in str(error):
        return 'disk_exhaustion', True
    code = getattr(getattr(error, 'response', None), 'status_code', None)
    if code is not None:
        return f'http_{code}', code >= 500
    if 'Timeout' in type(error).__name__:
        return 'timeout', True
    return 'runtime_error', True


def service_pid(session, service):
    name = restore.command(session.compose, session.env, 'ps', '-q', service).decode().split()
    if len(name) != 1:
        raise ValueError(f'exactly one owned {service} container required')
    return int(restore.command(['docker', 'inspect', '--format', '{{.State.Pid}}', name[0]], session.env))


def engine_disk(session):
    container = restore.command(session.compose, session.env, 'ps', '-q', 'clickhouse').decode().strip()
    if not container or '\n' in container:
        raise ValueError('exact owned ClickHouse container required for disk attribution')
    info = json.loads(restore.command(['docker', 'inspect', container], session.env))[0]
    matches = [Path(item['Source']) for item in info['Mounts'] if item['Destination'] == '/var/lib/clickhouse']
    if len(matches) != 1:
        raise ValueError('cannot identify the actual ClickHouse data device')
    return matches[0]


def io_sample(path):
    dev = path.stat().st_dev
    # Match the full block-device backing the mounted database, not the first
    # NVMe-labelled device or a container-only path.
    import os
    for line in Path('/proc/diskstats').read_text().splitlines():
        fields = line.split()
        if len(fields) >= 14 and (int(fields[0]), int(fields[1])) == (os.major(dev), os.minor(dev)):
            return dict(device=fields[2], read_bytes=int(fields[5]) * 512, write_bytes=int(fields[9]) * 512,
                busy_ms=int(fields[12]), weighted_busy_ms=int(fields[13]), in_progress=int(fields[11]))
    raise ValueError('ClickHouse device lacks attributable guest I/O counters')


def storage_probe(root, output, disk, *, demand=1_850_000_000):
    """Bounded direct-read class calibration on verified existing Parquet bytes."""
    probe = (root / 'input/content_events.parquet').resolve()
    if not probe.is_file() or probe.stat().st_dev != disk.stat().st_dev or probe.stat().st_size < 1024**3:
        raise ValueError('verified same-device probe input is unavailable; no disk binding inferred')
    before = io_sample(disk)
    raw = restore.command(['fio', '--readonly', '--name=dau-class-storage', '--rw=read', '--direct=1',
        '--ioengine=libaio', '--iodepth=32', '--bs=1M', '--time_based=1', '--runtime=30',
        '--size=' + str(probe.stat().st_size // 1024**2 * 1024**2), '--filename=' + str(probe),
        '--output-format=json'], None, timeout=90)
    data = json.loads(raw)
    save(output / 'storage-probe.json', data)
    if len(data['jobs']) != 1 or data['jobs'][0]['error'] or data['jobs'][0]['write']['io_bytes']:
        raise ValueError('bounded read-only class calibration did not complete')
    read_result = data['jobs'][0]['read']
    after = io_sample(disk)
    actual = int(read_result['bw_bytes'])
    return dict(outcome='NON_BINDING' if actual > demand else 'INSUFFICIENT_STORAGE_HEADROOM',
        binding_resource=None if actual > demand else 'storage', demand_bytes_per_second=demand,
        observed_bytes_per_second=actual, before=before, after=after,
        method='direct sequential class headroom probe plus separate actual calibration resource trace; not production supply')


def append_only_audit(session, output, started, ended):
    def ts(value):
        return 'parseDateTime64BestEffort(' + q(value.isoformat()) + ",6,'UTC')"
    session.query('dau_flush_audit', 'SYSTEM FLUSH LOGS')
    rows, identity = session.rows('dau_delivery_audit_mutations', 'SELECT mutation_id,command,create_time '
        "FROM system.mutations WHERE database='web10' AND table='content_events'")
    changes, ddl_id = session.rows('dau_delivery_audit_ddl', 'SELECT query_id,query_kind,toString(type) AS type '
        "FROM system.query_log WHERE has(tables,'web10.content_events') "
        "AND query_kind IN ('Delete','Alter','Truncate','Drop','Rename','Exchange') AND query_start_time_microseconds<="
        + ts(ended) + ' AND event_time_microseconds>=' + ts(started))
    save(output / 'raw-delivery-mutation-audit.json', dict(mutations=rows, statements=changes,
        receipts=[native.native_finish(session, identity), native.native_finish(session, ddl_id)]))
    return not (rows or changes)


def resource_debt(session, phase, in_flight, disk):
    parts, _ = session.rows('dau_timed_parts', "SELECT table,count() AS n FROM system.parts WHERE database='web10' AND active "
        "AND table IN ('documents','engagement_documents','content_events','doc_groups') GROUP BY table")
    by_table = {row['table']: int(row['n']) for row in parts}
    values = {'parts:' + table: by_table.get(table, 0) for table in ('documents', 'engagement_documents', 'content_events', 'doc_groups')}
    rows, _ = session.rows('dau_timed_debt', "SELECT (SELECT coalesce(sum(bytes_to_process),0) FROM system.merges WHERE database='web10') "
        "AS merge_bytes,(SELECT count() FROM system.mutations WHERE database='web10' AND is_done=0) AS pending,"
        "(SELECT value FROM system.metrics WHERE metric='MemoryTracking') AS tracked")
    rss = restore.command(['ps', '-eo', 'rss='], None, timeout=10).decode()
    values.update({'merge_queue:bytes': int(rows[0]['merge_bytes']), 'mutations:pending': int(rows[0]['pending']),
        'engine_memory:bytes': int(rows[0]['tracked']), 'disk_free:bytes': shutil.disk_usage(disk).free,
        'host_rss:kb': sum(map(int, rss.split())), 'in_flight:reads': in_flight})
    return dict(values=values, io=io_sample(disk))


async def credentials(http, readers, writers):
    tokens = {}
    for actor in [*readers, *writers]:
        user = actor['reader']
        if user in tokens:
            raise ValueError('duplicate or overlapping reader/writer identity')
        tokens[user] = await http.login(user)
    return tokens


async def calibration(driver, readers, record, observe, abort, bound):
    dispatcher = Dispatch(limit=2048, record=record, abort=abort)
    origin = asyncio.get_running_loop().time()
    for phase in CALIBRATION:
        if abort.is_set():
            break
        finished = asyncio.Event()
        observer = asyncio.create_task(observe(phase['name'], dispatcher, origin, finished))
        try:
            await dispatcher.offer(list(timed.assign_readers([phase], readers)), origin=origin,
                end=origin + phase['duration_s'], operation=lambda entry: driver.read(entry, readers[entry['reader_index']]),
                classify=classify)
        finally:
            finished.set()
            await observer
        origin += phase['duration_s']
    return dispatcher, await dispatcher.drain(bound)


def phase_reconciliation(records, phases):
    result = {}
    for phase in phases:
        name = phase['name']
        window = [record for record in records if record['phase'] == name]
        succeeded = [record for record in window if record['error_class'] is None]
        in_window = [record for record in succeeded if record['finished_s'] <= phase['duration_s']]
        result[name] = dict(scheduled=len(wl.read_schedule([phase])), offered=sum(r['offered_s'] is not None for r in window),
            started=sum(r['started_s'] is not None for r in window), completed=len(succeeded),
            completed_in_window=len(in_window), achieved_rps=len(in_window) / phase['duration_s'],
            successful_latency=wl.percentiles([(row['finished_s'] - row['started_s']) * 1000 for row in succeeded]),
            errors=sum(r['error_class'] is not None for r in window))
    return result


def debt_summary(records):
    phases = {}
    for name in ('CAL', 'CAL-BURST', 'W', 'A', 'B', 'D'):
        rows = [row for row in records if row['phase'] == name]
        if not rows:
            continue
        samples = [dict(i=row['elapsed_s'], values=row['debt']['values']) for row in rows]
        values = samples[0]['values']
        if any(set(row['values']) != set(values) for row in samples):
            raise ValueError('resource samples omitted a debt quantity')
        slopes = wl.slope(samples) if len(samples) >= 2 else {}
        sustained = wl.sustained_positive(samples) if len(samples) >= 4 else {}
        # Declining free disk is increasing debt, not shrinking debt.
        if len(samples) >= 4 and 'disk_free:bytes' in values:
            half = len(samples) // 2
            sustained['disk_free:bytes'] = (wl.slope(samples[:half])['disk_free:bytes'] < 0
                and wl.slope(samples[half:])['disk_free:bytes'] < 0)
        first_io, last_io = rows[0]['debt']['io'], rows[-1]['debt']['io']
        if first_io['device'] != last_io['device']:
            raise ValueError('data device changed during resource window')
        phases[name] = dict(samples=len(rows), start=values, end=samples[-1]['values'],
            slope_per_second=slopes, sustained_debt=sustained,
            virtual_device=first_io['device'], elapsed_s=samples[-1]['i'] - samples[0]['i'],
            read_bytes=last_io['read_bytes'] - first_io['read_bytes'],
            written_bytes=last_io['write_bytes'] - first_io['write_bytes'])
    return phases


def evidence_verdict(phases, resources, dispatch):
    required = {'CAL', 'CAL-BURST', 'A', 'B'}
    complete = required <= set(resources) and all(resources[name]['samples'] >= 4 for name in required)
    rate = all(phases[name]['scheduled'] == phases[name]['offered'] == phases[name]['started']
        and phases[name]['achieved_rps'] >= offered * 0.95 for name, offered in (('A', 15), ('B', 2.9)))
    return dict(resource_traces_complete=complete, achieved_rate_gate=rate, drain_gate=dispatch['drain_ok'],
        named_debt=[name for name, flag in resources.get('A', {}).get('sustained_debt', {}).items() if flag],
        errors=sum(phases[name]['errors'] for name in ('A', 'B')),
        custody='NOT_YET_VERIFIED', experiment_capacity='NOT_CLAIMED_BY_ON_HOST_CONTROLLER')


async def run(root, *, sample_debt, verify_storage, verify_delivery_stability):
    """Run the measured HTTP contract; keep all results private until proof holds.

    Caller supplies the admitted storage calibration and independent
    append-only delivery proof. A missing or failed gate cannot degrade to an
    approximate oracle or to an unsupported resource attribution.
    """
    bundle = read(root / 'dau-cell-bundle.json')
    approval = read(root / 'admission.json')
    packets = private_packets(root)
    selected = [packets[index]['profile'] for index in range(wl.READERS)]
    writers = bundle['writers']['actors']
    cell = cells.boot(root, 'dau-sustain', 'ordinary', 'uniform', aggregate=True, dau=True)
    output = cell / 'live'
    output.mkdir(mode=0o700)
    session = modern.Session(root)
    http = HTTP(cell, session, cell / 'http')
    envelope = approval['dau_envelope']
    pids = service_pid(session, 'clickhouse'), service_pid(session, 'api')
    abort = asyncio.Event()
    record_read = record_to(output / 'reads.jsonl')
    record_write = record_to(output / 'writes.jsonl')
    resources = record_to(output / 'resources.jsonl')
    started_utc = datetime.now(UTC)

    async def observe(phase, dispatch, origin, stop):
        loop = asyncio.get_running_loop()
        while not stop.is_set():
            values = await asyncio.to_thread(sample_debt, session, phase, len(dispatch.pending))
            host = await asyncio.to_thread(memory.sample, *pids, engine_cap=envelope['container_bytes'],
                server_cap=envelope['server_bytes'])
            resources(dict(phase=phase, elapsed_s=loop.time() - origin, debt=values, memory=host,
                guest_cpu=Path('/proc/stat').read_text().splitlines()[0]))
            try:
                await asyncio.wait_for(stop.wait(), 10)
            except TimeoutError:
                pass

    try:
        tokens = await credentials(http, selected, writers)
        driver = timed.HTTPWorkload(http, output, run_id=bundle['run_id'], reader_tokens=tokens,
            writers=writers, writer_tokens=tokens)
        idle = []
        for actor in selected[:3]:
            value = await http.sequence(tokens[actor['reader']], actor['groups'], phase='idle')
            if value['path_mode'] != 'F_DOCUMENT_STREAM_V1':
                raise ValueError('idle baseline did not use certified indexed path')
            idle.append(value['elapsed_ms'])
        bound = wl.DRAIN_MULTIPLIER * statistics.median(idle) / 1000
        cal, drained = await calibration(driver, selected, record_read, observe, abort, bound)
        if not drained:
            await cal.drain(None)
        save(output / 'calibration.json', dict(counts=dict(cal.counts), drained=drained, idle_ms=idle, bound_s=bound))
        if abort.is_set() or not drained:
            raise ValueError('calibration gate failed; measured windows were not admitted')
        storage = await asyncio.to_thread(verify_storage, root, output)
        save(output / 'storage.json', storage)
        if storage['outcome'] != 'NON_BINDING':
            value = dict(status='CALIBRATION_STORAGE_STOP', storage=storage, windows='NOT_RUN')
            save(output / 'live-receipt.json', value)
            return value
        before = await asyncio.to_thread(native.views_bookend, session, packets, 'before')
        save(output / 'raw-views-before.json', before)
        measured_start = datetime.now(UTC)
        result = await timed.workload(phases=MEASUREMENT, readers=selected, writer_count=len(writers),
            read=driver.read, write=driver.write, observe=observe, record_read=record_read, record_write=record_write,
            classify=classify, drain_bound=bound, max_reads=2048, max_writes=100, abort=abort)
        measured_end = datetime.now(UTC)
        readers_dispatch = result.pop('reader_dispatch')
        writers_dispatch = result.pop('writer_dispatch')
        # Native work that exceeded the drain gate is still retained and awaited.
        await asyncio.gather(readers_dispatch.drain(None), writers_dispatch.drain(None))
        after = await asyncio.to_thread(native.views_bookend, session, packets, 'after')
        save(output / 'raw-views-after.json', after)
        append_only = await asyncio.to_thread(verify_delivery_stability, session, output, measured_start, measured_end)
        views = native.settled_views(before, after, measured_end, append_only_verified=append_only)
        receipts = [json.loads(line) for line in (output / 'reads.jsonl').read_text().splitlines()]
        successful = {(row['phase'], row['slot']): row['reader_index'] for row in receipts
            if row['phase'] in ('A', 'B') and row['error_class'] is None}
        oracles = {index: dict(rows=value['rows'], followups=[*value['followups'], views[index]])
            for index, value in packets.items()}
        issued = [read(path) for path in sorted((output / 'publication-acks').glob('*.json'))]
        ledger = await asyncio.to_thread(native.reconcile_publications, session,
            cell / 'fanout-state/journal/intents.sqlite', 0, issued,
            {row['reader']: row['groups'] for row in writers}, {row['reader']: row['groups'] for row in selected})
        save(output / 'publication-reconciliation.json', ledger)
        responses = [read(path) for path in sorted((output / 'responses').glob('*.json')) if path.name.startswith(('A-', 'B-'))]
        certified = parity.verify(responses, successful, oracles)
        phases = phase_reconciliation(receipts, (*CALIBRATION, *MEASUREMENT))
        debt = debt_summary([json.loads(line) for line in (output / 'resources.jsonl').read_text().splitlines()])
        value = dict(status='PRIVATE_EVIDENCE_COLLECTED', parity=certified, storage=storage,
            phases=phases, debt=debt, gates=evidence_verdict(phases, debt, result),
            dispatch=result, writers=len(issued), started_utc=started_utc.isoformat(),
            measured_start_utc=measured_start.isoformat(), measured_end_utc=measured_end.isoformat())
        save(output / 'live-receipt.json', value)
        return value
    finally:
        await http.close()
