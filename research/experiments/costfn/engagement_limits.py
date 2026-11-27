"""Nov18 measurement policy; explicit research admission, never production defaults."""
import os

DIRECTIVE = 'Jacob Hoffman 2026-11-18 archaic execution limits removed'
RUN = 'Jacob Hoffman 2026-11-18 treated completion; banked baseline; no statement stops'
TALLY_RUN = 'Jacob Hoffman 2026-11-18 generic tally wiring; setup verified; counts only'


def enabled(operation):
    return operation.get('measurement_limits_directive') == DIRECTIVE


def settings(value=None):
    result = {**(value or {}), 'max_execution_time': 600, 'max_rows_to_read': 0,
        'max_rows_to_read_leaf': 0, 'max_bytes_to_read': 0, 'max_bytes_to_read_leaf': 0,
        'max_result_rows': 0, 'max_memory_usage': 22 * 1024**3}
    if os.environ.get('DAU_BUNDLE_ACTIVE') == '1':
        from dau_serving_bundle import ENGINE_THREADS
        result['max_threads'] = ENGINE_THREADS
    return result


def clients():
    """Only the isolated research API process calls this before importing the node."""
    import clickhouse_connect
    from urllib3.util import Timeout
    original = clickhouse_connect.get_client
    pool = None
    if os.environ.get('DAU_BUNDLE_ACTIVE') == '1':
        from clickhouse_connect.driver.httputil import get_pool_manager
        from dau_serving_bundle import POOL_KEEPALIVE
        pool = get_pool_manager(maxsize=POOL_KEEPALIVE, block=False)
    def client(*args, **kwargs):
        # Pinned1.6 computes progress_interval from this number during init and
        # cannot accept None there. Disable the actual read deadline AFTER init;
        # native max_execution_time, not a transport cap, governs measurements.
        kwargs.update(send_receive_timeout=660, query_retries=0)
        if pool is not None:
            kwargs['pool_mgr'] = pool
        result = original(*args, **kwargs)
        result._backend.timeout = Timeout(connect=10, read=None)
        result._backend.http_retries = 0
        return result
    clickhouse_connect.get_client = client
