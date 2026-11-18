"""Private query ledger for modern cells; no production or import-time I/O."""
import hashlib
import inspect
import json
import os
from pathlib import Path
import time

import sqlglot
from sqlglot import exp

from arm_f_failure import details


def classify(sql, callers, current):
    tables = {table.name for table in sqlglot.parse_one(sql, read='clickhouse').find_all(exp.Table)}
    preparation = bool(set(callers) & {'_prepare_rows', '_prepare_face', 'attach_node_ads', 'attach_pinned_ads',
        'get_active_node_ads', 'inventory', 'resolve_media_urls_in_docs', '_mint_hls_manifest_urls'})
    counters = any(name.startswith('counting_numbers') for name in tables)
    canonical = bool(tables & {'documents', 'engagement_documents', 'doc_groups'})
    if counters:
        return ('counts_embedded_in_preparation' if preparation else 'counts_embedded_in_resolution') if canonical else 'counts'
    if tables & {'content_events', 'content_events_aggregated'}:
        return 'views'
    if preparation:
        return 'preparation'
    if 'engagement_documents' in tables and list(sqlglot.parse_one(sql, read='clickhouse').find_all(exp.AggFunc)):
        return 'counts_embedded_in_resolution' if any(row.get('is_main') for row in current.get('fanout_scopes', [])) else 'counts'
    if tables & {'doc_groups_t', 'fanout'}:
        return 'candidates'
    if tables & {'strings', 'timestamps'}:
        return 'metadata_identities'
    if tables and tables <= {'parts', 'server_settings'}:
        return 'generation_or_envelope'
    return 'unclassified'


def install(original, observer, directory):
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    def query(sql, *args, **kwargs):
        current = observer.current.get() or {}
        request_id = current.get('request_id')
        if not request_id or request_id == 'unlabelled':
            return original(sql, *args, **kwargs)
        settings = dict(kwargs.get('settings') or {})
        settings.update(max_execution_time=10, max_memory_usage=22 * 1024**3,
            max_rows_to_read=10_000_000, read_overflow_mode='throw', log_comment='F_READ:' + request_id)
        kwargs['settings'] = settings
        frame, callers = inspect.currentframe(), []
        try:
            for _ in range(48):
                frame = frame.f_back if frame is not None else None
                if frame is None:
                    break
                callers.append(frame.f_code.co_name)
        finally:
            del frame
        row = dict(request_id=request_id, sql_sha256=hashlib.sha256(sql.encode()).hexdigest(),
            stage=classify(sql, callers, current), success=False)
        started = time.perf_counter()
        try:
            result = original(sql, *args, **kwargs)
            row.update(query_id=result.query_id, success=True)
            return result
        except BaseException as error:
            row.update(details(error))
            raise
        finally:
            row['client_query_ms'] = (time.perf_counter() - started) * 1000
            path = directory / (row['sql_sha256'] + '.sql')
            if not path.exists():
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, 'w') as stream:
                    stream.write(sql)
            with (directory / (request_id + '.jsonl')).open('a') as stream:
                stream.write(json.dumps(row) + '\n')
                stream.flush()
                os.fsync(stream.fileno())
    return query
