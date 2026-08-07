# Why Not Just ClickHouse + MinIO?

## The Question

If ClickHouse handles discovery, permissions, and analytics — and MinIO handles media blobs — what does MongoDB actually give us? Can we just delete it from the stack?

```
Current:  MongoDB + ClickHouse + MinIO + API
Idea:     ClickHouse + MinIO + API
```

## What ClickHouse Would Need to Do

Everything. Posts, reactions, comments, groups, permissions, engagement. All stored in one ClickHouse table. Deletes are tombstones. Updates are new rows with higher version numbers.

```sql
CREATE TABLE documents (
    doc_id String,
    author_key String,
    collection_name String,     -- 'posts', 'reactions', 'comments', 'outbox'
    body String,                -- JSON: full content
    discoverable UInt8,         -- can this post appear in feeds?
    tags Array(String),
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (author_key, doc_id)
TTL created_at + INTERVAL 90 DAY;
```

MinIO stores the media blobs. ClickHouse stores everything structured. That's it.

## Where It Works

**Append-only writes.** Posts, reactions, comments, follows — you create them, you rarely change them. ClickHouse is built for this. Millions of inserts per second. Perfect.

**Tombstone deletes.** You don't delete a row. You insert a new row with `deleted = 1`. ClickHouse handles this naturally. The data stays on disk until TTL cleans it up. Fine.

**Updates.** You don't update a row. You insert a new row with a higher `updated_at`. `ReplacingMergeTree` keeps the latest version. Editing a post is an insert, not an update. Works.

**Discovery, trending, search.** ClickHouse is built for this. Local queries, vectorized execution, inverted index. No MongoDB needed.

**Permissions.** Groups define who can see what. `doc_groups` maps documents to groups. `group_members` defines membership. Filter at query time. No Postgres needed. No separate permissions layer needed.

**Media.** MinIO stores blobs. ClickHouse stores metadata (URL, size, type). ClickHouse can query MinIO directly for metadata if needed. Works.

**Engagement.** Reactions and comments are documents with `ref` types. ClickHouse aggregates them. No ledger. No mirror. No double-write.

## Where It Hurts

**Schema evolution.** ClickHouse has a schema. Adding a field means `ALTER TABLE documents ADD COLUMN new_field String`. At scale, ALTER TABLE is a heavy operation — it rewrites data parts. MongoDB is schemaless — every document can have different fields. For a social network where features change weekly, schema rigidity is real pain.

**Mitigation:** store the body as JSON. ClickHouse has `JSON` type and `extractJSONString()` functions. The schema is wide (doc_id, author, body JSON, tags, created_at). New fields go into the JSON blob. No ALTER TABLE needed.

**Point lookups.** `GET /alice/posts/abc` — fetching a single post by ID. ClickHouse has no secondary index on `doc_id`. It scans partitions. For a hot path (every page load fetches posts), this is slow.

**Mitigation:** API-level caching. Redis cache for hot posts. Or a small local ClickHouse table with a primary key on `doc_id` that's kept in memory. Or accept that ClickHouse point lookups are ~10ms, not ~1ms, and that's fine for a feed.

**Atomic operations.** MongoDB's `find_one_and_update` is atomic. "Increment reaction count if the user hasn't reacted yet." ClickHouse has no atomic counters. You insert a reaction row. The count is computed at query time (`COUNT(*) WHERE hasToken(body, 'post-123')`).

**Mitigation:** this is actually fine. The count is a query in ClickHouse. It updates on insert. No atomic counter needed. The reaction is an insert. The count is an aggregation. This is the OLAP model.

**Write latency for single rows.** ClickHouse is optimized for batch inserts. A single `INSERT INTO documents VALUES (...)` works but it's slower than MongoDB's in-memory write. At scale, you batch inserts anyway.

**Mitigation:** batch inserts in the API. Accumulate writes, flush every 100ms or 100 records. Accept eventual consistency for the index. The ClickHouse write is the source of truth. If ClickHouse is behind by 100ms, the feed is 100ms stale. Acceptable.

**Complex nested data.** A post can have rich media, nested comments, threaded replies, reactions with metadata. MongoDB stores this as nested BSON naturally. ClickHouse needs flat tables or JSON columns.

**Mitigation:** JSON columns. ClickHouse's JSON type handles nested data. You query it with `extractJSONString()`. It's not as elegant as MongoDB's dot notation, but it works.

## The Honest Comparison

| Concern | MongoDB | ClickHouse Only |
|---|---|---|
| Append-only writes | Fast | **Faster** (1M rows/sec) |
| Single-row updates | **Fast** (atomic) | Slow (insert + merge) |
| Point lookups | **Fast** (indexed) | Slow (partition scan) |
| Schema flexibility | **Schemaless** | Rigid (JSON workaround) |
| Cross-user queries | Slow (MapReduce) | **Fast** (vectorized) |
| Full-text search | Weak | **Fast** (inverted index) |
| Aggregations | Slow | **Fast** (materialized views) |
| Operational complexity | One service | One service |
| Storage cost | Higher | **Lower** (columnar) |

## The Verdict

**ClickHouse + MinIO only.** No MongoDB needed. Discovery, trending, engagement, search — ClickHouse does it all faster and cheaper.

**For personal data: ClickHouse handles it.** Personal data is mostly append-only (posts, reactions, comments). Point lookups can be cached. The JSON column workaround solves schema flexibility. The materialized view workaround solves atomic counters. The cache workaround solves point lookup latency.

The cost: every workaround is application complexity. MongoDB does these things natively. ClickHouse requires you to design around its limitations.

**The WordPress for YouTube answer: ClickHouse + MinIO only.**

Why? Because WordPress doesn't use three databases. It uses one. MySQL handles everything — posts, comments, users, permissions. It's not optimal for anything. It's good enough for everything.

ClickHouse + MinIO is the same idea. One database for structured data. One object store for blobs. The API handles the rest. No MongoDB. No Postgres. No CDC. No Kafka.

The trade-offs (schema rigidity, point lookup latency, no atomic updates) are acceptable for a social network. Most social operations are append-only. Most reads are discovery queries. Most writes are creates, not updates.

## The Architecture

```
ClickHouse:
  documents (everything — posts, reactions, comments, notes, mail)
  doc_groups (document-to-group mapping)
  group_contracts (group policy, roles, join policy)
  group_members (membership)
  service_contracts (app access)
  user_blacklist, group_blacklist (blocking)

MinIO:
  media blobs
  presigned URLs

API:
  orchestrates ClickHouse + MinIO
  caches hot point lookups
  batches inserts
  converts MinIO URLs to presigned
```

Two services. That's the stack.

## Migration from MongoDB

1. Deploy ClickHouse + MinIO
2. Migrate MongoDB data to ClickHouse tables (one-time backfill)
3. Switch writes to ClickHouse
4. Keep MongoDB as read-only backup for 30 days
5. Delete MongoDB

## The Risk

ClickHouse is not MongoDB. If you need atomic updates, schemaless documents, or sub-millisecond point lookups, you'll feel the pain. The workarounds (JSON columns, materialized views, caching) add complexity.

But for "WordPress for YouTube" vibes, that complexity is the point. You accept the limitations of the tool to keep the stack simple. WordPress works with MySQL even though MySQL isn't optimal for everything. It's good enough.

ClickHouse + MinIO is good enough for a social network. The rest is optimization for later.