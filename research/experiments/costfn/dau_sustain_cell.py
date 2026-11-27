"""Admitted research-only indexed cell with scoped, journaled publication."""

from contextvars import ContextVar
from functools import lru_cache
import hashlib
import json
import os
from pathlib import Path

from fastapi import HTTPException
from starlette.responses import JSONResponse
import sqlglot
from sqlglot import exp

import arm_f_infrastructure as infrastructure
from arm_satellite_sql import literal as q
import dau_sustain_cell_policy as policy
from dau_sustain_candidate import cached_candidate
from dau_sustain_compiled_cache import memoize_sql
from dau_sustain_scope_proof import checked_route
from dau_serving_bundle import worker_route
import engagement_composition_api as composition
import engagement_tally_queries as tallies


e = composition.e
f, p = e.f, e.p
bundle = json.loads(Path(os.environ['DAU_CELL_BUNDLE']).read_bytes())
proof, writers = bundle['scope_proof'], bundle['writers']
allowed = policy.validate(f.admission, proof, writers)
if (bundle['host_id'] != p.host or bundle['task_id'] != f.admission['costfn_task_id']
        or proof['binding']['copy_hash'] != e.proof['parts_sha256']
        or proof['binding']['canonical_generation'] != p.counts['canonical_generation']
        or f.generation() != p.counts['canonical_generation']
        or {group for row in proof['routes'].values() for group in row['groups']} - set(f.build['group_members'])):
    raise RuntimeError('DAU cell does not match certified canonical source, scopes and fanout classification')


def authority_parts():
    # Only the two canonical publication tables may append. A create through
    # this cell cannot change grants, existing docs or selected Following links.
    tables = sorted(set(infrastructure.CANONICAL_TABLES) - {'documents', 'doc_groups'})
    rows = p.run("SELECT table,name,rows,data_version FROM system.parts WHERE database='web10' AND active AND table IN ("
        + ','.join(map(q, tables)) + ') ORDER BY table,name')
    return hashlib.sha256(json.dumps(rows, sort_keys=True, default=str).encode()).hexdigest()


authority = authority_parts()
composition.tally.receipt['parts_sha256'] = proof['parts_sha256']
ordinary_compile = p.compile_query
ordinary_publish = f.documents.create_as
inside_publication = ContextVar('dau_authorized_publication', default=False)
render_tallied_main = memoize_sql(tallies.main)


@lru_cache(maxsize=192)
def followup_shape(compiled):
    tree = sqlglot.parse_one(compiled, read='clickhouse')
    source = tree.args.get('from_')
    service = source.this.name if source and isinstance(source.this, exp.Table) else None
    if service in ('reactions', 'comments') and any(list(x.find_all(exp.AggFunc)) for x in tree.expressions):
        return service, tuple(e.queries.literal_targets(tree))
    return None


@memoize_sql
def render_followup(compiled, service, route, ids, uniform):
    return tallies.stored(sqlglot.parse_one(compiled, read='clickhouse'), service, route, ids, uniform=uniform)


def certify(reader):
    if reader not in proof['routes']:
        return False, 'unbuilt_reader'
    current = p.observer.current.get()
    fresh = authority_parts() == authority
    if current is not None:
        current['dau_authority_parts_match'] = fresh
    return fresh, 'uncertified_authority'


def scope_for(label, reader, readable):
    packet = proof['routes'].get(reader, {}).get('routes', {}).get(label)
    if not packet:
        raise ValueError('missing certified DAU scope')
    sample = next(iter(packet.values()))['verified_ids']
    return next(iter(checked_route(proof, reader, label, readable, sample).values()))


def main(compiled, pointers, profiles, scope):
    current = p.observer.current.get()
    actual = next(row for row in reversed(current['fanout_scopes']) if row['is_main'])
    routing = checked_route(proof, actual['reader'], 'main', actual['readable'], [row['doc_id'] for row in pointers])
    current['engagement_tally_scopes'] = sorted(set(routing.values()))
    return render_tallied_main(compiled, pointers, profiles, scope, routing, uniform=e.uniform, table=e.table)


def compile_query(*args, **kwargs):
    compiled = p._compile(*args, **kwargs)
    shape = followup_shape(compiled)
    if shape is None:
        return ordinary_compile(*args, **kwargs)  # Canonical prepare subreads retain the existing compiler.
    service, ids = shape
    reader = kwargs.get('member_key', args[2] if len(args) > 2 else 'anon')
    readable = args[1] if len(args) > 1 else kwargs['readable_groups_by_service']
    route = checked_route(proof, reader, service, readable, ids)[service]
    p.observer.current.get()['engagement_tally_scopes'] = [route]
    return render_followup(compiled, service, route, ids, e.uniform)


def publish(request, data, real_author, client_id, **kwargs):
    context = f.context.get()
    try:
        payload = f.payload(data)
        doc = policy.publication(bundle['run_id'], real_author, allowed, payload,
            (context or {}).get('operation_id'), has_origin=bool(request.headers.get('origin')), delegated=bool(client_id))
        slot = int(payload['body']['text'].removeprefix('dau sustain '))
        if slot >= bundle['writer_slot_cap'] or writers['actors'][slot % len(writers['actors'])]['reader'] != real_author:
            raise ValueError('publication does not match the frozen writer rotation')
        # Check by doc ID (not just author) because attachments are keyed by ID.
        current = p.observer.current.get() or {}
        result = f.original_query('SELECT doc_id FROM documents WHERE doc_id=' + q(doc) + ' LIMIT 1',
            settings={'log_comment': 'F_WRITE:' + current['request_id']})
        if result.result_rows:
            raise ValueError('publication would reuse a canonical attachment identity')
    except ValueError as error:
        raise HTTPException(403, str(error)) from error
    # Original current token/group authorization, exact_target check, journal,
    # native create and fanout/index reconciliation all remain in effect.
    return ordinary_publish(request, data, real_author, client_id, **{**kwargs, 'exact_targets': True})


f.read_certificate = certify
f.candidate = cached_candidate(f.candidate)
e.use_uniform_copy = lambda: e.uniform and not inside_publication.get()
p._compile = memoize_sql(p._compile)
e.uniform_sql = memoize_sql(e.uniform_sql)
p.scope_for = scope_for
p.serve.main_sql = main
p.compile_query = compile_query
f.documents.create_as = publish

observe_utilization = None
if f.admission.get('dau_calibration_utilization') is True:
    from dau_calibration_diagnostics import api_observer

    f.observation.FIELDS += ('phases_ms', 'unattributed_handler_ms')
    from dau_serving_bundle import local_worker_port

    observe_utilization = api_observer(f._observation_root, p.ch._get_client, port=local_worker_port())


async def application(scope, receive, send):
    if scope['type'] == 'http':
        method, path = scope['method'], scope['path']
        if not worker_route(os.environ.get('DAU_WORKER_ROLE'), method, path):
            return await JSONResponse({'detail': 'route is outside this admitted DAU worker'}, status_code=403)(scope, receive, send)
        if observe_utilization is not None:
            observe_utilization()
        if method == 'POST' and path == '/v3/create':
            token = inside_publication.set(True)
            try:
                return await f.application(scope, receive, send)
            finally:
                inside_publication.reset(token)
    if scope['type'] == 'lifespan' and os.environ.get('DAU_BUNDLE_ACTIVE') == '1':
        import anyio.to_thread
        limiter = anyio.to_thread.current_default_thread_limiter()
        limiter.total_tokens = int(os.environ['DAU_THREAD_TOKENS'])
        if os.environ['DAU_WORKER_ROLE'] == 'read':
            # Read workers install all serving/auth hooks at import. Only the
            # publisher runs node startup DDL and background write workers.
            for event in ('startup', 'shutdown'):
                message = await receive()
                if message['type'] != 'lifespan.' + event:
                    raise RuntimeError('unexpected read-worker lifespan event')
                await send({'type': 'lifespan.' + event + '.complete'})
            return
    return await composition.application(scope, receive, send)
