"""Captured-query adoption of root semantics; original policy boundaries remain."""
from copy import deepcopy

import sqlglot
from sqlglot import exp

import arm_satellite_serve as serve
from arm_satellite_sql import identifier, literal as q
import engagement_ref as refs



def migrate_sql(sql):
    tree = sqlglot.parse_one(sql, read='clickhouse')
    for function in list(tree.find_all(exp.JSONExtractScalar)):
        body, path = function.this, function.expression
        keys = list(path.find_all(exp.JSONPathKey)) if path is not None else []
        if len(keys) == 1 and keys[0].this in ('post_id', 'repost_of') and isinstance(body, exp.Column):
            function.replace(exp.column('ref_value', table=body.table or None))
    for select in tree.find_all(exp.Select):
        source = select.args.get('from_')
        if (source and isinstance(source.this, exp.Table) and source.this.name == 'reactions'
                and any(list(item.find_all(exp.AggFunc)) for item in select.expressions)):
            select.where(serve.condition("JSONExtractString(body,'target_id')=''"), copy=False)
    return tree.sql(dialect='clickhouse')


def capture(value, uniform):
    result = deepcopy(value)
    if uniform:
        for request in result['requests']:
            if 'sql' in request['payload']:
                request['payload']['sql'] = migrate_sql(request['payload']['sql'])
    return result


def reference_expression(service, uniform):
    if service not in ('reactions', 'comments', 'posts'):
        raise ValueError('captured engagement service required')
    return ('ref_value' if uniform or service == 'reactions' else
        "JSONExtractString(body,'" + ('post_id' if service == 'comments' else 'repost_of') + "')")


def scoped(boundary, ids, service, *, uniform, table):
    target = reference_expression(service, uniform)
    predicate = target + ' IN (' + refs.targets(ids) + ')'
    candidates = ('SELECT author_key,doc_id FROM ' + identifier(table) + ' WHERE collection_name='
        + q(service) + ' AND ' + predicate)
    return refs.bounded_boundary(boundary, candidates, predicate, table=table)


def literal_targets(tree):
    where = tree.args.get('where')
    if where is None:
        raise ValueError('literal page targets required')
    predicates = list(where.this.flatten()) if isinstance(where.this, exp.And) else [where.this]
    matches = [node for node in predicates if isinstance(node, exp.In)]
    if len(matches) != 1 or not matches[0].expressions or any(
            not isinstance(item, exp.Literal) or not item.is_string or not item.this for item in matches[0].expressions):
        raise ValueError('one positive literal target set required')
    return sorted({item.this for item in matches[0].expressions})


def followup(compiled, service, *, uniform, table):
    tree = sqlglot.parse_one(compiled, read='clickhouse')
    ids = literal_targets(tree)
    cte = next(cte for cte in tree.args['with_'].expressions if cte.alias == service)
    cte.set('this', sqlglot.parse_one(scoped(cte.this.sql(dialect='clickhouse'), ids, service,
        uniform=uniform, table=table), read='clickhouse'))
    return '/* ENGAGEMENT_DOC_COUNTS */ ' + tree.sql(dialect='clickhouse')


def main(compiled, pointers, profile_pairs, scope, *, uniform, table):
    original = sqlglot.parse_one(compiled, read='clickhouse')
    result = original.copy()
    boundaries = {cte.alias: cte.this for cte in original.args['with_'].expressions}
    ids = [row['doc_id'] for row in pointers]
    source = original.args['from_'].this
    for cte in result.args['with_'].expressions:
        if cte.alias == source.name:
            cte.set('this', sqlglot.parse_one(head(cte.this.sql(dialect='clickhouse'),
                [(row['author_key'], row['doc_id']) for row in pointers], table), read='clickhouse'))
        elif cte.alias == 'profile':
            cte.set('this', sqlglot.parse_one(head(cte.this.sql(dialect='clickhouse'), profile_pairs, table), read='clickhouse'))
    result.args['with_'].set('expressions', [cte for cte in result.args['with_'].expressions
        if cte.alias not in ('reactions', 'comments')])
    for old_join, new_join in zip(original.args.get('joins', []), result.args.get('joins', []), strict=True):
        selected = old_join.this.this if isinstance(old_join.this, exp.Subquery) else None
        if not isinstance(selected, exp.Select) or not any(list(item.find_all(exp.AggFunc)) for item in selected.expressions):
            continue
        service = selected.args['from_'].this.name
        boundary = scoped(boundaries[service].sql(dialect='clickhouse'), ids, service,
            uniform=uniform, table=table)
        selected = selected.copy()
        selected.set('from_', exp.From(this=exp.Subquery(this=sqlglot.parse_one(boundary, read='clickhouse'),
            alias=exp.TableAlias(this=exp.to_identifier(service)))))
        new_join.this.set('this', selected)
    triples = ','.join('(' + ','.join(q(row[key]) for key in ('author_key', 'doc_id', 'group_id')) + ')' for row in pointers)
    alias = source.alias_or_name
    result.where(serve.condition('(' + alias + '.author_key,' + alias + '.doc_id,' + alias + '.group_id) IN ('
        + triples + ')' if triples else '0'), copy=False)
    return '/* ENGAGEMENT_DOC_COUNTS */ ' + result.sql(dialect='clickhouse')


def head(boundary, pairs, table):
    keys = ','.join('(' + q(author) + ',' + q(doc) + ')' for author, doc in sorted(set(pairs)))
    candidates = 'SELECT author_key,doc_id FROM ' + identifier(table) + ' WHERE ' + (
        '(author_key,doc_id) IN (' + keys + ')' if keys else '0')
    return refs.bounded_boundary(boundary, candidates, '1', table=table)


def mixed_components(sql):
    """Isolated count diagnostics, NOT additive per-table attribution."""
    tree = sqlglot.parse_one(sql, read='clickhouse')
    components = []
    for select in tree.find_all(exp.Select):
        if not any(aggregate.find_ancestor(exp.Select) is select
                for item in select.expressions for aggregate in item.find_all(exp.AggFunc)):
            continue
        source = select.args.get('from_')
        if source is None:
            continue
        tables = {table.name for table in select.find_all(exp.Table)}
        if any(name.startswith('counting_numbers') for name in tables) or isinstance(source.this, exp.Subquery):
            component = select.copy()
            if tree.args.get('with_') and component is not tree:
                component.set('with_', tree.args['with_'].copy())
            components.append(component.sql(dialect='clickhouse'))
    return dict(components=components, additive=False,
        policy='isolated component reads are diagnostic; do not subtract native bytes to invent resolution cost')
