"""Explicit isolated F adapter. No production imports, endpoints or gate bypass.

Existing endpoint functions certify/authorize the real actor. A single private
coordinator journals and reconciles their actual effects. Old P remains intact.
"""
import contextvars
import asyncio
from datetime import UTC, datetime
from functools import wraps
import hashlib
import importlib
import json
import logging
import os
import re
from pathlib import Path
import threading
import uuid

from fastapi import HTTPException
import sqlglot

import arm_f as f
import arm_f_hooks
from arm_f_banked import ARCHIVE_SHA256 as BANKED_P_SHA256
import arm_f_observe as observation
import arm_f_views
import arm_f_faults
from arm_f_fence import Fence
import arm_f_online_rebuild
from arm_f_journal import Journal
from arm_f_store import Store
from arm_f_runtime import admitted
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
banked_comparator = (admission.get('scope') in ('F_GATES_ONLY', 'F_DEPLOY_REHEARSAL')
    and admission.get('banked_P_sha256') == BANKED_P_SHA256
    and build.get('Step0_receipt_sha256') == BANKED_P_SHA256 and build.get('P_Step0_T2') == 'CITED_PASS')
if (build.get('DDL_sha256') != hashlib.sha256(f.DDL.encode()).hexdigest()
        or build.get('droplet_id') != p.host or (build.get('P_Step0_T2') != 'PASS' and not banked_comparator)):
    raise RuntimeError('same-host source-bound F build after P Step0 required')
journal = Journal(ROOT / 'journal')
store = Store(p.ch.client, journal)
fence = Fence()
log = logging.getLogger('arm-f')
fatal = threading.Event()
context = contextvars.ContextVar('fanout_request', default=None)
startup_phase = contextvars.ContextVar('fanout_lifespan_startup_owner', default=None)
pending = contextvars.ContextVar('fanout_live_result', default=None)
MARKER = '/* Config F request-private canonical result */ SELECT 1'
MODE = os.environ.get('FANOUT_SERVING_MODE', 'F_DOCUMENT_STREAM_V1')
if MODE not in ('F_DOCUMENT_STREAM_V1', 'P_DOCUMENT_STREAM_V1'):
    raise RuntimeError('explicit separately labelled document contract required')

original_command = p.ch.client.command
original_insert = p.ch.client.insert


def command(sql, *args, **kwargs):
    active()
    settings = dict(kwargs.get('settings') or {})
    settings.update(max_execution_time=10, max_memory_usage=22 * 1024**3,
                    max_rows_to_read=10_000_000, read_overflow_mode='throw')
    current = p.observer.current.get()
    settings['log_comment'] = 'F_WRITE:' + (current['request_id'] if current else 'background')
    kwargs['settings'] = settings
    try:
        return original_command(sql, *args, **kwargs)
    except Exception as error:
        native_code = re.match(r'^Received ClickHouse exception, code: (\d+),', str(error))
        try:
            in_startup_task = startup_phase.get() is not None and startup_phase.get() is asyncio.current_task()
        except RuntimeError:  # Native commands in worker/background threads.
            in_startup_task = False
        schema_warning = (in_startup_task and native_code and int(native_code[1]) == 16
            and sql.lstrip().upper().startswith('CREATE TABLE IF NOT EXISTS '))
        if schema_warning:
            # Preserve the ordinary node's own handling of startup DDL errors.
            # Uncaught errors still fail ASGI startup/readiness. This context is
            # never enabled by a request/header, HTTP or background F operation.
            log.warning('[arm-f] lifespan schema warning code=16 class=%s sql_sha256=%s',
                type(error).__name__, hashlib.sha256(sql.encode()).hexdigest())
        else:
            fail('native_command_' + type(error).__name__)
        raise


def insert(*args, **kwargs):
    active()
    settings = dict(kwargs.get('settings') or {})
    current = p.observer.current.get()
    settings['log_comment'] = 'F_WRITE:' + (current['request_id'] if current else 'background')
    settings['max_memory_usage'] = 22 * 1024**3
    kwargs['settings'] = settings
    try:
        result = original_insert(*args, **kwargs)
        table = args[0] if args else kwargs.get('table')
        if table == 'fanout':
            rows = args[1] if len(args) > 1 else kwargs['data']
            observation.pointers(ROOT, current, table, rows, kwargs.get('column_names'))
        return result
    except Exception as error:
        fail('native_insert_' + type(error).__name__)
        raise


p.ch.client.command = command
p.ch.client.insert = insert
original_query = p.ch.client.query


def query(sql=None, *args, **kwargs):
    current = p.observer.current.get()
    if current and current.get('request_id') != 'unlabelled':
        settings = dict(kwargs.get('settings') or {})
        settings['log_comment'] = 'F_READ:' + current['request_id']
        kwargs['settings'] = settings
    if not current or current.get('request_id') == 'unlabelled' or not p._views.get():
        return original_query(sql, *args, **kwargs)
    if sql is None:
        sql = kwargs.pop('query')
    try:
        bound = p._signature.bind_partial(sql, *args, **kwargs)
        params = bound.arguments.get('parameters') or {}
        bound.arguments['query'] = arm_f_views.checked_sql(p.serve.bound_sql(sql, params))
        bound.arguments['parameters'] = None
        result = original_query(*bound.args, **bound.kwargs)
        values = arm_f_views.verify(result.result_rows)
    except Exception as error:
        fail('view_oracle_' + type(error).__name__)
        raise
    current.setdefault('fanout_view_checks', []).append({'query_id': result.query_id,
        'method': 'same-snapshot canonical sum/array-distinct', 'values': values})
    return result


p.ch.client.query = query


def active():
    admitted(admission, p.host)
    if fatal.is_set() or (ROOT / 'F.stop').exists() or not start <= datetime.now(UTC) < deadline:
        raise HTTPException(503, 'research admission closed')


def fail(reason):
    fatal.set()
    (ROOT / 'F.stop').write_text(reason + '\n')
    current = p.observer.current.get()
    if current is not None:
        current['arm_p_native_failure'] = reason


def operation_id(kind):
    current = context.get()
    if current is None:
        raise HTTPException(503, 'writes must enter the authorized research application')
    return current['operation_id'] + ':' + kind


def payload(data):
    return data.model_dump(mode='json', exclude={'token'})


original_create = documents.create_as


def mutation(function):
    @wraps(function)
    def call(*args, **kwargs):
        with fence.shared():
            active()
            return function(*args, **kwargs)
    return call


@mutation
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
        result = original_create(request, data, real_author, client_id, **call)
        arm_f_faults.check(ROOT, op, real_author, 'after_apply')
        return result
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
        arm_f_faults.check(ROOT, op, real_author, 'after_reconcile')
        # Canonical-generation mismatch now prevents stale P materialization use.
    try:
        return journal.run(op, real_author, 'publish', payload(data), authorize, apply, reconcile,
                           scope_keys=['group:' + group for group in data.groups or []] or ['author:' + real_author])
    except HTTPException:
        raise
    except Exception as error:
        fail('publish_' + type(error).__name__)
        raise


documents.create_as = create


def install_document_hook(route, kind):
    original = route.dependant.call
    @mutation
    @wraps(original)
    def mutate(request, data):
        active()
        if kind == 'attachment' and data.attached is None:
            return original(request, data)
        human = documents._user(data)
        op = operation_id(route.path)
        holder = {}
        with journal.lock:
            retry = journal.db.execute('SELECT 1 FROM intents WHERE operation_id=?', (op,)).fetchone() is not None
        def authorize():
            actor = documents._user(data)
            if actor != human:
                raise HTTPException(403, 'actor changed')
            author = data.author_as or human
            rows = store.rows('SELECT author_key,collection_name,deleted FROM (SELECT *,row_number() OVER '
                '(PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn FROM documents WHERE '
                'doc_id=' + q(data.doc_id) + ' AND author_key=' + q(author) + ') WHERE rn=1')
            if not rows:
                # Existing update-only posted_by compatibility, not journal authority.
                if kind != 'update' or data.author_as:
                    raise HTTPException(404, 'document not found')
                candidates = store.rows('SELECT author_key FROM documents WHERE doc_id=' + q(data.doc_id)
                    + ' AND posted_by=' + q(human) + ' AND deleted=0 ORDER BY updated_at DESC LIMIT 1')
                if not candidates:
                    raise HTTPException(404, 'document not found')
                author = candidates[0]['author_key']
                rows = store.rows('SELECT author_key,collection_name,deleted FROM (SELECT *,row_number() OVER '
                    '(PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn FROM documents WHERE '
                    'doc_id=' + q(data.doc_id) + ' AND author_key=' + q(author) + ') WHERE rn=1')
            if len(rows) != 1:
                raise HTTPException(404, 'document not found')
            operation = 'deleteOwn' if kind == 'delete' else 'updateOwn'
            if author != human:
                perms = p.ch.effective_role_perms(author, human, authenticated=True)
                if not p.ch.get_group(author) or not p.ch._effective_allows(perms, rows[0]['collection_name'], operation):
                    raise HTTPException(403, 'current delegated write authority required')
            documents._check_app_permission(request, human, rows[0]['collection_name'], operation, documents.client_id_of(data))
            holder.update(author=author, deleted=bool(rows[0]['deleted']))
        def apply(sequence, saved):
            if retry and kind == 'delete' and holder['deleted']:
                response = {'doc_id': data.doc_id, 'status': 'deleted'}
                before = []
            else:
                before = p.ch.get_doc_groups(data.doc_id)
                response = original(request, data)
            return {'response': response, 'before_groups': before}
        def reconcile(sequence, saved, result):
            if kind == 'delete' or (kind == 'attachment' and not data.attached):
                return  # Canonical tombstones/access are the synchronous read gate.
            rows = store.rows('SELECT author_key,doc_id,created_at,deleted FROM (SELECT *,row_number() OVER '
                '(PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn FROM documents WHERE '
                'doc_id=' + q(data.doc_id) + ' AND author_key=' + q(holder['author']) + ') WHERE rn=1')
            if len(rows) != 1 or rows[0]['deleted']:
                raise ValueError('current mutation target disappeared')
            after = p.ch.get_doc_groups(data.doc_id)
            for group in after:
                store.maintain_index(rows[0], group)
                if group not in result['before_groups']:
                    store.publish(rows[0], group, sequence)
        try:
            result = journal.run(op, human, kind, payload(data), authorize, apply, reconcile,
                scope_keys=['document:' + data.doc_id, 'group:' + getattr(data, 'group_id', '')]
                + ['group:' + group for group in getattr(data, 'groups', None) or []])
            return result['response']
        except HTTPException:
            raise
        except Exception as error:
            fail(kind + '_' + type(error).__name__)
            raise
    route.dependant.call = mutate


def install_membership_hook(route):
    original = route.dependant.call
    @mutation
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
        try:
            result = journal.run(op, actor, 'membership', payload(data), authorize, apply, reconcile,
                                 scope_keys=['group:' + group, 'reader:' + target])
        except HTTPException:
            raise
        except Exception as error:
            fail('membership_' + type(error).__name__)
            raise
        return result['response']
    route.dependant.call = member


hook_receipt = arm_f_hooks.install(p.observer.app, install_membership_hook, install_document_hook)
(ROOT / 'hook-install.json').write_text(json.dumps({**hook_receipt,
    'boot_id': os.environ.get('FANOUT_BOOT_ID'),
    'create_entry': 'documents.create_document -> documents.create_as -> original_create',
    'adapter_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'installer_sha256': hashlib.sha256(Path(arm_f_hooks.__file__).read_bytes()).hexdigest(),
    'production_source_modified': False}, indent=2))
print('[arm-f] real route hooks installed', len(hook_receipt['authorized_membership_routes']),
      len(hook_receipt['authorized_document_routes']), flush=True)


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
    current.setdefault('fanout_scopes', []).append({'reader': reader, 'readable': readable,
        'is_main': is_main, 'sql_sha256': hashlib.sha256(compiled.encode()).hexdigest()})
    # No global journal/reader lock across ClickHouse I/O. Immutable-receipt
    # generation is checked before/after; uncertified state takes canonical reads.
    fresh = generation() == p.counts['canonical_generation']
    if reader != p.profile['reader'] or not fresh:
        current['fanout'] = {'path': 'canonical_fallback', 'reason': 'unbuilt_reader' if fresh else 'uncertified_generation'}
        return compiled
    if not is_main:
        return p.compile_query(*args, **kwargs)
    if tree.args.get('qualify') is None:
        return compiled  # Never silently deduplicate an ordinary caller query.
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


def guarded_compile(*args, **kwargs):
    try:
        return compile_query(*args, **kwargs)
    except HTTPException:
        raise
    except Exception as error:
        unsafe = getattr(p.observer.safe_query, 'UnsafeQueryError', ())
        if unsafe and isinstance(error, unsafe):
            raise
        p.stop('F_compile_or_resolution_' + type(error).__name__)


p.observer.original_compile = guarded_compile
p.ch.execute_query = execute_query


def inventory():
    current = p.observer.current.get()
    if current and current.get('fanout', {}).get('path') == 'canonical_fallback':
        # Fallback must not quietly retain P's stale strings inventory hints.
        return p._original_inventory()
    return p.inventory()


p.ch.get_active_node_ads = inventory
if os.environ.get('FANOUT_STAGE_DIR'):
    # Same fixed-format native stage observation as Step0; does not replace the
    # F application, compiler, real auth gates or write coordinator.
    importlib.import_module('arm_f_profile_api')
stop_trim = threading.Event()


def trim_loop():
    while not stop_trim.wait(60):
        observation = {'request_id': uuid.uuid4().hex, 'path_kind': 'derived-background-trim'}
        token = p.observer.current.set(observation)
        try:
            active()
            with fence.shared():
                journal.trim_batch(store.trim)
        except Exception as error:
            fatal.set()
            (ROOT / 'F.stop').write_text('background_trim_' + type(error).__name__ + '\n')
            log.error('[arm-f] background trim failed class=%s; arm stops', type(error).__name__)
            break
        finally:
            p.observer.current.reset(token)
            folder = ROOT / 'background'
            folder.mkdir(exist_ok=True, mode=0o700)
            (folder / (observation['request_id'] + '.json')).write_text(json.dumps(observation))


threading.Thread(target=trim_loop, daemon=True).start()
rebuild_stop = arm_f_online_rebuild.start(ROOT, p, journal, fence, admission, active, fail)


async def application(scope, receive, send):
    phase_token = startup_phase.set(asyncio.current_task() if scope['type'] == 'lifespan' else None)
    async def phase_send(message):
        if message['type'] in ('lifespan.startup.complete', 'lifespan.startup.failed'):
            startup_phase.set(None)
        await send(message)
    try:
        return await request_application(scope, receive, phase_send)
    finally:
        startup_phase.reset(phase_token)


async def request_application(scope, receive, send):
    active()
    headers = dict(scope.get('headers', []))
    supplied = headers.get(b'x-fanout-operation', b'').decode('ascii', errors='ignore')
    try:
        identity = str(uuid.UUID(supplied)) if supplied else uuid.uuid4().hex
    except ValueError:
        raise HTTPException(400, 'invalid research operation id') from None
    token = context.set({'operation_id': identity})
    result_token = pending.set(None)
    async def marked_send(message):
        if message['type'] == 'http.response.start':
            current = p.observer.current.get()
            if dict(message.get('headers', [])).get(b'x-arm-p-stop') == b'1':
                fail('native_or_canonical_resolution_stop')
            observation.request(ROOT, current)
            path = (current or {}).get('fanout', {}).get('path')
            if path in ('canonical_fallback', 'F_DOCUMENT_STREAM_V1', 'P_DOCUMENT_STREAM_V1'):
                message = {**message, 'headers': [*message.get('headers', []), (b'x-fanout-path', path.encode())]}
        await send(message)
    try:
        return await p.application(scope, receive, marked_send)
    finally:
        pending.reset(result_token)
        context.reset(token)
