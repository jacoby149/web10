"""Real follow, entitlement, tombstone, retry and fenced-rebuild gate drivers."""
import asyncio
from datetime import UTC, datetime, timedelta
import hashlib
import json
from pathlib import Path
import sqlite3
import time
import uuid

import httpx

import arm_f as f
import arm_f_environment as environment
from arm_f_fixtures import ORIGIN, fresh_human, group, publish
from arm_f_http import HTTP
from arm_f_native import save
from arm_f_run import save as save_private
import arm_f_online_rebuild
from arm_f_reads import compare, profile_from_sample, reference
from arm_f_runtime import admitted
from arm_satellite_sql import literal as q


async def fixture_groups(http, writer, token, sizes, *, exclude=(), prefix='fixture'):
    users, _ = http.session.rows(prefix + '_humans', 'SELECT username FROM users FINAL WHERE deleted=0 AND username NOT IN ('
        + ','.join(q(name) for name in {writer, *exclude}) + ') ORDER BY username LIMIT 1999')
    if len(users) < max(sizes) - 1:
        raise ValueError('actual fixture population insufficient')
    result = []
    for index, size in enumerate(sizes):
        members = [dict(member_key=writer, role='owner'),
            *[dict(member_key=row['username'], role='member') for row in users[:size - 1]]]
        key = await group(http, token, 'F-' + prefix + '-' + str(index) + '-' + uuid.uuid4().hex[:6], members)
        result.append({'group_id': key, 'members': [row['member_key'] for row in members], 'size': size})
    return result


async def certified_read(http, token, reader, groups, label):
    sample = await http.sequence(token, groups)
    profile = profile_from_sample(http, sample, reader, groups)
    expected = reference(http.root, profile=profile, name=label + '-reference')
    compare(sample, expected, http.observation(sample['request_ids'][-1]))
    sample['native'] = http.native(sample['request_ids'], label)
    return sample


async def follow(root, output):
    root, output = Path(root), Path(output)
    session = environment.boot(root)
    http = HTTP(root, session, output)
    result = {'verified': False, 'groups': 39}
    try:
        writer = http.manifest['readers'][0]
        token = await http.login(writer)
        await http.consent(token, ORIGIN)
        reader, credential = await fresh_human(http)
        fixtures = await fixture_groups(http, writer, token, [10 if i % 2 else 2000 for i in range(39)],
            exclude=[reader, http.manifest['readers'][1]], prefix='follow39')
        for index, item in enumerate(fixtures):
            await publish(http, token, [item['group_id']], {'text': 'Fresh follow candidate', 'index': index})
        started = time.perf_counter()
        followed = []
        for item in fixtures:
            response, row = await http.post('/v3/groups/join', {'token': credential, 'group_id': item['group_id']},
                                            origin=http.manifest['origin'], operation=str(uuid.uuid4()))
            if response.get('role') != 'member':
                raise ValueError('fresh follow was not actually accepted')
            actual = http.observation(row['request_id']).get('fanout_membership', {})
            small = item['size'] + 1 < f.CUTOFF
            if actual.get('backfill_pointers') != int(small) or actual.get('lane') != ('fanout' if small else 'seek'):
                raise ValueError('actual same-session follow lane/backfill differs')
            followed.append(item['group_id'])
        sample = await http.sequence(credential, followed)
        elapsed = time.perf_counter() - started
        result.update(elapsed_seconds=elapsed, first_read_path=sample['path_mode'],
            request_ids=sample['request_ids'], reader=reader, fixture_groups=fixtures)
        save(output / 'timing.json', result)
        if elapsed > 60:
            raise ValueError('same-session follow39 plus first full feed exceeded60s')
        expected = reference(root, profile=profile_from_sample(http, sample, reader, followed), name='follow39-reference')
        compare(sample, expected, http.observation(sample['request_ids'][-1]))
        result.update(verified=True, native=http.native(sample['request_ids'], 'follow39-first-feed'))
        return result
    finally:
        save(output / 'follow39.json', result)
        await http.close()
        environment.stop(root)


async def stale(root, output):
    root, output = Path(root), Path(output)
    session = environment.boot(root)
    http = HTTP(root, session, output)
    cases = []
    try:
        writer, reader = http.manifest['readers'][:2]
        owner, viewer = await http.login(writer), await http.login(reader)
        await http.consent(owner, ORIGIN)
        members = [dict(member_key=writer, role='owner'), dict(member_key=reader, role='member')]
        a, b = [await group(http, owner, 'F-stale-' + name + '-' + uuid.uuid4().hex[:6], members) for name in ('A', 'B')]
        for index in range(205):
            await publish(http, owner, [a, b], {'text': 'Cap/refill lifecycle candidate', 'index': index})
        initial = await certified_read(http, viewer, reader, [a, b], 'stale-before')
        removed, retained = initial['rows'][0]['doc_id'], initial['rows'][1]['doc_id']
        await http.post('/v3/delete', {'token': owner, 'doc_id': removed}, origin=ORIGIN, operation=str(uuid.uuid4()))
        after = await certified_read(http, viewer, reader, [a, b], 'stale-after-delete')
        if removed in [row['doc_id'] for row in after['rows']] or len(after['rows']) != 21:
            raise ValueError('deleted candidate served or refill lost')
        cases.append('deleted_stale_pointer_denied_with_refill')
        await http.post('/v3/attachment', {'token': owner, 'doc_id': retained, 'group_id': a, 'attached': False},
                        origin=ORIGIN, operation=str(uuid.uuid4()))
        alternate = await certified_read(http, viewer, reader, [a, b], 'stale-alternate-route')
        if not any(row['doc_id'] == retained and row['group_id'] == b for row in alternate['rows']):
            raise ValueError('removing one route lost the valid alternate')
        cases.append('alternate_route_preserved')
        await http.post('/v3/groups/members/remove', {'token': owner, 'group_id': b, 'member_key': reader},
                        origin=ORIGIN, operation=str(uuid.uuid4()))
        denied = await certified_read(http, viewer, reader, [a, b], 'stale-revoked-route')
        if any(row['doc_id'] in (removed, retained) for row in denied['rows']):
            raise ValueError('revoked membership still delivered a stale route')
        cases.append('membership_entitlement_revocation')
        _, row = await http.post('/v3/groups/members/add', {'token': owner, 'group_id': b, 'member_key': reader, 'role': 'member'},
                                 origin=ORIGIN, operation=str(uuid.uuid4()))
        if http.observation(row['request_id']).get('fanout_membership', {}).get('backfill_pointers') != 200:
            raise ValueError('restored membership did not backfill its bounded live window')
        restored = await certified_read(http, viewer, reader, [a, b], 'stale-restored')
        if removed in [row['doc_id'] for row in restored['rows']] or retained not in [row['doc_id'] for row in restored['rows']]:
            raise ValueError('rejoin resurrected a tombstone or lost current content')
        cases.append('cap_overflow_rejoin_history_and_tombstone')
        return {'verified': True, 'cases': cases, 'sample_request_ids': restored['request_ids']}
    finally:
        await http.close()
        environment.stop(root)


def pointer_audit(http, request_id):
    path = http.root / 'fanout-state/pointer-audit' / (request_id + '.jsonl')
    return [row for line in path.read_text().splitlines() for row in json.loads(line)['rows']] if path.is_file() else []


async def checked_publish(http, token, group_id, *, operation=None):
    before, _ = http.session.rows('boundary_recipients_' + uuid.uuid4().hex,
        f.MEMBERS.replace('{group_id:String}', q(group_id)))
    wanted = {row['member_key'] for row in before}
    doc, row = await publish(http, token, [group_id], operation=operation)
    emitted = [item for item in pointer_audit(http, row['request_id']) if not item[-1]]
    expected = wanted if len(wanted) < f.CUTOFF else set()
    actual = [item[0] for item in emitted if item[3] == doc['doc_id'] and item[4] == group_id]
    if len(actual) != len(set(actual)) or set(actual) != expected:
        raise ValueError('actual emitted recipient pointers differ from independent canonical membership')
    return doc, row


async def boundaries(root, output):
    root, output = Path(root), Path(output)
    session = environment.boot(root)
    http = HTTP(root, session, output)
    http.client.timeout = httpx.Timeout(300)
    cases = []
    try:
        writer, mover = http.manifest['readers'][0], http.manifest['readers'][4]
        token, other = await http.login(writer), await http.login(mover)
        await http.consent(token, ORIGIN)
        await http.consent(other, ORIGIN)
        fixture = (await fixture_groups(http, writer, token, [1999], exclude=[mover], prefix='boundary'))[0]
        key = fixture['group_id']
        await checked_publish(http, token, key)
        await http.post('/v3/groups/join', {'token': other, 'group_id': key}, origin=ORIGIN, operation=str(uuid.uuid4()))
        await checked_publish(http, token, key)
        await http.post('/v3/groups/leave', {'token': other, 'group_id': key}, origin=ORIGIN, operation=str(uuid.uuid4()))
        await checked_publish(http, token, key)
        cases.append('1999_to_2000_to_1999_real_paths')
        for phase in ('after_apply', 'after_reconcile'):
            operation = str(uuid.uuid4())
            admission = dict(operation_id=operation + ':publish', actor_key=writer, phase=phase,
                expires_utc=(datetime.now(UTC) + timedelta(minutes=5)).isoformat())
            save_private(root / 'fanout-state/fault-admission.json', admission)
            try:
                await publish(http, token, [key], operation=operation)
            except (httpx.HTTPError, ValueError):
                pass
            else:
                raise ValueError('admitted crash was not exercised')
            fired = json.loads((root / 'fanout-state/fault-fired.json').read_bytes())
            if fired.get('phase') != phase or fired.get('operation_id') != operation + ':publish':
                raise ValueError('wrong/unobserved worker fault')
            db = sqlite3.connect('file:' + str(root / 'fanout-state/journal/intents.sqlite') + '?mode=ro', uri=True)
            pending = db.execute('SELECT state FROM intents WHERE operation_id=?', (operation + ':publish',)).fetchone()
            db.close()
            if not pending or pending[0] == 'complete':
                raise ValueError('crash did not leave a durable pending intent')
            environment.boot(root)
            first, _ = await publish(http, token, [key], operation=operation)
            second, _ = await publish(http, token, [key], operation=operation)
            if first['doc_id'] != second['doc_id']:
                raise ValueError('lost acknowledgement retry duplicated logical publication')
            rows, _ = session.rows('retry_logical_recipients_' + uuid.uuid4().hex,
                'SELECT reader_key,author_key,doc_id,group_id FROM fanout WHERE reader_key IN ('
                + ','.join(q(member) for member in fixture['members']) + ') AND doc_id=' + q(first['doc_id'])
                + ' GROUP BY reader_key,author_key,doc_id,group_id HAVING argMax(deleted,tuple(version,deleted))=0')
            if len(rows) != 1999 or {r['reader_key'] for r in rows} != set(fixture['members']):
                raise ValueError('retry lost/duplicated actual logical recipient routes')
            _, denial = await http.post('/v3/create', {'token': 'invalid', 'service': 'posts', 'groups': [key], 'body': {}},
                origin=ORIGIN, operation=operation, allow=(401, 403))
            if denial['status'] not in (401, 403):
                raise ValueError('completed retry bypassed current authentication')
            cases.append('durable_crash_retry_' + phase)
        command = dict(operation_id=str(uuid.uuid4()),
            source_sha256=hashlib.sha256(Path(arm_f_online_rebuild.__file__).read_bytes()).hexdigest())
        save_private(root / 'fanout-state/rebuild-command.json', command)
        path = root / 'fanout-state' / ('rebuild-' + command['operation_id']) / 'result.json'
        publish_task = follow_task = None
        publish_operation, follow_operation = str(uuid.uuid4()), str(uuid.uuid4())
        while True:
            deadline = admitted(json.loads((root / 'admission.json').read_bytes()), session.host_id)
            if (deadline - datetime.now(UTC)).total_seconds() < 180:
                raise TimeoutError('concurrent rebuild did not finish inside original admission')
            if path.is_file():
                state = json.loads(path.read_bytes())
                if state['outcome'] == 'STOP':
                    raise ValueError('fenced rebuild stopped')
                if state.get('phase') == 'FENCED' and state['outcome'] == 'RUNNING' and publish_task is None:
                    # Offer both real operations WHILE the exclusive rebuild is
                    # active, not before it started or after it completed.
                    publish_task = asyncio.create_task(publish(http, token, [key], operation=publish_operation))
                    follow_task = asyncio.create_task(http.post('/v3/groups/join', {'token': other, 'group_id': key},
                        origin=ORIGIN, operation=follow_operation))
                if state['outcome'] == 'PASS':
                    break
            await asyncio.sleep(.25)
        if publish_task is None:
            raise ValueError('rebuild did not overlap actual concurrent mutation arrivals')
        results = await asyncio.gather(publish_task, follow_task, return_exceptions=True)
        # Rebuild can outlast an HTTP caller. Any uncertain operation is retried
        # with the SAME operation ID, never called delivered on enqueue alone.
        if isinstance(results[0], BaseException):
            results[0] = await publish(http, token, [key], operation=publish_operation)
        if isinstance(results[1], BaseException):
            results[1] = await http.post('/v3/groups/join', {'token': other, 'group_id': key},
                                       origin=ORIGIN, operation=follow_operation)
        concurrent_doc, publication = results[0]
        if publication['started_utc'] > state['ended_utc'] and not any(r['started_utc'] < state['ended_utc']
                and r['path'] == '/v3/create' for r in http.records):
            raise ValueError('no actual publication arrival during rebuild')
        await certified_read(http, token, writer, [key], 'after-concurrent-rebuild')
        # Native current route state must equal the independently reconstructed
        # membership generation at this stable coordinator publication time.
        document, _ = session.rows('concurrent_document', 'SELECT created_at FROM documents WHERE author_key='
            + q(writer) + ' AND doc_id=' + q(concurrent_doc['doc_id']) + ' ORDER BY updated_at DESC,deleted DESC LIMIT 1')
        stamp = "parseDateTime64BestEffort(" + q(document[0]['created_at']) + ",3,'UTC')"
        members, _ = session.rows('concurrent_member_history', f.MEMBERS.replace('{group_id:String}', q(key))
            .replace('WHERE group_id=', 'WHERE updated_at<=' + stamp + ' AND group_id='))
        wanted = {row['member_key'] for row in members}
        emitted = [row[0] for row in pointer_audit(http, publication['request_id']) if not row[-1] and row[3] == concurrent_doc['doc_id']]
        if set(emitted) != (wanted if len(wanted) < f.CUTOFF else set()) or len(emitted) != len(set(emitted)):
            raise ValueError('concurrent rebuild/publication recipient reconciliation failed')
        cases.append('concurrent_publish_follow_fenced_canonical_rebuild')
        return {'verified': True, 'cases': cases, 'rebuild_receipt': str(path), 'rebuild': state}
    finally:
        await http.close()
        environment.stop(root)
