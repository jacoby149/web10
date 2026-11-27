"""Pure launch and publication restrictions for the isolated diverse DAU cell."""

import uuid

from arm_f_native import save
from arm_satellite_sql import literal as q
from costfn_task import read
from dau_sustain_native_audit import native_finish
import dau_sustain_readers as readers
import dau_sustain_workload as wl


def validate(approval, proof, writers):
    if (approval.get('purpose') != 'DAU_SUSTAINED_CONTRACT_RATE'
            or approval.get('dau_overnight') is not True
            or approval.get('dau_reader_criterion') != readers.CRITERION
            or approval.get('composition_admitted') is not True):
        raise ValueError('isolated overnight DAU admission required')
    routes = proof['routes']
    if len(routes) != wl.READERS or sorted(row['index'] for row in routes.values()) != list(range(wl.READERS)):
        raise ValueError('complete certified reader population required')
    if len(writers['actors']) != wl.WRITER_ACTORS:
        raise ValueError('complete certified writer population required')
    following = {group for row in routes.values() for group in row['groups']}
    expected = {}
    provider, discover = writers['provider'], writers['discover']
    if discover != provider + '/groups/web10/discover':
        raise ValueError('the declared default Discover group is required')
    for row in writers['actors']:
        actor = row['reader']
        owned = provider + '/groups/users/' + actor + '/followers'
        if actor in expected or set(row['groups']) != {owned, discover} or following & {owned, discover}:
            raise ValueError('writer actors and attachment scopes must remain distinct and outside Following')
        expected[actor] = frozenset((owned, discover))
    return expected


def publication(run_id, actor, expected, payload, operation_id, *, has_origin, delegated):
    if has_origin or delegated or actor not in expected:
        raise ValueError('only existing direct-API writer authority is admitted')
    if (payload.get('service') != 'posts' or payload.get('author_as') or payload.get('ref_value')
            or payload.get('ad_preference') or set(payload.get('groups') or []) != expected[actor]
            or len(payload['groups']) != 2):
        raise ValueError('only the scheduled exact-target ordinary publication is admitted')
    body = payload.get('body', {})
    text = body.get('text', '')
    if (set(body) != {'text', 'status'} or body.get('status') != 'active' or not isinstance(text, str)
            or not text.startswith('dau sustain ')):
        raise ValueError('only the declared synthetic text payload is admitted')
    raw = text.removeprefix('dau sustain ')
    if not raw.isascii() or not raw.isdecimal() or len(raw) > 6 or raw != str(int(raw)):
        raise ValueError('invalid publication slot')
    identity = str(uuid.uuid5(uuid.UUID(run_id), f'publication:{raw}'))
    if operation_id != identity:
        raise ValueError('publication operation does not match the scheduled slot')
    return str(uuid.uuid5(uuid.NAMESPACE_URL, actor + ':' + identity + ':publish'))


def writer_population(root, session, selection):
    manifest = read(root / 'input/manifest.json')
    provider = manifest['provider']
    own = provider + '/groups/users/'
    discover = provider + '/groups/web10/discover'
    following = {group for row in selection['readers'] for group in row['groups']}
    excluded = {row['reader'] for row in selection['readers']}
    candidates = sorted({actor for actor in manifest['readers'] if actor not in excluded
        and own + actor + '/followers' not in following})
    if discover in following or len(candidates) < wl.WRITER_ACTORS:
        raise ValueError('writer population cannot be isolated from certified Following pages')
    actors, receipts = [], []
    for offset in range(0, len(candidates), 512):
        batch = candidates[offset:offset + 512]
        own_group = 'concat(' + q(own) + ",member_key,'/followers')"
        query = ('SELECT member_key FROM (SELECT member_key,group_id,role,deleted FROM group_members '
            'WHERE member_key IN (' + ','.join(map(q, batch)) + ') AND group_id IN ('
            + ','.join(map(q, [discover, *[own + actor + '/followers' for actor in batch]]))
            + ') ORDER BY updated_at DESC,deleted DESC LIMIT 1 BY member_key,group_id) WHERE deleted=0 '
            'GROUP BY member_key HAVING countIf(group_id=' + own_group + " AND role IN ('owner','admin'))=1 "
            'AND countIf(group_id=' + q(discover) + ')=1 ORDER BY member_key')
        rows, query_id = session.rows(f'dau_writer_pool_{offset}', query)
        receipts.append(native_finish(session, query_id))
        actors.extend(dict(reader=row['member_key'], groups=[own + row['member_key'] + '/followers', discover]) for row in rows)
        if len(actors) >= wl.WRITER_ACTORS:
            break
    if len(actors) < wl.WRITER_ACTORS:
        raise ValueError('fewer than 100 qualifying existing writer accounts')
    value = dict(provider=provider, discover=discover, actors=actors[:wl.WRITER_ACTORS], native=receipts)
    path = root / 'dau-diverse-writer-pool.json'
    if path.exists():
        previous = read(path)
        if any(value[key] != previous[key] for key in ('provider', 'discover', 'actors')):
            raise ValueError('retained writer pool no longer has its original scope')
        return previous
    save(path, value)
    return value
