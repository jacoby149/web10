"""Private query ledger for modern cells; no production or import-time I/O."""
import hashlib
import inspect
import os
from pathlib import Path
import time

import sqlglot
from sqlglot import exp

from arm_f_failure import details
from arm_f_observe import append


def uniform_guard(sql, current):
    if current.get('engagement_mode') not in ('uniform', 'projection'):
        return
    tree = sqlglot.parse_one(sql, read='clickhouse')
    if any(table.name.startswith('counting_numbers') for table in tree.find_all(exp.Table)):
        if not current.get('engagement_tally_verified'):
            raise ValueError('uniform treatment attempted an undeclared cached-counter fallback')
        from engagement_tally_queries import guard
        guard(tree, current.get('engagement_tally_scopes', []))
    if 'ENGAGEMENT_DOC_COUNTS' not in sql:
        return  # Preparation remains the explicitly named, unoptimized remainder.
    for table in tree.find_all(exp.Table):
        if table.name != 'doc_groups':
            continue
        where = table.find_ancestor(exp.Select).args.get('where')
        if where is None or not any(isinstance(node.this, exp.Column) and node.this.name == 'doc_id'
                for node in where.find_all(exp.In)):
            raise ValueError('known group-only attachment lane refused before native execution')
        ancestor, ordered = table.parent, False
        while ancestor is not None:
            if isinstance(ancestor, exp.Select):
                for window in ancestor.find_all(exp.Window):
                    if {column.name for column in window.args.get('partition_by', [])} == {'doc_id', 'group_id'}:
                        order = window.args.get('order')
                        if order and [(item.this.name, item.args.get('desc')) for item in order.expressions] == [
                                ('updated_at', True), ('deleted', True)]:
                            ordered = True
            ancestor = ancestor.parent
        if not ordered:
            raise ValueError('attachment history lacks deletion-winning timestamp ties')
    return dict(candidate_doc_id_attachment_scope=True, deletion_wins_timestamp_ties=True)


def classify(sql, callers, current):
    try:
        tree = sqlglot.parse_one(sql, read='clickhouse')
    except Exception:
        return 'unclassified'
    tables = {table.name for table in tree.find_all(exp.Table)}
    if tables == {'billboard_pin_refs'} and 'candidates' in callers:
        return 'pin_index_lookup'
    if 'select_pins' in callers and tables == {'engagement_documents', 'pairs_refs'}:
        return 'pin_selection'
    if 'materialize_pins' in callers and tables == {'engagement_documents'}:
        return 'pin_materialization'
    preparation = bool(set(callers) & {'_prepare_rows', '_prepare_face', 'attach_node_ads', 'attach_pinned_ads',
        'get_active_node_ads', 'inventory', 'resolve_media_urls_in_docs', '_mint_hls_manifest_urls'})
    counters = any(name.startswith('counting_numbers') for name in tables)
    canonical = bool(tables & {'documents', 'engagement_documents', 'doc_groups'})
    if counters:
        return ('counts_embedded_in_preparation' if preparation else 'counts_embedded_in_resolution') if canonical else 'counts'
    if tables & {'content_events', 'content_events_aggregated', 'content_events_aggregated_all_time'}:
        return 'views'
    if preparation:
        return 'preparation'
    if 'ENGAGEMENT_DOC_COUNTS' in sql:
        return 'counts_embedded_in_resolution' if any(row.get('is_main') for row in current.get('fanout_scopes', [])) else 'counts'
    if 'engagement_documents' in tables and list(tree.find_all(exp.AggFunc)):
        return 'counts_embedded_in_resolution' if any(row.get('is_main') for row in current.get('fanout_scopes', [])) else 'counts'
    if tables & {'doc_groups_t', 'fanout'}:
        return 'candidates'
    if tables & {'strings', 'timestamps'}:
        return 'metadata_identities'
    if tables and tables <= {'parts', 'server_settings'}:
        return 'generation_or_envelope'
    return 'unclassified'


def install(original, observer, directory, *, operation=None):
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    signature = inspect.signature(original)
    def query(sql=None, *args, **kwargs):
        if sql is None:
            sql = kwargs.pop('query')
        current = observer.current.get() or {}
        request_id = current.get('request_id')
        if not request_id or request_id == 'unlabelled':
            return original(sql, *args, **kwargs)
        # BoundArguments.args can move an originally keyword settings mapping
        # into its positional driver slot. Normalize once before adding caps;
        # adding another keyword would otherwise pass settings twice.
        if 'settings' in signature.parameters:
            bound = signature.bind_partial(sql, *args, **kwargs)
            settings = dict(bound.arguments.get('settings') or {})
        else:
            bound = None
            settings = dict(kwargs.get('settings') or {})
        settings.update(max_execution_time=10, max_memory_usage=22 * 1024**3,
            max_rows_to_read=10_000_000, read_overflow_mode='throw', log_comment='F_READ:' + request_id)
        if operation is not None:
            import engagement_limits
            if engagement_limits.enabled(operation):
                settings = engagement_limits.settings(settings)
        if bound is not None:
            bound.arguments['settings'] = settings
        else:
            kwargs['settings'] = settings
        parameters = kwargs.get('parameters') or (args[0] if args and isinstance(args[0], dict) else None)
        rendered = sql
        if parameters:
            from clickhouse_connect.driver.binding import bind_query
            rendered, _ = bind_query(sql, parameters)
        frame, callers = inspect.currentframe(), []
        try:
            for _ in range(48):
                frame = frame.f_back if frame is not None else None
                if frame is None:
                    break
                callers.append(frame.f_code.co_name)
        finally:
            del frame
        stage = classify(rendered, callers, current)
        if os.environ.get('HYBRID_K20_PROJECTED') == '1':
            from hybrid_k20_projected import STAGES
            stage = next((name for name in STAGES if '/* ' + name + ' */' in rendered), stage)
        row = dict(request_id=request_id, sql_sha256=hashlib.sha256(rendered.encode()).hexdigest(),
            stage=stage, success=False)
        started = time.perf_counter()
        try:
            proof = uniform_guard(rendered, current)
            if proof:
                row['attachment_execution_guard'] = proof
            result = original(**bound.arguments) if bound is not None else original(sql, *args, **kwargs)
            row.update(query_id=result.query_id, success=True)
            return result
        except BaseException as error:
            row.update(details(error))
            raise
        finally:
            row['client_query_ms'] = (time.perf_counter() - started) * 1000
            path = directory / (row['sql_sha256'] + '.sql')
            try:
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, 'w') as stream:
                    stream.write(rendered)
            except FileExistsError:
                pass  # Identical SQL from concurrent follow-ups shares one file.
            append(directory / (request_id + '.jsonl'), row)
    return query
