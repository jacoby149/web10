"""Opt-in composition only; historical tally/F/P and production remain intact."""
import hashlib
import json
import os
from pathlib import Path

import sqlglot
from sqlglot import exp

import engagement_tally_api as tally
import engagement_billboard_reads as billboards
import engagement_composition as contract
import engagement_pairs as pairs
import engagement_pin_index as pin_index
from engagement_composition_verify import binding

e = tally.e
if (e.f.admission.get('composition_admitted') is not True
        or e.f.admission.get('run_directive') != contract.DIRECTIVE
        or e.MODE != 'uniform' or not e.aggregate_views):
    raise RuntimeError('explicit uniform/pairs/tally/billboard/aggregate composition required')

proof = json.loads(Path(os.environ['ENGAGEMENT_COMPOSITION_PROOF']).read_bytes())
indexed = pin_index.enabled(e.f.admission)
immutable_tables = {pairs.TABLE, pin_index.TABLE} if indexed else {pairs.TABLE}
if set(proof['immutable_parts']) != immutable_tables or (indexed and
        proof['gates']['ads'].get('pin_index_same_question') != 'PASS'):
    raise RuntimeError('missing certified immutable pin/ref lookup parts')
for name in contract.GATES:
    contract.gate(name, proof['gates'][name])
    if proof['gates'][name]['source_binding'] != binding():
        raise RuntimeError('composition source changed after native verification')
if (proof['droplet_id'] != e.p.host or proof['copy_parts_sha256'] != e.proof['parts_sha256']):
    raise RuntimeError('composition proof belongs to another host or canonical copy')

e.queries.scoped = pairs.scoped
original_compile = e.p.compile_query
original_checked = e.f.checked_query


def compile_query(*args, **kwargs):
    compiled = e.p._compile(*args, **kwargs)  # Existing live credential/read gate first.
    tree = sqlglot.parse_one(compiled, read='clickhouse')
    source = tree.args.get('from_')
    service = source.this.name if source and isinstance(source.this, exp.Table) else None
    if (service not in ('reactions', 'comments')
            or any(list(item.find_all(exp.AggFunc)) for item in tree.expressions)):
        return original_compile(*args, **kwargs)
    ids = pairs.root_targets(tree)
    if ids is None:
        return original_compile(*args, **kwargs)  # Exact-ID and unrelated reads are not ref queries.
    boundary = next(cte for cte in tree.args['with_'].expressions if cte.alias == service)
    boundary.set('this', sqlglot.parse_one(pairs.segment(boundary.this.sql(dialect='clickhouse'), ids), read='clickhouse'))
    return tree.sql(dialect='clickhouse')


def checked_query(*args, **kwargs):
    current = e.p.observer.current.get()
    if current is not None and not current.get('composition_pairs_checked'):
        for table, expected in proof['immutable_parts'].items():
            if table not in immutable_tables:
                raise ValueError('unexpected table in immutable composition fence')
            sql = ("SELECT name,toString(rows) AS rows,toString(data_version) AS data_version FROM system.parts "
                "WHERE database='web10' AND active AND table='" + table + "' ORDER BY name")
            result = e.f.original_query(sql, settings={'log_comment': 'F_READ:' + current['request_id']})
            parts = [dict(zip(result.column_names, row)) for row in result.result_rows]
            if hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest() != expected:
                raise ValueError('pairs changed after exact census verification')
        if set(proof['immutable_parts']) != immutable_tables:
            raise ValueError('missing frozen pairs part fence')
        current['composition_pairs_checked'] = True
    return original_checked(*args, **kwargs)


def execute(sql):
    columns, rows = e.p.ch.execute_query(sql)
    return [dict(zip(columns, row)) for row in rows]


def attach(docs, reader):
    return billboards.attach(docs, reader, execute=execute,
        readable=lambda reader, service: e.p.ch.readable_groups(reader, service, True,
            sorted({group for doc in docs for group in ([doc['group_id']] if doc.get('group_id') else doc.get('groups', []))})),
        compile=e.p._compile, indexed=indexed)


def forbidden_inventory():
    raise RuntimeError('billboard composition forbids every read-time ad inventory lookup')


e.p.compile_query = compile_query
e.f.checked_query = checked_query
e.p.ch.attach_pinned_ads = attach
e.p.ch.attach_node_ads = lambda docs, reader: docs  # Both settled pin kinds attach above; never select twice.
e.p.ch.get_active_node_ads = forbidden_inventory
application = e.application

if os.environ.get('HYBRID_K20_PROJECTED') == '1':
    import hybrid_k20_projected as k20
    if not indexed or not k20.enabled(e.f.admission):
        raise ValueError('projected K20 requires admitted indexed composition')
    original_execute = e.p._execute

    def execute_resolution(sql, settings=None):
        if sql.startswith(k20.MAIN_MARKER):
            return k20.resolution(lambda query: original_execute(query, settings=settings), sql)
        return original_execute(sql, settings=settings)

    e.p._execute = execute_resolution
