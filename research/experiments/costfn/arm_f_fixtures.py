"""Real human/app/group/document fixtures, not direct canonical table inserts."""
from datetime import UTC, datetime
import json
from pathlib import Path
import urllib.request
import uuid

import arm_f_environment as environment
from arm_f_http import HTTP
from arm_f_native import save
from arm_f_runtime import Session
from arm_satellite_sql import literal as q
import restore_dataset
import restore_realism as restore

ORIGIN = 'https://fanout.research.invalid'
ROLES = [dict(name='owner', permissions={'*': ['readAll', 'create', 'updateOwn', 'deleteOwn'],
    'group': ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup']}),
    dict(name='member', permissions={name: ['readAll', 'create'] for name in ('posts', 'reactions', 'comments', 'profile')})]


def setup_worker(root):
    root = Path(root)
    session = Session(root)
    clock = datetime.now(UTC).isoformat()
    overlay = root / 'fixture.overlay.json'
    overlay.write_text(json.dumps({'services': {'api': {'environment': {'FANOUT_FIXTURE_SETUP': '1',
        'FANOUT_FIXTURE_TIME': clock}, 'command': ['uv', 'run', 'uvicorn', 'arm_f_fixture_api:application',
        '--host', '0.0.0.0', '--port', '80', '--no-access-log']}}}))
    compose = session.compose[:-2] + ['-f', str(overlay), *session.compose[-2:]]
    restore.command(compose, session.env, 'up', '-d', '--no-deps', 'api', timeout=180)
    restore_dataset.wait_for(lambda: urllib.request.urlopen('http://127.0.0.1:6098/docs', timeout=3).status == 200, 'authorized fixture setup API')
    save(root / 'fixture-clock.json', {'setup_only': True, 'server_time': clock, 'measured_writer': False})
    return session


async def group(http, token, name, members):
    value, _ = await http.post('/v3/groups/create', {'token': token, 'name': name, 'roles': ROLES,
        'members': members, 'join_policy': 'open', 'discoverable': False, 'membership_visibility': 'hidden'}, origin=ORIGIN)
    return value['group_id']


async def publish(http, token, groups, body=None, *, operation=None):
    value, row = await http.post('/v3/create', {'token': token, 'service': 'posts', 'groups': groups,
        'body': body or {'text': 'Synthetic F programme publication'}}, origin=ORIGIN,
        operation=operation or str(uuid.uuid4()))
    return value, row


async def parity_fixture(root):
    root = Path(root)
    session = setup_worker(root)
    http = HTTP(root, session, root / 'fixture-http')
    manifest = http.manifest
    writer, reader, other = manifest['readers'][:3]
    try:
        token, second = await http.login(writer), await http.login(other)
        await http.consent(token, ORIGIN)
        await http.consent(second, ORIGIN)
        users, _ = session.rows('fixture_local_humans', 'SELECT username FROM users FINAL WHERE deleted=0 AND username NOT IN ('
            + ','.join(q(name) for name in (writer, reader, other)) + ') ORDER BY username LIMIT 1997')
        if len(users) != 1997:
            raise ValueError('insufficient actual fixture humans')
        small = [dict(member_key=writer, role='owner'), dict(member_key=reader, role='member'), dict(member_key=other, role='member')]
        first = await group(http, token, 'F-parity-A', small)
        second_group = await group(http, token, 'F-parity-B', small)
        large = await group(http, token, 'F-parity-large', [*small, *[dict(member_key=row['username'], role='member') for row in users]])
        posts = []
        for index in range(30):
            doc, _ = await publish(http, token, [first, second_group], {'text': 'Shared-route fixture', 'index': index})
            posts.append(doc['doc_id'])
        for index in range(30):
            doc, _ = await publish(http, token, [large], {'text': 'Seek-lane fixture', 'index': index})
            posts.append(doc['doc_id'])
        marker = uuid.uuid4().hex
        collision = []
        for actor in (token, second):
            doc, _ = await publish(http, actor, [first, second_group], {'text': 'Full-key identity fixture', 'fixture_same_id': marker})
            collision.append(doc)
        if collision[0]['doc_id'] != collision[1]['doc_id']:
            raise ValueError('actual same-ID/different-author fixture not established')
        result = dict(reader=reader, writer=writer, groups=[first, second_group, large],
            sizes=[3, 3, 2000], shared_ids=posts[:30] + [collision[0]['doc_id']], collision_id=collision[0]['doc_id'],
            fixture_clock=json.loads((root / 'fixture-clock.json').read_bytes()), actual_authorized_paths=True)
        save(root / 'fixture.json', result)
        return result
    finally:
        await http.close()
        environment.stop(root)


async def fresh_human(http):
    username = 'f-' + uuid.uuid4().hex[:24]
    await http.post('/v3/signup', {'username': username, 'password': http.manifest['password']})
    token = await http.login(username)
    await http.consent(token, http.manifest['origin'])
    return username, token
