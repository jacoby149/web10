"""Isolated root-ref experiment constructors. No API imports or engine side effects.

Seek results are candidate identities, never authority. The caller's original
canonical boundary still resolves history, attachments and policy. All new
tables live only in the separately admitted disposable research store.
"""
from collections import defaultdict
from copy import deepcopy
import json

import sqlglot
from sqlglot import exp

from arm_satellite_sql import identifier, literal as q


PROJECTION = """ALTER TABLE {table} ADD PROJECTION ref_sorted (
    SELECT ref_value,collection_name,created_at,doc_id,updated_at,author_key,deleted,
           JSONExtractString(body,'type') AS engagement_type,
           JSONExtractString(body,'target_id') AS engagement_target
    ORDER BY (ref_value,collection_name,created_at,doc_id,updated_at)
)"""


def projection(table='documents'):
    table = identifier(table)
    # Native24.8 rejects projections on ReplacingMergeTree's default 'throw'
    # mode (344). Rebuild preserves the projection across deduplicating merges;
    # 'drop' would silently remove the layout this experiment intends to test.
    return ["ALTER TABLE " + table + " MODIFY SETTING deduplicate_merge_projection_mode='rebuild'",
        PROJECTION.format(table=table), 'ALTER TABLE ' + table + ' MATERIALIZE PROJECTION ref_sorted SETTINGS mutations_sync=2']


def targets(ids):
    if not ids or any(not isinstance(value, str) or not value for value in ids):
        raise ValueError('explicit nonempty root IDs required')
    return ','.join(q(value) for value in sorted(set(ids)))


def without_key(body, key):
    #24.8 JSONMergePatch retains a null-valued member instead of deleting it.
    # Rebuild only the top-level object, keeping every other raw JSON value.
    return ("concat('{',arrayStringConcat(arrayMap(kv->concat(toJSONString(tupleElement(kv,1)),':',tupleElement(kv,2)),"
        "arrayFilter(kv->tupleElement(kv,1)!=" + q(key) + ',JSONExtractKeysAndValuesRaw(' + body + "))),','),'}')")


def seek(ids, *, table='documents'):
    # No deleted filter: an old ref may still lead to a now-deleted/moved item.
    # No FINAL:24.8 cannot use ordinary projections with FINAL. Resolve below.
    return ('SELECT author_key,doc_id FROM ' + identifier(table)
        + ' WHERE ref_value IN (' + targets(ids) + ") AND collection_name IN ('comments','reactions','posts')")


def segment(boundary, ids, *, table='documents'):
    """Narrow the ORIGINAL compiled boundary by full candidate keys, not ref alone.

    Filter ref again AFTER canonical winners. Pushing root/deleted predicates
    into history windows resurrects a moved or deleted document's old version.
    Every original policy/link/window expression stays in place.
    """
    tree = sqlglot.parse_one(boundary, read='clickhouse')
    documents = [node for node in tree.find_all(exp.Table) if node.name == 'documents']
    if not isinstance(tree, exp.Select) or not documents:
        raise ValueError('canonical documents boundary required')
    candidates = seek(ids, table=table)
    for node in documents:
        alias = node.alias_or_name
        replacement = sqlglot.parse_one('SELECT * FROM ' + identifier(table)
            + ' WHERE (author_key,doc_id) IN (' + candidates + ')', read='clickhouse')
        node.replace(exp.Subquery(this=replacement, alias=exp.TableAlias(this=exp.to_identifier(alias))))
    return ('SELECT * FROM (' + tree.sql(dialect='clickhouse') + ') AS authorized_segment '
        'WHERE ref_value IN (' + targets(ids) + ')')


def restructure(rows):
    """Small independent semantic fixture transformer, NOT a full-store loader.

    Resolve a legacy comment through body.post_id (root) or its parent chain.
    doc_id-only edges with multiple authors are ambiguous and refused. Keep all
    physical versions, including tombstones; never silently drop bad rows.
    """
    rows = deepcopy(rows)
    posts = {row['doc_id'] for row in rows if row['collection_name'] == 'posts'}
    comments = defaultdict(list)
    for row in rows:
        if row['collection_name'] == 'comments':
            comments[row['doc_id']].append(row)
    roots, visiting = {}, set()

    def root(comment_id):
        if comment_id in roots:
            return roots[comment_id]
        versions = comments.get(comment_id, [])
        if not versions or len({r['author_key'] for r in versions}) != 1 or comment_id in visiting:
            raise ValueError('missing/ambiguous/cyclic comment reference')
        visiting.add(comment_id)
        resolved = set()
        for row in versions:
            body = json.loads(row['body'])
            declared, parent = body.get('post_id', ''), row['ref_value']
            if not parent:
                raise ValueError('empty legacy comment reference')
            inferred = root(parent) if parent in comments else parent
            if inferred not in posts:
                raise ValueError('missing root post')
            if declared and declared != inferred:
                raise ValueError('conflicting comment root')
            resolved.add(declared or inferred)
        visiting.remove(comment_id)
        if len(resolved) != 1:
            raise ValueError('comment root changed across versions')
        roots[comment_id] = resolved.pop()
        return roots[comment_id]

    for comment_id in comments:
        root(comment_id)
    for row in rows:
        body = json.loads(row['body'])
        service, ref = row['collection_name'], row['ref_value']
        if service == 'comments':
            parent = ref if ref in comments else ''
            if 'parent_id' in body and body['parent_id'] != parent:
                raise ValueError('conflicting reply parent')
            body.pop('post_id', None)
            body['parent_id'] = parent
            row['ref_value'] = roots[row['doc_id']]
        elif service == 'reactions' and ref in comments:
            if 'target_id' in body and body['target_id'] != ref:
                raise ValueError('conflicting reaction target')
            body['target_id'] = ref
            row['ref_value'] = roots[ref]
        elif service == 'posts' and body.get('repost_of'):
            original = body.pop('repost_of')
            if original not in posts or (ref and ref != original):
                raise ValueError('conflicting repost reference')
            row['ref_value'] = original
        row['body'] = json.dumps(body, sort_keys=True, separators=(',', ':'))
    return rows


def threads(rows):
    """Assemble an already-authorized, current root segment; no DB reads here.

    Missing (e.g. private/deleted) parents remain unavailable, never fetched
    outside the segment. Multiple-author doc IDs cannot identify a reply edge.
    """
    result, by_id = [], {}
    for row in rows:
        if row['collection_name'] != 'comments':
            continue
        if row['doc_id'] in by_id:
            raise ValueError('ambiguous comment identity in thread segment')
        by_id[row['doc_id']] = dict(document=row, replies=[])
    for doc_id, node in by_id.items():
        parent = json.loads(node['document']['body']).get('parent_id', '')
        seen = {doc_id}
        cursor = parent
        while cursor in by_id:
            if cursor in seen:
                raise ValueError('cyclic reply tree')
            seen.add(cursor)
            cursor = json.loads(by_id[cursor]['document']['body']).get('parent_id', '')
        if parent in by_id:
            if by_id[parent]['document']['ref_value'] != node['document']['ref_value']:
                raise ValueError('cross-root reply edge')
            by_id[parent]['replies'].append(node)
        else:
            node['parent_unavailable'] = bool(parent)
            result.append(node)
    return result


def migration():
    """Disposable full-store copy, after explicit source validation below.

    Legacy comments' body.post_id is the root, ref is the reply target. The
    mapping includes deleted/history rows, refuses author/root ambiguity, and
    never uses an ANY join to silently choose a namesake. Source is unchanged.
    INSERT names every destination field and preserves all physical versions.
    """
    root = "JSONExtractString(body,'post_id')"
    checks = {
        'comment_root_required': "SELECT count() AS n FROM documents WHERE collection_name='comments' AND " + root + "=''",
        'comment_identity_ambiguous': "SELECT count() AS n FROM (SELECT doc_id FROM documents WHERE collection_name='comments' GROUP BY doc_id HAVING uniqExact(author_key)!=1 OR uniqExact(" + root + ")!=1)",
        'comment_root_missing': "SELECT count() AS n FROM documents WHERE collection_name='comments' AND " + root + " NOT IN (SELECT doc_id FROM documents WHERE collection_name='posts')",
        'comment_parent_missing': "SELECT count() AS n FROM documents WHERE collection_name='comments' AND ref_value NOT IN (SELECT doc_id FROM documents WHERE collection_name IN ('posts','comments'))",
        'comment_parent_wrong_root': "SELECT count() AS n FROM documents c INNER JOIN documents p ON c.ref_value=p.doc_id WHERE c.collection_name='comments' AND p.collection_name='comments' AND JSONExtractString(c.body,'post_id')!=JSONExtractString(p.body,'post_id')",
        'repost_root_missing': "SELECT count() AS n FROM documents WHERE collection_name='posts' AND JSONExtractString(body,'repost_of')!='' AND JSONExtractString(body,'repost_of') NOT IN (SELECT doc_id FROM documents WHERE collection_name='posts')",
        'repost_conflicting_ref': "SELECT count() AS n FROM documents WHERE collection_name='posts' AND JSONExtractString(body,'repost_of')!='' AND ref_value!='' AND ref_value!=JSONExtractString(body,'repost_of')",
        'nonrepost_post_ref': "SELECT count() AS n FROM documents WHERE collection_name='posts' AND ref_value!='' AND JSONExtractString(body,'repost_of')=''",
        'reserved_body_keys': "SELECT count() AS n FROM documents WHERE (collection_name='comments' AND JSONHas(body,'parent_id')) OR (collection_name='reactions' AND JSONHas(body,'target_id'))",
    }
    columns = 'doc_id,author_key,collection_name,body,ref_value,tags,created_at,updated_at,deleted,ad_mode,ad_target,posted_by'
    body = ("multiIf(d.collection_name='comments',JSONMergePatch(" + without_key('d.body', 'post_id') + ",concat('{\"parent_id\":',"
        "toJSONString(if(d.ref_value=JSONExtractString(d.body,'post_id'),'',d.ref_value)),'}')),"
        "d.collection_name='reactions' AND r.doc_id!='',JSONMergePatch(d.body,concat('{\"target_id\":',toJSONString(d.ref_value),'}')),"
        "d.collection_name='posts' AND JSONExtractString(d.body,'repost_of')!=''," + without_key('d.body', 'repost_of') + ',d.body)')
    ref = ("multiIf(d.collection_name='comments',JSONExtractString(d.body,'post_id'),"
        "d.collection_name='reactions' AND r.doc_id!='',r.root,"
        "d.collection_name='posts' AND JSONExtractString(d.body,'repost_of')!='',JSONExtractString(d.body,'repost_of'),d.ref_value)")
    select = 'd.doc_id,d.author_key,d.collection_name,' + body + ',' + ref + ',d.tags,d.created_at,d.updated_at,d.deleted,d.ad_mode,d.ad_target,d.posted_by'
    statements = [
        'CREATE TABLE engagement_comment_roots (doc_id String,root String) ENGINE=MergeTree ORDER BY doc_id',
        "INSERT INTO engagement_comment_roots SELECT doc_id,min(" + root + ") FROM documents WHERE collection_name='comments' GROUP BY doc_id",
        # Explicit CREATE, not AS documents: AS would inherit ref_sorted and a
        # subsequent ADD would collide. This also preserves the canonical PK.
        'CREATE TABLE engagement_documents AS documents',
        'ALTER TABLE engagement_documents DROP PROJECTION ref_sorted',
        'INSERT INTO engagement_documents (' + columns + ') SELECT ' + select + ' FROM documents d LEFT JOIN '
        'engagement_comment_roots r ON d.ref_value=r.doc_id',
        *projection('engagement_documents'),
    ]
    return checks, statements


def roundtrip_check(batch, batches=32):
    """Exact inverse-semantics multiset, not hashes/counts as a parity oracle.

    Hashing only partitions full identities; every field and raw multiplicity
    still participates in equality inside each partition. Changed keys become
    missing+extra, never cancel via a lossy checksum. JSON formatting/key order
    is not semantic; compare sorted raw key/value pairs after inverse mapping.
    """
    if type(batch) is not int or type(batches) is not int or not 0 <= batch < batches <= 64:
        raise ValueError('bounded complete-key validation batch required')
    body = ("multiIf(collection_name='comments',JSONMergePatch(" + without_key('body', 'parent_id') + ",concat('{\"post_id\":',toJSONString(ref_value),'}')),"
        "collection_name='reactions' AND JSONHas(body,'target_id')," + without_key('body', 'target_id') + ','
        "collection_name='posts' AND ref_value!='',JSONMergePatch(body,concat('{\"repost_of\":',toJSONString(ref_value),'}')),body)")
    ref = ("multiIf(collection_name='comments',if(JSONExtractString(body,'parent_id')='',ref_value,JSONExtractString(body,'parent_id')),"
        "collection_name='reactions' AND JSONHas(body,'target_id'),JSONExtractString(body,'target_id'),"
        # Legacy repost refs may already have named the original or been empty;
        # compare against its source ref via a full-key history-independent map.
        "collection_name='posts' AND ref_value!='',if((author_key,doc_id,updated_at,deleted) IN (SELECT author_key,doc_id,updated_at,deleted FROM documents WHERE collection_name='posts' AND ref_value!=''),ref_value,''),ref_value)")
    original = 'doc_id,author_key,collection_name,arraySort(JSONExtractKeysAndValuesRaw(body)),ref_value,tags,created_at,updated_at,deleted,ad_mode,ad_target,posted_by'
    restored = ('doc_id,author_key,collection_name,arraySort(JSONExtractKeysAndValuesRaw(' + body + ')),' + ref
        + ',tags,created_at,updated_at,deleted,ad_mode,ad_target,posted_by')
    predicate = 'cityHash64(author_key,doc_id)%' + str(batches) + '=' + str(batch)
    return ('SELECT count() AS mismatches FROM (SELECT value,sum(delta) AS balance FROM ('
        'SELECT tuple(' + original + ') AS value,toInt64(1) AS delta FROM documents WHERE ' + predicate
        + ' UNION ALL SELECT tuple(' + restored + ') AS value,toInt64(-1) AS delta FROM engagement_documents WHERE '
        + predicate + ') GROUP BY value HAVING balance!=0)')
