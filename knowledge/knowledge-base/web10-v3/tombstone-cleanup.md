# Tombstone Cleanup

Every table in web10 v3 uses append-only writes with tombstones. This doc covers the pattern and the cleanup strategy.

## The Pattern

Every update or delete is an insert. A tombstone row with `deleted = 1` and a higher `updated_at`.

**Update a post:**
```sql
INSERT INTO documents VALUES (
    'post-1', 'alice', 'posts', '{"text": "updated"}', 1, [],
    '2026-01-01 00:00:00.000', '2026-01-02 00:00:00.000', 0
);
```
ReplacingMergeTree keeps the row with the highest `updated_at`. Old version is gone on next merge.

**Delete a post:**
```sql
INSERT INTO documents VALUES (
    'post-1', 'alice', 'posts', '{"text": "original"}', 1, [],
    '2026-01-01 00:00:00.000', '2026-01-03 00:00:00.000', 1
);
```
Tombstone stays. Query filters `WHERE deleted = 0`. TTL physically removes it.

**Revoke a post_group attachment:**
```sql
INSERT INTO doc_groups VALUES (
    'post-1', 'alice.close-friends', 'read',
    '2026-01-01 00:00:00.000', '2026-01-03 00:00:00.000', 1
);
```
Same pattern. Append tombstone. ReplacingMergeTree keeps the latest.

## Why Not DELETE?

ClickHouse is optimized for inserts, not deletes. A `DELETE FROM` is a heavy mutation — it rewrites entire parts. An insert is cheap. The tombstone pattern matches the engine.

## The Cleanup

Two mechanisms:

**1. ReplacingMergeTree auto-compact.** When ClickHouse merges parts, it keeps only the row with the highest `updated_at` for each `(doc_id, group_id)` key. Old versions disappear. No action needed.

**2. TTL physical removal.** Every table has a TTL clause:
```sql
TTL created_at + INTERVAL 90 DAY;
```
After 90 days, ClickHouse physically removes the row. Tombstones included. The data is gone from disk.

**3. Background compaction job.** For tables without TTL (like `group_members`), a scheduled job runs:
```sql
ALTER TABLE group_members DELETE
WHERE deleted = 1 AND updated_at < now() - INTERVAL 30 DAY;
```
Runs weekly. Lightweight. Only touches old tombstones.

## Schedule

| Table | Strategy | Cleanup |
|---|---|---|
| `documents` | ReplacingMergeTree + TTL | 90 day TTL, physical removal |
| `doc_groups` | ReplacingMergeTree + TTL | 90 day TTL, physical removal |
| `groups` | ReplacingMergeTree | Weekly DELETE of old tombstones |
| `group_members` | ReplacingMergeTree | Weekly DELETE of old tombstones |
| `group_contracts` | ReplacingMergeTree | Weekly DELETE of old tombstones |
| `service_contracts` | ReplacingMergeTree | Weekly DELETE of old tombstones |
| `user_blacklist` | MergeTree | Weekly DELETE of old tombstones |
| `group_blacklist` | MergeTree | Weekly DELETE of old tombstones |
| `user_group_sharing` | ReplacingMergeTree | Weekly DELETE of old tombstones |
| `group_join_requests` | ReplacingMergeTree | Weekly DELETE of old tombstones |

Reactions and comments are documents — they use the `documents` table TTL. No separate cleanup needed.

## The Trade-off

Tombstones take space. A busy table has old versions sitting around until the next merge. But ClickHouse merges are cheap at scale — they're the core operation. The trade-off is worth it: inserts are fast, deletes are cheap, and cleanup is automatic.

## Summary

Append tombstones everywhere. ReplacingMergeTree compacts on merge. TTL removes old data physically. Background job handles tables without TTL. No manual intervention. The engine does the work.
