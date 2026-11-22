"""Independent views cell: real original endpoint/read gate, no F/cache dependency."""
import contextvars
import inspect
import json
import os
from pathlib import Path


import arm_f_observe as observations
from arm_f_client import dispatch
import engagement_events as events
import engagement_modern as modern
import engagement_observe
import arm_t
import research_api as observer
from app.v3.services import clickhouse as ch

ROOT = Path(os.environ['ENGAGEMENT_CELL_STATE'])
approval = json.loads((ROOT / 'admission.json').read_bytes())
host = arm_t.digitalocean_id()
modern.admitted(approval, host)
MODE = os.environ['ENGAGEMENT_READ_MODE']
if MODE not in ('raw', 'aggregate'):
    raise RuntimeError('explicit independent views mode required')
original = dispatch(ch._get_client, 'query', ch.client.query)
signature = inspect.signature(original)
if original('SELECT version()').result_rows != [(modern.ENGINE,)]:
    raise RuntimeError('independent views engine mismatch')
observed = engagement_observe.install(original, observer, os.environ['FANOUT_STAGE_DIR'])
inside = contextvars.ContextVar('engagement_original_views_helper', default=False)
old_views = ch.content_event_views_for_docs
allowed_paths = {'/v3/login', '/v3/contentViews'}


def rewrite_sql(sql, parameters):
    return sql, parameters


def query(sql=None, *args, **kwargs):
    if sql is None:
        sql = kwargs.pop('query')
    bound = signature.bind_partial(sql, *args, **kwargs)
    current = observer.current.get()
    if inside.get():
        params = bound.arguments.get('parameters') or {}
        ids = [value for key, value in params.items() if key.startswith('d') and key[1:].isdigit()]
        groups = [value for key, value in params.items() if key.startswith('g') and key[1:].isdigit()]
        sql = events.read(ids, params['svc'], groups, aggregate=MODE == 'aggregate')
        bound.arguments['query'], bound.arguments['parameters'] = sql, None
        bound.arguments['query'], bound.arguments['parameters'] = rewrite_sql(sql, None)
        result = observed(*bound.args, **bound.kwargs)
        values = [[row[0], int(row[1]), int(row[2])] for row in result.result_rows]
        if current is not None:
            current['fanout_view_checks'] = [dict(query_id=result.query_id, method=MODE, values=values)]
        return result
    bound.arguments['query'], bound.arguments['parameters'] = rewrite_sql(sql, bound.arguments.get('parameters'))
    return observed(*bound.args, **bound.kwargs)


def views(*args, **kwargs):
    token = inside.set(True)
    try:
        return old_views(*args, **kwargs)
    finally:
        inside.reset(token)


ch.client.query = query
ch.content_event_views_for_docs = views


async def application(scope, receive, send):
    modern.admitted(approval, host)
    if scope['type'] == 'http' and scope.get('method') == 'POST' and scope.get('path') not in allowed_paths:
        from starlette.responses import JSONResponse
        return await JSONResponse({'detail': 'independent read-only views cell'}, status_code=403)(scope, receive, send)
    async def marked_send(message):
        if message['type'] == 'http.response.start':
            observations.request(ROOT, observer.current.get())
        await send(message)
    return await observer.application(scope, receive, marked_send)
