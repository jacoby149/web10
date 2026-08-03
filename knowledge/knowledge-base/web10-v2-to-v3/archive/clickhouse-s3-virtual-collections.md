# ClickHouse + S3: Virtual User Collections

## The Idea

ClickHouse can query S3 directly. The S3 table engine reads Parquet files from S3 paths without loading them into ClickHouse storage. What if user collections lived in S3 instead of MongoDB — each user's data as Parquet files, ClickHouse querying them as virtual collections?

```
Current:  alice/public_posts → MongoDB collection → CRUD endpoint
Idea:     alice/public_posts → s3://web10/alice/public_posts/*.parquet → ClickHouse S3 table
```

## How It Would Work

Each user collection becomes an S3 prefix. Records are written as individual Parquet files (or batched into larger files):

```
s3://web10/
  alice/
    public_posts/
      2026-08-01_001.parquet   — 500 records
      2026-08-02_001.parquet   — 300 records
    reactions/
      2026-08-01_001.parquet
    comments/
      2026-08-01_001.parquet
  bob/
    public_posts/
      2026-08-01_001.parquet
```

ClickHouse defines a table that reads from the S3 prefix:

```sql
CREATE TABLE alice_public_posts (
    post_id String,
    text String,
    tags Array(String),
    created_at DateTime64(3),
    deleted UInt8
) ENGINE = S3('s3://web10/alice/public_posts/*.parquet', 'Parquet');
```

A global view joins all users:

```sql
CREATE VIEW all_public_posts AS
SELECT * FROM s3('s3://web10/*/public_posts/*.parquet', 'Parquet');
```

## The Pros

**1. No MongoDB.** One fewer service. No FerretDB translation layer. No MongoDB wire protocol overhead. The stack becomes: ClickHouse + S3 + API.

**2. Sovereignty.** User data is files in S3, not rows in a database. Alice can export her data by downloading her S3 prefix. She can move it to another node by copying the prefix. The data model is portable by default — not an export feature, just files.

**3. Storage cost.** S3 is cheap. Parquet is compressed. User data that costs $X in MongoDB costs $X/5 in S3 Parquet. At scale, storage is not free.

**4. Cross-user queries.** ClickHouse can query across all user prefixes in one SELECT. `SELECT * FROM s3('s3://web10/*/public_posts/*.parquet') WHERE created_at > now() - INTERVAL 1 HOUR` — trending feed without a separate discovery index. The user collections ARE the discovery index.

**5. No double-write for the public layer.** The current problem is: personal data in MongoDB, public data in a separate ledger. If user data lives in S3 and ClickHouse queries it directly, there's no mirror. The personal data IS the public data. ClickHouse just reads across users.

**6. Append-only is natural.** Social data is mostly append-only. Posts, reactions, comments — you create them, you rarely update them. Parquet is append-only. Each write is a new file. Perfect match.

**7. Analytics for free.** The same S3 files that serve the CRUD API can answer any analytical question. "How many posts did Alice write this month?" "What's the median post length across all users?" No separate analytics pipeline.

## The Cons

**1. Single-record updates.** Parquet files are immutable. To update a record, you rewrite the file. `PATCH /alice/reactions/123` means: read the Parquet file, find the record, modify it, write a new Parquet file, replace the old one. That's expensive. MongoDB does this in microseconds.

**2. Atomic find-and-update.** MongoDB's `find_one_and_update` is atomic. S3 has no transactions. To do find-and-update on S3, you need application-level locking: read the file, check the condition, write the new file, hope no one else wrote between read and write. Race condition city.

**3. Per-user access control.** MongoDB collections are naturally isolated — Alice's collection is separate from Bob's. S3 prefixes can be isolated with IAM policies, but ClickHouse querying `s3://web10/*/public_posts/*.parquet` needs access to all prefixes. The API layer must enforce access control — ClickHouse can't gate reads per-user.

**4. Schema evolution.** Parquet has a schema. If a post gains a field, you either write a new file with the new schema (now you have files with different schemas) or you make the schema wide enough for every possible field. MongoDB is schemaless — every document can have different fields.

**5. Delete semantics.** Deleting a single record from Parquet means rewriting the file. Or you add a `deleted` flag (tombstone) and accept that the old file stays on disk. MongoDB deletes are instant — the document is gone.

**6. Write latency.** Writing a Parquet file to S3 is slower than writing a MongoDB document. You're serializing, compressing, uploading. MongoDB writes are in-memory with fsync to disk. For a high-write workload like reactions, S3 write latency matters.

**7. Query latency.** ClickHouse reading from S3 is slower than reading from local disk. Every query hits the network. For a trending feed that's called on every page load, S3 latency adds up. ClickHouse can cache, but cache invalidation is the other hard problem.

**8. Indexing.** Parquet has column statistics (min/max) that ClickHouse uses for pruning, but it doesn't have secondary indexes. A query like `SELECT * FROM alice_public_posts WHERE post_id = 'xyz'` scans every Parquet file in the prefix looking for that ID. MongoDB has an index on `_id` — it's instant.

**9. Small files problem.** If each write creates a Parquet file, you end up with millions of tiny files. S3 doesn't like that — listing is slow, metadata operations are expensive. You need to batch writes (which adds latency) or use a compaction process (which adds complexity).

## The Verdict

**For the public layer: yes.** ClickHouse querying S3 is the right model for discovery, trending, and analytics. The data is append-heavy, cross-user queries are the norm, and updates are rare. The S3 table engine works well here.

**For personal data: no.** User collections need single-record CRUD, atomic operations, per-user access control, and schema flexibility. MongoDB (or a document database) is the right tool. The sovereignty story — "user data is files" — is compelling but the operational cost of Parquet CRUD is too high.

## The Hybrid

The sweet spot is a hybrid: personal data in MongoDB, public projections in S3 + ClickHouse.

```
Client → POST /alice/reactions → API
                                      → MongoDB write (source of truth, CRUD)
                                      → S3 Parquet write (public projection)
```

The S3 write is the same server-side hook proposed in the double-write doc. The difference is the target: S3 Parquet instead of a MongoDB collection. ClickHouse queries the S3 files for discovery, trending, and analytics.

The advantage over the MongoDB ledger: no separate data surface to keep in sync. The S3 files ARE the projection. ClickHouse reads them directly. No intermediate MongoDB collection.

The advantage over MongoDB for the public layer: columnar storage, inverted index for search, materialized views for aggregation, TTL for retention. All native.

## What This Means for v3

1. **Keep MongoDB for personal data.** User collections stay where they are. CRUD, contracts, access control — MongoDB handles it.

2. **Move the public ledger to S3.** Server-side hooks write Parquet files to S3. ClickHouse queries them. No MongoDB ledger collection.

3. **Discovery index becomes a ClickHouse view.** No separate index — just a view over `s3://web10/*/public_posts/*.parquet` with engagement scores from the ledger.

4. **Search uses ClickHouse inverted index.** No Elasticsearch. Native full-text search on the S3 files.

5. **The double-write problem is still there.** The server-side hook writes to MongoDB AND S3. But it's server-side, not client-side. Reliable, not fire-and-forget.

## Summary

ClickHouse + S3 eliminates the public ledger as a separate data surface. User data projections live in S3 as Parquet files. ClickHouse queries them directly. No MongoDB collection to mirror. No sync problem.

But personal data stays in MongoDB. CRUD, atomicity, access control — S3 Parquet can't replace that. The hybrid is the answer: MongoDB for personal, S3 + ClickHouse for public. One server-side hook bridges them.