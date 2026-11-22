"""D123's sole raw-events exception: exact bounded delivery-history question."""
import sqlglot
from sqlglot import exp

STAGE = 'delivery_dedup_raw_read'
_SHAPE = sqlglot.parse_one('SELECT doc_id,max(seen_at) FROM content_events GROUP BY doc_id', read='clickhouse')
_EQUALITIES = {'service', 'reader_key', 'surface', 'event_type'}


def _terms(node):
    node = node.unnest()
    if isinstance(node, exp.And):
        return [*_terms(node.this), *_terms(node.expression)]
    return [node]


def admitted(tree):
    """Literal values may change; columns, scopes, operators and clauses may not."""
    tree = tree.copy()
    for identifier in tree.find_all(exp.Identifier):
        identifier.set('quoted', False)
    where = tree.args.get('where')
    if where is None:
        return False
    tree.set('where', None)
    if tree != _SHAPE:
        return False  # Also denies joins/CTEs/subqueries/aliases/HAVING/extra clauses.
    seen = set()
    for term in _terms(where.this):
        if isinstance(term, exp.EQ):
            column, literal = term.this, term.expression
            name = column.name if isinstance(column, exp.Column) else None
            if (name not in _EQUALITIES or column != exp.column(name)
                    or not isinstance(literal, exp.Literal) or not literal.is_string
                    or (name == 'event_type' and literal.this != 'delivery')
                    or term != exp.EQ(this=exp.column(name), expression=literal.copy())):
                return False
        elif isinstance(term, exp.In):
            name = 'doc_id'
            values = term.expressions
            if (term.this != exp.column(name) or not values
                    or any(not isinstance(value, exp.Literal) or not value.is_string for value in values)
                    or term != exp.In(this=exp.column(name), expressions=[v.copy() for v in values])):
                return False
        else:
            return False
        if name in seen:
            return False
        seen.add(name)
    return seen == _EQUALITIES | {'doc_id'}
