"""Explicit26.x engagement admission; historical F/P defaults stay frozen."""
from datetime import UTC, datetime
import json
from pathlib import Path
import time
import uuid

import arm_f_runtime
import arm_t
import restore_realism as restore

ENGINE = '26.10.4.207'
IMAGE = 'ghcr.io/jacoby149/base-clickhouse:26.10.4.207@sha256:4f491abc44d9f4a1747c033c35ddd5bc385521305d85ca8251ba0824ff597035'
DIRECTIVE = 'Jacob Hoffman 2026-11-17 engagement full-store A-D candidate-scoped attachments'
COMPLETION_DIRECTIVE = 'Jacob Hoffman 2026-11-18 engagement fix-and-finish; initial K20 setup exception'


def admitted(value, host, now=None):
    deadline = arm_f_runtime.admitted(value, host, now=now)
    completion = (value.get('purpose') == 'ENGAGEMENT_COMPLETION_ONLY'
        and value.get('run_directive') == COMPLETION_DIRECTIVE
        and value.get('engagement_completion_admitted') is True
        and value.get('initial_k20_count_build_admitted') is True
        and value.get('stages_b_d_admitted') is False)
    if (value.get('engagement_engine') != ENGINE or value.get('engagement_directive') != DIRECTIVE
            or (value.get('purpose') != 'ENGAGEMENT_FULL_STORE_A_D' and not completion)
            or value.get('engagement_ref_admitted') is not True):
        raise ValueError('explicit26.10.4.207 full-store engagement admission required')
    return deadline


class Session(arm_f_runtime.Session):
    def __init__(self, root):
        super().__init__(root)
        self.deadline = admitted(self.operation, self.host_id)

    def verify_envelope(self):
        container = restore.command(self.compose, self.env, 'ps', '-q', 'clickhouse').decode().strip()
        if not container or '\n' in container:
            raise ValueError('exactly one owned modern engine required')
        memory = int(restore.command(['docker'], self.env, 'inspect', '--format', '{{.HostConfig.Memory}}', container))
        version, _ = self.query('modern_engine', 'SELECT version()')
        cap, _ = self.query('modern_server_cap', "SELECT value FROM system.server_settings WHERE name='max_server_memory_usage'")
        if version != ENGINE or memory != 28 * 1024**3 or int(cap) != 22 * 1024**3:
            raise ValueError('live modern engine/envelope differs from explicit admission')
        return dict(engine=version, container_bytes=memory, server_bytes=int(cap))

    def native(self, query_id, *, measured=False):
        value = super().native(query_id, measured=False)
        if measured and int(value['read_rows']) > 10_000_000:
            raise ValueError('modern cell read over10M; preserve it and stop this cell')
        return value

    def query(self, label, sql, *, measured=False, setup_seconds=600, settings=None):
        admitted(self.operation, self.host_id)
        budget = min(10 if measured else setup_seconds, remaining(self.operation))
        if budget < 1:
            raise TimeoutError('modern query reached original cleanup margin')
        query_id = 'fanout-f-' + uuid.uuid4().hex
        self.record(dict(phase='start', label=label, query_id=query_id, measured=measured,
            sql_sha256=__import__('hashlib').sha256(sql.encode()).hexdigest(), deadline_seconds=budget))
        args = ['--max_memory_usage=' + str(22 * 1024**3), '--max_threads=4']
        if measured:
            args += ['--max_rows_to_read=10000000', '--read_overflow_mode=throw']
        else:
            args += ['--max_bytes_before_external_sort=2147483648', '--max_bytes_before_external_group_by=2147483648',
                '--max_temporary_data_on_disk_size_for_query=107374182400', '--join_algorithm=full_sorting_merge']
        if settings:
            ceilings = dict(max_memory_usage=22 * 1024**3, max_rows_to_read=10_000_000,
                max_bytes_to_read=2 * 1024**3, max_result_rows=1_000_000,
                max_bytes_before_external_sort=2 * 1024**3, max_bytes_before_external_group_by=2 * 1024**3)
            if any(key not in ceilings or type(value) is not int or not 0 < value <= ceilings[key] for key, value in settings.items()):
                raise ValueError('only tighter explicit modern query bounds allowed')
            args = [arg for arg in args if arg.split('=', 1)[0].removeprefix('--') not in settings]
            args += ['--' + key + '=' + str(value) for key, value in settings.items()]
        started = time.perf_counter()
        try:
            command = ['exec', '-T', 'clickhouse', 'clickhouse-client',
                '--user', 'web10', '--password', 'web10', '--database', 'web10', '--query_id', query_id,
                '--max_execution_time', str(budget), '--receive_timeout', str(budget + 10),
                *args, '--query', sql]
            if (not measured and self.operation.get('engagement_completion_admitted') is True
                    and sql.lstrip().upper().startswith(('ALTER ', 'OPTIMIZE ', 'INSERT ', 'CREATE '))):
                from engagement_native import await_query
                raw = await_query(self, [*self.compose, *command], query_id, budget)
            else:
                raw = restore.command(self.compose, self.env, *command, timeout=budget + 20)
            self.record(dict(phase='finish', label=label, query_id=query_id, success=True,
                elapsed_seconds=time.perf_counter() - started))
            return raw.decode().strip(), query_id
        except Exception as error:
            from arm_f_failure import details, persist, save
            path = persist(self.root, error, operation=label, query_id=query_id)
            value = json.loads(path.read_bytes())
            try:
                restore.command(self.compose, self.env, 'exec', '-T', 'clickhouse', 'clickhouse-client',
                    '--user', 'web10', '--password', 'web10', '--query', 'SYSTEM FLUSH LOGS', timeout=5)
                text = restore.command(self.compose, self.env, 'exec', '-T', 'clickhouse', 'clickhouse-client',
                    '--user', 'web10', '--password', 'web10', '--max_execution_time=2', '--query',
                    "SELECT query_id,toString(type) AS type,exception_code,exception,query_duration_ms,read_rows,read_bytes "
                    "FROM system.query_log WHERE query_id='" + query_id + "' AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing') FORMAT JSON", timeout=5)
                rows = json.loads(text)['data']
                value['native'] = dict(status='COLLECTED' if rows else 'NO_QUERY_LOG_ROWS', rows=rows)
            except Exception as diagnostic:
                value['native'] = dict(status='COLLECTION_FAILED', **details(diagnostic))
            save(path, value)
            self.record(dict(phase='finish', label=label, query_id=query_id, success=False,
                elapsed_seconds=time.perf_counter() - started, **details(error)))
            raise


def install_sessions():
    """Process-local injection into unchanged constructors, never production."""
    import arm_f_environment
    import arm_f_fixtures
    import arm_f_infrastructure
    import arm_f_native
    import arm_f_reads
    import arm_satellite_runtime
    for module in (arm_f_environment, arm_f_fixtures, arm_f_infrastructure, arm_f_native, arm_f_reads, arm_satellite_runtime):
        module.Session = Session


def operation(root):
    root = Path(root)
    value = json.loads((root / 'admission.json').read_bytes())
    admitted(value, arm_t.digitalocean_id())
    from arm_f_run import operation as parent_operation
    return parent_operation(root)


def remaining(value):
    return int((datetime.fromisoformat(value['deadline_utc']) - datetime.now(UTC)).total_seconds()) - 180
