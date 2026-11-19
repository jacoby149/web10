"""Derived N-ref candidates. Canonical history/policy remains the only authority.

No engine or API import-time effects. Historical edges deliberately survive:
moving/deleting a document must not make its old version a new winner. The
original compiled boundary resolves complete full-key histories AFTER the seek.
"""
import json

import sqlglot
from sqlglot import exp

from arm_satellite_sql import identifier, literal as q
import engagement_ref as canonical

TABLE = 'pairs_refs'
TARGET_KEYS = ('parent_id', 'target_id', 'ad_id')
DDL = ("CREATE TABLE pairs_refs (doc_id String,ref_id String,author_key String,role String) "
    "ENGINE=MergeTree ORDER BY (ref_id,doc_id)")


def declared(row):
    """Independent small-fixture oracle; roles are data, never permission bits."""
    body = json.loads(row['body']) if isinstance(row['body'], str) else row['body']
    if not isinstance(body, dict):
        raise ValueError('document body must be an object')
    root = row['ref_value']
    if not isinstance(root, str):
        raise ValueError('one governing root string required')
    extra = body.get('refs', [])
    if not isinstance(extra, list) or any(not isinstance(v, str) for v in extra):
        raise ValueError('body refs must be an array of strings')
    result = {(root, 'root')} if root else set()
    for value in [body.get(key, '') for key in TARGET_KEYS] + extra:
        if not isinstance(value, str):
            raise ValueError('declared target must be a string')
        if value:
            result.add((value, 'target'))
    return result


def oracle(rows):
    return {(row['author_key'], row['doc_id'], ref, role)
        for row in rows for ref, role in declared(row)}


def source(table='engagement_documents'):
    targets = '[' + ','.join("JSONExtractString(body," + q(key) + ')' for key in TARGET_KEYS) + ']'
    edges = ("arrayDistinct(arrayConcat(if(ref_value='',[],[(ref_value,'root')]),"
        "arrayMap(v->(v,'target'),arrayFilter(v->v!='',arrayConcat(" + targets
        + ",JSONExtract(body,'refs','Array(String)'))))))")
    return ('SELECT DISTINCT doc_id,tupleElement(edge,1) AS ref_id,author_key,tupleElement(edge,2) AS role '
        'FROM ' + identifier(table) + ' ARRAY JOIN ' + edges + ' AS edge')


def build(table='engagement_documents', satellite=TABLE):
    return 'INSERT INTO ' + identifier(satellite) + ' ' + source(table)


def validate_source(table='engagement_documents'):
    invalid = ["JSONType(body)!='Object'"]
    invalid += ['(JSONHas(body,' + q(key) + ') AND JSONType(body,' + q(key) + ")!='String')" for key in TARGET_KEYS]
    invalid.append("(JSONHas(body,'refs') AND (JSONType(body,'refs')!='Array' OR "
        "arrayExists(v->JSONType(v)!='String',JSONExtractArrayRaw(body,'refs'))))")
    return 'SELECT count() AS invalid FROM ' + identifier(table) + ' WHERE ' + ' OR '.join(invalid)


def census(table='engagement_documents', satellite=TABLE, *, batch=0, batches=32):
    """Exact bidirectional set comparison, independently expanded with UNION.

    Hashing only divides the domain. Full identity/ref/role equality decides the
    verdict. Multiplicity of identical physical history edges is intentionally
    collapsed, but duplicate satellite rows are separately refused below.
    """
    if type(batch) is not int or type(batches) is not int or not 0 <= batch < batches <= 64:
        raise ValueError('complete census partition required')
    table, satellite = identifier(table), identifier(satellite)
    lane = 'cityHash64(author_key,doc_id)%' + str(batches) + '=' + str(batch)
    branches = ["SELECT author_key,doc_id,ref_value AS ref_id,'root' AS role FROM " + table
        + " WHERE " + lane + " AND ref_value!=''"]
    for key in TARGET_KEYS:
        value = 'JSONExtractString(body,' + q(key) + ')'
        branches.append("SELECT author_key,doc_id," + value + " AS ref_id,'target' AS role FROM "
            + table + ' WHERE ' + lane + ' AND ' + value + "!=''")
    branches.append("SELECT author_key,doc_id,ref_id,'target' AS role FROM " + table
        + " ARRAY JOIN JSONExtract(body,'refs','Array(String)') AS ref_id WHERE " + lane + " AND ref_id!=''")
    expected = 'SELECT DISTINCT author_key,doc_id,ref_id,role FROM (' + ' UNION ALL '.join(branches) + ')'
    actual = 'SELECT author_key,doc_id,ref_id,role FROM ' + satellite + ' WHERE ' + lane
    return ('SELECT count() AS mismatches FROM (SELECT author_key,doc_id,ref_id,role,sum(delta) AS balance FROM ('
        'SELECT *,toInt64(1) AS delta FROM (' + expected + ') UNION ALL SELECT *,toInt64(-1) AS delta FROM ('
        + actual + ')) GROUP BY author_key,doc_id,ref_id,role HAVING balance!=0)')


def seek(ids, *, role=None, satellite=TABLE):
    if role not in (None, 'root', 'target'):
        raise ValueError('declared role required')
    return ('SELECT author_key,doc_id FROM ' + identifier(satellite) + ' WHERE ref_id IN ('
        + canonical.targets(ids) + ')' + (' AND role=' + q(role) if role else ''))


def segment(boundary, ids, *, table='engagement_documents', role='root', satellite=TABLE):
    # Relationship edges never broaden a root permission scope. Fine-target
    # callers keep their own outer predicate after resolving canonical winners.
    if role != 'root':
        raise ValueError('target-edge seeks must preserve their own canonical target predicate, never borrow root scope')
    return canonical.bounded_boundary(canonical_heads(boundary), seek(ids, role=role, satellite=satellite),
        'ref_value IN (' + canonical.targets(ids) + ')', table=table)


def root_targets(tree):
    """Both real /read single-ref equality and captured multi-root IN shapes."""
    where = tree.args.get('where')
    if where is None:
        return None
    atoms = list(where.this.flatten()) if isinstance(where.this, exp.And) else [where.this]
    matches = []
    for atom in atoms:
        if not isinstance(atom, (exp.EQ, exp.In)) or not isinstance(atom.this, exp.Column) or atom.this.name != 'ref_value':
            continue
        values = [atom.expression] if isinstance(atom, exp.EQ) else atom.expressions
        if not values or any(not isinstance(v, exp.Literal) or not v.is_string or not v.this for v in values):
            raise ValueError('literal nonempty governing roots required')
        matches.append((atom, sorted({v.this for v in values})))
    if not matches:
        if any(v.name == 'ref_value' for v in where.find_all(exp.Column)):
            raise ValueError('unsupported governing-root predicate must not fall back to a history scan')
        return None
    if len(matches) != 1:
        raise ValueError('one governing-root constraint required')
    chosen, ids = matches[0]
    if any(v.name == 'ref_value' for atom in atoms if atom is not chosen for v in atom.find_all(exp.Column)):
        raise ValueError('ambiguous extra governing-root predicate')
    return ids


def canonical_heads(boundary):
    tree = sqlglot.parse_one(boundary, read='clickhouse')
    for window in tree.find_all(exp.Window):
        if {column.name for column in window.args.get('partition_by', [])} == {'doc_id', 'author_key'}:
            window.set('order', sqlglot.parse_one('SELECT row_number() OVER (ORDER BY updated_at DESC,deleted DESC)',
                read='clickhouse').expressions[0].args['order'])
    return tree.sql(dialect='clickhouse')


def scoped(boundary, ids, service, *, uniform, table):
    if uniform is not True or table != 'engagement_documents':
        raise ValueError('pairs treatment requires migrated canonical semantics')
    return segment(boundary, ids, table=table)
