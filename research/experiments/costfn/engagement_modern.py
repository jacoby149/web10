"""Explicit26.x engagement admission; historical F/P defaults stay frozen."""
from datetime import UTC, datetime
import json
from pathlib import Path

import arm_f_runtime
import arm_t
import restore_realism as restore

ENGINE = '26.10.4.207'
IMAGE = 'ghcr.io/jacoby149/base-clickhouse:26.10.4.207@sha256:4f491abc44d9f4a1747c033c35ddd5bc385521305d85ca8251ba0824ff597035'
DIRECTIVE = 'Jacob Hoffman 2026-11-17 engagement full-store A-D candidate-scoped attachments'


def admitted(value, host, now=None):
    deadline = arm_f_runtime.admitted(value, host, now=now)
    if (value.get('engagement_engine') != ENGINE or value.get('engagement_directive') != DIRECTIVE
            or value.get('purpose') != 'ENGAGEMENT_FULL_STORE_A_D' or value.get('engagement_ref_admitted') is not True):
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
