# ClickHouse + S3: User Collections as Files

## The Idea

ClickHouse can query S3 directly. Not as a pipeline — as the storage layer. The `S3` table engine reads Parquet files from S3 paths without loading them into ClickHouse's own disks. What if user collections lived in S3 instead of MongoDB?

```
Current:  alice/public_posts → MongoDB collection
Idea:     alice/public_posts → s3://web10-data/alice/public_posts/*.parquet
```

ClickHouse queries the S3 path. The data never leaves S3. No MongoDB. No FerretDB. Just files and a query engine.

## How It Would Work

Each user collection becomes an S3 prefix. Records are Parquet files, partitioned by time:

```
s3://web10-data/
  alice/
    public_posts/
      year=2026/month=08/part-001.parquet
      year=2026/month=08/part-002.parquet
    reactions/
      year=2026/month=08/part-001.parquet
    comments/
      year=2026/month=08/part-001.parquet
    follows/
      year=2026/part-001.parquet
  bob/
    public_posts/
      year=2026/month=08/part-001.parquet
```

ClickHouse defines a virtual table over the S3 prefix:

```sql
CREATE TABLE alice_posts
ENGINE = S3('s3://web10-data/alice/public_posts/*.parquet', 'Parquet');
```

Or a global view across all users:

```sql
SELECT * FROM s3('s3://web10-data/*/public_posts/*.parquet', 'Parquet')
WHERE created_at > now() - INTERVAL 1 HOUR
ORDER BY engagement_score DESC
LIMIT 50;
```

## The Advantages

**1. No MongoDB.** One fewer service. No FerretDB translation layer. No document database at all. The stack becomes: ClickHouse + S3 + API. Simpler to run, simpler to understand.

**2. Sovereignty.** User data is files, not rows in a database. Alice can copy her S3 prefix to another bucket. She can move to another node by pointing it at her files. The data is portable by definition — not because of an export feature, because it's just files.

**3. Cross-user queries are native.** MongoDB makes cross-user queries painful because each user has their own collection. S3 has no collection boundary — it's a flat namespace with prefixes. ClickHouse can query all users in one SELECT. No discovery index needed. No projection layer. The user data IS the public layer.

**4. Storage cost.** Parquet compresses 5-10x vs BSON. S3 is cheap. At scale, storage matters. A user with 10,000 posts takes ~50MB in MongoDB, ~5MB in Parquet on S3.

**5. ClickHouse features on everything.** Inverted index for search. Materialized views for aggregation. TTL for retention. These work on S3-backed tables. The discovery features (trending, search, suggestions) work directly on user data — no mirror, no sync.

**6. No double-write.** The personal-vs-discoverable tension disappears. There's one copy of the data. ClickHouse reads it for personal queries and public queries. No ledger mirror. No projection hooks. No sync problem.

**7. Media and metadata together.** Currently media blobs live in MinIO and metadata lives in MongoDB. With this model, everything is S3. Media blobs in one prefix, metadata as Parquet in another. One storage system.

**8. Horizontal scale.** S3 scales infinitely. ClickHouse scales horizontally. No MongoDB replica set limits. No sharding strategy to design.

## The Disadvantages

**1. No atomic updates.** MongoDB's `find_one_and_update` is atomic. S3 + Parquet is not. To update a record: read the file, modify the row, write a new file, replace the old one. Between read and write, another request can modify the same file. Last write wins. For social data this is often acceptable — reactions are idempotent, posts are append-only. But it's a real limitation.

**2. No row-level deletes.** Parquet files are immutable. To delete a row: rewrite the file without it, or add a tombstone flag. MongoDB deletes a document in microseconds. S3 requires a file rewrite. Tombstones work but the old data stays on disk until compaction.

**3. Write latency.** Writing a Parquet file to S3 is slower than writing to MongoDB. Serialization, compression, network round-trip. MongoDB writes are in-memory with WAL. For high-frequency operations (reactions, likes), S3 write latency adds up. Mitigation: batch writes. Accumulate records in memory, flush to S3 every N seconds or N records.

**4. Query latency.** ClickHouse reading from S3 is slower than reading from local disk. Every query hits the network. For read-heavy operations (feed, profile, search), S3 latency matters. Mitigation: ClickHouse can cache hot data locally. Or use a materialized view that copies frequently queried data to local disk.

**5. Schema rigidity.** Parquet has a schema. Adding a field means either: writing new files with the new schema (now you have two schemas), or making the schema wide enough for every possible field. MongoDB is schemaless — every document can have different fields. For social data with evolving features, schema flexibility matters. Mitigation: use a superset schema with nullable columns. Or use a JSON column for flexible fields.

**6. Small files problem.** If every write creates a Parquet file, you get millions of tiny files. S3 doesn't like that — listing is slow, metadata operations are expensive. Mitigation: batch writes. Accumulate records, flush as larger files. Or use a compaction process that merges small files periodically.

**7. Per-user access control.** MongoDB collections are naturally isolated — Alice's collection is separate from Bob's. S3 prefixes can be isolated with IAM policies, but ClickHouse querying across prefixes needs access to all of them. The API layer must enforce access control — ClickHouse can't gate reads per-user. Mitigation: the API validates the token, checks the terms record, and only constructs queries for data the user can access. This is already how the API works — it's not a new problem.

**8. No secondary indexes.** Parquet has column statistics (min/max) that ClickHouse uses for pruning, but no secondary indexes. A query like `SELECT * WHERE post_id = 'xyz'` scans every file in the prefix. MongoDB has an index on `_id` — it's instant. Mitigation: partition by post_id hash. Or use a local ClickHouse table as an index that maps IDs to S3 file locations.

**9. No geospatial indexes.** MongoDB has geospatial indexes for location queries. ClickHouse has geospatial functions but no native geospatial index. For location-based features, this is a limitation.

**10. No change streams.** MongoDB change streams let you react to data changes in real-time. S3 has no equivalent. To detect changes: poll S3 for new files, or use S3 event notifications. Less elegant, more complex.

## The Hybrid — Best of Both

The honest answer: this isn't all-or-nothing. The public layer benefits from S3 + ClickHouse. The personal layer benefits from MongoDB.

```
Personal data (CRUD-heavy):  MongoDB
  - Single-record updates
  - Atomic operations
  - Per-user isolation
  - Schema flexibility

Public data (query-heavy):   S3 + ClickHouse
  - Cross-user aggregation
  - Search
  - Trending
  - Analytics
```

The bridge is the server-side hook. When a user creates a post, the API writes to MongoDB (personal) AND to S3 (public). One client call, two writes. The writes are different shapes — MongoDB gets the full document, S3 gets the projected public fields.

This is the double-write from the other doc. But with S3 as the target, the double-write has a purpose: personal data stays in the right database, public data lands in the right storage.

## What About Replacing MongoDB Entirely?

Technically possible. Operationally painful.

Every CRUD operation becomes a file read + file write. Atomic operations require application-level locking. Schema evolution requires migration scripts. Deletes require tombstones and compaction.

The benefit: one storage system. The cost: reimplementing every database feature in application code.

The trade-off only makes sense if the benefit (sovereignty, simplicity, cost) outweighs the cost (complexity, latency, lost features). For web10, the sovereignty story is central. But the current model already supports data export. Making the storage format portable doesn't make the data more sovereign — the API contracts do.

## The Verdict

**S3 + ClickHouse for the public layer:** yes. The advantages (cross-user queries, search, analytics, cost) outweigh the disadvantages (write latency, no updates). The public layer is append-heavy and query-heavy — perfect for S3 Parquet.

**S3 + ClickHouse for personal data:** no. The disadvantages (no atomic updates, no row-level deletes, schema rigidity, write latency) outweigh the advantages. Personal data is CRUD-heavy — MongoDB is the right tool.

**The hybrid:** keep MongoDB for personal data, move the public ledger to S3 + ClickHouse. Server-side hooks bridge them. No double-write problem — the writes go to different systems for different purposes.

## The Deeper Question

The real question isn't "S3 or MongoDB?" It's "what does the data model look like?"

The current model: one collection per user, system collections for public data. This model creates the double-write problem because personal and public data live in different places.

An alternative model: all data in one place, with access control at the query layer. Personal data is just data with restricted access. Public data is data with open access. No separate collections. No mirrors.

S3 + ClickHouse makes this model possible. One S3 bucket. ClickHouse enforces access control via the API layer. Personal and public are not different storage — they're different query permissions.

That's a v3 question. The v2 answer is "server-side hooks." The v3 answer might be "one storage, query-time access control."

Until then: MongoDB for personal, S3 + ClickHouse for public. The hooks bridge them.