# ClickHouse + MongoDB: Direct Query via `mongodb()`

## The Idea

ClickHouse has a `mongodb()` table function that queries MongoDB directly. No data migration, no ETL pipeline, no projection layer. ClickHouse reads MongoDB collections in-flight and can join them with ClickHouse tables in a single query.

```sql
SELECT
    ch_orders.order_id,
    ch_orders.amount,
    mongo_users.email,
    mongo_users.country
FROM local_clickhouse_orders AS ch_orders
LEFT JOIN mongodb(
    'mongodb://user:password@mongo-host:27017/shop_db',
    'users',
    'id String, email String, country String'
) AS mongo_users
ON ch_orders.user_id = mongo_users.id;
```

For web10, this means ClickHouse can query user collections directly from MongoDB while still providing OLAP capabilities for the public layer.

## How It Works

ClickHouse connects to MongoDB as a remote data source. The `mongodb()` function takes:
- Connection string
- Collection name
- Schema definition (ClickHouse types)

```sql
-- Query a user's posts directly from MongoDB
SELECT * FROM mongodb('mongodb://...', 'alice.public_posts',
    'post_id String, text String, tags Array(String), created_at DateTime')
WHERE created_at > now() - INTERVAL 7 DAY;

-- Join ClickHouse ledger with MongoDB user data
SELECT
    l.interaction_type,
    l.actor_key,
    u.email,
    u.display_name
FROM public_ledger AS l
LEFT JOIN mongodb('mongodb://...', 'web10.star',
    'user_key String, email String, display_name String') AS u
ON l.actor_key = u.user_key;
```

## The Architecture

```
Client → API → MongoDB (writes, source of truth)
              ↓
         ClickHouse (queries MongoDB directly for reads)
              ↓
         Response to client
```

No projection. No mirror. No double-write. ClickHouse reads what it needs from MongoDB at query time.

## Advantages Over S3 Projection

**1. No sync problem.** The data lives in one place. ClickHouse reads the latest state from MongoDB on every query. No stale projections, no reconciliation, no tombstone cleanup.

**2. No ETL pipeline.** The S3 approach required batch writes, compaction, and file management. `mongodb()` eliminates all of that — ClickHouse reads MongoDB collections directly.

**3. Real-time consistency.** A write to MongoDB is immediately visible to ClickHouse queries. The S3 approach had a delay between write and file flush.

**4. Simpler stack.** MongoDB + ClickHouse vs. MongoDB + S3 + ClickHouse + batch writer. Fewer moving parts.

**5. Schema flexibility preserved.** MongoDB's schemaless documents are accessed through ClickHouse's typed schema definition. New fields in MongoDB can be added to the ClickHouse schema definition without migrating existing data.

## Disadvantages vs S3

**1. Query latency.** ClickHouse reads from MongoDB over the network on every query. S3 Parquet files can be cached and scanned in parallel. For heavy analytical workloads, S3 will be faster.

**2. MongoDB load.** Every ClickHouse query adds read load to MongoDB. S3 offloads this entirely. At very high query volumes, MongoDB becomes the bottleneck.

**3. No columnar compression.** MongoDB stores documents row-by-row. ClickHouse reads full documents even if it only needs a few fields. S3 Parquet is columnar — only requested columns are read.

**4. No materialized views on MongoDB data.** ClickHouse can create materialized views on its own tables, but not on `mongodb()` sources. Pre-computed aggregations require a local ClickHouse table (which brings back the sync problem).

**5. Connection management.** ClickHouse maintains connections to MongoDB. Connection pooling, authentication, and network reliability become operational concerns.

## The Fit for web10

| Workload | mongodb() | S3 Parquet |
|---|---|---|
| Discovery feed | Good | Better |
| Engagement counts | Good | Better |
| User profile reads | Good | Good |
| Search | Adequate | Better |
| Analytics | Adequate | Better |
| Write throughput | N/A (read-only) | N/A (batch) |
| Real-time consistency | **Excellent** | Poor |
| Operational complexity | **Low** | High |
| MongoDB read load | Added | None |

## When to Use `mongodb()`

**Use it when:**
- You need real-time consistency between MongoDB and analytical queries
- Query volume is moderate (not competing with MongoDB for reads)
- You want to eliminate ETL complexity
- The workload is a mix of CRUD and analytics

**Don't use it when:**
- You need heavy analytical workloads (billions of rows, complex aggregations)
- MongoDB is already at read capacity
- You need materialized views or pre-computed aggregations
- Columnar scan performance is critical

## The Hybrid: Best of Both

For web10, the optimal approach combines both:

```
Writes:  Client → API → MongoDB (source of truth)
Reads (CRUD): API → MongoDB directly
Reads (OLAP): API → ClickHouse → mongodb() → MongoDB
Hot paths: API → ClickHouse local tables (materialized from MongoDB)
```

The `mongodb()` table function handles most analytical queries. For the hottest paths (trending feed, engagement counts), materialized views in ClickHouse provide sub-millisecond response.

## Migration Path

1. Deploy ClickHouse alongside MongoDB
2. Replace MongoDB ledger queries with `mongodb()` calls in ClickHouse
3. For hot paths, add materialized views that refresh from MongoDB
4. Gradually migrate discovery queries from MongoDB to ClickHouse
5. Keep MongoDB as the write path and source of truth

## Summary

ClickHouse's `mongodb()` table function eliminates the need for a projection layer. It reads MongoDB directly, providing real-time consistency without ETL complexity. For web10, this means the public layer can leverage ClickHouse's analytical power while MongoDB remains the source of truth.

The trade-off is query latency and MongoDB read load. For moderate workloads, `mongodb()` is the simpler, more maintainable approach. For heavy analytical workloads, S3 Parquet projections provide better performance at the cost of complexity.