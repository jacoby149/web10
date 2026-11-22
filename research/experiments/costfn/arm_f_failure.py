"""Durable private diagnostics for isolated synthetic F runs, never API payloads.

No frame locals, request bodies, tokens or environment snapshots. Full stacks
retain their frames; transport capabilities/credentials are redacted in text.
Diagnostic collection never changes the failing operation or retries it.
"""
from contextlib import contextmanager
import contextvars
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import traceback
import uuid

current = contextvars.ContextVar('F_failure_operation', default={})


def text(value):
    value = re.sub(r'https?://[^\s\'\"<>]+', '<transport-url-redacted>', str(value))
    value = re.sub(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '<jwt-redacted>', value)
    return re.sub(r'(?i)(bearer\s+|(?:password|secret_key|access_key|token)[\s\'\"]*[:=][\s\'\"]*)([^\s,\'\"}]+)',
                  r'\1<credential-redacted>', value)


def details(error):
    stack = ''.join(traceback.format_exception(error))
    if error.__traceback__ is None:
        stack = ''.join(traceback.format_stack()[:-1]) + stack
    value = dict(failure_class=type(error).__name__, failure_module=type(error).__module__,
        failure_message=text(error), failure_traceback=text(stack),
        diagnostic_context=dict(current.get()))
    stderr = getattr(error, 'stderr', None)
    if stderr:
        value['failure_stderr'] = text(stderr.decode(errors='replace') if isinstance(stderr, bytes) else stderr)
    return value


def save(path, value):
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, indent=2, default=str)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def persist(root, error, *, native=None, **context):
    value = dict(outcome='STOP', **details(error), utc=datetime.now(UTC).isoformat(),
        native=native if native is not None else {'status': 'NOT_COLLECTED'},
        context={**current.get(), **context})
    path = Path(root) / 'failures' / (uuid.uuid4().hex + '.json')
    save(path, value)
    return path


def before_cleanup(root, **context):
    """Call first in finally: record errors before any nested close/stop can run."""
    error = sys.exception()
    if error is not None:
        return persist(root, error, **context)
    return None


def engine_failure(root, error, client, *, log_comment, **context):
    """Bypass stopped serving wrappers for bounded diagnostics, never replay SQL.

    Persist the original FIRST; if the engine is unavailable the receipt says so.
    A separate diagnostic failure must never replace the operation's exception.
    """
    path = persist(root, error, native={'status': 'PENDING', 'log_comment': log_comment}, **context)
    value = json.loads(path.read_bytes())
    try:
        from arm_satellite_sql import literal
        client = client() if callable(client) else client
        settings = {'max_execution_time': 2, 'max_memory_usage': 64 * 1024**2, 'max_result_rows': 1000,
                    'result_overflow_mode': 'throw'}
        client.command('SYSTEM FLUSH LOGS', settings=settings)
        result = client.query('SELECT query_id,toString(type) AS type,exception_code,exception,stack_trace,'
            'query_duration_ms,read_rows,read_bytes,written_rows,memory_usage,log_comment FROM system.query_log '
            'WHERE log_comment=' + literal(log_comment)
            + " AND type IN ('QueryFinish','ExceptionBeforeStart','ExceptionWhileProcessing') LIMIT 1000",
            settings=settings)
        rows = [dict(zip(result.column_names, row)) for row in result.result_rows]
        value['native'] = dict(status='COLLECTED' if rows else 'NO_QUERY_LOG_ROWS', log_comment=log_comment,
            query_ids=[row['query_id'] for row in rows], rows=rows)
    except BaseException as diagnostic_error:
        value['native'] = dict(status='COLLECTION_FAILED', log_comment=log_comment, **details(diagnostic_error))
    save(path, value)
    return path


@contextmanager
def operation(root=None, **context):
    token = current.set({**current.get(), **context})
    try:
        yield
    except BaseException as error:
        if root is not None:
            persist(root, error)
        raise
    finally:
        current.reset(token)
