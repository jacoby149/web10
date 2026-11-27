"""Step0 only: Config P with exact native stage attribution, not F/P1 treatment.

Retains SQL privately on the admitted synthetic host. Public observations are
metadata-only. Mixed resolution/count queries are labelled mixed, not split by
invented fractions of native totals. No changed P query/oracle or grant path.
"""
import hashlib
import inspect
import importlib
import json
import os
from pathlib import Path
import time

import sqlglot
from sqlglot import exp

SOURCE_HASH = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()

p = importlib.import_module('arm_satellite_api')

DIRECTORY = Path(os.environ['FANOUT_STAGE_DIR'])
if not DIRECTORY.is_dir():
    raise RuntimeError('private stage receipt directory required')
original = p._query


def classify(sql, callers=()):
    try:
        tables = {table.name for table in sqlglot.parse_one(sql, read='clickhouse').find_all(exp.Table)}
    except Exception:
        return 'unclassified'
    counter = any(name.startswith('counting_numbers') for name in tables)
    canonical = bool(tables & {'documents', 'doc_groups'})
    preparation = bool(set(callers) & {'_prepare_rows', '_prepare_face', 'attach_node_ads', 'attach_pinned_ads',
        'get_active_node_ads', 'inventory', 'resolve_media_urls_in_docs', '_mint_hls_manifest_urls'})
    if counter:
        return ('counts_embedded_in_preparation' if preparation else 'counts_embedded_in_resolution') if canonical else 'counts'
    if 'content_events' in tables:
        return 'views'
    if preparation:
        return 'preparation'
    if tables & {'doc_groups_t', 'fanout'}:
        return 'candidates'
    if tables & {'strings', 'timestamps'}:
        return 'metadata_identities'
    if canonical:
        return 'canonical_resolution'
    if tables and tables <= {'parts', 'server_settings'}:
        return 'generation_or_envelope'
    return 'authority_or_other'


def query(sql, *args, **kwargs):
    current = p.observer.current.get()
    request_id = current.get('request_id') if current else None
    started = time.monotonic()
    frame, callers = inspect.currentframe(), []
    try:
        for _ in range(48):
            frame = frame.f_back if frame is not None else None
            if frame is None:
                break
            callers.append(frame.f_code.co_name)  # Names only; never inspect/serialize frame locals.
    finally:
        del frame
    row = {'stage': classify(sql, callers), 'request_id': request_id,
           'sql_sha256': hashlib.sha256(sql.encode()).hexdigest(), 'stage_observer_sha256': SOURCE_HASH}
    try:
        result = original(sql, *args, **kwargs)
        summary = result.summary or {}
        row.update(query_id=result.query_id, read_rows=int(summary.get('read_rows', 0)),
                   read_bytes=int(summary.get('read_bytes', 0)), success=True)
        return result
    except Exception as error:
        row.update(success=False, **__import__('arm_f_failure').details(error))
        raise
    finally:
        row['client_query_ms'] = (time.monotonic() - started) * 1000
        if request_id and request_id != 'unlabelled':
            # Only known synthetic query text, never bound credential/HTTP bodies.
            target = DIRECTORY / (row['sql_sha256'] + '.sql')
            try:
                fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            except FileExistsError:
                pass  # Another worker can win creation of the exact same SQL digest.
            else:
                with os.fdopen(fd, 'w') as stream:
                    stream.write(sql)
            fd = os.open(DIRECTORY / (request_id + '.jsonl'), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            with os.fdopen(fd, 'a') as stream:
                stream.write(json.dumps(row) + '\n')
                stream.flush()
                os.fsync(stream.fileno())


p._query = query
application = p.application
