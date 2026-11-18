"""Opt-in complete-read treatment over the original F/P authorization/prepare.

No production module imports this. Ordinary API implementations stay unchanged;
the copy is used only after its exact parity certificate and current-part fence.
"""
import hashlib
import json
import os
from pathlib import Path

import sqlglot
from sqlglot import exp

import engagement_events as events
import engagement_modern as modern
import engagement_observe
import engagement_queries as queries

DIRECTORY = os.environ.pop('FANOUT_STAGE_DIR')
import arm_f_api as f  # noqa: E402 -- disable only the old observer before importing the unchanged adapter

p = f.p
modern.admitted(f.admission, p.host)
f.observation.FIELDS += ('engagement_mode', 'engagement_count_dispatch', 'engagement_copy_checked')
MODE = os.environ['ENGAGEMENT_READ_MODE']
if MODE not in ('baseline', 'projection', 'aggregate', 'uniform'):
    raise RuntimeError('explicit engagement cell mode required')
uniform = MODE == 'uniform'
aggregate_views = MODE == 'aggregate' or (uniform and os.environ.get('ENGAGEMENT_VIEWS_AGGREGATED') == '1')
table = 'engagement_documents' if uniform else 'documents'

version = p._query('SELECT version()', settings={'max_execution_time': 2}).result_rows
if version != [(modern.ENGINE,)]:
    raise RuntimeError('actual API engine does not match modern admission')

if uniform:
    proof = json.loads(Path(os.environ['ENGAGEMENT_COPY_PROOF']).read_bytes())
    if proof.get('parity') != 'PASS' or proof.get('batches') != list(range(32)):
        raise RuntimeError('exact complete copy parity required before uniform serving')

old_main = p.serve.main_sql
old_compile = p.compile_query
old_checked = f.checked_query
raw_query = p._query
p._query = engagement_observe.install(raw_query, p.observer, DIRECTORY)


def copy_fence(current):
    if not uniform or current.get('engagement_copy_checked'):
        return
    sql = "SELECT name,toString(rows) AS rows,toString(data_version) AS data_version FROM system.parts WHERE database='web10' AND active AND table='engagement_documents' ORDER BY name"
    result = f.original_query(sql, settings={'log_comment': 'F_READ:' + current['request_id']})
    rows = [dict(zip(result.column_names, row)) for row in result.result_rows]
    if hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest() != proof['parts_sha256']:
        raise RuntimeError('migrated copy changed after exact parity certification')
    current['engagement_copy_checked'] = True


def main_sql(compiled, pointers, profile_pairs, scope):
    if MODE == 'baseline':
        return old_main(compiled, pointers, profile_pairs, scope)
    return queries.main(compiled, pointers, profile_pairs, scope, uniform=uniform, table=table)


def compile_query(*args, **kwargs):
    if MODE == 'baseline':
        return old_compile(*args, **kwargs)
    compiled = p._compile(*args, **kwargs)
    tree = sqlglot.parse_one(compiled, read='clickhouse')
    source = tree.args.get('from_')
    service = source.this.name if source and isinstance(source.this, exp.Table) else None
    if service not in ('reactions', 'comments') or not any(list(item.find_all(exp.AggFunc)) for item in tree.expressions):
        return old_compile(*args, **kwargs)
    readable = args[1] if len(args) > 1 else kwargs['readable_groups_by_service']
    reader = kwargs.get('member_key', args[2] if len(args) > 2 else 'anon')
    p.scope_for(service, reader, readable)  # Retain exact current credential/scope checks.
    current = p.observer.current.get()
    if current is not None:
        current['engagement_count_dispatch'] = dict(mode=MODE, service=service, table=table,
            canonical_policy_retained=True, attachment_candidates=True)
    return queries.followup(compiled, service, uniform=uniform, table=table)


def checked_query(sql=None, *args, **kwargs):
    if sql is None:
        sql = kwargs.pop('query')
    current = p.observer.current.get()
    if current is not None:
        current['engagement_mode'] = MODE
        copy_fence(current)
    bound = p._signature.bind_partial(sql, *args, **kwargs)
    params = bound.arguments.get('parameters') or {}
    if p._views.get():
        ids = [value for key, value in params.items() if key.startswith('d') and key[1:].isdigit()]
        groups = [value for key, value in params.items() if key.startswith('g') and key[1:].isdigit()]
        bound.arguments['query'] = events.read(ids, params['svc'], groups, aggregate=aggregate_views)
        # Existing P rewrite consumes the original bound-ID metadata.
        result = f.original_query(*bound.args, **bound.kwargs)
        values = [[row[0], int(row[1]), int(row[2])] for row in result.result_rows]
        if current is not None:
            current.setdefault('fanout_view_checks', []).append(dict(query_id=result.query_id,
                method=('aggregate' if aggregate_views else 'raw') + '; independent quiet canonical check after HTTP', values=values))
        return result
    if uniform and current is not None and current.get('request_id') != 'unlabelled':
        tree = sqlglot.parse_one(p.serve.bound_sql(sql, params) if params else sql, read='clickhouse')
        for node in tree.find_all(exp.Table):
            if node.name == 'documents':
                node.set('this', exp.to_identifier(table))
        bound.arguments['query'] = tree.sql(dialect='clickhouse')
        bound.arguments['parameters'] = params
        sql, args, kwargs = bound.args[0], bound.args[1:], bound.kwargs
    return old_checked(sql, *args, **kwargs)


p.serve.main_sql = main_sql
p.compile_query = compile_query
f.checked_query = checked_query


async def application(scope, receive, send):
    modern.admitted(f.admission, p.host)
    if scope['type'] == 'http':
        path = scope.get('path', '')
        if scope.get('method') == 'POST' and path not in ('/v3/query', '/v3/read', '/v3/contentViews', '/v3/login'):
            from starlette.responses import JSONResponse
            return await JSONResponse({'detail': 'engagement serving cell is writer-fenced'}, status_code=403)(scope, receive, send)
    return await f.application(scope, receive, send)
