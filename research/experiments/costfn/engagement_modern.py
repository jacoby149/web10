"""Explicit26.x engagement admission; historical F/P defaults stay frozen."""
from datetime import UTC, datetime
import json
from pathlib import Path
import time
import uuid

import arm_f_runtime
import arm_t
import engagement_limits as limits
import restore_realism as restore
import engagement_window as window

ENGINE = '26.10.4.207'
IMAGE = 'ghcr.io/jacoby149/base-clickhouse:26.10.4.207@sha256:4f491abc44d9f4a1747c033c35ddd5bc385521305d85ca8251ba0824ff597035'
DIRECTIVE = 'Jacob Hoffman 2026-11-17 engagement full-store A-D candidate-scoped attachments'
COMPLETION_DIRECTIVE = 'Jacob Hoffman 2026-11-18 engagement fix-and-finish; initial K20 setup exception'


def admitted(value, host, now=None):
    deadline = arm_f_runtime.admitted(value, host, now=now)
    completion = (value.get('purpose') == 'ENGAGEMENT_COMPLETION_ONLY'
        and (value.get('run_directive') == COMPLETION_DIRECTIVE or (
            value.get('run_directive') == limits.RUN and limits.enabled(value)))
        and value.get('engagement_completion_admitted') is True
        and value.get('initial_k20_count_build_admitted') is True
        and value.get('stages_b_d_admitted') is False)
    tally = (value.get('purpose') == 'ENGAGEMENT_TALLY_WIRING' and value.get('run_directive') == limits.TALLY_RUN
        and limits.enabled(value) and value.get('tally_wiring_admitted') is True
        and value.get('stages_b_d_admitted') is False)
    from engagement_composition import DIRECTIVE as composition_directive
    composition = (value.get('purpose') == 'ENGAGEMENT_ALL_FIXES'
        and value.get('run_directive') == composition_directive and limits.enabled(value)
        and value.get('composition_admitted') is True and value.get('tally_wiring_admitted') is True
        and value.get('initial_k20_count_build_admitted') is True
        and value.get('engagement_completion_admitted') is True and value.get('stages_b_d_admitted') is False)
    DAU_DIRECTIVE = 'Jacob Hoffman 2026-11-25 sustained-DAU contract-rate load test'
    dau = (value.get('purpose') == 'DAU_SUSTAINED_CONTRACT_RATE'
        and value.get('dau_sustain_directive') == DAU_DIRECTIVE
        and value.get('run_directive') == composition_directive and limits.enabled(value)
        and value.get('composition_admitted') is True and value.get('tally_wiring_admitted') is True
        and value.get('initial_k20_count_build_admitted') is True
        and value.get('engagement_completion_admitted') is True and value.get('stages_b_d_admitted') is False)
    if (value.get('engagement_engine') != ENGINE or value.get('engagement_directive') != DIRECTIVE
            or (value.get('purpose') != 'ENGAGEMENT_FULL_STORE_A_D' and not completion and not tally
                and not composition and not dau)
            or value.get('engagement_ref_admitted') is not True):
        raise ValueError('explicit26.10.4.207 full-store engagement admission required')
    return deadline


class Session(arm_f_runtime.Session):
    def __init__(self, root):
        super().__init__(root)
        self.deadline = admitted(self.operation, self.host_id)

    def rows(self, label, sql, **kwargs):
        rows, query_id = super().rows(label, sql, **kwargs)
        if label == 'canonical_generation':
            # The real F/P serving drivers hash these UInt64 fields as decimal
            # strings.26.x JSON emits numbers; encode the SAME parts identically.
            rows = [{**row, 'rows': str(int(row['rows'])), 'data_version': str(int(row['data_version']))}
                for row in rows]
        return rows, query_id

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
        if measured and not limits.enabled(self.operation) and int(value['read_rows']) > 10_000_000:
            raise ValueError('modern cell read over10M; preserve it and stop this cell')
        return value

    def query(self, label, sql, *, measured=False, setup_seconds=600, settings=None):
        admitted(self.operation, self.host_id)
        rebuild_setup = (not measured and label == 'events_layout_rebuild' and window.enabled(self.operation))
        if self.operation.get('tally_wiring_admitted') is True and not rebuild_setup:
            setup_seconds = min(setup_seconds, 600)
        current_policy = limits.enabled(self.operation)
        budget = min((600 if current_policy else 10) if measured else setup_seconds, remaining(self.operation))
        if budget < 1:
            raise TimeoutError('modern query reached original cleanup margin')
        query_id = 'fanout-f-' + uuid.uuid4().hex
        self.record(dict(phase='start', label=label, query_id=query_id, measured=measured,
            sql_sha256=__import__('hashlib').sha256(sql.encode()).hexdigest(), deadline_seconds=budget))
        args = ['--max_memory_usage=' + str(setup_memory_cap(self.operation)), '--max_threads=4']
        if measured and not current_policy:
            args += ['--max_rows_to_read=10000000', '--read_overflow_mode=throw']
        if not measured:
            args += ['--max_bytes_before_external_sort=2147483648', '--max_bytes_before_external_group_by=2147483648',
                '--max_temporary_data_on_disk_size_for_query=107374182400', '--join_algorithm=full_sorting_merge']
        if settings:
            settings = dict(settings)
            if current_policy:
                settings.pop('max_rows_to_read', None)
                settings.pop('max_bytes_to_read', None)
                settings.pop('max_result_rows', None)
            ceilings = dict(max_memory_usage=setup_memory_cap(self.operation), max_rows_to_read=10_000_000,
                max_bytes_to_read=2 * 1024**3, max_result_rows=1_000_000,
                max_bytes_before_external_sort=2 * 1024**3, max_bytes_before_external_group_by=2 * 1024**3)
            if any(key not in ceilings or type(value) is not int or not 0 < value <= ceilings[key] for key, value in settings.items()):
                raise ValueError('only tighter explicit modern query bounds allowed')
            args = [arg for arg in args if arg.split('=', 1)[0].removeprefix('--') not in settings]
            args += ['--' + key + '=' + str(value) for key, value in settings.items()]
        if current_policy:
            args += ['--max_rows_to_read=0', '--max_rows_to_read_leaf=0', '--max_bytes_to_read=0',
                '--max_bytes_to_read_leaf=0', '--max_result_rows=0']
        started = time.perf_counter()
        try:
            statement_kind = ('write' if sql.lstrip().upper().startswith(('ALTER ', 'OPTIMIZE ', 'INSERT ', 'CREATE '))
                else 'read')
            command = ['exec', '-T', 'clickhouse', 'clickhouse-client',
                '--user', 'web10', '--password', 'web10', '--database', 'web10', '--query_id', query_id,
                '--max_execution_time', str(budget), '--receive_timeout', str(budget + 10),
                *args]
            if (current_policy or (not measured and self.operation.get('engagement_completion_admitted') is True
                    and statement_kind == 'write')):
                from engagement_native import await_query
                raw = await_query(self, [*self.compose, *command], query_id, budget,
                    sql=sql, statement_kind=statement_kind)
            else:
                raw = restore.command(self.compose, self.env, *command, data=sql.encode(), timeout=budget + 20)
            self.record(dict(phase='finish', label=label, query_id=query_id, success=True,
                elapsed_seconds=time.perf_counter() - started))
            return raw.decode().strip(), query_id
        except Exception as error:
            from arm_f_failure import details, persist, save
            path = persist(self.root, error, operation=label, query_id=query_id)
            value = json.loads(path.read_bytes())
            try:
                restore.command(self.compose, self.env, 'exec', '-T', 'clickhouse', 'clickhouse-client',
                    '--user', 'web10', '--password', 'web10', data=b'SYSTEM FLUSH LOGS', timeout=5)
                text = restore.command(self.compose, self.env, 'exec', '-T', 'clickhouse', 'clickhouse-client',
                    '--user', 'web10', '--password', 'web10', '--max_execution_time=2',
                    data=("SELECT query_id,toString(type) AS type,exception_code,exception,query_duration_ms,read_rows,read_bytes "
                    "FROM system.query_log WHERE query_id='" + query_id + "' AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing') FORMAT JSON").encode(), timeout=5)
                rows = json.loads(text)['data']
                value['native'] = dict(status='COLLECTED' if rows else 'NO_QUERY_LOG_ROWS', rows=rows)
            except Exception as diagnostic:
                value['native'] = dict(status='COLLECTION_FAILED', **details(diagnostic))
            save(path, value)
            self.record(dict(phase='finish', label=label, query_id=query_id, success=False,
                elapsed_seconds=time.perf_counter() - started, **details(error)))
            raise


def setup_memory_cap(operation):
    """The banked 32/28/22 GiB frame pins 22 GiB per query. The sized DAU host
    declares its own envelope and its setup statements take that server cap
    instead; the measured single-read comparison frame is unchanged (its
    admissions never carry dau_envelope)."""
    envelope = operation.get('dau_envelope')
    if type(envelope) is dict and type(envelope.get('server_bytes')) is int and envelope['server_bytes'] > 0:
        return envelope['server_bytes']
    return 22 * 1024**3


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
    if window.task(value):
        return float('inf')
    return int((datetime.fromisoformat(value['deadline_utc']) - datetime.now(UTC)).total_seconds()) - 180
