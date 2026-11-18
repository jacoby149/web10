"""Nov18 measurement policy; explicit research admission, never production defaults."""
DIRECTIVE = 'Jacob Hoffman 2026-11-18 archaic execution limits removed'
RUN = 'Jacob Hoffman 2026-11-18 treated completion; banked baseline; no statement stops'


def enabled(operation):
    return operation.get('measurement_limits_directive') == DIRECTIVE


def settings(value=None):
    return {**(value or {}), 'max_execution_time': 600, 'max_rows_to_read': 0,
        'max_rows_to_read_leaf': 0, 'max_bytes_to_read': 0, 'max_bytes_to_read_leaf': 0,
        'max_result_rows': 0, 'max_memory_usage': 22 * 1024**3}


def clients():
    """Only the isolated research API process calls this before importing the node."""
    import clickhouse_connect
    original = clickhouse_connect.get_client
    def client(*args, **kwargs):
        kwargs.update(send_receive_timeout=None, query_retries=0)
        return original(*args, **kwargs)
    clickhouse_connect.get_client = client
