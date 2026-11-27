"""Non-additive process/cgroup readings and a separate additive host snapshot."""

from pathlib import Path

DAU_API_NOFILE = 65536


def meminfo(text):
    result = {}
    for line in text.splitlines():
        key, _, tail = line.partition(':')
        fields = tail.split()
        if len(fields) == 2 and fields[1] == 'kB':
            result[key] = int(fields[0]) * 1024
    return result


def memory_stat(text):
    return {key: int(value) for key, value in (line.split() for line in text.splitlines())}


def account(host, engine, api, *, engine_current, api_current, api_rss, engine_cap, server_cap):
    """Host occupied = total minus free; do not add cgroup usage to it.

    Cgroup anonymous bytes exclude file-backed cache. The residual is labelled,
    not asserted to be pure kernel/OS usage: it includes other processes, shared
    memory, slab and counter skew. Reclaimable slab is not page cache.
    """
    occupied = host['MemTotal'] - host['MemFree']
    page_cache = host['Buffers'] + host['Cached'] - host['Shmem']
    engine_anon, api_anon = engine['anon'], api['anon']
    residual = occupied - page_cache - engine_anon - api_anon
    consistent = min(occupied, page_cache, engine_anon, api_anon, residual) >= 0
    return dict(host=dict(total_bytes=host['MemTotal'], available_bytes=host['MemAvailable'],
        occupied_bytes=occupied, page_cache_and_buffers_bytes=page_cache,
        os_other_and_unattributed_bytes=residual, partition_consistent=consistent),
        engine=dict(cgroup_current_bytes=engine_current, cgroup_anon_bytes=engine_anon,
            cgroup_file_bytes=engine['file'], container_cap_bytes=engine_cap, server_cap_bytes=server_cap),
        api=dict(cgroup_current_bytes=api_current, cgroup_anon_bytes=api_anon,
            cgroup_file_bytes=api['file'], process_rss_bytes=api_rss),
        scope='cgroup current and process RSS overlap host cache; sum only host partition terms')


def cgroup(pid, proc, cgroups):
    if type(pid) is not int or pid < 1:
        raise ValueError('container must have a live host PID')
    entry = (proc / str(pid) / 'cgroup').read_text().splitlines()
    paths = [line[3:] for line in entry if line.startswith('0::/')]
    if len(paths) != 1 or paths[0] == '/':
        raise ValueError('one isolated cgroup v2 memory controller required')
    path = (cgroups / paths[0].lstrip('/')).resolve()
    if not path.is_relative_to(cgroups.resolve()):
        raise ValueError('cgroup path escapes the host mount')
    return path


def sample(engine_pid, api_pid, *, engine_cap, server_cap, proc=Path('/proc'), cgroups=Path('/sys/fs/cgroup')):
    engine = cgroup(engine_pid, proc, cgroups)
    api = cgroup(api_pid, proc, cgroups)
    if engine.is_relative_to(api) or api.is_relative_to(engine):
        raise ValueError('separate non-overlapping API and engine cgroups required')
    if int((engine / 'memory.max').read_text()) != engine_cap:
        raise ValueError('live engine cgroup cap differs from admission')
    pids = {int(pid) for pid in (api / 'cgroup.procs').read_text().split()}
    if api_pid not in pids:
        raise ValueError('API process no longer belongs to its admitted cgroup')
    rss = sum(meminfo((proc / str(pid) / 'status').read_text())['VmRSS'] for pid in pids)
    return account(meminfo((proc / 'meminfo').read_text()),
        memory_stat((engine / 'memory.stat').read_text()), memory_stat((api / 'memory.stat').read_text()),
        engine_current=int((engine / 'memory.current').read_text()),
        api_current=int((api / 'memory.current').read_text()), api_rss=rss,
        engine_cap=engine_cap, server_cap=server_cap)


def api_descriptors(api_pid, *, proc=Path('/proc'), cgroups=Path('/sys/fs/cgroup')):
    group = cgroup(api_pid, proc, cgroups)
    result = []
    for pid in sorted({int(part) for part in (group / 'cgroup.procs').read_text().split()}):
        directory = proc / str(pid)
        try:
            limit = next(line.split()[-3:-1] for line in (directory / 'limits').read_text().splitlines()
                if line.startswith('Max open files'))
            count = sum(1 for _ in (directory / 'fd').iterdir())
        except FileNotFoundError:
            # A short-lived child may exit between reading cgroup.procs and its
            # proc directory. The actual API container PID must still be present.
            continue
        result.append(dict(pid=pid, open=count, soft=int(limit[0]), hard=int(limit[1])))
    if api_pid not in {row['pid'] for row in result}:
        raise ValueError('owned API process disappeared during descriptor sample')
    return result
