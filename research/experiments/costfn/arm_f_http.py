"""Real HTTP workloads and exact native attribution; no saved user credentials."""
import asyncio
from datetime import UTC, datetime
import json
from pathlib import Path
import time
import uuid

import httpx

import arm_f
from arm_f_native import save
from arm_satellite_sql import literal as q
import core_feed
import engagement_window as window


class HTTP:
    def __init__(self, root, session, output):
        self.root, self.session, self.output = Path(root), session, Path(output)
        self.output.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.manifest = json.loads((self.root / 'input/manifest.json').read_bytes())
        policy = getattr(session, 'operation', {}).get('measurement_limits_directive') == 'Jacob Hoffman 2026-11-18 archaic execution limits removed'
        self.client = httpx.AsyncClient(base_url='http://127.0.0.1:6098', timeout=None if policy else 65, trust_env=False,
            limits=httpx.Limits(max_connections=2048, max_keepalive_connections=256))
        self.records = []
        self.capture = core_feed.wire()
        self.capture['requests'][0]['payload']['sql'] = arm_f.document_contract(self.capture['requests'][0]['payload']['sql'])

    async def close(self):
        await self.client.aclose()

    async def post(self, path, body, *, origin=None, operation=None, allow=(), setup_group=False):
        options = {}
        if setup_group:
            if path != '/v3/groups/create':
                raise ValueError('long setup timeout is only for fixture group creation')
            remaining = (float('inf') if window.task(getattr(self.session, 'operation', {})) else
                (self.session.deadline - datetime.now(UTC)).total_seconds() - 180)
            if remaining <= 0:
                raise TimeoutError('fixture group setup reached original cleanup margin')
            options['timeout'] = min(600, remaining)
        request_id = uuid.uuid4().hex
        headers = {'X-Research-ID': request_id}
        if origin:
            headers['Origin'] = origin
        if operation:
            headers['X-Fanout-Operation'] = operation
        started, begin = datetime.now(UTC).isoformat(), time.perf_counter()
        row = dict(request_id=request_id, path=path, started_utc=started, status=None, operation_id=operation)
        if setup_group:
            row.update(setup_only=True, request_timeout_seconds=options['timeout'])
        try:
            response = await self.client.post(path, json=body, headers=headers, **options)
            row.update(status=response.status_code, elapsed_ms=(time.perf_counter() - begin) * 1000,
                       stop=response.headers.get('x-arm-p-stop') == '1', path_mode=response.headers.get('x-fanout-path'))
            if response.headers.get('x-research-id') != request_id or row['stop']:
                raise ValueError('HTTP native/correlation stop')
            if response.status_code not in allow:
                response.raise_for_status()
            return response.json(), row
        except BaseException as error:
            identifiers = {key: body[key] for key in ('group_id', 'doc_id', 'groups', 'username') if key in body}
            __import__('arm_f_failure').persist(self.output, error, operation=path,
                request_id=request_id, operation_id=operation, **identifiers)
            row.update(__import__('arm_f_failure').details(error))
            raise
        finally:
            row['elapsed_ms'] = (time.perf_counter() - begin) * 1000
            row['ended_utc'] = datetime.now(UTC).isoformat()
            self.records.append(row)
            # No HTTP body, JWT, response or frame locals; private sanitized diagnostics only.
            with (self.output / 'requests.jsonl').open('a') as stream:
                stream.write(json.dumps(row) + '\n')

    async def login(self, username, password=None):
        response, _ = await self.post('/v3/login', {'username': username,
            'password': password or self.manifest['password'], 'site': 'costfn'})
        return response['token']

    async def consent(self, token, origin):
        await self.post('/v3/app-contracts/add', {'token': token, 'allowed_origin': origin,
            'permissions': {service: ['readAll', 'create', 'updateOwn', 'deleteOwn']
                            for service in ('posts', 'reactions', 'comments', 'profile')}})

    async def sequence(self, token, groups, *, phase='measured'):
        started = time.perf_counter()
        first = self.capture['requests'][0]
        main, record = await self.post(first['path'], core_feed.payload(first['payload'], token, groups),
                                       origin=self.manifest['origin'])
        rows = main.get('rows', [])
        if not rows:
            raise ValueError('empty full response is not a valid sequence')
        ids = [row['doc_id'] for row in rows]
        policy = getattr(self.session, 'operation', {}).get('measurement_limits_directive') == 'Jacob Hoffman 2026-11-18 archaic execution limits removed'
        followups = await asyncio.gather(*(self.post(item['path'],
            core_feed.payload(item['payload'], token, groups, ids), origin=self.manifest['origin'])
            for item in self.capture['requests'][1:]), return_exceptions=policy)
        # A failed sibling must not close the client under a still-running native
        # follow-up. All submitted statements finish before this cell reports it.
        if policy:
            for item in followups:
                if isinstance(item, BaseException):
                    raise item
        elapsed = (time.perf_counter() - started) * 1000
        return dict(phase=phase, elapsed_ms=elapsed,
            request_ids=[record['request_id'], *[item[1]['request_id'] for item in followups]],
            rows=rows, followups=[item[0] for item in followups], path_mode=record.get('path_mode'))

    def observation(self, request_id):
        path = self.root / 'fanout-state/requests' / (request_id + '.jsonl')
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        if len(rows) != 1 or rows[0].get('request_id') != request_id:
            raise ValueError('missing/ambiguous request observation')
        if any(rows[0].get(key) for key in ('arm_p_stop', 'arm_p_native_failure', 'delivery_failures')):
            raise ValueError('request contains a hidden native/delivery failure')
        return rows[0]

    def native(self, request_ids, label):
        ids, stages = [], []
        for request in request_ids:
            path = self.root / 'F-stages' / (request + '.jsonl')
            if not path.is_file():
                raise ValueError('missing request-bound native stages')
            rows = [json.loads(line) for line in path.read_text().splitlines()]
            if not rows or any(row.get('success') is not True or row.get('request_id') != request for row in rows):
                raise ValueError('failed/incomplete native stages')
            ids.extend(row['query_id'] for row in rows)
            stages.extend(rows)
        if len(ids) != len(set(ids)):
            raise ValueError('duplicate native attribution')
        self.session.query(label + '_flush', 'SYSTEM FLUSH LOGS')
        rows, _ = self.session.rows(label + '_native', 'SELECT query_id,read_rows,read_bytes,query_duration_ms,'
            'memory_usage,exception_code,written_rows,written_bytes,log_comment FROM system.query_log WHERE query_id IN ('
            + ','.join(q(value) for value in ids) + ") AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
        if {row['query_id'] for row in rows} != set(ids) or len(rows) != len(ids):
            raise ValueError('missing/duplicate actual native query results')
        policy = getattr(self.session, 'operation', {}).get('measurement_limits_directive') == 'Jacob Hoffman 2026-11-18 archaic execution limits removed'
        if any(int(row['exception_code']) or (not policy and int(row['read_rows']) > 10_000_000) for row in rows):
            raise ValueError('native failure/over10M stop')
        save(self.output / (label + '-stages.json'), stages)
        if (self.root / 'banked-P.tar.gz').is_file():
            from arm_f_report import report
            report(self.root, self.output / (label + '-P-cited-F-observed.json'), rows, stages)
        return rows
