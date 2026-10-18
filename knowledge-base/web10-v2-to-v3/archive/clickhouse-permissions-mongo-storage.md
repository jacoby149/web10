# ClickHouse Permissions + MongoDB Storage: The Flattened Model

## The Current Problem

MongoDB has one database per user: `alice.public_posts`, `bob.public_posts`. Access control is structural — you can't query Bob's collection because it's a separate database. Cross-user queries are impossible, which is why the discovery index and public ledger exist.

The consequence: double-write. Every public action writes to the user's collection AND a system collection. The client manages sync. The sync breaks.

## The Idea

Flatten MongoDB. One collection (or a few). Just IDs and raw data. No per-user isolation at the database level.

Move the permissions layer to ClickHouse. Every record has a permissions entry — who can see it, under what terms. ClickHouse queries join MongoDB data with permissions. If you don't have permission, the row is filtered out at query time.

```
MongoDB (dumb storage):  { _id: "post-abc", body: { text: "hello", tags: [...] }, author: "alice" }
ClickHouse (permissions): { record_id: "post-abc", author: "alice", visibility: "public", terms: "..." }
```

The dev does CRUD. Writes the raw data to MongoDB. Writes the permissions metadata to ClickHouse. That's it.

## How It Works

### The MongoDB Layer — Dumb Storage

One collection. Flat. No per-user databases. No access control at the storage layer.

```
web10_data/
  posts:
    { _id: "post-abc", author: "alice", body: { text: "...", tags: [...] }, created_at: ... }
    { _id: "post-def", author: "bob", body: { text: "...", tags: [...] }, created_at: ... }
  reactions:
    { _id: "react-1", actor: "alice", target: "post-def", type: "like", created_at: ... }
  comments:
    { _id: "comment-1", actor: "alice", target: "post-def", text: "...", created_at: ... }
  follows:
    { _id: "follow-1", follower: "alice", following: "bob", created_at: ... }
```

That's it. Just IDs and raw BSON. No schema enforcement. No access control. The dev writes to it like a key-value store.

### The ClickHouse Layer — Permissions + Analytics

Structured tables for permissions, visibility, and aggregation:

```sql
-- Permissions: who can see what
CREATE TABLE record_permissions (
    record_id String,
    record_type String,  -- 'post', 'reaction', 'comment'
    author_key String,
    visibility String,   -- 'public', 'followers', 'private', 'token'
    terms String,        -- JSON: who has access, under what conditions
    created_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (record_type, author_key, record_id);

-- Follows graph: who follows whom
CREATE TABLE follows_graph (
    follower_key String,
    following_key String,
    created_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (follower_key, following_key);

-- Tokens: who has been granted access to what
CREATE TABLE access_tokens (
    token_id String,
    record_id String,
    granted_to String,
    expires_at DateTime64(3),
    revoked UInt8 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (record_id, granted_to);

-- Engagement: aggregated from reactions
CREATE TABLE engagement (
    record_id String,
    reaction_count UInt32,
    comment_count UInt32,
    score Float64,
    updated_at DateTime64(3)
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY record_id;
```

### The Query — Join + Filter

Every read goes through ClickHouse. It joins MongoDB data with permissions and filters by the requester's access:

```sql
-- Alice's feed: posts from people she follows that she's allowed to see
SELECT mongo.body, perm.author_key, eng.score
FROM mongodb('mongodb://...', 'web10_data.posts',
    '_id String, author String, body String, created_at DateTime') AS mongo
JOIN record_permissions AS perm ON mongo._id = perm.record_id
LEFT JOIN engagement AS eng ON mongo._id = eng.record_id
JOIN follows_graph AS fg ON perm.author_key = fg.following_key
WHERE fg.follower_key = 'alice'
  AND perm.deleted = 0
  AND (
    perm.visibility = 'public'
    OR perm.visibility = 'followers'
    OR EXISTS (
      SELECT 1 FROM access_tokens
      WHERE record_id = mongo._id AND granted_to = 'alice' AND revoked = 0
    )
  )
ORDER BY mongo.created_at DESC
LIMIT 50;
```

The query returns exactly what Alice is allowed to see. Nothing more. Nothing less. The permissions are enforced at the query layer, not the storage layer.

### The Write — CRUD + Permissions

The dev writes to MongoDB (the data) and ClickHouse (the permissions). One API call, two writes:

```
Client → POST /alice/posts → API
                                  → MongoDB INSERT: { _id: "post-abc", author: "alice", body: {...} }
                                  → ClickHouse INSERT: { record_id: "post-abc", author: "alice", visibility: "public", terms: {...} }
```

The MongoDB write is the data. The ClickHouse write is the permissions. Both are fast. Both are awaited. If either fails, the whole operation fails.

## The Advantages

**1. No double-write for discovery.** The discovery index disappears. ClickHouse queries MongoDB directly and filters by permissions. There's one copy of the data. No mirror. No sync problem.

**2. Cross-user queries are trivial.** MongoDB is flat. ClickHouse can query all users in one SELECT. The permissions layer filters what's visible. No system collections. No ledger.

**3. Targeted discovery.** Every user's discovery feed is a ClickHouse query with their specific permission filters. "Show me posts from people I follow where visibility is public or followers." The query returns exactly what they're allowed to see. No over-fetching, no client-side filtering.

**4. MongoDB is simple.** The dev just writes BSON. No per-user databases to manage. No collection-per-user pattern. No cross-collection queries. It's a key-value store for documents.

**5. ClickHouse owns the complex stuff.** Permissions, visibility, terms, engagement scoring, trending, search — all structured in ClickHouse where they belong. ClickHouse is the query engine for "what can this user see?"

**6. Sovereignty.** User data in MongoDB is just files (BSON). Export is dumping the collection and filtering by author. Portable. Simple.

**7. No FerretDB.** MongoDB is just dumb storage. Any MongoDB-compatible backend works. FerretDB's limitations don't matter because we're not doing complex queries against it — ClickHouse handles the queries.

## The Disadvantages

**1. Every read goes through ClickHouse.** Even a single post lookup: `GET /alice/posts/abc` goes through ClickHouse → `mongodb()` → MongoDB. Added latency vs. direct MongoDB reads. Mitigation: cache hot reads. Or keep the CRUD API for simple lookups and use ClickHouse only for cross-user queries.

**2. ClickHouse is the single point of failure for reads.** If ClickHouse is down, no one can read anything. Even the owner can't read their own posts. Mitigation: ClickHouse is highly available. Multiple nodes, replication.

**3. Permission evaluation at query time.** Every query evaluates permissions for every row. At scale, this is expensive. Mitigation: materialized views for common permission patterns. Pre-computed "visible to X" indexes.

**4. MongoDB has no access control.** If someone gets direct MongoDB access, they can read everything. The permissions are only enforced by ClickHouse. Mitigation: MongoDB is behind the API. Direct access requires infrastructure compromise. Defense in depth.

**5. Write complexity.** The dev writes to two systems. MongoDB for data, ClickHouse for permissions. If the MongoDB write succeeds but ClickHouse fails, the data exists without permissions. Mitigation: transactional write — both succeed or both fail. Or: ClickHouse write is the primary, MongoDB is the backup.

**6. Schema drift.** MongoDB is schemaless. ClickHouse has a schema. If the MongoDB document gains a field, the ClickHouse `mongodb()` schema definition needs updating. Mitigation: ClickHouse schema is the source of truth. The API enforces it on writes.

## The Hybrid CRUD

The practical approach: not every read goes through ClickHouse.

```
Simple CRUD (single user, single record): API → MongoDB directly
  - GET /alice/posts/abc
  - PATCH /alice/posts/abc
  - DELETE /alice/posts/abc

Cross-user queries (discovery, feed, search): API → ClickHouse → mongodb()
  - GET /discover
  - GET /alice/feed
  - GET /search?q=hello
  - GET /trending
```

The CRUD API reads MongoDB directly for single-user operations. ClickHouse handles everything that crosses user boundaries. The permissions layer in ClickHouse is consulted for cross-user queries. For single-user CRUD, the API checks the token and authorizes against the record's author — simple, fast, no ClickHouse needed.

## The Write Model

The dev's experience:

```python
# Create a post — one API call
def create_post(author, body, visibility):
    post_id = str(uuid4())

    # MongoDB: the data
    mongo.db.posts.insert_one({
        "_id": post_id,
        "author": author,
        "body": body,
        "created_at": now(),
    })

    # ClickHouse: the permissions
    clickhouse.execute("""
        INSERT INTO record_permissions
        VALUES (%s, 'post', %s, %s, %s, %s, 0)
    """, (post_id, author, visibility, json.dumps(terms), now()))

    return post_id
```

The dev writes to MongoDB (the data) and ClickHouse (the permissions). The API handles both. The dev doesn't think about sync, mirrors, or projections.

## What About the Ledger?

The public ledger disappears. Reactions, comments, and follows are just records in MongoDB with permissions in ClickHouse. Engagement counts are materialized views in ClickHouse:

```sql
CREATE MATERIALIZED VIEW reaction_counts
TO engagement
AS SELECT
    target AS record_id,
    count() AS reaction_count,
    0 AS comment_count,
    count() * 1.0 AS score,
    now() AS updated_at
FROM mongodb('mongodb://...', 'web10_data.reactions',
    '_id String, actor String, target String, type String, created_at DateTime')
WHERE type = 'like'
GROUP BY target;
```

The materialized view aggregates reactions from MongoDB into ClickHouse. Engagement counts are pre-computed. No ledger mirror. No client-side sync.

## The Verdict

This is the v3 answer to the double-write problem. Not "server-side hooks to a mirror." Not "S3 projections." The answer is: **one storage, one permissions layer, queries join them.**

MongoDB is the dumb storage. ClickHouse is the smart query engine. The permissions live where the queries happen. The data lives where writes are fast. They're joined at query time.

The double-write problem disappears because there's no mirror. The discovery index disappears because ClickHouse queries across users. The ledger disappears because engagement is a materialized view.

One collection. One permissions table. One query engine. The rest is SQL.

## Migration Path

1. Flatten MongoDB: migrate from per-user databases to a flat collection
2. Deploy ClickHouse with permissions tables
3. Backfill permissions from existing terms records and visibility settings
4. Migrate cross-user queries (discovery, feed, search) to ClickHouse
5. Keep CRUD API for single-user operations
6. Deprecate the discovery index and public ledger

The migration is additive. The flat collection coexists with per-user databases during transition. ClickHouse queries the flat collection. The old system collections are deprecated as ClickHouse replaces them.