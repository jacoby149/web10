"""Recorded concurrency configuration for the isolated DAU utilization replay."""

import json
import os
from pathlib import Path
import resource
from contextvars import ContextVar


READ_PORTS = (6101, 6102, 6103, 6104)
READ_TOKENS = 5
WRITE_TOKENS = 4
ENGINE_THREADS = 1
ENGINE_CONCURRENCY = 40
MERGE_POOL = 8
ENGINE_NOFILE = 262144
DRIVER_NOFILE = 65536
POOL_KEEPALIVE = 16
READ_PATHS = ('/v3/query', '/v3/contentViews')
MERGE_THRESHOLDS = {
    'number_of_free_entries_in_pool_to_execute_mutation': 4,
    'number_of_free_entries_in_pool_to_execute_optimize_entire_partition': 4,
    'number_of_free_entries_in_pool_to_lower_max_size_of_merge': 8,
}
read_port = ContextVar('dau_read_port', default=None)


def enabled(approval):
    return (approval.get('purpose') == 'DAU_SUSTAINED_CONTRACT_RATE'
        and approval.get('dau_overnight') is True and approval.get('dau_calibration_utilization') is True)


def driver_limit():
    soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
    if hard != resource.RLIM_INFINITY and hard < DRIVER_NOFILE:
        raise ValueError('owned driver hard descriptor ceiling is below bundle requirement')
    if soft != resource.RLIM_INFINITY and soft < DRIVER_NOFILE:
        resource.setrlimit(resource.RLIMIT_NOFILE, (DRIVER_NOFILE, hard))
    return dict(soft=resource.getrlimit(resource.RLIMIT_NOFILE)[0], hard=hard)


def engine_xml():
    return f'''<clickhouse>
  <max_concurrent_queries>{ENGINE_CONCURRENCY}</max_concurrent_queries>
  <background_pool_size>{MERGE_POOL}</background_pool_size>
  <background_merges_mutations_concurrency_ratio>2</background_merges_mutations_concurrency_ratio>
  <merge_tree>
    <number_of_free_entries_in_pool_to_execute_mutation>4</number_of_free_entries_in_pool_to_execute_mutation>
    <number_of_free_entries_in_pool_to_execute_optimize_entire_partition>4</number_of_free_entries_in_pool_to_execute_optimize_entire_partition>
    <number_of_free_entries_in_pool_to_lower_max_size_of_merge>8</number_of_free_entries_in_pool_to_lower_max_size_of_merge>
  </merge_tree>
</clickhouse>
'''


def worker_layout():
    return [(80, 'write', WRITE_TOKENS), *[(number, 'read', READ_TOKENS) for number in range(81, 81 + len(READ_PORTS))]]


def write_public_config(path, text):
    path = Path(path)
    path.write_text(text)
    path.chmod(0o444)


def configure_engine(root, session):
    """Restart only the owned engine with the bundle; do not rebuild tables."""
    from arm_f_infrastructure import CANONICAL_TABLES
    from arm_f_native import save
    import engagement_certificates
    import restore_dataset
    import restore_realism as restore

    root = Path(root)
    engagement_certificates.verify(root)
    before = root / 'dau-serving-bundle-engine-before.json'
    if not before.exists():
        values, query_id = session.rows('dau_bundle_before_server_settings', "SELECT name,value FROM system.server_settings WHERE name IN "
            "('max_concurrent_queries','background_pool_size','background_merges_mutations_concurrency_ratio')")
        save(before, dict(rows=values, query_id=query_id, native=session.native(query_id)))
    overlays = Path(json.loads((root / 'restore.json').read_bytes())['overlay'])
    original = json.loads(overlays.read_bytes())
    clickhouse = original['services']['clickhouse']
    config = root / 'dau-serving-bundle.xml'
    write_public_config(config, engine_xml())
    profile = root / 'dau-serving-profile.xml'
    write_public_config(profile, f'<clickhouse><profiles><default><max_threads>{ENGINE_THREADS}</max_threads>'
        '</default></profiles></clickhouse>\n')
    target = '/etc/clickhouse-server/config.d/dau-serving-bundle.xml'
    mount = str(config.resolve()) + ':' + target + ':ro'
    if mount not in clickhouse['volumes']:
        clickhouse['volumes'].append(mount)
    profile_mount = str(profile.resolve()) + ':/etc/clickhouse-server/users.d/dau-serving-profile.xml:ro'
    if profile_mount not in clickhouse['volumes']:
        clickhouse['volumes'].append(profile_mount)
    clickhouse['ulimits'] = {'nofile': {'soft': ENGINE_NOFILE, 'hard': ENGINE_NOFILE}}
    save(overlays, original)
    restore.command(session.compose, session.env, 'up', '-d', '--no-deps', 'clickhouse', timeout=180)
    restore_dataset.wait_for(lambda: restore.server_ready(session.compose, session.env), 'owned DAU bundle engine')
    for table in (*CANONICAL_TABLES, 'engagement_documents', 'pairs_refs', 'pairs_refs_fat', 'billboard_pin_refs'):
        session.query('dau_bundle_refreeze_' + table, 'SYSTEM STOP MERGES ' + table)
    rows, _ = session.rows('dau_bundle_engine_readback', "SELECT name,value FROM system.server_settings WHERE name IN "
        "('max_concurrent_queries','background_pool_size','background_merges_mutations_concurrency_ratio')")
    actual = {row['name']: int(row['value']) for row in rows}
    if actual != {'max_concurrent_queries': ENGINE_CONCURRENCY, 'background_pool_size': MERGE_POOL,
            'background_merges_mutations_concurrency_ratio': 2}:
        raise ValueError('live ClickHouse concurrency settings differ from the DAU bundle')
    rows, _ = session.rows('dau_bundle_merge_tree_readback', 'SELECT name,value FROM system.merge_tree_settings WHERE name IN ('
        + ','.join(repr(name) for name in MERGE_THRESHOLDS) + ')')
    thresholds = {row['name']: int(row['value']) for row in rows}
    profile_threads = restore.query(session.compose, session.env, "SELECT value FROM system.settings WHERE name='max_threads'").strip()
    if thresholds != MERGE_THRESHOLDS or profile_threads != str(ENGINE_THREADS):
        raise ValueError('live ClickHouse profile or merge thresholds differ from the DAU bundle')
    envelope = session.verify_envelope()
    certificate = engagement_certificates.verify(root)
    save(root / 'dau-serving-bundle-engine.json', dict(server_settings=actual, merge_tree_settings=thresholds,
        event_merges_active=True, default_profile_threads=int(profile_threads), envelope=envelope,
        verified_generation=certificate['canonical_generation']))


def worker_pids(descriptors, *, proc=Path('/proc')):
    """Resolve all five real Uvicorn processes within the owned API cgroup."""
    result = {}
    for row in descriptors:
        pid = row['pid']
        try:
            argv = (proc / str(pid) / 'cmdline').read_bytes().split(b'\0')
        except FileNotFoundError:
            continue
        if b'dau_sustain_cell:application' not in argv or b'--port' not in argv:
            continue
        port = int(argv[argv.index(b'--port') + 1])
        if port in result:
            raise ValueError('duplicate live DAU worker port')
        result[port] = pid
    if set(result) != {port for port, _, _ in worker_layout()}:
        raise ValueError('live DAU worker layout differs from the serving bundle')
    return result


def local_worker_port():
    return int(os.environ['DAU_WORKER_PORT']) if os.environ.get('DAU_BUNDLE_ACTIVE') == '1' else None


def worker_route(role, method, path):
    if (method, path) == ('GET', '/docs'):
        return True
    routes = {'read': READ_PATHS, 'write': ('/v3/login', '/v3/create'),
              None: (*READ_PATHS, '/v3/login', '/v3/create')}
    return method == 'POST' and path in routes[role]
