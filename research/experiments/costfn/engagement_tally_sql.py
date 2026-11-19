"""Generic setup tallies; recipes carry meanings, never the satellite schema."""
from dataclasses import asdict, dataclass
import hashlib
import json

import sqlglot
from sqlglot import exp

import arm_satellite_batch as batch
from arm_satellite_sql import literal as q, identifier

TABLE = 'counting_numbers_tally'
PARTS = TABLE + '_parts'


@dataclass(frozen=True)
class Recipe:
    name: str
    service: str
    fine_key: str = ''
    predicate: str = '1'


RECIPES = (
    Recipe('reactions:like', 'reactions', 'target_id', "JSONExtractString(body,'type')='like'"),
    Recipe('reactions:dislike', 'reactions', 'target_id', "JSONExtractString(body,'type')='dislike'"),
    Recipe('reactions:present', 'reactions', 'target_id'),
    Recipe('reactions:like:direct', 'reactions', '', "JSONExtractString(body,'type')='like' AND JSONExtractString(body,'target_id')=''"),
    Recipe('reactions:dislike:direct', 'reactions', '', "JSONExtractString(body,'type')='dislike' AND JSONExtractString(body,'target_id')=''"),
    Recipe('reactions:present:direct', 'reactions', '', "JSONExtractString(body,'target_id')=''"),
    Recipe('comments', 'comments', 'parent_id'), Recipe('reposts', 'posts'))


def recipes(service):
    return [r for r in RECIPES if r.service == service]


def scope(reader, service, groups, generation, copy_hash):
    return hashlib.sha256(json.dumps(dict(reader=reader, service=service, groups=sorted(groups),
        generation=generation, copy_parts=copy_hash, recipes=[asdict(r) for r in recipes(service)]), sort_keys=True).encode()).hexdigest()


def boundary(service, groups, reader, *, table='engagement_documents', links='doc_groups'):
    from arm_satellite_counts import canonical_boundary
    tree = sqlglot.parse_one(canonical_boundary(service, groups, reader), read='clickhouse')
    for node in tree.find_all(exp.Table):
        if node.name in ('documents', 'doc_groups'):
            node.set('this', exp.to_identifier(table if node.name == 'documents' else links))
    for window in tree.find_all(exp.Window):
        if {c.name for c in window.args.get('partition_by', [])} == {'doc_id', 'group_id'}:
            window.set('order', sqlglot.parse_one('SELECT row_number() OVER (ORDER BY updated_at DESC,deleted DESC)',
                read='clickhouse').expressions[0].args['order'])
    return tree.sql(dialect='clickhouse')


def insert(canonical, service, key, index, total, *, table='engagement_documents', links='doc_groups'):
    source = batch.boundary(canonical, index, total, documents=table, links=links)
    arrays = []
    for recipe in recipes(service):
        targets = 'arrayDistinct(arrayFilter(t->t!=\'\',[ref_value' + (
            ',JSONExtractString(body,' + q(recipe.fine_key) + ')' if recipe.fine_key else '') + ']))'
        arrays.append('if(' + recipe.predicate + ',arrayMap(t->tuple(' + q(recipe.name) + ',t),'
            + targets + '),[])')
    return ('INSERT INTO ' + identifier(PARTS) + ' SELECT tupleElement(item,2) AS doc_id,tupleElement(item,1) AS counter_name,'
        + q(key) + ',' + str(index) + ',count() FROM (SELECT arrayJoin(arrayConcat(' + ','.join(arrays)
        + ')) AS item FROM (' + source + ')) GROUP BY doc_id,counter_name')


def oracle(service, groups, reader, ids, *, table='engagement_documents', links='doc_groups'):
    """Independent FINAL oracle; OR membership, not the builder's target expansion."""
    from arm_satellite_counts import oracle_boundary
    tree = sqlglot.parse_one(oracle_boundary(service, groups, reader), read='clickhouse')
    for node in tree.find_all(exp.Table):
        if node.name in ('documents', 'doc_groups'):
            node.set('this', exp.to_identifier(table if node.name == 'documents' else links))
    values = ','.join(q(value) for value in sorted(set(ids)))
    fine = 'target_id' if service == 'reactions' else 'parent_id' if service == 'comments' else ''
    finer = 'JSONExtractString(body,' + q(fine) + ')' if fine else "''"
    items = []
    # Spell expectations independently; do not call insert()/target expansion.
    if service == 'reactions':
        for kind in ('like', 'dislike'):
            items += ["tuple('reactions:" + kind + "',countIf(JSONExtractString(body,'type')='" + kind
                + "' AND (ref_value=target OR " + finer + '=target)))',
                "tuple('reactions:" + kind + ":direct',countIf(JSONExtractString(body,'type')='" + kind
                + "' AND ref_value=target AND JSONExtractString(body,'target_id')=''))"]
        items += ["tuple('reactions:present',countIf(ref_value=target OR " + finer + '=target))',
            "tuple('reactions:present:direct',countIf(ref_value=target AND JSONExtractString(body,'target_id')=''))"]
    else:
        items = ["tuple('" + ('comments' if service == 'comments' else 'reposts')
            + "',countIf(ref_value=target OR " + finer + '=target))']
    return ('SELECT target AS doc_id,tupleElement(item,1) AS counter_name,tupleElement(item,2) AS value FROM ('
        + 'SELECT target,arrayJoin([' + ','.join(items) + ']) AS item FROM (SELECT * FROM ('
        + tree.sql(dialect='clickhouse') + ') WHERE ref_value IN (' + values + ') OR ' + finer + ' IN (' + values
        + ')) ARRAY JOIN [' + values + '] AS target GROUP BY target) WHERE value>0')
