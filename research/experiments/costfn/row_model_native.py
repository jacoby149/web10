"""Typed native driver and exact-query receipts for the isolated row-model cell.

No engine, credential or network activity on import. The worker supplies an
already configured pinned driver after host/admission/envelope verification.
Native result blocks stay typed; JSON is only the private receipt format.

Receipt scope: Driver.submit statements only. Caller-created client bootstrap
(server/session/timezone/protocol negotiation) is outside that scope. Explicit
insert-context metadata and receipt observations use distinct true query IDs
and ROW_MODEL_AUX tags, outside data receipts; no data ID is reused for them.
"""
import hashlib
from pathlib import Path
import re
import sys
import time
import uuid

import sqlglot
from sqlglot import exp

from arm_f_failure import details
from arm_f_native import save
from arm_satellite_sql import literal as q
import engagement_limits as limits
from row_model_fence import TABLES


class IdentityMismatch(ValueError):
    def __init__(self, expected, actual):
        self.actual = str(actual)
        super().__init__('row-model response identity differs: expected ' + expected + ', returned ' + self.actual)


class Driver:
    def __init__(self, client, root, guard):
        self.client, self.root, self.guard = client, Path(root), guard
        self.root.mkdir(mode=0o700, parents=True, exist_ok=False)
        self.records = []
        self.pending = {}
        self.stage, self.variant = 'setup', None
        self.role, self.fence_ms = 'assembly', 0.0

    def fence_call(self, operation):
        previous, self.role = self.role, 'generation_fence'
        started = time.perf_counter()
        try:
            return operation()
        finally:
            self.fence_ms += (time.perf_counter() - started) * 1000
            self.role = previous

    def settings(self, query_id, *, observation=False):
        self.guard()
        # HttpClient recognizes query_id here and puts it in URL params, not headers.
        return {**limits.settings(), 'query_id': query_id, 'max_execution_time': 2 if observation else 600,
            'max_threads': 4, 'log_comment': ('ROW_MODEL_AUX:' if observation else 'ROW_MODEL:') + query_id,
            'log_queries': 1, 'log_query_settings': 1,
            'max_bytes_before_external_sort': 2 * 1024**3,
            'max_bytes_before_external_group_by': 2 * 1024**3}

    def auxiliary_settings(self, *, metadata=False):
        identifier = ('row-model-metadata-' if metadata else 'row-model-observe-') + uuid.uuid4().hex
        settings = self.settings(identifier, observation=not metadata)
        settings['log_comment'] = 'ROW_MODEL_AUX:' + identifier
        print('[row-model] native auxiliary', 'metadata' if metadata else 'observation', identifier, flush=True)
        return settings

    @staticmethod
    def check_response_identity(result, settings):
        actual = getattr(result, 'query_id', None)
        # Body-returning command results may omit identity; native exact-ID proof
        # remains mandatory. A known mismatch must never poll a different ID.
        if actual and actual != settings['query_id']:
            raise IdentityMismatch(settings['query_id'], actual)

    def observe(self, query_id):
        """Wait for the ORIGINAL native operation, never resubmit lost work."""
        while True:
            self.guard()
            self.client.command('SYSTEM FLUSH LOGS', settings=self.auxiliary_settings())
            sql = ("SELECT query_id,toString(type) AS type,exception_code,exception,read_rows,read_bytes,query_duration_ms,"
                "written_rows,written_bytes,memory_usage,Settings['max_execution_time'] AS native_max_execution_time,"
                "Settings['max_rows_to_read'] AS native_max_rows_to_read,"
                "Settings['max_bytes_to_read'] AS native_max_bytes_to_read,"
                "Settings['max_memory_usage'] AS native_max_memory_usage "
                'FROM system.query_log WHERE query_id=' + q(query_id)
                + " AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
            result = self.client.query(sql, settings=self.auxiliary_settings())
            rows = [dict(zip(result.column_names, row)) for row in result.result_rows]
            if rows:
                if len(rows) != 1:
                    raise ValueError('ambiguous original row-model native completion')
                if rows[0]['query_id'] != query_id:
                    raise ValueError('native row-model receipt identity differs from original operation')
                return rows[0]
            time.sleep(2)  # No fixed client/poll cap; the bound lease and native deadline govern.

    def collect_pending(self, records=None):
        records = list(self.pending.values()) if records is None else records
        pending = [r for r in records if 'native' not in r and not r.get('identity_mismatch')]
        if not pending:
            return
        # Batch successful receipt collection: never force one query-log flush
        # per tiny value seek during a full-family build.
        self.client.command('SYSTEM FLUSH LOGS', settings=self.auxiliary_settings())
        ids = ','.join(q(r['query_id']) for r in pending)
        earliest = min(r['submitted_epoch'] for r in pending) - 2
        statement = ("SELECT query_id,toString(type) AS type,exception_code,exception,read_rows,read_bytes,query_duration_ms,"
            "written_rows,written_bytes,memory_usage,Settings['max_execution_time'] AS native_max_execution_time,"
            "Settings['max_rows_to_read'] AS native_max_rows_to_read,Settings['max_bytes_to_read'] AS native_max_bytes_to_read,"
            "Settings['max_memory_usage'] AS native_max_memory_usage FROM system.query_log WHERE "
            'event_date>=toDate(toDateTime(' + str(earliest) + ')) AND event_time>=toDateTime(' + str(earliest) + ') AND query_id IN (' + ids
            + ") AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
        result = self.client.query(statement, settings=self.auxiliary_settings())
        native = {}
        wanted = {record['query_id'] for record in pending}
        for row in result.result_rows:
            value = dict(zip(result.column_names, row))
            if value['query_id'] not in wanted:
                raise ValueError('unexpected native identity in row-model receipt batch')
            if value['query_id'] in native:
                raise ValueError('duplicate native completion in row-model receipt batch')
            native[value['query_id']] = value
        for record in pending:
            if record['query_id'] in native:
                record['native'] = native[record['query_id']]
                if record['outcome'] == 'CLIENT_COMPLETE':
                    record['outcome'] = 'NATIVE_COMPLETE' if not int(record['native']['exception_code']) else 'INCOMPLETE'
                self.pending.pop(record['query_id'], None)
                save(self.root / (record['query_id'] + '.json'), record)
            else:
                self.collect(record)  # Observe original exact ID without a fixed polling cap.

    def check_treatment(self, statement):
        if self.variant != 'rows':
            return
        tree = sqlglot.parse_one(statement, read='clickhouse')
        tables = list(tree.find_all(exp.Table))
        if not isinstance(tree, exp.Select) or any(node.catalog or not (
                node.name in TABLES and node.db in ('', 'web10')
                or node.name in ('parts', 'tables') and node.db == 'system') for node in tables):
            raise ValueError('typed assembly attempted a canonical/unknown-table fallback')
        for node in tree.find_all(exp.Func):
            name = node.name if isinstance(node, exp.Anonymous) else node.sql_name()
            if ('JSON' in name.upper() or isinstance(node, exp.Cast)
                    or re.match(r'^to(?:U?Int|Float|Decimal|Date|String|FixedString|UUID|Bool)', name, re.I)
                    or isinstance(node, exp.Unhex) and not isinstance(node.this, exp.Literal)):
                raise ValueError('typed assembly attempted read-time JSON extraction or value casting')

    def submit(self, statement, operation):
        self.guard()
        self.check_treatment(statement)
        query_id = 'row-model-' + uuid.uuid4().hex
        digest = hashlib.sha256(statement.encode()).hexdigest()
        (self.root / (digest + '.sql')).write_text(statement)
        record = dict(query_id=query_id, sql_sha256=digest, stage=self.stage, variant=self.variant, role=self.role,
            submitted_epoch=int(time.time()),
            submitted_once=True, outcome='RUNNING')
        self.records.append(record)
        self.pending[query_id] = record
        save(self.root / (query_id + '.json'), record)
        print('[row-model] native submit', self.stage, query_id, flush=True)
        started = time.perf_counter()
        try:
            value = operation(self.settings(query_id))
            record['outcome'] = 'CLIENT_COMPLETE'
            return value
        except BaseException as error:
            record.update(outcome='INCOMPLETE', **details(error))
            if isinstance(error, IdentityMismatch):
                record.update(identity_mismatch=True, returned_query_id=error.actual)
                self.pending.pop(query_id, None)
            save(self.root / (query_id + '.json'), record)
            raise
        finally:
            record['client_ms'] = (time.perf_counter() - started) * 1000
            # Successful measured work is observed AFTER the sample clock stops.
            # Failed transport settles the original operation before another cell.
            if record['outcome'] == 'INCOMPLETE' and not record.get('identity_mismatch'):
                self.collect(record)
            save(self.root / (query_id + '.json'), record)
            print('[row-model] native client', query_id, record['outcome'], flush=True)

    def collect(self, record):
        if record.get('identity_mismatch'):
            return  # Proven different response ID: preserve failure, never poll/remap it.
        try:
            record['native'] = self.observe(record['query_id'])
            if record['outcome'] == 'CLIENT_COMPLETE':
                record['outcome'] = 'NATIVE_COMPLETE' if not int(record['native']['exception_code']) else 'INCOMPLETE'
            self.pending.pop(record['query_id'], None)
        except Exception as error:
            record['collection_failure'] = details(error)
        save(self.root / (record['query_id'] + '.json'), record)

    def query(self, statement):
        def execute(settings):
            result = self.client.query(statement, settings=settings,
                query_tz='UTC', tz_mode='aware')
            # Consume typed result blocks inside the submitted operation. A
            # late body/decoder failure is not a successful client completion.
            rows = [dict(zip(result.column_names, row)) for row in result.result_rows]
            self.check_response_identity(result, settings)
            return rows
        return self.submit(statement, execute)

    def command(self, statement):
        def execute(settings):
            result = self.client.command(statement, settings=settings)
            self.check_response_identity(result, settings)
            return result
        return self.submit(statement, execute)

    def insert(self, table, rows, columns):
        # SQL identity is metadata only; never copy inserted private payloads into logs.
        statement = 'INSERT INTO ' + table + ' (' + ','.join(columns) + ') FORMAT Native'
        self.check_treatment(statement)  # Deny a typed-read write before even metadata I/O.
        # The pinned client's implicit DESCRIBE inherits context settings. Give
        # metadata its own true AUX ID, then replace it for the actual INSERT.
        context = self.client.create_insert_context(table, column_names=columns,
            settings=self.auxiliary_settings(metadata=True))
        def execute(settings):
            context.settings = settings
            context.transport_settings = None
            result = self.client.insert(table, rows, context=context)
            self.check_response_identity(result, settings)
            return result
        return self.submit(statement, execute)

    def sample(self, name, variant, phase, operation):
        before = len(self.records)
        self.stage, self.variant = name + ':' + phase, variant
        fence_before = self.fence_ms
        started = time.perf_counter()
        try:
            actual = operation()
        finally:
            elapsed = (time.perf_counter() - started) * 1000
            self.stage, self.variant = 'setup', None
            records = self.records[before:]
            collection_failure = None
            try:
                self.collect_pending(records)
            except Exception as error:
                collection_failure = details(error)
            stages = {}
            for role in ('assembly', 'generation_fence'):
                selected = [r for r in records if r['role'] == role]
                stages[role] = {key: sum(r.get('native', {}).get(key, 0) for r in selected)
                    for key in ('read_rows', 'read_bytes', 'query_duration_ms')}
            fence_ms = self.fence_ms - fence_before
            sample = dict(elapsed_ms=max(0, elapsed - fence_ms), inclusive_elapsed_ms=elapsed, fence_elapsed_ms=fence_ms,
                read_rows=stages['assembly']['read_rows'], read_bytes=stages['assembly']['read_bytes'], stages=stages,
                inclusive_read_rows=sum(r.get('native', {}).get('read_rows', 0) for r in records),
                inclusive_read_bytes=sum(r.get('native', {}).get('read_bytes', 0) for r in records),
                statements=[dict(query_id=r['query_id'], sql_sha256=r['sql_sha256'], role=r['role'], native=r.get('native')) for r in records],
                accounting='assembly and measured generation-fence stages separate; inclusive totals retained; ROW_MODEL_AUX separate',
                collection_failure=collection_failure,
                operation_failed=sys.exception() is not None)
            save(self.root / (name + '-' + phase + '-' + variant + '.json'), sample)
        self.require_native(records)
        if collection_failure is not None:
            raise ValueError('row-model native collection failed; inspect the preserved partial sample')
        return actual, sample

    @staticmethod
    def require_native(records):
        if not records or any(r.get('outcome') != 'NATIVE_COMPLETE' or 'native' not in r
                or r['native'].get('query_id') != r['query_id']
                or int(r['native']['exception_code']) or str(r['native']['native_max_execution_time']) != '600'
                or str(r['native']['native_max_rows_to_read']) != '0'
                or str(r['native']['native_max_bytes_to_read']) != '0'
                or str(r['native']['native_max_memory_usage']) != str(22 * 1024**3)
                for r in records):
            raise ValueError('missing/failed native600s statement evidence; preserve partial actuals, never claim parity')
