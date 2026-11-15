"""Own-host Config F query ledger, separate from the subordinate P baseline.

Reuse only the verified restore transport/envelope, never pretend F SQL is a
no-fanout P operation. No provisioning or import-time engine work.
"""
from datetime import UTC, datetime
import hashlib
import json
import time
import uuid

import arm_satellite_runtime as p
import restore_realism as restore


def admitted(operation, host, now=None):
    now = now or datetime.now(UTC)
    start, deadline = (datetime.fromisoformat(operation[name]) for name in ('approved_utc', 'deadline_utc'))
    if (operation.get('configuration') != 'F' or operation.get('approved_by') != 'Jacob'
            or operation.get('droplet_id') != host or operation.get('dataset_id') != p.arm_t.DATASET
            or operation.get('budget_usd') != 2 or operation.get('watchdog_verified') is not True
            or operation.get('cutoff') != 2000 or operation.get('T7_admitted') is not False
            or operation.get('sort_order_arm_admitted') is not False
            or (deadline - start).total_seconds() != 14400 or not start <= now < deadline):
        raise ValueError('current exact isolated F approval required, not an old P lease')
    return deadline


class Session(p.Session):
    def __init__(self, root):
        # Checks actual DO metadata, source-bound frozen restore and subordinate P
        # setup identity. All F operations below use the separate parent admission.
        super().__init__(root)
        self.operation = json.loads((self.root / 'admission.json').read_bytes())
        self.deadline = admitted(self.operation, self.host_id)
        self.ledger = self.root / 'evidence/f-query-ledger.jsonl'

    def query(self, label, sql, *, measured=False, setup_seconds=600, settings=None):
        admitted(self.operation, self.host_id)
        if self.stopped or (self.root / 'F.stop').exists() or (self.root / 'fanout-state/F.stop').exists():
            raise ValueError('F arm stopped; no further cell')
        remaining = int((self.deadline - datetime.now(UTC)).total_seconds()) - 180
        if remaining < 30:
            raise ValueError('original cleanup margin exhausted')
        budget = min(10 if measured else setup_seconds, remaining)
        query_id = 'fanout-f-' + uuid.uuid4().hex
        self.record(dict(phase='start', configuration='F', label=label, query_id=query_id,
            measured=measured, utc=datetime.now(UTC).isoformat(), deadline_seconds=budget,
            sql_sha256=hashlib.sha256(sql.encode()).hexdigest()))
        print('[arm-f] native start', label, query_id, flush=True)
        begin = time.monotonic()
        args = ['--max_memory_usage=23622320128', '--max_threads=4']
        if not measured:
            args += ['--max_bytes_before_external_sort=2147483648', '--max_bytes_before_external_group_by=2147483648',
                     '--max_temporary_data_on_disk_size_for_query=107374182400', '--join_algorithm=full_sorting_merge']
        if settings:
            ceilings = dict(max_memory_usage=22 * 1024**3, max_rows_to_read=8_000_000,
                max_bytes_to_read=2 * 1024**3, max_result_rows=1_000_000,
                max_bytes_before_external_sort=2 * 1024**3, max_bytes_before_external_group_by=2 * 1024**3)
            if any(key not in ceilings or type(value) is not int or not 0 < value <= ceilings[key]
                   for key, value in settings.items()):
                raise ValueError('only tighter bounded setup settings are allowed')
            args = [arg for arg in args if arg.split('=', 1)[0].removeprefix('--') not in settings]
            args += ['--' + key + '=' + str(value) for key, value in settings.items()]
            args += ['--read_overflow_mode=throw', '--result_overflow_mode=throw']
        try:
            raw = restore.command(self.compose, self.env, 'exec', '-T', 'clickhouse', 'clickhouse-client',
                '--user', 'web10', '--password', 'web10', '--database', 'web10', '--query_id', query_id,
                '--max_execution_time', str(budget), *args, '--query', sql, timeout=budget + 20)
            self.record(dict(phase='finish', label=label, query_id=query_id, success=True,
                             elapsed_seconds=time.monotonic() - begin))
            return raw.decode().strip(), query_id
        except Exception as error:
            self.record(dict(phase='finish', label=label, query_id=query_id, success=False,
                failure_class=type(error).__name__, elapsed_seconds=time.monotonic() - begin))
            raise

    def native(self, query_id, *, measured=False):
        if not query_id.startswith('fanout-f-') or not query_id[9:].isalnum():
            raise ValueError('exact F query identity required')
        self.query('flush_native', 'SYSTEM FLUSH LOGS')
        rows, _ = self.rows('read_native', 'SELECT query_id,toString(type) AS type,query_duration_ms,read_rows,'
            "read_bytes,written_rows,written_bytes,memory_usage,exception_code FROM system.query_log WHERE query_id='"
            + query_id + "' AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing')")
        if len(rows) != 1:
            raise ValueError('missing/ambiguous F native receipt')
        if measured and int(rows[0]['read_rows']) > 10_000_000:
            self.record(dict(phase='STOP', reason='single read over10M', native=rows[0]))
            (self.root / 'F.stop').write_text('single_read_over_10M\n')
            self.stopped = True
            raise ValueError('single measured read over10M; arm stops')
        return rows[0]
