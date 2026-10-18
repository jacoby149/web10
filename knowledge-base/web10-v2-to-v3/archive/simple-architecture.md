# Simple Architecture: MongoDB + ClickHouse

## The Goal

WordPress for YouTube vibes. Simple to deploy. Simple to operate. The dev doesn't think about databases — they just write content and it works.

## Two Databases. That's It.

```
MongoDB      — full documents. The body of everything.
ClickHouse   — the discovery index. Everything needed for queries, stored locally.
```

No Postgres. No CDC pipeline. No Kafka. No federated joins at query time.

## What Goes Where

### MongoDB — The Documents

The full, rich payload. Everything the user wrote.

```
posts:
  { _id: "post-abc", author: "alice", body: { text: "hello", media: [...] }, created_at: ... }
reactions:
  { _id: "react-1", actor: "alice", target: "post-abc", type: "like", created_at: ... }
comments:
  { _id: "comment-1", actor: "alice", target: "post-abc", text: "nice", created_at: ... }
```

MongoDB is the source of truth for the content. When the dev reads a single post, they read from MongoDB by ID. Fast. Simple.

### ClickHouse — The Index

Everything needed to answer discovery queries, stored locally. No joins to external databases at query time.

```sql
CREATE TABLE discovery_posts (
    post_id String,
    author_key String,
    text String,              -- copy for search (inverted index)
    tags Array(String),
    visibility String,         -- permissions baked in
    created_at DateTime64(3),
    engagement_score Float64,
    deleted UInt8 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (created_at, post_id);

CREATE TABLE follows_graph (
    follower_key String,
    following_key String,
    created_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (follower_key, following_key);

CREATE TABLE engagement (
    record_id String,
    reaction_count UInt32,
    score Float64,
    updated_at DateTime64(3)
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY record_id;
```

The key: **everything ClickHouse needs for a query lives in ClickHouse.** The `visibility` column is in the table. The follows graph is in the table. No Postgres lookup. No MongoDB join. The query is local, fast, vectorized.

## The Developer Experience

The dev makes one call. The API handles the rest.

```ts
// The dev writes this:
await createPost({
  text: "hello world",
  tags: ["web10"],
  visibility: "public"
});

// The API handles this (the dev never sees it):
// → MongoDB: insert full document
// → ClickHouse: insert index row + visibility
```

That's it. The dev doesn't know there are two databases. They don't care. They just CRUD with visibility settings.

## The Read Flow

```
Discovery query (feed, trending, search):
  → ClickHouse returns post IDs (local query, fast)
  → API batch-fetches full documents from MongoDB by ID
  → Return to client

Single post read:
  → MongoDB fetch by ID (direct, no ClickHouse needed)
  → Return to client
```

ClickHouse never joins to MongoDB at query time. It returns IDs. The API fetches the bodies. This is the pattern that doesn't melt databases.

## Why Not Three Databases?

Adding Postgres for permissions means:
- A third service to deploy and maintain
- A CDC pipeline to keep it in sync with ClickHouse
- Federated joins or application-level orchestration for every query
- More things that can break

The permissions are simple enough to live in ClickHouse. `visibility` is a column. Revoking is inserting a `deleted=true` row. Follows are a table. These are all append-only writes — ClickHouse handles them perfectly.

ClickHouse is OLAP, not OLTP. But the permissions workload is mostly inserts (create permission) and reads (filter by visibility). The updates are rare and can be handled as append-only (insert a new row, mark the old one deleted). This is the model ClickHouse is built for.

## Why Not Federated Joins?

The `mongodb()` and `postgresql()` table functions are great for ETL and backfills. They're terrible for production queries:

- Every query opens network connections to external databases
- ClickHouse loses its columnar speed advantage waiting on network I/O
- Under load, it floods MongoDB and Postgres with parallel connections

The rule: `mongodb()` and `postgresql()` are for data migrations, not API pathways.

## The Write Model

The API writes to both databases synchronously. If either fails, the whole operation fails.

```python
def create_post(author, body, visibility):
    post_id = str(uuid4())

    # MongoDB: the full document
    mongo.db.posts.insert_one({
        "_id": post_id,
        "author": author,
        "body": body,
        "created_at": now(),
    })

    # ClickHouse: the index row (with permissions baked in)
    clickhouse.execute("""
        INSERT INTO discovery_posts
        VALUES (%s, %s, %s, %s, %s, %s, 0.0, 0)
    """, (post_id, author, body['text'], body['tags'], visibility, now()))

    return post_id
```

Both writes are fast. Both are awaited. No background sync. No CDC. No eventual consistency.

For engagement updates (reactions streaming in), a background queue batches inserts into ClickHouse. This is the one place where async is acceptable — engagement counts can be eventual.

## The Discovery Query

Alice's feed — posts from people she follows, filtered by visibility:

```sql
SELECT dp.post_id, dp.author_key, dp.text, dp.tags, dp.engagement_score
FROM discovery_posts dp
JOIN follows_graph fg ON dp.author_key = fg.following_key
WHERE fg.follower_key = 'alice'
  AND dp.deleted = 0
  AND fg.deleted = 0
  AND (
    dp.visibility = 'public'
    OR dp.visibility = 'followers'
  )
ORDER BY dp.created_at DESC
LIMIT 50;
```

Everything is local. Everything is fast. No network hops. No external joins. ClickHouse returns 50 post IDs with enough metadata to render the feed. The API fetches the full bodies from MongoDB for any posts that need it.

## The Double-Write Problem

Solved. One copy of the data (MongoDB). One index for discovery (ClickHouse). The server writes both. The client never manages sync. No ledger mirror. No projection layer. No double-write.

The "double-write" is just the API writing to two databases in one call. It's not a problem — it's the architecture. The dev doesn't see it.

## Deployment

Two services in docker-compose:

```yaml
services:
  mongo:       # or ferretdb + postgres-documentdb
  clickhouse:  # single binary, no dependencies
  api:         # orchestrates both
  minio:       # media blobs
```

Four services. That's the whole stack. No Kafka. No Debezium. No Postgres. No CDC pipeline.

## Summary

MongoDB stores the documents. ClickHouse stores the index with permissions baked in. The API orchestrates writes. The dev just calls `createPost()` and doesn't think about it.

Two databases. No CDC. No federated joins. No Kafka. Simple to deploy. Simple to operate. Fast queries. The WordPress for YouTube vibe.