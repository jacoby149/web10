"""Real query/read authorization over the separate synthetic hot-cell store."""
import os

import sqlglot
from sqlglot import exp

from arm_satellite_sql import literal as q
import engagement_views_api as base
from arm_f_client import dispatch

POST = os.environ['ENGAGEMENT_HOT_POST']
base.allowed_paths.update(('/v3/query', '/v3/read'))
old_insert = dispatch(base.ch._get_client, 'insert', base.ch.client.insert)


def insert(*args, **kwargs):
    current = base.observer.current.get()
    if current and current.get('request_id') != 'unlabelled':
        kwargs['settings'] = {**(kwargs.get('settings') or {}), 'log_comment': 'F_WRITE:' + current['request_id'],
            'max_memory_usage': 22 * 1024**3}
    return old_insert(*args, **kwargs)


def rewrite(sql, parameters):
    from clickhouse_connect.driver.binding import bind_query
    tree = sqlglot.parse_one(bind_query(sql, parameters)[0] if parameters else sql, read='clickhouse')
    services = {node.expression.this for node in tree.find_all(exp.EQ)
        if isinstance(node.this, exp.Column) and node.this.name == 'collection_name'
        and isinstance(node.expression, exp.Literal) and node.expression.is_string}
    service = next(iter(services)) if len(services) == 1 else None
    predicate = '(ref_value=' + q(POST) + ' OR doc_id=' + q(POST) + ')'
    if base.inside.get():
        predicate = 'doc_id=' + q(POST)
    elif service is not None:
        predicate += ' AND collection_name=' + q(service)
    candidate_source = ' FROM engagement_hot_documents WHERE ' + predicate
    for node in list(tree.find_all(exp.Table)):
        if node.name == 'documents':
            name = 'engagement_hot_documents'
            candidates = 'SELECT author_key,doc_id' + candidate_source
            replacement = sqlglot.parse_one('SELECT * FROM ' + name + ' WHERE (author_key,doc_id) IN (' + candidates + ')', read='clickhouse')
        elif node.name == 'doc_groups':
            name = 'engagement_hot_links'
            owner = node.find_ancestor(exp.Select)
            for window in owner.find_all(exp.Window):
                if {column.name for column in window.args.get('partition_by', [])} == {'doc_id', 'group_id'}:
                    window.set('order', sqlglot.parse_one('SELECT row_number() OVER (ORDER BY updated_at DESC,deleted DESC)',
                        read='clickhouse').expressions[0].args['order'])
            replacement = sqlglot.parse_one('SELECT * FROM ' + name + ' WHERE doc_id IN '
                '(SELECT doc_id' + candidate_source + ')', read='clickhouse')
        else:
            continue
        node.replace(exp.Subquery(this=replacement, alias=exp.TableAlias(this=exp.to_identifier(node.alias_or_name))))
    return tree.sql(dialect='clickhouse'), None


base.rewrite_sql = rewrite
base.ch.client.insert = insert
application = base.application
