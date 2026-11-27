"""Persistent, private host-to-ClickHouse transport for untimed DAU scope setup."""

from contextlib import contextmanager
import hashlib
from ipaddress import IPv4Address, IPv4Network
import json
import time
from uuid import uuid4

from arm_satellite_sql import literal as q
import engagement_modern as modern
import restore_realism as restore


class ScopeTransport:
    def __init__(self, session, client):
        self.session, self.client = session, client
        self.operation, self.host_id, self.ledger = session.operation, session.host_id, session.ledger

    def execute(self, label, statement, *, rows):
        modern.admitted(self.operation, self.host_id)
        identity = 'fanout-f-' + uuid4().hex
        cap = int(min(600, modern.remaining(self.operation)))
        if cap < 1:
            raise TimeoutError('owned setup margin exhausted')
        settings = dict(query_id=identity, max_execution_time=cap, max_threads=4,
            max_memory_usage=modern.setup_memory_cap(self.operation), max_rows_to_read=0,
            max_rows_to_read_leaf=0, max_bytes_to_read=0, max_bytes_to_read_leaf=0, max_result_rows=0,
            max_bytes_before_external_sort=2 * 1024**3, max_bytes_before_external_group_by=2 * 1024**3,
            max_temporary_data_on_disk_size_for_query=100 * 1024**3, join_algorithm='full_sorting_merge')
        self.session.record(dict(phase='start', label=label, query_id=identity, measured=False,
            sql_sha256=hashlib.sha256(statement.encode()).hexdigest(), deadline_seconds=cap,
            transport='owned-private-http-setup'))
        started = time.perf_counter()
        try:
            if rows:
                result = self.client.query(statement, settings=settings)
                if result.query_id != identity:
                    raise ValueError('direct setup read returned a different native identity')
                value = [dict(zip(result.column_names, row, strict=True)) for row in result.result_rows]
            else:
                value = self.client.command(statement, settings=settings)
        except Exception as error:
            self.session.record(dict(phase='finish', label=label, query_id=identity, success=False,
                failure_class=type(error).__name__, elapsed_seconds=time.perf_counter() - started))
            raise
        self.session.record(dict(phase='finish', label=label, query_id=identity, success=True,
            elapsed_seconds=time.perf_counter() - started))
        return (value if rows else str(value)), identity

    def query(self, label, statement):
        return self.execute(label, statement, rows=False)

    def rows(self, label, statement):
        return self.execute(label, statement, rows=True)

    def native(self, identity):
        self.query('dau_scope_flush', 'SYSTEM FLUSH LOGS')
        rows, _ = self.rows('dau_scope_exact_finish', 'SELECT query_id,toString(type) AS type,query_duration_ms,read_rows,'
            'read_bytes,written_rows,written_bytes,memory_usage,exception_code FROM system.query_log WHERE query_id='
            + q(identity) + " AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
        if len(rows) != 1 or rows[0]['query_id'] != identity:
            raise ValueError('exact native DAU setup finish missing or ambiguous')
        return rows[0]


@contextmanager
def connect(session):
    """Never publish a service port or route a credential outside the owner bridge."""
    from clickhouse_connect import get_client
    from urllib3.util import Timeout

    if (session.operation.get('purpose') != 'DAU_SUSTAINED_CONTRACT_RATE'
            or session.operation.get('dau_overnight') is not True):
        raise ValueError('direct preparation transport requires the owned DAU admission')
    modern.admitted(session.operation, session.host_id)
    project = 'web10-costfn-frozen-satellite-dau-' + str(session.host_id)
    identifiers = restore.command(session.compose, session.env, 'ps', '-q', 'clickhouse').decode().split()
    if len(identifiers) != 1:
        raise ValueError('one exact owned engine required')
    info = json.loads(restore.command(['docker', 'inspect', identifiers[0]], session.env))[0]
    labels = info['Config']['Labels']
    ips = [row['IPAddress'] for row in info['NetworkSettings']['Networks'].values() if row['IPAddress']]
    private = any(IPv4Address(ips[0]) in IPv4Network(cidr) for cidr in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')) if len(ips) == 1 else False
    if labels.get('com.docker.compose.project') != project or labels.get('com.docker.compose.service') != 'clickhouse' or not private:
        raise ValueError('DAU direct preparation refuses an unknown engine or external address')
    client = get_client(host=ips[0], port=8123, username='web10', password='web10', database='web10',
        send_receive_timeout=660, query_retries=0)
    try:
        client._backend.timeout = Timeout(connect=10, read=None)
        client._backend.http_retries = 0
        transport = ScopeTransport(session, client)
        rows, identity = transport.rows('dau_scope_transport_probe', 'SELECT version() AS version')
        if rows != [{'version': modern.ENGINE}] or int(transport.native(identity)['exception_code']):
            raise ValueError('direct preparation engine version or exact native identity differs')
        yield transport
    finally:
        client.close()
