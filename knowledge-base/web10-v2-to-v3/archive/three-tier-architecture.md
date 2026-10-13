# Three-Tier Architecture: MongoDB Storage + Postgres Permissions + ClickHouse Analytics

## The Problem

The previous doc proposed ClickHouse for both permissions and analytics. ClickHouse is OLAP — great for aggregations, bad for single-record CRUD. The permissions layer needs fast point writes (create permission, revoke token, update visibility) and fast point lookups (does user X have access to record Y?). That's OLTP.

Postgres and YugabyteDB are OLTP. They're fast for point writes and lookups. They can't query MongoDB directly like ClickHouse can. So the architecture needs three tiers.

## The Three Tiers

```
MongoDB (dumb storage):     Raw data. IDs and BSON. No access control.
Postgres/Yugabyte (OLTP):   Permissions. Who can see what. Fast point reads/writes.
ClickHouse (OLAP):          Analytics. Discovery, trending, engagement, search.
```

Each tier does what it's built for. No compromise.

## The MongoDB Layer — Dumb Storage

Same as before. One flat collection. Just IDs and raw data.

```
web10_data/
  posts:
    { _id: "post-abc", author: "alice", body: { text: "...", tags: [...] }, created_at: ... }
  reactions:
    { _id: "react-1", actor: "alice", target: "post-def", type: "like", created_at: ... }
  comments:
    { _id: "comment-1", actor: "alice", target: "post-def", text: "...", created_at: ... }
```

## The Postgres Layer — Permissions (OLTP)

Fast point reads and writes. Every record has a permissions row. The API checks Postgres before serving any data.

```sql
-- Permissions: who can see what
CREATE TABLE record_permissions (
    record_id TEXT PRIMARY KEY,
    record_type TEXT NOT NULL,  -- 'post', 'reaction', 'comment'
    author_key TEXT NOT NULL,
    visibility TEXT NOT NULL,   -- 'public', 'followers', 'private', 'token'
    terms JSONB,                -- access conditions
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted BOOLEAN DEFAULT FALSE
);

-- Index for permission checks
CREATE INDEX idx_permissions_author ON record_permissions(author_key);
CREATE INDEX idx_permissions_visibility ON record_permissions(visibility);

-- Follows graph
CREATE TABLE follows (
    follower_key TEXT NOT NULL,
    following_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (follower_key, following_key)
);

CREATE INDEX idx_follows_following ON follows(following_key);

-- Access tokens
CREATE TABLE access_tokens (
    token_id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL,
    granted_to TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    revoked BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_tokens_record ON access_tokens(record_id);
CREATE INDEX idx_tokens_granted ON access_tokens(granted_to);
```

The API checks permissions before serving data:

```python
def can_user_see(user_key, record_id):
    perm = db.execute("""
        SELECT visibility FROM record_permissions WHERE record_id = $1
    """, record_id).fetchone()

    if perm.visibility == 'public':
        return True
    if perm.visibility == 'followers':
        return db.execute("""
            SELECT 1 FROM follows WHERE follower_key = $1 AND following_key = $2
        """, user_key, perm.author_key).fetchone() is not None
    if perm.visibility == 'token':
        return db.execute("""
            SELECT 1 FROM access_tokens
            WHERE record_id = $1 AND granted_to = $2 AND revoked = FALSE
        """, record_id, user_key).fetchone() is not None
    return False
```

Sub-millisecond. Indexed. ACID. This is what Postgres does.

## The ClickHouse Layer — Analytics (OLAP)

Discovery, trending, engagement, search. Cross-user aggregation. This is where ClickHouse shines.

```sql
-- Post index for discovery
CREATE TABLE discovery_posts (
    post_id String,
    author_key String,
    text String,
    tags Array(String),
    visibility String,
    created_at DateTime64(3),
    engagement_score Float64,
    deleted UInt8 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (created_at, post_id);

-- Engagement aggregation
CREATE TABLE engagement (
    record_id String,
    reaction_count UInt32,
    comment_count UInt32,
    score Float64,
    updated_at DateTime64(3)
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY record_id;

-- Follows graph for feed computation
CREATE TABLE follows_graph (
    follower_key String,
    following_key String,
    created_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (follower_key, following_key);
```

ClickHouse queries for discovery:

```sql
-- Alice's feed: posts from people she follows
SELECT dp.post_id, dp.text, dp.tags, dp.engagement_score
FROM discovery_posts dp
JOIN follows_graph fg ON dp.author_key = fg.following_key
WHERE fg.follower_key = 'alice'
  AND dp.deleted = 0
  AND dp.visibility IN ('public', 'followers')
ORDER BY dp.created_at DESC
LIMIT 50;
```

The ClickHouse query returns candidate records. The API checks Postgres for permissions before serving each one.

## The Write Flow

One API call, three writes:

```
Client → POST /alice/posts → API
                                  → MongoDB INSERT (raw data)
                                  → Postgres INSERT (permissions)
                                  → ClickHouse INSERT (discovery index)
```

MongoDB: the data. Postgres: who can see it. ClickHouse: discovery and analytics.

```python
def create_post(author, body, visibility):
    post_id = str(uuid4())

    # MongoDB: the data
    mongo.db.posts.insert_one({
        "_id": post_id,
        "author": author,
        "body": body,
        "created_at": now(),
    })

    # Postgres: the permissions
    postgres.execute("""
        INSERT INTO record_permissions (record_id, record_type, author_key, visibility, terms)
        VALUES ($1, 'post', $2, $3, $4)
    """, post_id, author, visibility, json.dumps(terms))

    # ClickHouse: the discovery index
    clickhouse.execute("""
        INSERT INTO discovery_posts VALUES (%s, %s, %s, %s, %s, %s, 0.0, 0)
    """, (post_id, author, body['text'], body['tags'], visibility, now()))

    return post_id
```

## The Read Flow

Two paths:

```
CRUD read (single user):     API → Postgres (check permission) → MongoDB (get data)
Discovery read (cross-user): API → ClickHouse (get candidates) → Postgres (check each) → MongoDB (get data)
```

For a single post: `GET /alice/posts/abc` → Postgres check → MongoDB fetch. Fast. No ClickHouse needed.

For a feed: `GET /alice/feed` → ClickHouse returns 50 candidates → Postgres checks each → MongoDB fetches the allowed ones. The ClickHouse query is fast. The Postgres checks are fast (indexed). The MongoDB fetches are fast (by ID).

## Why Not ClickHouse for Permissions?

ClickHouse is OLAP. It's built for:
- High-throughput batch inserts
- Complex aggregations over millions of rows
- Columnar compression and vectorized execution

It's NOT built for:
- Single-row inserts (high latency, no WAL)
- Single-row updates (requires mutation, background process)
- Single-row deletes (requires mutation, background process)
- Point lookups (no secondary indexes, scans partitions)

The permissions layer needs all four of those. Postgres does them natively. ClickHouse doesn't.

## Why Not Postgres for Analytics?

Postgres can do cross-user queries. It can join tables and aggregate. But at scale:

- Postgres scans rows. ClickHouse scans columns. For "top 50 posts by engagement," Postgres reads every column of every row. ClickHouse reads only the columns it needs.
- Postgres has no inverted index for full-text search. ClickHouse does.
- Postgres materialized views refresh manually. ClickHouse materialized views update automatically on insert.
- Postgres struggles with billions of rows. ClickHouse is built for it.

## Why Not ClickHouse mongodb() for Permissions?

The `mongodb()` table function lets ClickHouse query MongoDB directly. But it's still OLAP — it reads MongoDB collections in batch, not for point lookups. A permission check like "does user X have access to record Y?" becomes a full collection scan in ClickHouse. Postgres does it with an index in microseconds.

## The Trade-offs

| Operation | MongoDB | Postgres | ClickHouse |
|---|---|---|---|
| Single-row INSERT | Fast | Fast | Slow (batch only) |
| Single-row UPDATE | Fast | Fast | Slow (mutation) |
| Single-row DELETE | Fast | Fast | Slow (mutation) |
| Point lookup (by ID) | Fast (indexed) | Fast (indexed) | Slow (partition scan) |
| Cross-user aggregation | Slow (MapReduce) | OK (joins) | Fast (vectorized) |
| Full-text search | Weak | OK (tsvector) | Fast (inverted index) |
| Materialized views | No | Manual | Automatic |
| Time-series queries | Weak | OK | Fast (partitioning, TTL) |

## The Verdict

**MongoDB for storage.** Dumb. Flat. Just IDs and BSON. No access control. No complex queries. The dev writes to it like a key-value store.

**Postgres for permissions.** Fast point reads and writes. Indexed lookups. ACID. The API checks Postgres before serving any data. "Does user X have access to record Y?" is a single indexed query.

**ClickHouse for analytics.** Discovery, trending, engagement, search. Cross-user aggregation. Inverted index for search. Materialized views for pre-computed scores. The API queries ClickHouse for candidate records, then checks Postgres for permissions.

Three tiers. Each does what it's built for. No compromise.

## The Double-Write Problem

The previous docs identified the double-write as the core problem: personal data in one place, public data in another, client manages sync. This three-tier model solves it differently:

- There's one copy of the data (MongoDB)
- Permissions are in Postgres (fast, reliable, ACID)
- Discovery is in ClickHouse (fast, analytical)
- The server writes all three. The client never manages sync.

The server-side hook is the bridge. One API call, three writes. All awaited. All reliable. The client makes one call. The server handles the rest.

## Migration Path

1. Flatten MongoDB: migrate from per-user databases to a flat collection
2. Deploy Postgres with permissions tables
3. Backfill permissions from existing terms records and visibility settings
4. Deploy ClickHouse with discovery tables
5. Backfill discovery from existing posts
6. Migrate CRUD reads: API checks Postgres, reads MongoDB
7. Migrate discovery reads: API queries ClickHouse, checks Postgres, reads MongoDB
8. Deprecate the discovery index and public ledger

## Summary

MongoDB stores the data. Postgres controls access. ClickHouse powers discovery. Three tiers, each doing what it's built for. The API orchestrates them. The client never thinks about sync.

The double-write problem disappears because there's one copy of the data. The permissions problem is solved by Postgres — fast, indexed, ACID. The discovery problem is solved by ClickHouse — fast aggregation, search, analytics.

One storage. One permissions layer. One analytics engine. The API joins them.