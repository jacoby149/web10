"""Exact captured-count substitution; original document/profile gates stay put."""
import sqlglot
from sqlglot import exp

import arm_satellite_serve as serve
import engagement_queries as original
import engagement_tally_sql as tally
from arm_satellite_sql import literal as q, identifier


def stored(selected, service, key, ids, *, uniform=True):
    target = selected.expressions[0]
    expression = target.this if isinstance(target, exp.Alias) else target
    wanted = original.reference_expression(service, uniform)
    if expression.sql(dialect='clickhouse') != sqlglot.parse_one('SELECT ' + wanted, read='clickhouse').expressions[0].sql(dialect='clickhouse'):
        raise ValueError('unbuilt tally target family')
    group = selected.args.get('group')
    if not group or len(group.expressions) != 1 or group.expressions[0].sql(dialect='clickhouse') not in (expression.sql(dialect='clickhouse'), target.alias_or_name):
        raise ValueError('unbuilt tally grouping')
    known = serve.recipe_expressions()
    fields, names = ['doc_id AS ' + identifier(target.alias_or_name)], []
    for item in selected.expressions[1:]:
        aggregate = item.this if isinstance(item, exp.Alias) else item
        found = known.get((service, aggregate.sql(dialect='clickhouse')))
        if not found:
            raise ValueError('unbuilt tally aggregate')
        name = found[0] + (':direct' if service == 'reactions' else '')
        fields.append('maxIf(value,counter_name=' + q(name) + ') AS ' + identifier(item.alias_or_name))
        names.append(name)
    if not names:
        raise ValueError('nonempty count projection required')
    if service == 'reactions':
        names.append('reactions:present:direct')
    # Only the pinned target constraint and its direct-reaction clause may vanish.
    where = selected.args.get('where')
    atoms = list(where.this.flatten()) if where and isinstance(where.this, exp.And) else [where.this] if where else []
    allowed = [serve.condition(wanted + "<>''")]
    if uniform and service == 'reactions':
        allowed.append(serve.condition("JSONExtractString(body,'target_id')=''"))
        if not any(atom == allowed[-1] for atom in atoms):
            raise ValueError('root-wide reaction query is not the direct-feed counter kind')
    for atom in atoms:
        if any(atom == candidate for candidate in allowed):
            continue
        if isinstance(atom, exp.In) and atom.this == expression and all(isinstance(v, exp.Literal) and v.is_string for v in atom.expressions) and {v.this for v in atom.expressions} == set(ids):
            continue
        raise ValueError('unbuilt tally predicate; do not drop caller conditions')
    result = ('SELECT ' + ','.join(fields) + ' FROM ' + tally.TABLE + ' WHERE scope_key IN (' + q(key)
        + ') AND doc_id IN (' + serve.literals(ids) + ') AND counter_name IN (' + serve.literals(names) + ') GROUP BY doc_id')
    for modifier in ('order', 'limit', 'offset'):
        if selected.args.get(modifier):
            result += ' ' + selected.args[modifier].sql(dialect='clickhouse')
    return result


def main(compiled, pointers, profiles, scope, scopes, *, uniform, table):
    before = sqlglot.parse_one(compiled, read='clickhouse')
    result = sqlglot.parse_one(original.main(compiled, pointers, profiles, scope, uniform=uniform, table=table), read='clickhouse')
    ids = [row['doc_id'] for row in pointers]
    for old, new in zip(before.args.get('joins', []), result.args.get('joins', []), strict=True):
        selected = old.this.this if isinstance(old.this, exp.Subquery) else None
        if isinstance(selected, exp.Select) and any(list(item.find_all(exp.AggFunc)) for item in selected.expressions):
            service = selected.args['from_'].this.name
            new.this.set('this', sqlglot.parse_one(stored(selected, service, scopes[service], ids, uniform=uniform), read='clickhouse'))
    return '/* ENGAGEMENT_DOC_COUNTS TALLY */ ' + result.sql(dialect='clickhouse')


def guard(tree, allowed_scopes):
    def literal(node):
        if isinstance(node, exp.Literal) and node.is_string:
            return node.this
        if isinstance(node, exp.Unhex) and isinstance(node.this, exp.Literal):
            return bytes.fromhex(node.this.this).decode()
        raise ValueError('tally lookup requires server literal keys')
    for table in tree.find_all(exp.Table):
        if not table.name.startswith('counting_numbers'):
            continue
        if table.name != tally.TABLE:
            raise ValueError('unadmitted legacy counter table')
        where = table.find_ancestor(exp.Select).args.get('where')
        predicates = list(where.this.flatten()) if where and isinstance(where.this, exp.And) else []
        found = {}
        for predicate in predicates:
            if not isinstance(predicate, exp.In) or not isinstance(predicate.this, exp.Column):
                raise ValueError('tally predicate must be positive key conjunction')
            found[predicate.this.name] = {literal(v) for v in predicate.expressions}
        if set(found) != {'scope_key', 'doc_id', 'counter_name'} or any(not v or '' in v for v in found.values()) or not found['scope_key'] <= set(allowed_scopes):
            raise ValueError('unbound tally scope/targets/kinds')
