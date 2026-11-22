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


def pin_sql(docs):
    identities = sorted({(doc['author_key'], doc['doc_id']) for doc in docs})
    if not identities:
        raise ValueError('canonical full-key page documents required')
    keys = ','.join('(' + q(author) + ',' + q(doc) + ')' for author, doc in identities)
    return ("SELECT author_key,doc_id,ref_value,body FROM (SELECT *,row_number() OVER "
        "(PARTITION BY author_key,doc_id ORDER BY updated_at DESC,deleted DESC) AS rn "
        "FROM engagement_documents WHERE (author_key,doc_id) IN (" + pairs.seek([doc for _, doc in identities], role='root')
        + ")) WHERE rn=1 AND deleted=0 AND collection_name='placements' AND (author_key,ref_value) IN (" + keys
        + ") AND JSONExtractString(body,'post_author')=author_key")


def attach(docs, reader, *, execute, readable, compile):
    if not docs:
        return docs
    print('[billboards] canonical pins start posts=', len(docs), flush=True)
    pins = execute(pin_sql(docs))
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
