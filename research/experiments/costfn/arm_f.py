"""Config F construction/merge primitives. No imports, hooks or engine at import.

Canonical membership is enumerated once per publication. Pointers never authorize.
The isolated adapter supplies live canonical resolution and real authorized writes.
"""
from datetime import UTC, datetime
import heapq

from arm_satellite_sql import literal

CUTOFF = 2000
CAP = 200
GRANULARITY = 64
DDL = """CREATE TABLE fanout (
    reader_key String,
    created_at DateTime64(3, 'UTC'),
    author_key String,
    doc_id String,
    group_id String,
    version UInt64,
    deleted UInt8 DEFAULT 0,
    merge_version UInt64 MATERIALIZED version * 2 + toUInt64(deleted),
    CONSTRAINT valid_version CHECK version > 0 AND version <= 9223372036854775807,
    CONSTRAINT valid_deleted CHECK deleted IN (0, 1)
) ENGINE = ReplacingMergeTree(merge_version)
ORDER BY (reader_key, created_at, doc_id, author_key, group_id)
SETTINGS index_granularity = 64"""
COLUMNS = ['reader_key', 'created_at', 'author_key', 'doc_id', 'group_id', 'version', 'deleted']
MEMBERS = """SELECT member_key FROM (
 SELECT member_key,deleted,row_number() OVER (
 PARTITION BY group_id,member_key ORDER BY updated_at DESC,deleted DESC) AS rn
 FROM group_members WHERE group_id={group_id:String})
 WHERE rn=1 AND deleted=0 AND member_key NOT IN ('anyone','authenticated','anon')
 ORDER BY member_key"""


def recipients(query, group):
    """One complete canonical pass. No limit, separate count, cache or counter."""
    keys = [row[0] for row in query(MEMBERS, parameters={'group_id': group}).result_rows]
    if len(set(keys)) != len(keys) or any(not isinstance(key, str) or not key for key in keys):
        raise ValueError('invalid canonical recipient rows')
    return keys


def append_publication(query, insert, document, group, version):
    """Called after real canonical authorization/attachment by the coordinator.

    Critically, there is no read or rerank of a reader's existing fanout list.
    The large-group path still pays the full canonical membership enumeration.
    """
    if type(version) is not int or not 0 < version <= 2**63 - 1:
        raise ValueError('durable positive revision required')
    keys = recipients(query, group)
    small = len(keys) < CUTOFF
    rows = [[key, document['created_at'], document['author_key'], document['doc_id'], group, version, 0]
            for key in keys] if small else []
    if rows:
        insert('fanout', rows, column_names=COLUMNS)
    return {'members': len(keys), 'recipient_pointers': len(rows), 'lane': 'fanout' if small else 'seek'}


def cache_sql(reader, groups):
    """Logical global 200-identity window BEFORE group/service selection.

    Preserve all routes of each retained identity. A filter miss needs seek/refill.
    Physical trimming is independent of this read-time correctness rule.
    """
    selected = ','.join(literal(group) for group in sorted(set(groups))) or "''"
    return ("WITH latest AS (SELECT *,row_number() OVER (PARTITION BY reader_key,created_at,"
        "author_key,doc_id,group_id ORDER BY version DESC,deleted DESC) AS rn FROM fanout WHERE reader_key="
        + literal(reader) + "), live AS (SELECT * FROM latest WHERE rn=1 AND deleted=0), "
        "retained AS (SELECT *,dense_rank() OVER (ORDER BY created_at DESC,doc_id DESC,author_key DESC) AS position "
        "FROM live) SELECT group_id,author_key,doc_id,toUnixTimestamp64Milli(created_at) AS created_ms "
        "FROM retained WHERE position<=" + str(CAP) + " AND group_id IN (" + selected
        + ") ORDER BY created_at DESC,doc_id DESC,author_key DESC,group_id")


def document_contract(sql):
    """Separate approved F/P document-stream contract; never edit old captures."""
    import sqlglot
    tree = sqlglot.parse_one(sql, read='clickhouse')
    if any(tree.args.get(key) for key in ('distinct', 'group', 'qualify', 'having', 'offset')):
        raise ValueError('only captured chronological main supported')
    order = tree.args.get('order')
    if order is None or len(order.expressions) != 1 or not order.expressions[0].args.get('desc'):
        raise ValueError('chronological captured order required')
    ordered = order.expressions[0].this.sql(dialect='clickhouse').lower()
    if ordered not in ('tounixtimestamp64milli(p.created_at)', 'p.created_at'):
        raise ValueError('ranking is outside document-stream contract')
    shape = sqlglot.parse_one("SELECT 1 QUALIFY row_number() OVER (PARTITION BY p.author_key,p.doc_id "
        "ORDER BY p.group_id ASC)=1 ORDER BY p.created_at DESC,p.doc_id DESC,p.author_key DESC", read='clickhouse')
    tree.set('qualify', shape.args['qualify'])
    tree.set('order', shape.args['order'])
    return tree.sql(dialect='clickhouse')


def key(row):
    # Python's string ordering is made descending without prefix-order mistakes.
    def descending(value):
        return tuple(-ord(char) for char in value) + (1,)
    return -row['created_ms'], descending(row['doc_id']), descending(row['author_key']), row['group_id']


def merge_page(sources, size, fetch, resolve):
    """Bounded sorted sources; canonical resolution owns entitlement and refill.

    Sources may be recipient cache or seeks. Fully identical documents appearing
    in different routes are resolved together; canonical SQL picks its valid route.
    Never dedup on doc_id alone, or discard a valid alternative route after denial.
    """
    if type(size) is not int or size < 1 or len(sources) != len(set(sources)):
        raise ValueError('positive page size and distinct sources required')
    cursors, buffers, exhausted, seen = {}, {s: [] for s in sources}, set(), set()
    heap, serial = [], 0

    def advance(source):
        nonlocal serial
        if not buffers[source] and source not in exhausted:
            rows = fetch(source, cursors.get(source), size + 1)
            previous = key(cursors[source]) if source in cursors else None
            for row in rows:
                current = key(row)
                if previous is not None and current <= previous:
                    raise ValueError('nonadvancing candidate cursor')
                previous = current
            if rows:
                cursors[source] = rows[-1]
            if len(rows) < size + 1:
                exhausted.add(source)
            if len(rows) > size + 1:
                raise ValueError('candidate source exceeded bound')
            buffers[source] = list(reversed(rows))
        if buffers[source]:
            row = buffers[source].pop()
            heapq.heappush(heap, (key(row), serial, source, row))
            serial += 1

    for source in sources:
        advance(source)
    output = []
    while heap and len(output) < size:
        _, _, source, first = heapq.heappop(heap)
        identity = first['author_key'], first['doc_id']
        routes = [first]
        advance(source)
        # All routes for an identity are contiguous in the complete ordering.
        while heap and (heap[0][3]['author_key'], heap[0][3]['doc_id']) == identity:
            _, _, source, row = heapq.heappop(heap)
            routes.append(row)
            advance(source)
        if identity in seen:
            continue
        rows = resolve(routes)
        if len(rows) > 1:
            raise ValueError('canonical document contract returned duplicate identity')
        for row in rows:
            if (row['author_key'], row['doc_id']) != identity or not any(
                    row['group_id'] == route['group_id'] and row['created_ms'] == route['created_ms'] for route in routes):
                raise ValueError('canonical result not bound to requested identity/route/time')
            seen.add(identity)
            output.append(row)
    return output


def publication_time(value):
    parsed = datetime.fromisoformat(value) if isinstance(value, str) else value
    if not isinstance(parsed, datetime):
        raise ValueError('canonical timestamp required')
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)
