"""Predeclared open-loop concurrent readers/publishes/follows on populated state.

10s declared lead-in, then600s measured steady-state. Arrivals never wait for a
previous completion; overload/rejection, drain and late completions are retained.
No observer SQL during the cell. All source verification/native collection follows
the measured window, without counting drain as achieved sustained throughput.
"""
import asyncio
from datetime import UTC, datetime
import engagement_window as window
import json
import math
from pathlib import Path
import shutil
import sqlite3
import time
import uuid

import httpx

import arm_f_environment as environment
from arm_f_fixtures import ORIGIN, fresh_human, group, publish
from arm_f_gates import LOAD_SECONDS, load_verdict, p95
from arm_f_http import HTTP
from arm_f_lifecycle import pointer_audit
from arm_f_native import save
from arm_f_runtime import admitted
from arm_satellite_sql import literal as q

READERS, THINK, LEAD_IN, MAX_INFLIGHT = 1400, 60, 10, 4096


async def fixtures(http):
    cohort = http.manifest['readers'][1:READERS + 1]
    if len(cohort) != READERS:
        raise ValueError('predeclared1400 ordinary reader cohort missing')
    actors = []
    for _ in range(39):
        name, token = await fresh_human(http)
        await http.consent(token, ORIGIN)
        actors.append((name, token))
    excluded = [*cohort, *[name for name, _ in actors]]
    fillers, _ = http.session.rows('RW_fixture_fillers', 'SELECT username FROM users FINAL WHERE deleted=0 '
        'AND username NOT IN (' + ','.join(q(name) for name in excluded) + ') ORDER BY username LIMIT 1998')
    if len(fillers) != 1998:
        raise ValueError('load fixture requires actual local humans')
    groups, assigned = [], {}
    for index, (writer, token) in enumerate(actors):
        size = (10, 500, 1999)[index % 3]
        selected = cohort[:9] if index == 0 else (cohort[9:508] if index == 1 else (cohort[508:] if index == 2 else []))
        for reader in selected:
            assigned[reader] = index
        members = [dict(member_key=writer, role='owner'), *[dict(member_key=name, role='member') for name in selected],
            *[dict(member_key=row['username'], role='member') for row in fillers[:size - 1 - len(selected)]]]
        key = await group(http, token, 'followers', members)
        groups.append(key)
        await publish(http, token, [key], {'text': 'Load follow-backfill seed', 'fixture': index})
    membership, _ = http.session.rows('RW_initial_memberships', 'SELECT member_key,group_id,role FROM group_members FINAL '
        'WHERE deleted=0 AND member_key IN (' + ','.join(q(name) for name in cohort)
        + ") AND endsWith(group_id,'/followers') ORDER BY member_key,group_id", setup_seconds=900)
    by_reader = {reader: [] for reader in cohort}
    old_follows = {reader: [] for reader in cohort}
    for row in membership:
        if row['group_id'] not in groups:
            by_reader[row['member_key']].append(row['group_id'])
            if row['role'] == 'member':
                old_follows[row['member_key']].append(row['group_id'])
    credentials = {}
    for reader in cohort:
        if len(old_follows[reader]) != 20:
            raise ValueError('initial reader K20 cohort differs')
        token = await http.login(reader)
        credentials[reader] = token
        # Keep actual personal graph K20 at admission: replace one original
        # follow with its assigned real publishing group, through the real API.
        removed = old_follows[reader][0]
        await http.post('/v3/groups/leave', {'token': token, 'group_id': removed},
                        origin=http.manifest['origin'], operation=str(uuid.uuid4()))
        by_reader[reader].remove(removed)
        by_reader[reader].append(groups[assigned[reader]])
    baseline = {}
    for index, key in enumerate(groups):
        from arm_f import MEMBERS
        members, _ = http.session.rows('RW_base_' + str(index), MEMBERS.replace('{group_id:String}', q(key)))
        baseline[key] = sorted(row['member_key'] for row in members)
    return cohort, actors, groups, by_reader, credentials, baseline


def collect_native(http, request_ids, output):
    """One post-window flush, bounded ID batches; never a wall-window cost guess."""
    http.session.query('RW_flush', 'SYSTEM FLUSH LOGS')
    native = {}
    all_ids = []
    mapping = {}
    for request in request_ids:
        path = http.root / 'F-stages' / (request + '.jsonl')
        stages = [json.loads(line) for line in path.read_text().splitlines()]
        if any(row.get('success') is not True for row in stages):
            raise ValueError('failed native load stage')
        ids = [row['query_id'] for row in stages]
        if not ids:
            raise ValueError('load native request attribution absent')
        mapping[request] = ids
        all_ids.extend(ids)
    if len(all_ids) != len(set(all_ids)):
        raise ValueError('duplicate native request attribution')
    for kind, values, condition in (('read', all_ids, 'query_id'),
                                    ('write', ['F_WRITE:' + value for value in request_ids], 'log_comment')):
        for start in range(0, len(values), 500):
            rows, _ = http.session.rows('RW_native_' + kind + '_' + str(start), 'SELECT query_id,read_rows,read_bytes,'
                'written_rows,written_bytes,memory_usage,exception_code,log_comment,query_kind,tables,query_start_time_microseconds '
                'FROM system.query_log WHERE ' + condition + ' IN (' + ','.join(q(value) for value in values[start:start + 500])
                + ") AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
            for row in rows:
                native[row['query_id']] = row
    if set(all_ids) - set(native) or any(int(row['exception_code']) or int(row['read_rows']) > 10_000_000 for row in native.values()):
        raise ValueError('native load failure/over10M/missing receipts')
    save(output / 'native.json', {'queries': native, 'request_query_ids': mapping})
    return native, mapping


def reconcile(http, baseline, base_sequence, native, writers):
    """Independent canonical before/after facts plus durable serialized operation
    history. This resolves sub-millisecond membership races without a guessed
    timestamp cutoff. Oracle snapshots are NOT publish-path membership recipes.
    """
    from arm_f import MEMBERS
    db = sqlite3.connect('file:' + str(http.root / 'fanout-state/journal/intents.sqlite') + '?mode=ro', uri=True)
    intents = db.execute('SELECT sequence,operation_id,actor_key,operation,payload_json,result_json,state FROM intents '
        'WHERE sequence>? ORDER BY sequence', (base_sequence,)).fetchall()
    seeds = db.execute("SELECT actor_key,payload_json,result_json FROM intents WHERE sequence<=? AND operation='publish' AND state='complete'",
                       (base_sequence,)).fetchall()
    db.close()
    if any(row[-1] != 'complete' for row in intents):
        raise ValueError('unresolved durable operations after load drain')
    documents, _ = http.session.rows('RW_canonical_new_writer_docs', 'SELECT author_key,doc_id,'
        'toUnixTimestamp64Milli(created_at) AS created_ms FROM (SELECT author_key,doc_id,created_at,collection_name,deleted,'
        'row_number() OVER (PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn FROM documents '
        'WHERE author_key IN (' + ','.join(q(name) for name in writers) + ")) WHERE rn=1 AND deleted=0 AND collection_name='posts'",
        setup_seconds=900)
    metadata = {(row['author_key'], row['doc_id']): int(row['created_ms']) for row in documents}
    links, _ = http.session.rows('RW_canonical_new_writer_links', 'SELECT doc_id,group_id FROM (SELECT doc_id,group_id,deleted,'
        'row_number() OVER (PARTITION BY doc_id,group_id ORDER BY updated_at DESC,deleted DESC) AS rn FROM doc_groups WHERE doc_id IN '
        '(SELECT doc_id FROM documents WHERE author_key IN (' + ','.join(q(name) for name in writers)
        + '))) WHERE rn=1 AND deleted=0', setup_seconds=900)
    attached = {}
    for row in links:
        attached.setdefault(row['doc_id'], set()).add(row['group_id'])
    by_operation = {row['operation_id']: row for row in http.records if row.get('operation_id')}
    wanted_members = {key: set(values) for key, values in baseline.items()}
    events = []
    published = set()
    posts = {key: {} for key in baseline}
    for actor, raw, result in seeds:
        if actor in writers:
            payload, outcome = json.loads(raw), json.loads(result)
            identity = actor, outcome['doc_id']
            key = payload['groups'][0]
            if identity not in metadata or attached.get(identity[1]) != {key}:
                raise ValueError('independent initial backfill document facts differ')
            posts[key][identity] = metadata[identity]
    for sequence, operation, actor, kind, raw, result, state in intents:
        if kind not in ('publish', 'membership'):
            continue  # Derived trim is separately measured, never new delivery.
        payload, outcome = json.loads(raw), json.loads(result)
        request = by_operation.get(operation.split(':', 1)[0])
        if request is None:
            raise ValueError('unmanaged canonical writer in load history')
        if kind == 'publish':
            doc = outcome['doc_id']
            if (actor, doc) not in metadata or doc in published or attached.get(doc) != {payload['groups'][0]}:
                raise ValueError('missing/duplicated canonical logical publication')
            published.add(doc)
            events.append((sequence, 'publish', actor, payload['groups'][0], doc, request))
        else:
            key = payload['group_id']
            if request['path'] != '/v3/groups/join' or key not in wanted_members:
                raise ValueError('undeclared membership mutation in load')
            events.append((sequence, 'follow', actor, key, None, request))
    follow_rows, pointers, expected_total = 0, 0, 0
    for sequence, kind, actor, key, doc, request in events:
        rows = [row for row in pointer_audit(http, request['request_id']) if not row[-1]]
        if kind == 'follow':
            if actor in wanted_members[key]:
                raise ValueError('configured follow was a no-op, not a real new follow')
            wanted_members[key].add(actor)
            eligible = sorted(((stamp, doc, author) for (author, doc), stamp in posts[key].items()), reverse=True)[:200]
            expected = {(stamp, author, doc) for stamp, doc, author in eligible} if len(wanted_members[key]) < 2000 else set()
            if ({(int(row[1]), row[2], row[3]) for row in rows} != expected or len(rows) != len(expected)
                    or any(row[0] != actor or row[4] != key or int(row[5]) != sequence for row in rows)):
                raise ValueError('follow backfilled the wrong principal/route')
            follow_rows += len(rows)
            continue
        expected = wanted_members[key] if len(wanted_members[key]) < 2000 else set()
        if (any(row[2] != actor or row[3] != doc or row[4] != key or int(row[5]) != sequence for row in rows)
                or len(rows) != len({row[0] for row in rows}) or {row[0] for row in rows} != expected):
            raise ValueError('independent operation/recipient/route delivery mismatch')
        inserts = [row for row in native.values() if row.get('log_comment') == 'F_WRITE:' + request['request_id']
            and row.get('query_kind') == 'Insert' and 'web10.fanout' in row.get('tables', [])]
        if sum(int(row['written_rows']) for row in inserts) != len(rows):
            raise ValueError('submitted pointers differ from native physical writes')
        pointers += len(rows)
        expected_total += len(expected)
        posts[key][actor, doc] = metadata[actor, doc]
    for index, (key, wanted) in enumerate(wanted_members.items()):
        current, _ = http.session.rows('RW_final_' + str(index), MEMBERS.replace('{group_id:String}', q(key)))
        if {row['member_key'] for row in current} != wanted:
            raise ValueError('finished canonical memberships differ from replayed successful follows')
    return pointers, expected_total, follow_rows


async def run(root, output):
    root, output = Path(root), Path(output)
    seed = json.loads((root / 'F-population/result.json').read_bytes())
    if seed.get('seeded_fraction') != 1 or seed.get('outcome') != 'SEEDED_PENDING_POPULATED_T6_T5_RW':
        raise ValueError('R+W requires actual full-population seed')
    session = environment.boot(root)
    approval = json.loads((root / 'admission.json').read_bytes())
    deadline = admitted(approval, session.host_id)
    if window.work_seconds(approval, deadline) < 1200 or shutil.disk_usage(root).free < 100 * 1024**3:
        raise TimeoutError('load needs remaining fixed window and100GiB reserve; do not extend')
    http = HTTP(root, session, output)
    result = dict(verified=False, population_fraction=1, duration_seconds=0, lead_in_seconds=LEAD_IN,
        cohort=READERS, initial_follow_K=20, maximum_added_follows=5,
        offered_rates={'reads': READERS / THINK, 'publishes': 100, 'follows': 10}, streams={},
        lost_deliveries=None, duplicate_deliveries=None, audit_fsync_in_write_latency=True)
    events, reads, publications, pending, schedulers = [], [], [], set(), []
    try:
        cohort, actors, groups, scopes, credentials, baseline = await fixtures(http)
        db = sqlite3.connect('file:' + str(root / 'fanout-state/journal/intents.sqlite') + '?mode=ro', uri=True)
        base_sequence = db.execute('SELECT coalesce(max(sequence),0) FROM intents').fetchone()[0]
        db.close()
        start = time.monotonic() + LEAD_IN
        end = start + LOAD_SECONDS
        result['world_before_utc'] = datetime.now(UTC).isoformat()
        result['measured_start_utc'] = datetime.fromtimestamp(time.time() + LEAD_IN, UTC).isoformat()
        save(output / 'admission-profile.json', {**result, 'reader_names': cohort, 'writer_names': [name for name, _ in actors],
            'group_ids': groups, 'follow_schedule': 'reader=i%1400; next not-yet-followed publishing group, deterministic',
            'route_mix': 'round-robin39 initial10/500/1999 groups; current canonical classification always wins'})
        active_readers, follow_used = set(), {reader: set(scopes[reader]) for reader in cohort}
        parity_failure = asyncio.Event()
        async def operation(kind, index, due):
            now = time.monotonic()
            event = dict(kind=kind, index=index, offered=due - start, started=now - start, success=False)
            reader = cohort[index % READERS] if kind != 'publishes' else None
            owns_reader_slot = False
            try:
                if kind == 'reads':
                    if reader in active_readers:
                        event['rejected'] = True
                        return
                    active_readers.add(reader)
                    owns_reader_slot = True
                    selected = list(scopes[reader])
                    sample = await http.sequence(credentials[reader], selected)
                    observation = http.observation(sample['request_ids'][-1])
                    checks = observation.get('fanout_view_checks', [])
                    if len(checks) != 1 or sample['followups'][2] != {doc: {'impressions': n, 'reach': reach}
                            for doc, n, reach in checks[0]['values']}:
                        raise ValueError('concurrent exact snapshot view parity failed')
                    sample.update(reader=reader, groups=selected, offered=due - start)
                    # Private synthetic responses only; not public gate evidence.
                    save(output / ('read-' + sample['request_ids'][0] + '.json'), sample)
                    reads.append(sample)
                elif kind == 'publishes':
                    writer, token = actors[index % len(actors)]
                    group_id = groups[index % len(groups)]
                    doc, row = await publish(http, token, [group_id])
                    publications.append(dict(writer=writer, doc_id=doc['doc_id'], group_id=group_id,
                        request_id=row['request_id'], started_utc=row['started_utc'], ended_utc=row['ended_utc']))
                else:
                    target = (index % READERS + index // READERS + 1) % len(groups)
                    while groups[target] in follow_used[reader]:
                        target = (target + 1) % len(groups)
                    group_id = groups[target]
                    follow_used[reader].add(group_id)
                    response, _ = await http.post('/v3/groups/join', {'token': credentials[reader], 'group_id': group_id},
                        origin=http.manifest['origin'], operation=str(uuid.uuid4()))
                    if response.get('role') != 'member':
                        raise ValueError('load follow did not actually complete')
                    scopes[reader].append(group_id)
                event['success'] = True
            except httpx.HTTPError as error:
                event.update(__import__('arm_f_failure').details(error))
                __import__('arm_f_failure').persist(output, error, operation=kind, reader=reader, index=index)
            except ValueError as error:
                event.update(__import__('arm_f_failure').details(error))
                __import__('arm_f_failure').persist(output, error, operation=kind, reader=reader, index=index)
                parity_failure.set()  # Never hide a semantic failure in the<1% HTTP-error allowance.
            finally:
                if owns_reader_slot:
                    active_readers.discard(reader)
                event['completed'] = time.monotonic() - start
                events.append(event)
                with (output / 'arrivals.jsonl').open('a') as stream:
                    stream.write(json.dumps(event) + '\n')
        async def schedule(kind, rate):
            base = start - LEAD_IN
            for index in range(math.floor(rate * (LOAD_SECONDS + LEAD_IN))):
                due = base + index / rate
                await asyncio.sleep(max(0, due - time.monotonic()))
                admitted(json.loads((root / 'admission.json').read_bytes()), session.host_id)
                if parity_failure.is_set() or (root / 'fanout-state/F.stop').exists():
                    raise ValueError('native load stop; no further arrivals')
                if len(pending) >= MAX_INFLIGHT:
                    rejected = dict(kind=kind, index=index, offered=due - start, completed=time.monotonic() - start,
                                    success=False, rejected=True)
                    events.append(rejected)
                    with (output / 'arrivals.jsonl').open('a') as stream:
                        stream.write(json.dumps(rejected) + '\n')
                    continue
                task = asyncio.create_task(operation(kind, index, due))
                pending.add(task)
                task.add_done_callback(pending.discard)
        schedulers = [asyncio.create_task(schedule(kind, rate)) for kind, rate in
                      (('reads', READERS / THINK), ('publishes', 100), ('follows', 10))]
        await asyncio.gather(*schedulers)
        await asyncio.sleep(max(0, end - time.monotonic()))
        result['duration_seconds'] = LOAD_SECONDS
        result['pending_at_window_end'] = len(pending)
        if pending:
            await asyncio.wait_for(asyncio.gather(*list(pending)), timeout=65)
        result['measured_end_utc'] = datetime.fromtimestamp(time.time() - (time.monotonic() - end), UTC).isoformat()
        # Actual API completions only. Drain is not delivered measured throughput.
        for kind in ('reads', 'publishes', 'follows'):
            offered = [row for row in events if row['kind'] == kind and 0 <= row['offered'] < LOAD_SECONDS]
            complete = [row for row in events if row['kind'] == kind and row['success'] and 0 <= row['completed'] < LOAD_SECONDS]
            result[kind] = dict(offered=len(offered), completed=len(complete), during_window_completed=len(complete),
                errors=sum(not row['success'] for row in offered), pending=0)
            if kind != 'reads':
                result[kind]['p95_ms'] = p95([(row['completed'] - row['started']) * 1000 for row in offered
                                             if row['success'] and not row.get('rejected')])
        await http.close()
        environment.stop(root)
        request_ids = [row['request_id'] for row in http.records if row['started_utc'] >= result['world_before_utc']]
        native, mapping = collect_native(http, request_ids, output)
        background, _ = session.rows('RW_all_native_with_background', 'SELECT query_id,read_rows,read_bytes,written_rows,'
            'written_bytes,memory_usage,exception_code,log_comment,query_start_time_microseconds FROM system.query_log '
            "WHERE (startsWith(log_comment,'F_READ:') OR startsWith(log_comment,'F_WRITE:')) AND "
            'query_start_time_microseconds>=parseDateTime64BestEffort(' + q(result['measured_start_utc']) + ",6,'UTC') AND "
            'query_start_time_microseconds<parseDateTime64BestEffort(' + q(result['measured_end_utc'])
            + ",6,'UTC') AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
        if any(int(row['exception_code']) or int(row['read_rows']) > 10_000_000 for row in background):
            raise ValueError('background/native load stop')
        save(output / 'measured-native-with-background.json', background)
        measured_reads = [sample for sample in reads if 0 <= sample['offered'] < LOAD_SECONDS]
        result['reads']['latencies_ms'] = [sample['elapsed_ms'] for sample in measured_reads]
        result['reads']['max_sequence_bytes'] = max((sum(int(native[query]['read_bytes'])
            for request in sample['request_ids'] for query in mapping[request]) for sample in measured_reads), default=math.inf)
        # Every returned core payload/count is checked against a separate canonical
        # process after the load. See verify_reads for monotonic snapshot handling.
        await verify_reads(http, measured_reads, publications, output)
        pointers, wanted, follow_rows = reconcile(http, baseline, base_sequence, native, [name for name, _ in actors])
        result.update(recipient_pointers=pointers, expected_recipient_pointers=wanted, lost_deliveries=0, duplicate_deliveries=0,
            follow_backfill_pointers=follow_rows,
            native_physical_written_rows=sum(int(row['written_rows']) for row in background),
            native_physical_written_bytes=sum(int(row['written_bytes']) for row in background),
            write_accounting='native statement start inside measured window; lead-in/drain retained separately')
        db = sqlite3.connect('file:' + str(root / 'fanout-state/journal/intents.sqlite') + '?mode=ro', uri=True)
        result['dirty_reader_backlog'] = db.execute('SELECT count(*) FROM dirty_readers WHERE generation>trimmed_generation').fetchone()[0]
        result['pending_intents_after_drain'] = db.execute("SELECT count(*) FROM intents WHERE state!='complete'").fetchone()[0]
        db.close()
        load_verdict(result)
        result['verified'] = True
        return result
    finally:
        __import__('arm_f_failure').before_cleanup(output, stage='R+W', operation='load')
        for task in schedulers:
            task.cancel()
        if schedulers:
            await asyncio.gather(*schedulers, return_exceptions=True)
        for task in list(pending):
            task.cancel()
        if pending:
            await asyncio.gather(*list(pending), return_exceptions=True)
        save(output / 'load.json', result)
        await http.close()
        environment.stop(root)


async def verify_reads(http, reads, publications, output):
    from arm_f_reads import profile_from_sample, reference, rowset
    from arm_satellite_ad_parity import validate_main
    http.session.query('RW_oracle_commitments_ddl', 'CREATE TABLE f_oracle_commits (author_key String,doc_id String,'
        'completed_at DateTime64(6,\'UTC\')) ENGINE=MergeTree ORDER BY (author_key,doc_id)')
    for start in range(0, len(publications), 200):
        values = ','.join('(' + ','.join((q(row['writer']), q(row['doc_id']),
            'parseDateTime64BestEffort(' + q(row['ended_utc']) + ",6,'UTC')")) + ')' for row in publications[start:start + 200])
        http.session.query('RW_oracle_commits_' + str(start), 'INSERT INTO f_oracle_commits VALUES ' + values)
    baseline = json.loads((output / 'admission-profile.json').read_bytes())['world_before_utc']
    requests = {row['request_id']: row for row in http.records}
    for index, sample in enumerate(reads):
        profile = profile_from_sample(http, sample, sample['reader'], sample['groups'])
        profile.update(verify_actual_pairs=[(row['author_key'], row['doc_id']) for row in sample['rows']],
            lower_read_utc=requests[sample['request_ids'][0]]['started_utc'], lower_before_utc=baseline)
        # A lower snapshot consists of the immutable pre-cell world plus all
        # acknowledged-before-read publishes. Newer in-flight rows may displace
        # its tail, never an earlier eligible row above the returned cutline.
        expected = reference(http.root, profile=profile, name='RW-oracle-' + str(index))
        validate_main(sample['rows'], expected['rows'], expected['eligible_ads'])
        for actual, wanted in zip(sample['followups'][:2], expected['followups'], strict=True):
            if rowset(actual.get('rows', [])) != rowset(wanted):
                raise ValueError('concurrent canonical engagement mismatch')
        def order(row):
            return row['created_at'], row['doc_id'], row['author_key']
        if sample['rows'] != sorted(sample['rows'], key=order, reverse=True):
            raise ValueError('concurrent document stream order mismatch')
        identities = {(row['author_key'], row['doc_id']) for row in sample['rows']}
        if len(identities) != len(sample['rows']):
            raise ValueError('duplicate full identity under load')
        floor = order(sample['rows'][-1])
        if any((row['author_key'], row['doc_id']) not in identities for row in expected['lower_rows'] if order(row) >= floor):
            raise ValueError('read dropped an independently committed eligible row')
