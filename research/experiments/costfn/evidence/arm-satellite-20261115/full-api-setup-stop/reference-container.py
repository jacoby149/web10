"""Independent unmodified canonical/prepare path; setup only, never a serving sample."""
import hashlib
import inspect
import json
from pathlib import Path
import sys
import sqlglot
from sqlglot import exp

sys.path.insert(0, '/research')
import core_feed
from app.v3.endpoints import query as endpoint
from app.v3.models import PrepareSpec
from app.v3.services import clickhouse as ch, safe_query

ROOT = Path('/satellite-reference')
profile = json.loads((ROOT / 'profile.json').read_bytes())
readable = profile['actual_readable_by_kind']['main']
reader = profile['reader']
capture = core_feed.wire()
native = []
original_query = ch.client.query
signature = inspect.signature(original_query)


def query(sql, *args, **kwargs):
    bound = signature.bind_partial(sql, *args, **kwargs)
    settings = dict(bound.arguments.get('settings') or {})
    settings.update(max_execution_time=900, max_memory_usage=22 * 1024**3, max_threads=4,
                    max_bytes_before_external_sort=2 * 1024**3, max_bytes_before_external_group_by=2 * 1024**3,
                    max_temporary_data_on_disk_size_for_query=100 * 1024**3, join_algorithm='full_sorting_merge')
    bound.arguments['settings'] = settings
    try:
        result = original_query(*bound.args, **bound.kwargs)
    except Exception as error:
        native.append({'failure_class': type(error).__name__})
        raise
    native.append({'query_id': result.query_id, 'sql_sha256': hashlib.sha256(sql.encode()).hexdigest(),
                   'read_rows': int(result.summary.get('read_rows', 0)), 'read_bytes': int(result.summary.get('read_bytes', 0))})
    return result


ch.client.query = query
endpoint.MAX_EXECUTION_TIME_S = 900  # Separate setup process, never the serving worker.
compiled = safe_query.build_safe_query(capture['requests'][0]['payload']['sql'], readable,
    member_key=reader, allowed_services=frozenset(readable), max_limit=1000)
tree = sqlglot.parse_one(compiled, read='clickhouse')
post_boundary = next(cte.this for cte in tree.args['with_'].expressions if cte.alias == 'posts')
page = sqlglot.parse_one('SELECT p.doc_id,p.author_key FROM (' + post_boundary.sql(dialect='clickhouse') + ') AS p', read='clickhouse')
for key in ('where', 'order', 'limit'):
    page.set(key, tree.args[key].copy())
page_columns, page_values = ch.execute_query(page.sql(dialect='clickhouse'), settings={'max_execution_time': 900})
page_rows = [dict(zip(page_columns, row)) for row in page_values]
if not page_rows:
    raise ValueError('independent canonical page is empty')

def literals(values):
    return ','.join(exp.Literal.string(value).sql(dialect='clickhouse') for value in sorted(set(values)))

ids = literals([row['doc_id'] for row in page_rows])
authors = literals([row['author_key'] for row in page_rows])
selectors = {'posts': 'doc_id IN (' + ids + ") OR JSONExtractString(body,'repost_of') IN (" + ids + ')',
             'reactions': 'ref_value IN (' + ids + ')',
             'comments': "JSONExtractString(body,'post_id') IN (" + ids + ')',
             'profile': 'author_key IN (' + authors + ')'}
# The independent reference derives all identities from canonical tables, never
# transpose/strings/counting_numbers. Keep the original windows/gates/aggregates.
for cte in tree.args['with_'].expressions:
    identity = "SELECT author_key,doc_id FROM documents FINAL WHERE deleted=0 AND collection_name='" + cte.alias + "' AND (" + selectors[cte.alias] + ')'
    for table in list(cte.this.find_all(exp.Table)):
        if table.name in ('documents', 'doc_groups'):
            text = '(author_key,doc_id) IN (' + identity + ')' if table.name == 'documents' else 'doc_id IN (SELECT doc_id FROM (' + identity + '))'
            predicate = sqlglot.parse_one('SELECT 1 WHERE ' + text, read='clickhouse').args['where'].this
            table.find_ancestor(exp.Select).where(predicate, copy=False)
columns, values = ch.execute_query(tree.sql(dialect='clickhouse'), settings={'max_execution_time': 900})
rows = [endpoint._serialize_row(dict(zip(columns, row))) for row in values]

# Independent canonical inventory reference; do not let the optional helper's
# exception-to-empty fallback silently manufacture an empty-inventory oracle.
inventory_ids = ch.client.query("SELECT doc_id,author_key FROM documents FINAL "
    "WHERE deleted=0 AND has(tags,'node_ad') AND doc_id IN (SELECT doc_id FROM doc_groups FINAL "
    "WHERE deleted=0 AND group_id='api.localhost/groups/web10/discover') ORDER BY updated_at DESC LIMIT 20")
keys = ','.join('(' + literals([author]) + ',' + literals([doc]) + ')' for doc, author in inventory_ids.result_rows)
if not keys:
    raise ValueError('nonempty canonical inventory identities required')
inventory = ch.client.query("SELECT doc_id,author_key,body,tags,posted_by FROM documents FINAL WHERE deleted=0 "
    "AND (author_key,doc_id) IN (" + keys + ") ORDER BY updated_at DESC")
ads = [{'doc_id': row[0], 'author_key': row[1], 'body': ch._parse_json(row[2]), 'tags': list(row[3]), 'posted_by': row[4]}
       for row in inventory.result_rows if ch._parse_json(row[2]).get('status') == 'active']
if not ads:
    raise ValueError('nonempty canonical inventory reference required')
ch.get_active_node_ads = lambda: list(ads)
prepared = endpoint._prepare_rows(rows, reader, PrepareSpec(**capture['requests'][0]['payload']['prepare']), readable, True)
if any('failure_class' in row for row in native):
    raise ValueError('reference contains a hidden native failure')
raw = json.dumps(prepared, sort_keys=True).encode()
(ROOT / 'rows.json').write_bytes(raw)
(ROOT / 'summary.json').write_text(json.dumps({'kind': 'CANONICAL_PREPARED_SETUP_REFERENCE',
    'rows': len(prepared), 'inventory_candidates': len(ads), 'rows_sha256': hashlib.sha256(raw).hexdigest(),
    'compiled_sha256': hashlib.sha256(compiled.encode()).hexdigest(),
    'canonical_bounded_reference_sha256': hashlib.sha256(tree.sql(dialect='clickhouse').encode()).hexdigest(),
    'reference_identities_from': 'canonical tables only; no satellite or treatment result', 'native_queries': native,
    'serving_measurement': False, 'setup_query_seconds': 900, 'serving_limits_changed': False}, indent=2) + '\n')
print('[satellite-reference] independent canonical prepared rows complete', len(prepared), flush=True)
