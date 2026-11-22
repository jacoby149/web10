"""Read canonical pins/creatives without inventory selection or cached bodies.

Dependency-injected for no-engine tests. The caller must supply already-bound
canonical page documents. A pin is authored by that post's author and inherits
its ONE governing root's authorized scope; target refs never grant access to
the creative. Creative payloads still pass the existing live service read gate.
"""
from copy import deepcopy
import json

from arm_satellite_sql import literal as q
import engagement_pairs as pairs
import engagement_queries as queries


def page_keys(docs):
    identities = sorted({(doc['author_key'], doc['doc_id']) for doc in docs})
    if not identities:
        raise ValueError('canonical full-key page documents required')
    return ','.join('(' + q(author) + ',' + q(doc) + ')' for author, doc in identities)


def pin_selection_sql(docs):
    keys = page_keys(docs)
    return ("SELECT author_key,doc_id,ref_value,candidate_count FROM ("
        "SELECT author_key,doc_id,ref_value,collection_name,deleted,count() OVER () AS candidate_count FROM ("
        "SELECT author_key,doc_id,ref_value,collection_name,deleted,updated_at,row_number() OVER "
        "(PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn "
        "FROM engagement_documents WHERE (author_key,doc_id) IN (" + pairs.seek([doc['doc_id'] for doc in docs], role='root')
        + ")) WHERE rn=1) AS pin_selection_current_winners "
        "WHERE deleted=0 AND collection_name='placements' AND (author_key,ref_value) IN (" + keys
        + ") ORDER BY author_key,doc_id")


def pin_materialization_sql(docs, selected):
    if not selected:
        raise ValueError('nonempty exact pin survivor identities required')
    keys = ','.join('(' + q(row['author_key']) + ',' + q(row['doc_id']) + ')' for row in selected)
    roots = ','.join('(' + q(row['author_key']) + ',' + q(row['doc_id']) + ',' + q(row['ref_value']) + ')'
        for row in selected)
    return ("SELECT author_key,doc_id,ref_value,body FROM ("
        "SELECT author_key,doc_id,ref_value,body,collection_name,deleted,updated_at,row_number() OVER "
        "(PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn "
        "FROM engagement_documents WHERE (author_key,doc_id) IN (" + keys
        + ")) AS pin_materialization_current_winners WHERE rn=1 AND deleted=0 AND collection_name='placements' "
        "AND (author_key,ref_value) IN (" + page_keys(docs) + ") AND (author_key,doc_id,ref_value) IN (" + roots
        + ") AND JSONExtractString(body,'post_author')=author_key ORDER BY author_key,doc_id")


def select_pins(docs, execute):
    selected = execute(pin_selection_sql(docs))
    keys = [(row['author_key'], row['doc_id']) for row in selected]
    posts = {(doc['author_key'], doc['doc_id']) for doc in docs}
    if (keys != sorted(set(keys)) or any((row['author_key'], row['ref_value']) not in posts for row in selected)
            or any(set(row) != {'author_key', 'doc_id', 'ref_value', 'candidate_count'} for row in selected)
            or any(int(row['candidate_count']) < len(selected) for row in selected)
            or len({int(row['candidate_count']) for row in selected}) > 1):
        raise ValueError('invalid exact canonical pin survivor handoff')
    print('[billboards] pin_selection finish survivors=', len(selected),
        'canonical_candidates=', selected[0]['candidate_count'] if selected else 'see native receipt', flush=True)
    return selected


def materialize_pins(docs, selected, execute):
    pins = execute(pin_materialization_sql(docs, selected))
    keys = [(row['author_key'], row['doc_id']) for row in pins]
    expected = {(row['author_key'], row['doc_id']): row['ref_value'] for row in selected}
    if (keys != sorted(set(keys)) or any(key not in expected or row['ref_value'] != expected[key]
            for key, row in zip(keys, pins))):
        raise ValueError('materialized pins differ from exact survivor handoff')
    print('[billboards] pin_materialization finish eligible_bodies=', len(pins), flush=True)
    return pins


def attach(docs, reader, *, execute, readable, compile):
    if not docs:
        return docs
    print('[billboards] canonical pins start posts=', len(docs), flush=True)
    selected = select_pins(docs, execute)
    pins = materialize_pins(docs, selected, execute) if selected else []
    placements, wanted, validated = {}, set(), []
    for pin in pins:
        body = json.loads(pin['body']) if isinstance(pin['body'], str) else pin['body']
        if not isinstance(body, dict):
            raise ValueError('malformed canonical billboard pin')
        root = pin['author_key'], pin['ref_value']
        target = body.get('target_author'), body.get('target_id')
        if (body.get('post_author') != root[0] or body.get('placement') not in ('author', 'node')
                or any(not isinstance(v, str) or not v for v in target)):
            raise ValueError('malformed canonical billboard pin')
        if body['placement'] == 'author' and target[0] != root[0]:
            raise ValueError('author billboard cannot name another author collection')
        validated.append((root, body['placement'], target))
    # D124 deliberately permits agreeing pins. Validate the complete eligible
    # set first; no duplicate can hide a malformed/unauthorized pin.
    for root, kind, target in validated:
        previous = placements.get(root)
        if previous is not None and previous[1] != target:
            raise ValueError('live pins name different ads for one full-key post')
        if previous is None or kind == 'author':
            placements[root] = kind, target  # Author wins among agreeing placements.
        wanted.add(target)
    print('[billboards] canonical pins finish pins=', len(placements), flush=True)
    creatives = {}
    if wanted:
        groups = readable(reader, 'posts')
        if groups:
            ids = sorted({doc for _, doc in wanted})
            sql = ('SELECT DISTINCT doc_id,author_key,posted_by,body,tags FROM posts WHERE doc_id IN ('
                + ','.join(q(doc) for doc in ids) + ')')
            boundary = compile(sql, {'posts': groups}, member_key=reader, allowed_services=frozenset({'posts'}))
            # Retain the ORIGINAL canonical compiler, including all current
            # policy/history/link checks; pairs merely bound its physical lane.
            compiled = queries.head(pairs.canonical_heads(boundary), wanted, 'engagement_documents')
            print('[billboards] canonical creatives start targets=', len(wanted), flush=True)
            for creative in execute(compiled):
                identity = creative['author_key'], creative['doc_id']
                if identity not in wanted or identity in creatives:
                    raise ValueError('unexpected/ambiguous canonical creative identity')
                creative = deepcopy(creative)
                if isinstance(creative['body'], str):
                    creative['body'] = json.loads(creative['body'])
                creatives[identity] = creative
            print('[billboards] canonical creatives finish visible=', len(creatives), flush=True)
    result = []
    for doc in docs:
        row = {k: deepcopy(v) for k, v in doc.items() if k not in ('ad', 'node_ad')}
        placement = placements.get((doc['author_key'], doc['doc_id']))
        if placement:
            kind, identity = placement
            if identity in creatives:
                row['ad' if kind == 'author' else 'node_ad'] = deepcopy(creatives[identity])
        result.append(row)
    return result
