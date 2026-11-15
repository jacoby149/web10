"""Exact same-snapshot differential view check, research P/F workers only.

Concurrent deliveries make a later second SELECT a different snapshot. Append
independent sum/array-distinct aggregates to the ORIGINAL canonical event query;
keep every predicate/join/group and the first three output columns unchanged.
Their CPU/memory/bytes stay in the measured native query. No view snapshots or
counters, and no claimed verification of an unobserved concurrent snapshot.
"""
import sqlglot
from sqlglot import exp


def checked_sql(sql):
    tree = sqlglot.parse_one(sql, read='clickhouse')
    if (len(tree.expressions) != 3 or tree.expressions[1].alias_or_name != 'impressions'
            or tree.expressions[2].alias_or_name != 'reach' or tree.expressions[0].sql(dialect='clickhouse') != 'e.doc_id'
            or not isinstance(tree.expressions[1].this, exp.Count)
            or tree.expressions[1].this.this is not None
            or not tree.args.get('group') or tree.args['group'].sql(dialect='clickhouse') != 'GROUP BY e.doc_id'
            or not {'content_events', 'doc_groups'} <= {t.name for t in tree.find_all(exp.Table)}):
        raise ValueError('unrecognized canonical view query; do not guess an oracle')
    reach = tree.expressions[2].this.sql(dialect='clickhouse').lower().replace(' ', '')
    if reach not in ('countdistinct(e.reader_key)', 'count(distincte.reader_key)', 'uniqexact(e.reader_key)'):
        raise ValueError('view reach expression drift')
    oracle = sqlglot.parse_one('SELECT sum(toUInt64(1)) AS f_oracle_impressions,'
        'length(groupUniqArray(e.reader_key)) AS f_oracle_reach', read='clickhouse')
    tree.set('expressions', [*tree.expressions, *oracle.expressions])
    return tree.sql(dialect='clickhouse')


def verify(rows):
    seen, values = set(), []
    for row in rows:
        if (len(row) != 5 or row[0] in seen or int(row[1]) != int(row[3]) or int(row[2]) != int(row[4])
                or not 0 <= int(row[2]) <= int(row[1])):
            raise ValueError('canonical same-snapshot differential view mismatch')
        seen.add(row[0])
        values.append([row[0], int(row[1]), int(row[2])])
    return values
