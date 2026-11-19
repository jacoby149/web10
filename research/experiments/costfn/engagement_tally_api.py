"""Explicit research-only scalar routing, after current credential/policy checks."""
import hashlib
import json

import sqlglot
from sqlglot import exp

import engagement_api as e
import engagement_limits as limits
import engagement_queries as queries
import engagement_tally_queries as tallies

if (e.f.admission.get('run_directive') != limits.TALLY_RUN or e.f.admission.get('tally_wiring_admitted') is not True):
    raise RuntimeError('explicit tally wiring admission required')
receipt = e.p.counts.get('tally', {})
if not receipt.get('verified') or receipt.get('canonical_generation') != e.p.counts['canonical_generation']:
    raise RuntimeError('native verified current tally scopes required')


def scopes(label, reader, readable):
    from engagement_tally_sql import scope as expected_scope
    e.p.scope_for(label, reader, readable)
    result = receipt['routing'][label]
    for service, key in result.items():
        built = receipt['scopes'][key]
        if (not built['verified'] or not built['complete'] or built['reader'] != reader
                or sorted(readable.get(service, [])) != built['groups']
                or key != expected_scope(reader,service,built['groups'],receipt['canonical_generation'],receipt['copy_parts_sha256'])):
            raise ValueError('unbuilt or changed tally credential/service/group scope')
    return result


def main(compiled, pointers, profiles, scope):
    current = e.p.observer.current.get()
    actual = next(row for row in reversed(current['fanout_scopes']) if row['is_main'])
    selected = scopes('main', actual['reader'], actual['readable'])
    current['engagement_tally_scopes'] = sorted(set(selected.values()))
    return tallies.main(compiled, pointers, profiles, scope, selected, uniform=e.uniform, table=e.table)


old_compile = e.p.compile_query
old_checked = e.f.checked_query


def compile_query(*args, **kwargs):
    compiled = e.p._compile(*args, **kwargs)
    tree = sqlglot.parse_one(compiled, read='clickhouse')
    source = tree.args.get('from_')
    service = source.this.name if source and isinstance(source.this, exp.Table) else None
    if service not in ('reactions', 'comments') or not any(list(x.find_all(exp.AggFunc)) for x in tree.expressions):
        return old_compile(*args, **kwargs)  # Document-on-open remains projection-based.
    readable = args[1] if len(args) > 1 else kwargs['readable_groups_by_service']
    reader = kwargs.get('member_key', args[2] if len(args) > 2 else 'anon')
    try:
        ids = queries.literal_targets(tree)
        key = scopes(service, reader, readable)[service]
        e.p.observer.current.get()['engagement_tally_scopes'] = [key]
        return tallies.stored(tree, service, key, ids, uniform=e.uniform)
    except ValueError:
        # Non-feed aggregate shapes (e.g. opening a thread by a finer target)
        # retain the existing document/projection path, never an approximate tally.
        return old_compile(*args, **kwargs)


def checked_query(*args, **kwargs):
    current = e.p.observer.current.get()
    if current is not None:
        if not current.get('engagement_tally_verified'):
            for table, expected in (('counting_numbers_tally',receipt['parts_sha256']),
                    ('engagement_documents',receipt['copy_parts_sha256'])):
                sql = "SELECT name,toString(rows) AS rows,toString(data_version) AS data_version FROM system.parts WHERE database='web10' AND table='" + table + "' AND active ORDER BY name"
                result = e.f.original_query(sql, settings={'log_comment': 'F_READ:' + current['request_id']})
                parts = [dict(zip(result.column_names, row)) for row in result.result_rows]
                if hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest() != expected:
                    raise ValueError('tally or source-copy parts changed after verification')
            current['engagement_tally_verified'] = True
            current.setdefault('engagement_tally_scopes', [])
    return old_checked(*args, **kwargs)


e.p.serve.main_sql = main
e.p.compile_query = compile_query
e.f.checked_query = checked_query
application = e.application
