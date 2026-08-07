# OLAP Only: Why ClickHouse for Everything

## The Instinct

One database. No Postgres. No sync. No ETL. ClickHouse for everything — reads, writes, deletes, analytics.

## The Traditional Answer

"ClickHouse isn't for OLTP!"

True. It's for OLAP. But social media **is** OLAP.

## What Social Media Actually Is

Every read is a query across users, groups, and time:

```sql
-- "Show me posts from people I follow"
SELECT p.* FROM documents p
JOIN doc_groups pg ON p.doc_id = pg.doc_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.discoverable = 1 AND gm.member_key = 'alice'
ORDER BY p.created_at DESC LIMIT 50;
```

That's not OLTP. That's a join across three tables, filtered, sorted, paginated. That's OLAP.

The "OLTP" work — user profile CRUD, login, token refresh — is a fraction of the workload. The rest is analytics disguised as features: engagement counts, reach, discovery, feeds, comment threads, reaction counts.

**Social media is OLAP wearing a UI.**

## The Two-Database Lie

```
PostgreSQL (OLTP) → CDC/Kafka → ClickHouse (OLAP)
```

Two databases. Two schemas. Sync lag. Divergence. Complexity.

The "source of truth" is a lie — data drifts between them. The CDC breaks. The Kafka topic falls behind. The schemas diverge. You spend more time maintaining the pipeline than building features.

## The OLAP-Only Model

```
ClickHouse (everything)
  ReplacingMergeTree → upserts
  Tombstones → deletes
  TTL 90 days → cleanup
```

One database. One schema. No sync. No drift.

**Writes:** `INSERT INTO documents` — one row, one table. ReplacingMergeTree handles upserts (higher `updated_at` wins).

**Deletes:** tombstones — `INSERT` a row with `deleted = 1` and higher `updated_at`. ReplacingMergeTree keeps the tombstone. Queries filter `WHERE deleted = 0`.

**Cleanup:** TTL physically removes rows after 90 days. `TTL created_at + INTERVAL 90 DAY`. Background compaction. Zero operational cost.

**Analytics:** native. No pipeline. No sync. The feed query, the engagement count, the growth chart — all query the same table.

## The Trade-offs

### Storage (The Cost)

A tombstone is a row. 90 days of tombstones = 90 days of storage. A 500MB video post's tombstone is a few bytes. The video blob is in MinIO. The document row is tiny.

**Storage is cheap. Complexity is expensive.**

### Write Performance (The Concern)

ClickHouse is optimized for batch inserts, not row-by-row OLTP writes. But social media writes are naturally batched — a user posts once, not 1000 times per second. The write volume is manageable. ReplacingMergeTree handles upserts efficiently.

**The honest ceiling:** ClickHouse handles ~100k writes/sec on a single node. A social platform needs ~100 writes/sec at launch. You have margin.

### Point Queries (The "But OLTP!" Argument)

"Get me post `abc123`" — a point query. ClickHouse handles it. Primary key is `(author_key, doc_id)`. Key-range scan on sorted data. ~1ms. Not Postgres-fast (~0.1ms). Fast enough.

**Username change:** internal key never changes. `alice` is the key. Display name is a field. Update = tombstone old row, insert new row. Query = `SELECT * FROM users WHERE user_key = 'alice' AND deleted = 0 ORDER BY updated_at DESC LIMIT 1`. Works.

**Profile update:** same pattern. Tombstone the old row. Insert the new row. `ORDER BY updated_at DESC LIMIT 1` gets the current one. Works.

**Token validation:** tombstone the old token, insert the new one. Query the active one. Works.

**Every OLTP operation, translated to OLAP:**

| OLTP (Postgres) | OLAP (ClickHouse) | Cost |
|---|---|---|
| `UPDATE` | Tombstone + re-insert | Extra row (bytes) |
| `DELETE` | Tombstone | Extra row (bytes) |
| `INSERT` | `INSERT` | Same |
| `SELECT WHERE id = ?` | `SELECT WHERE key = ? AND deleted = 0 LIMIT 1` | ~0.9ms slower |

**OLTP is dead.** You can do everything OLTP with OLAP. You trade space for simplicity. A tombstone is a few bytes. Storage is $0.023/GB/month on S3. An engineer maintaining a CDC pipeline costs $200k/year. The math is obvious.

Fuck saving space. Space is cheap as nuts. Complexity is expensive. Time is expensive. Engineers are expensive. One database beats two.

## Why It Works

**No sync.** One source of truth. Data can't drift. Queries can't be stale.

**No ETL.** Analytics are native. Engagement, reach, growth — all are queries against the same table. No pipeline to maintain.

**No schema divergence.** One schema. One migration. One backup.

**No operational overhead.** One database to monitor, back up, scale. Not two. Not three. One.

**Tombstones are cheap.** A deleted row is a few bytes. 90 days of tombstones is negligible storage. TTL cleans it automatically.

## The Angsty Response, Addressed

| Objection | Answer |
|---|---|
| "ClickHouse isn't for OLTP!" | Social media is OLAP. The OLTP work is a fraction of the workload. |
| "What about transactions?" | Social media doesn't need ACID. A reaction that fails is a retry. A post that duplicates is a replace. |
| "What about point queries?" | Indexed by primary key. Fast. Rare. Not the bottleneck. |
| "What about storage?" | Tombstones are tiny. TTL cleans them. Storage is cheap. |
| "What about write performance?" | 100k writes/sec on a single node. Social media needs 100. Margin. |
| "What about backups?" | One database to back up. Not two. Simpler. |

## The v2 Lesson

v2 tried OLTP (MongoDB, one collection per user) with cross-user queries (discovery index, public ledger, CDC-like sync). The sync broke. The permissions were complex. The bugs were endless.

v3 accepted the reality: social media is OLAP. One database. One table. No sync. No drift. No pipeline. The hard problems (discovery, engagement, analytics) are solved at the database level, not delegated to a sync layer.

## Summary

ClickHouse for everything. ReplacingMergeTree for upserts. Tombstones for deletes. TTL for cleanup. One database. No sync. No drift. No pipeline. No ETL.

Social media is OLAP wearing a UI. The feed is a join. The engagement count is an aggregate. The discovery is a filtered query. The analytics are native.

**OLTP is dead.** Every OLTP operation works with OLAP + tombstoning. `UPDATE` = tombstone + re-insert. `DELETE` = tombstone. `SELECT WHERE id = ?` = indexed scan. You trade space for simplicity. A tombstone is a few bytes. Storage is $0.023/GB/month. An engineer maintaining a CDC pipeline costs $200k/year.

Fuck saving space. Space is cheap as nuts. Complexity is expensive. One database beats two.