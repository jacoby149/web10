"""Explicit isolated F adapter. No production imports, endpoints or gate bypass.

Existing endpoint functions certify/authorize the real actor. A single private
coordinator journals and reconciles their actual effects. Old P remains intact.
"""
import contextvars
from datetime import UTC, datetime
from functools import wraps
import hashlib
import json
import logging
import os
from pathlib import Path
import threading
import uuid

from fastapi import HTTPException
import sqlglot

import arm_f as f
from arm_f_journal import Journal
from arm_f_store import Store
import arm_satellite_api as p
from arm_satellite_sql import literal as q
from app.v3.endpoints import documents, groups

if os.environ.get('FANOUT_CONFIG_F') != '1':
    raise RuntimeError('explicit isolated F opt-in required')
ROOT = Path(os.environ['FANOUT_STATE'])
admission = json.loads((ROOT / 'admission.json').read_bytes())
start, deadline = (datetime.fromisoformat(admission[key]) for key in ('approved_utc', 'deadline_utc'))
if (admission.get('configuration') != 'F' or admission.get('droplet_id') != p.host
        or admission.get('approved_by') != 'Jacob' or admission.get('budget_usd') != 2
        or admission.get('cutoff') != f.CUTOFF or admission.get('sort_order_arm_admitted') is not False
        or (deadline - start).total_seconds() != 14400 or not start <= datetime.now(UTC) < deadline):
    raise RuntimeError('exact current parent F admission required')
build = json.loads((ROOT / 'build.json').read_bytes())
if (build.get('DDL_sha256') != hashlib.sha256(f.DDL.encode()).hexdigest()
        or build.get('droplet_id') != p.host or build.get('P_Step0_T2') != 'PASS'):
    raise RuntimeError('same-host source-bound F build after P Step0 required')
journal = Journal(ROOT / 'journal')
store = Store(p.ch.client, journal)
log = logging.getLogger('arm-f')
context = contextvars.ContextVar('fanout_request', default=None)
pending = contextvars.ContextVar('fanout_live_result', default=None)
MARKER = '/* Config F request-private canonical result */ SELECT 1'
MODE = os.environ.get('FANOUT_SERVING_MODE', 'F_DOCUMENT_STREAM_V1')
if MODE not in ('F_DOCUMENT_STREAM_V1', 'P_DOCUMENT_STREAM_V1'):
    raise RuntimeError('explicit separately labelled document contract required')


def active():
    if not start <= datetime.now(UTC) < deadline:
        raise HTTPException(503, 'research admission closed')


def operation_id(kind):
    current = context.get()
    if current is None:
        raise HTTPException(503, 'writes must enter the authorized research application')
    return current['operation_id'] + ':' + kind


def payload(data):
    return data.model_dump(mode='json', exclude={'token'})


original_create = documents.create_as


@wraps(original_create)
def create(request, data, real_author, client_id, **kwargs):
    active()
    op = operation_id('publish')
    def authorize():
        documents._check_app_permission(request, real_author, data.service, 'create', client_id)
        author = data.author_as or real_author
        if data.author_as:
            perms = p.ch.effective_role_perms(author, real_author, authenticated=True)
            if not p.ch.get_group(author) or not p.ch._effective_allows(perms, data.service, 'create'):
                raise HTTPException(403, 'no current group-author create authority')
        if data.groups and not any((data.author_as and group == data.author_as) or
                p.ch.can_write_group(group, author, data.service) for group in data.groups):
            raise HTTPException(403, 'no current target authority')
    def apply(sequence, saved):
        # Entry's real actor was verified; original function rechecks current app,
        # group-author and actual target authority. Stable UUID/time survive retry.
        call = {**kwargs, 'doc_id': str(uuid.uuid5(uuid.NAMESPACE_URL, real_author + ':' + op)),
                'version_time': f.publication_time(journal.timestamp(sequence))}
        return original_create(request, data, real_author, client_id, **call)
    def reconcile(sequence, saved, result):
        for group in result.get('groups', []):
            live = store.rows('SELECT author_key,doc_id,created_at,deleted FROM (SELECT *,row_number() OVER '
                '(PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn FROM documents '
                'WHERE author_key=' + q(result['author_key']) + ' AND doc_id=' + q(result['doc_id'])
                + ') WHERE rn=1')
            if len(live) != 1 or live[0]['deleted'] or not store.rows(__import__('arm_f_store').pairs_sql(live, group)):
                raise ValueError('canonical publication/attachment changed before pointer reconcile')
            store.maintain_index(live[0], group)
            receipt = store.publish(live[0], group, sequence)
            current = p.observer.current.get()
            if current is not None:
                current.setdefault('fanout_publications', []).append({'group_id': group, **receipt})
        # Canonical-generation mismatch now prevents stale P materialization use.
    return journal.run(op, real_author, 'publish', payload(data), authorize, apply, reconcile)


documents.create_as = create


def install_membership_hook(route):
    original = route.dependant.call
    @wraps(original)
    def member(data):
        active()
        actor = groups._principal(data)  # Original token certification, never journal identity as authority.
        op = operation_id(route.path)
        group = data.group_id
        target = getattr(data, 'member_key', None) or getattr(data, 'requester_key', None) or actor
        def authorize():
            if groups._principal(data) != actor:
                raise HTTPException(403, 'research actor changed')
        def apply(sequence, saved):
            # Original join/invite/manager policy and actual canonical mutation.
            before = store.members(group)
            result = original(data)
            return {'response': result, 'before_members': len(before), 'target': target}
        def reconcile(sequence, saved, result):
            after = store.members(group)
            if target in after:
                backfill = store.backfill(group, target, sequence)
            else:
                backfill = {'removed_route_pointers': store.remove_route(group, target, sequence)}
            if result['before_members'] >= f.CUTOFF > len(after):
                # Same follow path, no alternate threshold-crossing machinery.
                for key in after:
                    store.backfill(group, key, sequence)
            current = p.observer.current.get()
            if current is not None:
                current['fanout_membership'] = backfill
        result = journal.run(op, actor, 'membership', payload(data), authorize, apply, reconcile)
        return result['response']
    route.dependant.call = member


MEMBERSHIP_PATHS = {'/v3/groups/join', '/v3/groups/leave', '/v3/groups/members/add',
    '/v3/groups/members/remove', '/v3/groups/accept-invite', '/v3/groups/requests/join/approve'}
installed = []
for route in p.observer.app.routes:
    if getattr(route, 'path', None) in MEMBERSHIP_PATHS and 'POST' in (getattr(route, 'methods', None) or set()):
        install_membership_hook(route)
        installed.append(route.path)
if not {'/v3/groups/join', '/v3/groups/leave'} <= set(installed):
    raise RuntimeError('real membership routes not installed; no synthetic substitute')


def generation():
    rows = p.run("SELECT table,name,rows,data_version FROM system.parts WHERE database='web10' AND active AND table IN "
        "('documents','doc_groups','group_members','group_contracts','app_contracts','user_blacklist','group_blacklist',"
        "'user_group_sharing','group_hidden_docs','banned_users') ORDER BY table,name")
    for row in rows:
        row['rows'], row['data_version'] = str(row['rows']), str(row['data_version'])
    return hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()


def candidate(compiled, group, after, limit):
    tree = sqlglot.parse_one(compiled, read='clickhouse')
    tree.set('qualify', None)
    tree.set('order', sqlglot.parse_one('SELECT 1 ORDER BY p.created_at DESC', read='clickhouse').args['order'])
    return p.serve.candidate_sql(tree.sql(dialect='clickhouse'), group, after, limit)


def compile_query(*args, **kwargs):
    active()
    compiled = p._compile(*args, **kwargs)  # Existing caller has already resolved live service grants.
    current = p.observer.current.get()
    if current is None:
        return compiled
    readable = args[1] if len(args) > 1 else kwargs['readable_groups_by_service']
    reader = kwargs.get('member_key', args[2] if len(args) > 2 else 'anon')
    tree = sqlglot.parse_one(compiled, read='clickhouse')
    is_main = 'profile_body' in {item.alias_or_name for item in tree.expressions} and bool(tree.args.get('joins'))
    with journal.lock:
        fresh = generation() == p.counts['canonical_generation']
        if reader != p.profile['reader'] or not fresh:
            # Safe canonical fallback is not a generation-guard bypass: it uses no
            # uncertified satellites at all, and its full cost/error is measured.
            current['fanout'] = {'path': 'canonical_fallback', 'reason': 'unbuilt_reader' if fresh else 'uncertified_generation'}
            return compiled
        if not is_main:
            return p.compile_query(*args, **kwargs)
        if tree.args.get('qualify') is None:
            # No silent rewrite of ordinary SQL. Only the labelled new contract.
            return compiled
        service = tree.args['from_'].this.name
        scope = p.scope_for('main', reader, readable)
        size = int(tree.args['limit'].expression.this)
        selected = readable[service]
        lanes = build['group_members']
        if set(selected) - set(lanes):
            raise ValueError('unbuilt source classification')
        small = [group for group in selected if lanes[group] < f.CUTOFF]
        large = [group for group in selected if lanes[group] >= f.CUTOFF]
        cache = p.run(f.cache_sql(reader, small)) if MODE == 'F_DOCUMENT_STREAM_V1' and small else []
        sources = (['__small__'] if cache else []) + (large if cache else selected)
        columns = []
        def fetch(source, after, limit):
            if source != '__small__':
                return p.run(candidate(compiled, source, after, limit))
            rows = [row for row in cache if after is None or f.key(row) > f.key(after)]
            if rows:
                return rows[:limit]
            # Cache is a window, not history. Continue small sources after its tail.
            queries = [candidate(compiled, group, after, limit) for group in small]
            sql = 'SELECT * FROM (' + ' UNION ALL '.join('(' + query + ')' for query in queries) + ') '
            sql += 'ORDER BY created_ms DESC,doc_id DESC,author_key DESC,group_id LIMIT ' + str(limit)
            return p.run(sql)
        def resolve(pointers):
            nonlocal columns
            profiles = p.run('SELECT author_key,doc_id FROM strings WHERE owner_key IN ('
                + p.serve.literals([row['author_key'] for row in pointers]) + ") AND field_name='service:profile'")
            sql = p.serve.main_sql(compiled, pointers, [(r['author_key'], r['doc_id']) for r in profiles], scope)
            columns, values = p._execute(sql, settings={'max_execution_time': 10})
            rows = [dict(zip(columns, row)) for row in values]
            for row in rows:
                row['created_ms'] = p.serve.created_ms(row['created_at'])
            return rows
        rows = f.merge_page(sources, size, fetch, resolve)
        if generation() != p.counts['canonical_generation']:
            raise ValueError('canonical generation changed during bounded read')
        if not columns:
            raise ValueError('empty result schema not established')
        pending.set((current['request_id'], columns, [tuple(row[column] for column in columns) for row in rows]))
        current['fanout'] = {'path': MODE, 'canonical_body_reads': True, 'small_groups': len(small), 'seek_groups': len(large)}
        return MARKER


execute = p.ch.execute_query


def execute_query(sql, settings=None):
    if sql != MARKER:
        return execute(sql, settings=settings)
    value = pending.get()
    pending.set(None)
    current = p.observer.current.get()
    if value is None or current is None or value[0] != current['request_id']:
        raise ValueError('missing request-private canonical result')
    return value[1], value[2]


p.observer.original_compile = compile_query
p.ch.execute_query = execute_query
stop_trim = threading.Event()


def trim_loop():
    while not stop_trim.wait(60):
        try:
            active()
            journal.trim_batch(store.trim)
        except Exception:
            log.exception('[arm-f] background trim failed; logical read cap remains enforced')


threading.Thread(target=trim_loop, daemon=True).start()


async def application(scope, receive, send):
    active()
    headers = dict(scope.get('headers', []))
    supplied = headers.get(b'x-fanout-operation', b'').decode('ascii', errors='ignore')
    try:
        identity = str(uuid.UUID(supplied)) if supplied else uuid.uuid4().hex
    except ValueError:
        raise HTTPException(400, 'invalid research operation id') from None
    token = context.set({'operation_id': identity})
    result_token = pending.set(None)
    try:
        return await p.application(scope, receive, send)
    finally:
        pending.reset(result_token)
        context.reset(token)
