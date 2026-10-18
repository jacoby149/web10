# ClickHouse for the Public Layer

## The Problem

The public layer — discovery index, public ledger, engagement counts — is the read surface everyone hits. Anon users, marketing-ui, the trending feed, suggested accounts, search. Every query scans across users. Every query aggregates.

MongoDB is terrible at this. It was built for single-document CRUD with indexed lookups. Cross-user aggregation means MapReduce, $lookup pipelines, or application-side accumulation. All of them choke at scale because MongoDB stores documents row-by-row with no column compression. A query like "top 50 posts by engagement in the last hour" means scanning every post, computing engagement from the ledger, sorting, and returning. That's a full collection scan with no vectorized execution.

The double-write docs already explain why the client-side mirror breaks. Even with server-side hooks, the read surface itself is the bottleneck.

## Why ClickHouse

ClickHouse is an OLAP columnar database. It was built for exactly this: high-throughput writes, complex aggregations, sub-second response on billions of rows. It stores data column-by-column with compression (LZ4, ZSTD), executes queries vectorized, and merges data in the background.

The public layer is OLAP. It's not "find user X's post." It's "show me the top posts right now." It's "how many reactions did this post get?" It's "which tags are trending?" These are aggregations over many rows. ClickHouse is the tool for aggregations over many rows.

## The Fit

| Requirement | MongoDB | ClickHouse |
|---|---|---|
| Cross-user aggregation | Full scan, MapReduce, or app-side | Native GROUP BY, materialized views |
| Write throughput | ~10k docs/sec single node | ~1M rows/sec single node |
| Read latency (aggregates) | Seconds to minutes | Milliseconds |
| Storage efficiency | Row-based, no compression | Columnar, 5-10x compression |
| Time-series queries | Weak (no native partitioning) | Strong (native partitioning, TTL) |
| Full-text search | Atlas-only, weak | Native tokenization, TF-IDF |
| Single-record CRUD | Native | Weak (no row-level updates) |

The trade-off is clear: ClickHouse is not a CRUD database. You don't update a single row. You insert. You delete by partition. This is actually the right model for the public layer — it's an append-only projection. When a post is deleted, you insert a tombstone or delete by partition key.

## The Architecture

The public layer stays a projection. It doesn't replace MongoDB. It sits beside it:

```
Client → POST /alice/reactions → API (crud.py)
                                      → MongoDB write (source of truth)
                                      → ClickHouse INSERT (public projection)
```

The server-side hook that was already proposed for reactions, comments, and follows writes to ClickHouse instead of (or in addition to) the MongoDB ledger. The read path changes:

```
Before:  GET /discover → API → MongoDB $lookup pipeline → slow
After:   GET /discover → API → ClickHouse SELECT → fast
```

## What Goes Into ClickHouse

### discovery_posts
The post index for the trending feed. Append-only. When a post is deleted, insert a `deleted=true` flag.

```sql
CREATE TABLE discovery_posts (
    post_id String,
    author_key String,
    author_name String,
    text String,
    tags Array(String),
    visibility String,
    created_at DateTime64(3),
    deleted UInt8 DEFAULT 0,
    engagement_score Float64
) ENGINE = MergeTree()
ORDER BY (created_at, post_id)
TTL created_at + INTERVAL 90 DAY;
```

The `engagement_score` is a materialized view that updates from the reactions table. The TTL handles data retention — posts older than 90 days fall off the trending feed naturally.

### public_ledger
Structured interactions. Reactions, comments, follows. The source of truth for engagement counts.

```sql
CREATE TABLE public_ledger (
    entry_id String,
    actor_key String,
    target_key String,
    target_post_id String,
    interaction_type String,  -- 'reaction', 'comment', 'follow'
    payload String,           -- JSON for flexible schema
    created_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (interaction_type, target_post_id, created_at);
```

Queries like "engagement count for post X" become `SELECT count() FROM public_ledger WHERE target_post_id = 'X' AND deleted = 0` — sub-millisecond on millions of rows.

### metering_events
Per-request metering. Already high-volume, already append-only. Perfect ClickHouse fit.

```sql
CREATE TABLE metering_events (
    event_id String,
    user_key String,
    service String,
    operation String,
    bytes UInt64,
    duration_ms UInt32,
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (user_key, created_at)
TTL created_at + INTERVAL 30 DAY;
```

## The Advantages

**1. Sub-second discovery.** The trending feed, top posts, suggested accounts — all become trivial SELECT queries. No MapReduce. No $lookup chains. Just `SELECT * FROM discovery_posts WHERE deleted = 0 ORDER BY engagement_score DESC LIMIT 50`.

**2. Real-time engagement.** Engagement counts update as reactions stream in. Materialized views can aggregate reactions per post automatically. No more "read the ledger, count manually" on every page load.

**3. Scale without pain.** ClickHouse handles millions of inserts per second on a single node. The public layer is the bottleneck at scale because every user's action writes to it. Columnar storage means the storage cost doesn't grow linearly with data volume.

**4. Time-series analytics.** Trending tags, hourly activity, user growth — all native. Partition by date, aggregate by window, no application-side time bucketing.

**5. Full-text search.** ClickHouse has an inverted index for search. The discovery index can support text search natively — no Elasticsearch needed for the first cut.

**6. Data retention.** TTL policies handle cleanup automatically. Posts older than 90 days drop off the trending feed. Metering events older than 30 days are gone. No manual cleanup jobs.

**7. Analytics for free.** The same table that serves the trending feed can answer "how many unique users reacted today" or "what's the median post length." No separate analytics pipeline.

## Search

ClickHouse has an inverted index for full-text search. The discovery index can support text search natively — keyword matching, phrase search, relevance ranking. For the discovery feed, trending tags, and post search, it eliminates the need for a separate search service.

At very large scale or when you need advanced features (fuzzy matching, synonyms, multi-language stemming), Elasticsearch or Meilisearch is still the heavier hammer. But for v3, ClickHouse's inverted index covers the search surface without adding another service.

## What Doesn't Go Into ClickHouse

ClickHouse is not a replacement for the user collections. Personal data stays in MongoDB:

- `alice/public_posts` — CRUD, contract-gated, per-user
- `alice/inbox` — fan-out writes, per-user reads
- `alice/dms` — private, per-user
- `alice/follows` — source of truth for who alice follows
- `alice/reactions` — source of truth for alice's reactions

The user collections need row-level updates, contract checks, and per-user access control. ClickHouse can't do any of that efficiently. It's a projection target, not a source of truth.

## Migration Path

This is additive. No migration needed:

1. Deploy ClickHouse alongside MongoDB (new docker-compose service)
2. Add the INSERT hooks to `crud.py` — server-side projections write to both
3. Flip the read path: discovery queries hit ClickHouse instead of MongoDB
4. The old MongoDB ledger can be deprecated once ClickHouse is the sole read source

The risk is low because ClickHouse starts as a warm cache. The MongoDB ledger stays the source of truth until ClickHouse is proven reliable. Then you flip the reads and drop the ledger writes.

## The Cost

ClickHouse is open source (Apache 2.0). One node handles the workload of many MongoDB nodes for this use case. The storage cost is lower because of columnar compression. The operational cost is one more service in docker-compose, but it's a single binary with no dependencies.

The engineering cost is writing the hooks and the read-path queries. The hooks are the same server-side projections already planned for v3. The only difference is the target is ClickHouse instead of a MongoDB collection.

## Summary

The public layer is OLAP. MongoDB is OLTP. ClickHouse is OLAP. Using ClickHouse for the public layer means the read surface — discovery, trending, engagement, analytics — works at scale without fighting the database. Personal data stays in MongoDB where it belongs. The server-side hooks bridge them. One client call. Two writes. Each to the right database.