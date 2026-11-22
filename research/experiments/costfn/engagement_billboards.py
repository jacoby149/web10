"""Setup-only static billboard placement and exact response oracle.

No runtime inventory selection, reader identity, credential or engine access.
Production placement remains outside this admission. Full keys distinguish the
paired same-doc-id/different-author fixtures throughout.
"""
from copy import deepcopy
import hashlib
import json
from fractions import Fraction
import uuid

PIN_SEMANTICS = 'D124_FULL_CREATIVE_AGREEMENT_AUTHOR_FIRST'


def key(row):
    value = row['author_key'], row['doc_id']
    if any(not isinstance(v, str) or not v for v in value):
        raise ValueError('full nonempty document identity required')
    return value


def ratio(value):
    if isinstance(value, bool):
        raise ValueError('node ratio must be a rational number from zero through one')
    value = Fraction(str(value))
    if not 0 <= value <= 1:
        raise ValueError('node ratio out of range')
    return value


def roll(seed, post):
    # Exact integer arithmetic; independent of reader, page order and processes.
    encoded = json.dumps([seed, *key(post)], separators=(',', ':'), ensure_ascii=True)
    return int.from_bytes(hashlib.sha256(encoded.encode()).digest(), 'big')


def plan(posts, author_collections, node_collection, *, author_posts, node_ratio, seed):
    percentage = ratio(node_ratio)
    if not isinstance(seed, str) or not seed:
        raise ValueError('explicit seeded setup required')
    identities = [key(post) for post in posts]
    if len(set(identities)) != len(identities):
        raise ValueError('setup posts must have unique full identities')
    author_posts = set(author_posts)
    if not author_posts <= set(identities):
        raise ValueError('declared author-pin subset contains an unknown post')
    for owner, collection in author_collections.items():
        if any(key(ad)[0] != owner for ad in collection):
            raise ValueError('author collection contains a foreign creative')
    for collection in [node_collection, *author_collections.values()]:
        if len({key(ad) for ad in collection}) != len(collection):
            raise ValueError('duplicate creative in collection')
    cursors, records, pins = {}, [], []
    for post in sorted(posts, key=key):
        identity = key(post)
        author = identity in author_posts
        draw = roll(seed, post)
        kind = 'author' if author else ('node' if draw * percentage.denominator < percentage.numerator * 2**256 else 'none')
        collection = author_collections.get(identity[0], []) if author else node_collection
        ad, index = None, None
        if kind != 'none':
            if not collection:
                raise ValueError('selected placement has no declared creative collection')
            cursor = ('author', identity[0]) if author else ('node', '')
            index = cursors.get(cursor, 0) % len(collection)
            cursors[cursor] = cursors.get(cursor, 0) + 1
            ad = deepcopy(collection[index])
        record = dict(post=list(identity), placement=kind, ad=ad, collection_index=index, roll=str(draw))
        records.append(record)
        if ad is not None:
            pins.append(dict(doc_id=str(uuid.uuid5(uuid.NAMESPACE_URL, json.dumps(['billboard', *identity]))),
                author_key=identity[0], collection_name='placements', ref_value=identity[1],
                body=dict(target_id=ad['doc_id'], target_author=ad['author_key'],
                    post_author=identity[0], placement=kind)))
    return dict(kind='SETUP_ONLY_IMMUTABLE_BILLBOARDS', seed=seed, node_ratio=str(percentage),
        selection='round_robin_across_posts_never_reads', author_posts=[list(v) for v in sorted(author_posts)],
        posts=records, pins=pins, reader_targeting=False)


def expected_rows(rows, setup):
    """Independent D124 oracle over immutable eligible placement records.

    Banked setup has one record per post. Purpose-built amendment fixtures may
    carry multiple settled pin records; runtime pins/satellites never feed this.
    """
    records = {}
    for record in setup['posts']:
        records.setdefault(tuple(record['post']), []).append(record)
    result = []
    for original in rows:
        identity = key(original)
        if identity not in records:
            raise ValueError('actual page post missing from immutable ad setup')
        row = {k: deepcopy(v) for k, v in original.items() if k not in ('ad', 'node_ad')}
        live = []
        for record in records[identity]:
            kind, ad = record['placement'], record['ad']
            if kind not in ('author', 'node', 'none') or ((kind == 'none') != (ad is None)):
                raise ValueError('malformed immutable ad setup')
            if ad is not None:
                target = key(ad)
                if kind == 'author' and target[0] != identity[0]:
                    raise ValueError('immutable author placement names foreign creative')
                live.append((kind, target, ad))
        if len({target for _, target, _ in live}) > 1:
            raise ValueError('immutable pins name different ads for one post')
        if live:
            ad = live[0][2]
            if any(creative != ad for _, _, creative in live):
                raise ValueError('inconsistent immutable payload for one creative identity')
            kind = 'author' if any(kind == 'author' for kind, _, _ in live) else 'node'
            row['ad' if kind == 'author' else 'node_ad'] = deepcopy(ad)
        result.append(row)
    return result


def compare(actual, canonical_rows, setup):
    expected = expected_rows(canonical_rows, setup)
    if actual != expected:
        raise ValueError('exact billboard identity/content/placement or canonical page parity failed')
    return dict(parity='PASS', exact_creative_identity_required=True, pin_semantics=PIN_SEMANTICS, checked_posts=len(expected),
        author_pins=sum('ad' in row for row in expected), node_pins=sum('node_ad' in row for row in expected))
