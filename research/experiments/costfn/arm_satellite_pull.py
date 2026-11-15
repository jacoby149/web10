"""Config P's parameterized pull/refill mechanism; no database or authority.

fetch(group, after, limit) supplies ordered identity pointers from the transpose.
resolve(pointers) performs the one canonical winner-resolution/read, returning
current authorized response rows. It is NOT an extra verification stage. No
written feed, owner inference, author hints, fixed page shape or body copies.
The caller supplies the complete ordering key required by its query contract.
"""
from collections import deque
import heapq

from arm_satellite_sql import slice_limit


def identity(row):
    return row["group_id"], row["author_key"], row["doc_id"]


def pull_page(groups, page_size, fetch, resolve, order_key):
    """Return up to page_size rows; denied/deleted pointers cause exact refill.

    Keys sort ascending (encode descending fields in the supplied order_key).
    Group attachment multiplicity is preserved. Continuations are full pointers,
    not a timestamp-only cursor. No source is considered exhausted on a partial
    resolved page; only an actually exhausted slice can establish that.
    """
    limit = slice_limit(page_size)
    if len(groups) != len(set(groups)):
        raise ValueError("distinct group sources required")
    buffers = {group: deque() for group in groups}
    cursors = {group: None for group in groups}
    exhausted = set()
    seen = {group: set() for group in groups}
    heap, serial = [], 0
    stats = {"slice_reads": 0, "pointer_rows": 0, "resolution_reads": 0,
             "resolved_pointers": 0, "rejected_pointers": 0}

    def advance(group):
        nonlocal serial
        if not buffers[group] and group not in exhausted:
            rows = fetch(group, cursors[group], limit)
            stats["slice_reads"] += 1
            stats["pointer_rows"] += len(rows)
            if len(rows) > limit:
                raise ValueError("source exceeded requested slice bound")
            previous = order_key(cursors[group]) if cursors[group] is not None else None
            for row in rows:
                if row["group_id"] != group or identity(row) in seen[group]:
                    raise ValueError("wrong-source or repeated continuation pointer")
                key = order_key(row)
                if previous is not None and key <= previous:
                    raise ValueError("source ordering/cursor must be complete and strictly increasing")
                previous = key
                seen[group].add(identity(row))
                buffers[group].append(row)
            if rows:
                cursors[group] = rows[-1]
            if len(rows) < limit:
                exhausted.add(group)
        if buffers[group]:
            row = buffers[group].popleft()
            heapq.heappush(heap, (order_key(row), serial, group, row))
            serial += 1

    for group in groups:
        advance(group)
    output = []
    while heap and len(output) < page_size:
        winners = []
        while heap and len(winners) < page_size - len(output):
            _, _, group, row = heapq.heappop(heap)
            winners.append(row)
            advance(group)
        rows = resolve(winners)
        stats["resolution_reads"] += 1
        stats["resolved_pointers"] += len(winners)
        requested = {identity(row): row for row in winners}
        returned = set()
        for row in rows:
            key = identity(row)
            if key not in requested or key in returned:
                raise ValueError("canonical resolution returned extra or duplicate identities")
            if order_key(row) != order_key(requested[key]):
                raise ValueError("canonical ordering metadata changed; refresh derived source")
            returned.add(key)
        rows = sorted(rows, key=order_key)
        output.extend(rows)
        stats["rejected_pointers"] += len(winners) - len(rows)
    return output, stats
