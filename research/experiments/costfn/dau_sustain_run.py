"""Host-side driver for the sustained-DAU load test.

Contract: DAU-SUSTAINED-LOAD.md §8. Reuses the pinned client, receipt
adapter, oracle comparison and statement inventory; the legacy bench.py
harness is not touched and not reused. One task admission; the 12-hour
provider backstop is a failsafe, not a deadline.
"""
import argparse
import asyncio
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
import time

from arm_f_native import save
from arm_f_reads import rowset
from costfn_task import Task, read, digest, exact, ParityDivergence
import arm_f_http
import arm_f_run as arm_run
import arm_satellite_sql as sql
import dau_sustain_workload as wl
import engagement_billboards as ads
import engagement_cells as cells
import engagement_certificates as certificates
import engagement_composition as contract
import engagement_modern as modern
import engagement_window as window
import hybrid_k20_full_store as full_store
import hybrid_k20_run_current as current
import restore_realism as restore

DIRECTIVE = 'Jacob Hoffman 2026-11-25 sustained-DAU contract-rate load test'
DEBT_SAMPLE_SECONDS = 10
BANKED_EVENT_COUNT = 1_600_000_000
BANKED_DOCUMENT_COUNT = 88_200_363
STORAGE_DEMAND_GB_PER_S = 1.85
CALIBRATION_RATE = 2.9
CALIBRATION_SECONDS = 120
BURST_RATE = 15.0
BURST_SECONDS = 60
CELL_NAME = 'dau-sustain'
PHASE_KEYS = ('CAL', 'W', 'A', 'B')


class Actions(full_store.Actions):
    """The banked full-store setup chain; the DAU test measures the indexed
    complete path, so no hybrid/projected overlay is admitted here."""


def admission_gate(approval):
    if approval.get('dau_sustain_directive') != DIRECTIVE:
        raise ValueError('sustained-DAU admission directive required')
    if approval.get('purpose') != 'DAU_SUSTAINED_CONTRACT_RATE':
        raise ValueError('sustained-DAU admission purpose required')
    host = approval.get('dau_host')
    if not (host and host.get('region') and host.get('size') and host.get('price_hourly')
            and host.get('storage_gib') and host.get('storage_class') == 'NVMe'
            and host.get('backstop_h') == 12 and host.get('compute_ceiling_usd') == 25.0):
        raise ValueError('budget-sized host class declared at admission required')
    envelope = approval.get('dau_envelope')
    if not (envelope and type(envelope.get('container_bytes')) is int
            and type(envelope.get('server_bytes')) is int and envelope['server_bytes'] < envelope['container_bytes']):
        raise ValueError('engine envelope declared at admission required')
    if approval.get('restored_snapshot_id') != '255003176':
        raise ValueError('frozen store of the retained snapshot required')
    if not window.task(approval):
        raise ValueError('task-mode admission required')
    if approval.get('hybrid_k20_projected_admitted') is not False:
        raise ValueError('sustained-DAU measures the indexed complete path only')
    full_store.source_guard(approval)


def verify_envelope(root):
    """The declared engine envelope on the sized host, verified live: engine
    version, container memory, server memory cap."""
    session = modern.Session(root)
    container = restore.command(session.compose, session.env, 'ps', '-q', 'clickhouse').decode().strip()
    if not container or '\n' in container:
        raise ValueError('exactly one owned engine required')
    memory = int(restore.command(['docker'], session.env, 'inspect', '--format',
        '{{.HostConfig.Memory}}', container))
    version, _ = session.query('dau_engine', 'SELECT version()')
    cap, _ = session.query('dau_server_cap',
        "SELECT value FROM system.server_settings WHERE name='max_server_memory_usage'")
    approval = read(root / 'admission.json')
    envelope = approval['dau_envelope']
    if version != modern.ENGINE or memory != envelope['container_bytes'] or int(cap) != envelope['server_bytes']:
        raise ValueError('live engine/envelope differs from the declared admission')
    return dict(engine=version, container_bytes=memory, server_bytes=int(cap))


def verify_store(root):
    """Restore-verification hooks (contract §8.3): counts, and the canonical
    generation fingerprint against the banked pre-steady-state value recorded
    on the snapshot host."""
    session = modern.Session(root)
    counts, _ = session.rows('dau_store_counts', 'SELECT (SELECT count() FROM documents) AS documents,'
        '(SELECT count() FROM content_events) AS events')
    if (int(counts[0]['documents']) != BANKED_DOCUMENT_COUNT
            or int(counts[0]['events']) != BANKED_EVENT_COUNT):
        raise ValueError('frozen store counts differ from the banked store')
    fingerprint = certificates.fingerprint(session)
    banked = read(root / 'banked-store-fingerprint.json')
    if (fingerprint['canonical_content_sha256'] != banked['canonical_content_sha256']
            or fingerprint['canonical_generation'] != banked['canonical_generation']):
        raise ValueError('canonical content or generation differs from the snapshot store')
    return dict(counts=counts,
        fingerprint_sha256=digest_bytes(fingerprint),
        banked_fingerprint_sha256=digest(root / 'banked-store-fingerprint.json'))


def digest_bytes(value):
    return __import__('hashlib').sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def reader_pool(root, session):
    """150 distinct prepared readers: each is a fixture account whose actual
    K20 span equals the banked ordinary span (the declared hot shared
    audience). The shared span is verified, never assumed: any reader whose
    groups or readability differ fails the task before any timed window."""
    manifest = read(root / 'input/manifest.json')
    readers = manifest['readers'][2:2 + wl.READERS]
    if len(readers) != wl.READERS or len(set(readers)) != wl.READERS:
        raise ValueError('distinct reader pool required')
    banked_profile = read(root / 'profile-ordinary.json')
    pool = []
    for index, reader in enumerate(readers, start=2):
        profile = asyncio.run(arm_run.setup_scopes(root / f'dau-reader-{index}', session,
            reader_override=reader))
        if profile['groups'] != banked_profile['groups']:
            raise ValueError('reader pool deviates from the banked shared span')
        if profile['actual_readable_by_kind'] != banked_profile['actual_readable_by_kind']:
            raise ValueError('reader pool deviates from the banked readability')
        pool.append(dict(index=index, reader=reader,
            profile_sha256=digest(root / f'dau-reader-{index}' / 'profile' / 'inventory.json')))
    value = dict(readers=pool, shared_span=banked_profile['groups'], readers_count=len(pool))
    save(root / 'dau-reader-pool.json', value)
    return value


def freeze_oracle(root, session, pool):
    """The independent complete-response oracle, frozen once for the shared
    span and bound per reader identity. The rows/follow-ups authority is the
    canonical reference built by the independent canonical-only process in
    read-setup, with the declared billboard fixture applied (the same
    expected-billboards file the banked cells audit against); the per-reader
    views expectations derive from the frozen raw delivery state plus the
    declared W-phase first-delivery delta. Not a second live run."""
    reference = read(root / 'reference-ordinary/expected-billboards.json')
    page_ids = [row['doc_id'] for row in reference['rows']]
    span = ','.join(sql.literal(g) for g in pool['shared_span'])
    views = {}
    for entry in pool['readers']:
        reader = entry['reader']
        cold, _ = session.rows('dau_oracle_cold_' + str(entry['index']),
            'SELECT count() AS n FROM content_events WHERE service=\'posts\' AND event_type=\'delivery\''
            ' AND reader_key=' + sql.literal(reader)
            + ' AND doc_id IN (' + ','.join(sql.literal(i) for i in page_ids) + ')')
        values, _ = session.rows('dau_oracle_views_' + str(entry['index']),
            'SELECT doc_id,count() AS impressions,uniqExact(reader_key) AS reach FROM content_events '
            "WHERE service='posts' AND event_type='delivery' AND doc_id IN ("
            + ','.join(sql.literal(i) for i in page_ids) + ') AND doc_id IN '
            '(SELECT doc_id FROM doc_groups FINAL WHERE deleted=0 AND group_id IN (' + span + ')) '
            'GROUP BY doc_id')
        expected = {row['doc_id']: dict(impressions=int(row['impressions']),
            reach=int(row['reach'])) for row in values}
        for doc in page_ids:
            expected.setdefault(doc, dict(impressions=0, reach=0))
        if int(cold[0]['n']) == 0:
            for doc in page_ids:
                expected[doc]['impressions'] += 1
                expected[doc]['reach'] += 1
        views[reader] = dict(cold_first_delivery=int(cold[0]['n']) == 0, expected=expected)
    value = dict(reference_sha256=digest(root / 'reference-ordinary/expected-billboards.json'),
        shared_span=pool['shared_span'],
        bindings=[dict(reader=row['reader'], profile_sha256=row['profile_sha256'])
            for row in pool['readers']],
        views=views, page_ids=page_ids)
    save(root / 'dau-oracle.json', value)
    return reference


def writer_actors(root, session):
    """100 distinct fixture writer actors, verified against the frozen store:
    none is in any pool reader's K20 span (their publications must stay
    invisible to the measured pages), and each holds the grants the stream
    needs. The verification is native, fail-closed."""
    manifest = read(root / 'input/manifest.json')
    pool = read(root / 'dau-reader-pool.json')
    span_authors = {group.removesuffix('/followers') for group in pool['shared_span']}
    discover = manifest.get('discover_group')
    if not discover:
        raise ValueError('default Discover group required in the manifest')
    if type(manifest.get('writers')) is list:
        writers = manifest['writers'][:wl.WRITER_ACTORS]
    else:
        taken = span_authors | {row['reader'] for row in pool['readers']}
        writers = [account for account in manifest['readers'][200:200 + 4 * wl.WRITER_ACTORS]
            if account not in taken][:wl.WRITER_ACTORS]
    if len(writers) != wl.WRITER_ACTORS or len(set(writers)) != wl.WRITER_ACTORS:
        raise ValueError('distinct writer actor pool required')
    if set(writers) & span_authors:
        raise ValueError('writer inside a measured K20 span; stream would corrupt the oracle')
    for writer in writers:
        rows, _ = session.rows('dau_writer_followers_' + writer[:8],
            "SELECT count() AS n FROM group_members FINAL WHERE member_key=" + sql.literal(writer)
            + " AND deleted=0 AND group_id=" + sql.literal(writer + '/followers')
            + " AND role IN ('admin','owner')")
        if int(rows[0]['n']) != 1:
            raise ValueError('writer holds no write role in their own followers group')
        rows, _ = session.rows('dau_writer_discover_' + writer[:8],
            "SELECT count() AS n FROM group_members FINAL WHERE member_key=" + sql.literal(writer)
            + " AND deleted=0 AND group_id=" + sql.literal(discover))
        if int(rows[0]['n']) != 1:
            raise ValueError('writer is not a Discover member')
    value = dict(writers=writers, discover=discover,
        span_authors=sorted(span_authors), verification='NATIVE_FAIL_CLOSED')
    save(root / 'dau-writer-actors.json', value)
    return value


def debt_sample(session, index, phase_name, in_flight, root):
    values = {}
    parts, _ = session.rows('dau_debt_parts_' + str(index),
        "SELECT table, count() AS n FROM system.parts WHERE database='web10' AND active "
        "AND table IN ('documents','engagement_documents','content_events','doc_groups') GROUP BY table")
    by_table = {row['table']: int(row['n']) for row in parts}
    values['parts:documents'] = by_table.get('documents', 0)
    values['parts:engagement_documents'] = by_table.get('engagement_documents', 0)
    values['parts:content_events'] = by_table.get('content_events', 0)
    values['parts:doc_groups'] = by_table.get('doc_groups', 0)
    merges, _ = session.rows('dau_debt_merges_' + str(index),
        "SELECT coalesce(sum(bytes_to_process),0) AS b FROM system.merges WHERE database='web10'")
    values['merge_queue:bytes'] = int(merges[0]['b'])
    mutations, _ = session.rows('dau_debt_mutations_' + str(index),
        "SELECT count() AS n FROM system.mutations WHERE database='web10' AND is_done=0")
    values['mutations:pending'] = int(mutations[0]['n'])
    memory, _ = session.rows('dau_debt_memory_' + str(index),
        "SELECT value FROM system.metrics WHERE metric='MemoryTracking'")
    values['engine_memory:bytes'] = int(memory[0]['value'])
    values['disk_free:bytes'] = shutil.disk_usage('/var/lib/clickhouse').free
    rss = restore.command(['ps', '-eo', 'rss='], None, timeout=10).decode()
    values['host_rss:kb'] = sum(int(part) for part in rss.split() if part)
    values['in_flight:reads'] = float(in_flight)
    sample = wl.debt_sample(index, phase_name, values, in_flight=in_flight)
    path = root / 'debt' / (phase_name + '.jsonl')
    path.parent.mkdir(mode=0o700, exist_ok=True)
    with path.open('a') as stream:
        stream.write(json.dumps(sample) + '\n')
    return sample


def disk_counters():
    """OS read/write counter deltas for the data device; virtual-device
    counters on a droplet, declared in the receipt."""
    device = None
    for line in Path('/proc/diskstats').read_text().splitlines():
        parts = line.split()
        if len(parts) >= 10 and (parts[2].startswith('nvme') or parts[2] in ('vda', 'sda')):
            device = parts[2]
            break
    if device is None:
        raise ValueError('data device not identified')

    def read_counters():
        for line in Path('/proc/diskstats').read_text().splitlines():
            parts = line.split()
            if len(parts) >= 10 and parts[2] == device:
                return dict(device=device, sectors_read=int(parts[5]), sectors_written=int(parts[9]))
        raise ValueError('data device counters absent')

    return device, read_counters()


def writer_payload(writer, slot, discover):
    """One publication: a public text-only post into the writer's own
    followers group plus the default Discover group. No media, no grants
    beyond the fixture, no author_as — the stream's discipline is the
    payload's shape."""
    groups = [writer + '/followers', discover]
    if len(set(groups)) != 2 or discover.endswith('/followers'):
        raise ValueError('writer groups must be exactly own-followers plus Discover')
    return dict(service='posts',
        body=dict(text='dau sustain ' + str(slot), status='active'),
        groups=groups)


def error_class_of(error):
    """Content-free error classes only: status, timeout, or engine stop.
    A 429 under declared offered load is a saturation signal, counted and
    attributed; never a silent drop."""
    status = getattr(getattr(error, 'response', None), 'status_code', None)
    text = str(error)
    if status == 429:
        return '429'
    if status is not None and 500 <= status < 600:
        return '5xx'
    if status is not None and 400 <= status < 500:
        return '4xx_content' if status != 429 else '429'
    if 'Memory limit' in text or 'code 241' in text or ('241' in text and 'Memory' in text):
        return 'memory_cap_refusal'
    if 'Timeout' in text:
        return 'timeout'
    return 'other'


async def run_phase(http, pool, tokens, views, billboards, accounting, phase_name, rate, seconds,
                    stop, debt, in_flight):
    """One open-loop offered window: schedule the reads, offer on schedule
    whatever the completions do, audit every response against the frozen
    oracle, and bank the pre-declared stops."""
    role = ('calibration' if phase_name in ('CAL', 'CAL-BURST')
        else wl.phase(phase_name)['role'])
    entries = wl.read_schedule([dict(name=phase_name, duration_s=seconds, rate=rate,
        measured=phase_name in ('A', 'B'), role=role)])
    accounting.schedule([phase_name] * len(entries))
    t0 = time.monotonic()
    sampler_stop = asyncio.Event()
    sampler = debt(sampler_stop, phase_name)
    try:
        for item in entries:
            if stop.is_set():
                break
            target = t0 + item['offset_s']
            if target > time.monotonic():
                await asyncio.sleep(target - time.monotonic())
            reader = pool['readers'][item['reader_index']]['reader']
            accounting.offer(phase_name)
            in_flight['n'] += 1
            accounting.start(phase_name, time.perf_counter() * 1000)
            try:
                sample = await http.sequence(tokens[reader], pool['shared_span'], phase=phase_name)
                now_ms = time.perf_counter() * 1000
                audit_response(sample, reader, billboards, views[reader]['expected'])
                accounting.complete(phase_name, now_ms, latency_ms=sample['elapsed_ms'])
            except ParityDivergence:
                in_flight['n'] -= 1
                accounting.complete(phase_name, now_ms, error='divergence')
                stop.set()
                raise
            except Exception as error:
                in_flight['n'] -= 1
                code = error_class_of(error)
                accounting.complete(phase_name, now_ms, error=code)
                if code in ('memory_cap_refusal', 'timeout'):
                    stop.set()
                    break
            if phase_name in ('A', 'B') and wl.saturation_stop(
                    accounting, phase_name, time.perf_counter() * 1000,
                    window_s=60, fraction=0.5, offered_rate=rate):
                stop.set()
                break
    finally:
        sampler_stop.set()
        await sampler
    return entries


def audit_response(sample, reader, billboards, expected_views):
    """Exact ordered complete-response parity against the frozen oracle;
    any divergence raises ParityDivergence and stops the task."""
    exact(ads.compare, sample['rows'], billboards['rows'], billboards['billboard_setup'])
    for actual, wanted in zip(sample['followups'][:2], billboards['followups'][:2], strict=True):
        if rowset(actual.get('rows', [])) != rowset(wanted):
            raise ParityDivergence('complete canonical engagement follow-up mismatch: ' + reader)
    if set(sample['followups'][2]) - set(expected_views):
        raise ParityDivergence('unrequested view values in the sustained response: ' + reader)
    actual_views = {doc: sample['followups'][2].get(doc) for doc in expected_views}
    if actual_views != expected_views:
        raise ParityDivergence('views follow-up differs from the frozen per-reader expectation: ' + reader)


def evaluate_gates(receipt, envelope):
    """G1-G5 verdicts on the banked windows (G6 completeness is checked by
    the bank-side receipt review against the artifact inventory)."""
    verdicts = {}
    peak = receipt['windows']['A']
    flat_or_shrinking = all(not flag for flag in peak['debt']['sustained_positive'].values())
    named = {name: wl.time_to_bind(name, receipt['debt_by_phase']['A'], cap)
        for name, cap in (('engine_memory:bytes', envelope['server_bytes']),)
        if peak['debt']['sustained_positive'].get(name)}
    verdicts['G1_debt_slope'] = dict(
        outcome='CLEAN_PASS' if flat_or_shrinking and receipt['divergences'] == 0 else 'NAMED_DEBT',
        sustained_positive=peak['debt']['sustained_positive'],
        named_debt=named,
        sentence=('at the contract peak, every quantity that could turn into debt was flat or shrinking'
            if flat_or_shrinking else
            'sustained for the window, with named debt binding at the banked time-to-bind'))
    drain = receipt['drain']
    verdicts['G2_drain'] = dict(outcome='PASS' if drain['in_flight_zero_within_bound'] else 'FAIL',
        bound_s=drain['bound_s'], in_flight_peak=drain['in_flight_peak'])
    errors = receipt['error_counts']
    verdicts['G3_oracle'] = dict(outcome='PASS' if receipt['divergences'] == 0 else 'FAIL',
        divergences=receipt['divergences'])
    verdicts['G4_errors'] = dict(
        outcome='PASS' if not (errors.get('error_5xx') or errors.get('timeout') or errors.get('error_4xx'))
        else 'FAIL',
        counts=errors,
        note='429 under declared offered load is a saturation signal, counted and attributed')
    verdicts['G5_envelope'] = dict(outcome='PASS' if not receipt['resource_stops'] else 'FAIL',
        stops=receipt['resource_stops'])
    return verdicts


def median_single_read_ms(accounting):
    values = accounting['latencies_ms'].get('W') or accounting['latencies_ms'].get('CAL') or []
    if not values:
        return None
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


async def windows(root, actions):
    session = modern.Session(root)
    cell = cells.boot(root, CELL_NAME, 'ordinary', 'uniform',
        serving_mode='F_DOCUMENT_STREAM_V1', aggregate=True, projected=False, hybrid=False)
    http = arm_f_http.HTTP(cell, session, cell / 'http')
    accounting = wl.offered_achieved()
    pool = read(root / 'dau-reader-pool.json')
    oracle = read(root / 'dau-oracle.json')
    writers = read(root / 'dau-writer-actors.json')
    billboards = read(root / 'reference-ordinary/expected-billboards.json')
    views = oracle['views']
    stop_all = asyncio.Event()
    in_flight = {'n': 0}
    counters_at = dict()

    def debt(sampler_stop, phase_name):
        async def loop():
            index = 0
            last = 0.0
            while not sampler_stop.is_set():
                now = time.monotonic()
                if now - last >= DEBT_SAMPLE_SECONDS:
                    try:
                        debt_sample(session, index, phase_name, in_flight['n'], root)
                        index += 1
                    except Exception:
                        pass
                    last = now
                await asyncio.sleep(0.5)
        return asyncio.create_task(loop())

    async def writer_stream(stream_stop, start_offset_s):
        t0 = time.monotonic()
        plan = wl.write_schedule(wl.WRITER_ACTORS,
            slots=read(root / 'dau-schedule.json')['writers'])
        with (root / 'writer-records.jsonl').open('a') as stream:
            for item in plan:
                if stream_stop.is_set():
                    break
                target = t0 + item['offset_s'] - start_offset_s
                if target > time.monotonic():
                    await asyncio.sleep(target - time.monotonic())
                writer = writers['writers'][item['writer_index']]
                started = time.perf_counter()
                record = dict(phase='WABD', writer_index=item['writer_index'], slot=item['slot'],
                    outcome='ok', ms=None, error_class=None)
                try:
                    payload = writer_payload(writer, item['slot'], writers['discover'])
                    await http.post('/v3/documents/create',
                        dict(token=writer_tokens[writer], **payload))
                except Exception as error:
                    record.update(outcome='error', error_class=error_class_of(error))
                    if record['error_class'] == 'memory_cap_refusal':
                        stream_stop.set()
                        stop_all.set()
                record['ms'] = (time.perf_counter() - started) * 1000
                stream.write(json.dumps(record) + '\n')

    device, counters_before = disk_counters()
    tokens = {}
    for entry in pool['readers']:
        tokens[entry['reader']] = await http.login(entry['reader'])
    writer_tokens = {}
    manifest = read(root / 'input/manifest.json')
    for writer in writers['writers']:
        writer_tokens[writer] = await http.login(writer)
        await http.consent(writer_tokens[writer], manifest['origin'])

    phases = []
    phases.append(await run_phase(http, pool, tokens, views, billboards, accounting,
        'CAL', CALIBRATION_RATE, CALIBRATION_SECONDS, stop_all, debt, in_flight))
    counters_at['burst_start'] = counters_before()
    phases.append(await run_phase(http, pool, tokens, views, billboards, accounting,
        'CAL-BURST', BURST_RATE, BURST_SECONDS, stop_all, debt, in_flight))
    counters_at['burst_end'] = counters_before()
    storage_gb_s = (counters_at['burst_end']['sectors_read'] - counters_at['burst_start']['sectors_read']) \
        * 512 / (BURST_SECONDS * 1024**3)
    if stop_all.is_set():
        raise ValueError('calibration stop: ' + json.dumps(accounting['error_class']))
    if storage_gb_s <= STORAGE_DEMAND_GB_PER_S:
        save(root / 'dau-storage-binding.json', dict(device=device, measured_gb_per_s=storage_gb_s,
            demand_gb_per_s=STORAGE_DEMAND_GB_PER_S,
            verdict='STORAGE_BINDING', note='the sustained window is not admitted: storage provably binds'))
        raise ValueError('storage headroom gate: measured ' + str(round(storage_gb_s, 3))
            + ' GB/s against the ' + str(STORAGE_DEMAND_GB_PER_S) + ' GB/s contract-peak demand')
    save(root / 'dau-storage-headroom.json', dict(device=device,
        measured_gb_per_s=round(storage_gb_s, 3), demand_gb_per_s=STORAGE_DEMAND_GB_PER_S,
        verdict='STORAGE_NON_BINDING'))

    stream_stop = asyncio.Event()
    stream = asyncio.create_task(writer_stream(stream_stop, 0.0))
    median_wall_ms = None
    try:
        for name, rate, seconds in (('W', 15.0, 300), ('A', 15.0, 600), ('B', 2.9, 1800)):
            if stop_all.is_set():
                break
            await run_phase(http, pool, tokens, views, billboards, accounting,
                name, rate, seconds, stop_all, debt, in_flight)
            if stop_all.is_set():
                break
        # drain: the offered load stops; in-flight completes; debt sampling
        # continues; the bound is 3x the median single-read wall, banked here.
        drain_stop = asyncio.Event()
        sampler = debt(drain_stop, 'D')
        t_drain = time.monotonic()
        median_wall_ms = median_single_read_ms(accounting)
        bound = wl.DRAIN_MULTIPLIER * (median_wall_ms or 0) / 1000
        while accounting['in_flight_now'] > 0 and time.monotonic() - t_drain < max(bound, 1):
            await asyncio.sleep(0.5)
        drained = accounting['in_flight_now'] == 0
        drain_stop.set()
        await sampler
    finally:
        stream_stop.set()
        await stream
        await http.close()

    debt_by_phase = {}
    for name in ('CAL', 'CAL-BURST', 'W', 'A', 'B', 'D'):
        path = root / 'debt' / (name + '.jsonl')
        if path.exists():
            debt_by_phase[name] = [json.loads(line) for line in path.read_text().splitlines()]
    calibration = dict(rate=CALIBRATION_RATE, seconds=CALIBRATION_SECONDS,
        burst_rate=BURST_RATE, burst_seconds=BURST_SECONDS,
        percentiles=wl.percentiles(accounting['latencies_ms'].get('CAL', [])),
        burst_percentiles=wl.percentiles(accounting['latencies_ms'].get('CAL-BURST', [])),
        reconciliation=accounting.reconciliation(),
        median_single_read_wall_ms=median_wall_ms,
        storage=dict(device=device, measured_gb_per_s=round(storage_gb_s, 3),
            demand_gb_per_s=STORAGE_DEMAND_GB_PER_S, verdict='STORAGE_NON_BINDING'))
    save(root / 'dau-calibration.json', calibration)
    windows_report = {name: wl.receipt_window(name, accounting, debt_by_phase,
        median_single_read_ms=median_wall_ms or 0) for name in ('W', 'A', 'B')}
    drain_report = dict(within_bound=drained, bound_s=bound,
        in_flight_peak=accounting['in_flight_peak'],
        in_flight_zero_within_bound=drained, phase='D')
    debt_by_phase.setdefault('D', [])
    divergences = accounting['error_class'].get('divergence', 0)
    stops = []
    if accounting['error_class'].get('memory_cap_refusal'):
        stops.append(dict(phase='WABD', resource='memory', detail='memory cap refusal or OOM risk'))
    if stop_all.is_set() and not divergences and not accounting['error_class'].get('memory_cap_refusal'):
        stops.append(dict(phase='WABD', resource='saturation',
            detail='achieved below 50 percent of offered for 60 s'))
    return dict(calibration=calibration, storage_headroom=calibration['storage'],
        windows=windows_report, drain=drain_report,
        debt_by_phase=debt_by_phase,
        divergences=divergences, resource_stops=stops,
        error_counts=dict(memory_cap_refusal=accounting['error_class'].get('memory_cap_refusal', 0),
            timeout=accounting['error_class'].get('timeout', 0),
            error_429=accounting['error_class'].get('429', 0),
            error_5xx=accounting['error_class'].get('5xx', 0),
            error_4xx=accounting['error_class'].get('4xx_content', 0),
            other=accounting['error_class'].get('other', 0),
            divergence=divergences),
        reconciliation=accounting.reconciliation(),
        in_flight_zero_within_bound=drained)


def run(root, *, note=None):
    root = Path(root).resolve()
    approval = read(root / 'admission.json')
    admission_gate(approval)
    sha = current.source_guard(approval)
    task = Task(root, approval, sha)
    with task.attempt(note) as attempt:
        modern.install_sessions()
        actions = Actions(root, task)
        try:
            task.step('restore', lambda: actions.restore(),
                validate=lambda stored: verify_envelope(root))
            task.step('verify-envelope', lambda: verify_envelope(root))
            task.step('verify-store', lambda: verify_store(root))
            task.step('steady-state', lambda: full_store.steady_state(root))
            task.step('read-setup', lambda: actions.stage('read-setup', {}))
            task.step('migrate', lambda: actions.stage('migrate', {}))
            task.step('billboard-fixtures', lambda: actions.stage('billboard-fixtures', {}))
            task.step('furniture', lambda: actions.stage('furniture', {}),
                validate=lambda stored: full_store.validate_furniture(stored, root))
            progress = {}
            for name in contract.GATES:
                value = task.step('gate:' + name,
                    (lambda name=name: full_store.gate_stage(actions, name, progress)),
                    (lambda stored, name=name: contract.gate(name, stored)))
                progress['verify-' + name] = dict(outcome='PASS', evidence=value)
            task.step('reader-pool', lambda: reader_pool(root, modern.Session(root)))
            task.step('oracle', lambda: freeze_oracle(root, modern.Session(root),
                read(root / 'dau-reader-pool.json')))
            task.step('writers', lambda: writer_actors(root, modern.Session(root)))
            schedule = dict(reads=dict(CAL=int(CALIBRATION_RATE * CALIBRATION_SECONDS),
                CAL_BURST=int(BURST_RATE * BURST_SECONDS),
                W=int(15.0 * 300), A=int(15.0 * 600), B=int(2.9 * 1800)),
                writers=int(1.0 * (300 + 600 + 1800 + 60)),
                declared='staggered round-robin; persisted before execution',
                read_hash=wl.schedule_hash(wl.read_schedule([dict(name='W', duration_s=300, rate=15.0)])),
                persisted_utc=datetime.now(UTC).isoformat())
            save(root / 'dau-schedule.json', schedule)
            receipt = task.step('windows', lambda: asyncio.run(windows(root, actions)))
            gates = evaluate_gates(receipt, approval['dau_envelope'])
            approval['dau_host']['admitted_utc'] = approval.get('approved_utc')
            result = dict(status='EVIDENCE_COLLECTED', **task.identity, source_end=sha,
                receipt=receipt, gates=gates,
                identity=dict(source_revision=sha,
                    runner_sha256=digest_bytes(Path(__file__).read_bytes()),
                    engine=modern.ENGINE, snapshot_id='255003176',
                    dataset_id=approval['dataset_id'],
                    schedule_sha256=digest(root / 'dau-schedule.json'),
                    host=approval['dau_host'],
                    admission_task=approval['costfn_task_id'],
                    started_utc=str(attempt['started_utc'])),
                claim_boundary=('the software sustains or does not sustain the realism contract rate '
                    'on a host sized to the budget; storage supply and production claims stay out '
                    'under the contract boundary'),
                calibration_receipt_sha256=digest(root / 'dau-calibration.json'))
            save(root / 'dau-sustain-receipt.json', result)
            return result
        finally:
            if (root / 'restore.json').exists():
                cells.stop(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--repair-note')
    args = parser.parse_args()
    run(args.root, note=args.repair_note)
