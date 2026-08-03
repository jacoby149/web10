# Discovery Is CRUD: No Separate Endpoints

## The Problem

`/public` and `/discover` are separate endpoints from CRUD. The discovery index is a separate data surface. The public ledger is a separate data surface. The client writes to CRUD and mirrors to the ledger. The server indexes to the discovery table. Three surfaces. Sync problems. Double-write.

The discovery index exists because MongoDB can't query across users. ClickHouse can. The discovery index is a MongoDB workaround, not a platform feature.

## The Solution

Discovery is a CRUD parameter. One endpoint. One data surface. No mirrors. No sync.

```
GET /alice/posts?discover=true    → posts Alice can see (public + followers + groups)
GET /alice/posts?discover=false   → only Alice's own posts
GET /alice/posts                  → default: Alice's own posts (private)
```

The `discover` flag tells the API to apply cross-user visibility filtering. Without it, the API returns only the authenticated user's own data. With it, the API returns data from other users where the authenticated user has permission.

## How It Works

The CRUD endpoint handles everything. ClickHouse filters by permissions at query time:

```sql
-- discover=false: only the user's own posts
SELECT * FROM posts
WHERE author_key = 'alice' AND deleted = 0
ORDER BY created_at DESC;

-- discover=true: posts Alice can see (cross-user, permission-filtered)
SELECT * FROM posts
WHERE deleted = 0
  AND (
    -- Public posts from anyone
    visibility = 'public'
    AND collection_visibility = 'public'

    OR

    -- Followers-only: Alice sees them if she follows the author
    (visibility = 'followers'
     AND author_key IN (
       SELECT following_key FROM follows
       WHERE follower_key = 'alice' AND deleted = 0
     ))

    OR

    -- Group posts: Alice sees them if she's a member
    (visibility = 'group'
     AND visibility_scope IN (
       SELECT group_id FROM group_members
       WHERE member_key = 'alice' AND deleted = 0
     ))

    OR

    -- Alice's own posts (always visible)
    author_key = 'alice'
  )
ORDER BY created_at DESC
LIMIT 50;
```

## The Post-Level `discoverable` Flag

Every post has a `discoverable` flag. The author controls it:

```ts
// Public and discoverable (default for public posts)
await createPost({ text: "hello world", visibility: "public", discoverable: true });

// Public but not discoverable (visible by direct link, not in feeds)
await createPost({ text: "private link post", visibility: "public", discoverable: false });

// Followers-only (discoverable within followers)
await createPost({ text: "behind the scenes", visibility: "followers", discoverable: true });
```

The `discoverable` flag is per-record. The author sets it. The API respects it. If `discoverable: false`, the post is excluded from `discover=true` queries but still visible to the author and anyone with a direct link.

```sql
-- discover=true also filters by discoverable flag
SELECT * FROM posts
WHERE deleted = 0
  AND discoverable = 1
  AND (visibility checks...)
```

## What Disappears

- `/discover` endpoint — replaced by `?discover=true` on CRUD
- `/public` endpoint — replaced by `?discover=true&visibility=public`
- Discovery index table — replaced by ClickHouse filtering on the posts table
- Public ledger — replaced by ClickHouse aggregation on the reactions table
- Server-side indexing hooks — replaced by a single insert into the posts table
- Client-side ledger mirrors — replaced by the API writing once

## The API Surface

```
# CRUD endpoints (everything)
GET  /{user}/posts                    → user's own posts
GET  /{user}/posts?discover=true      → discoverable posts the user can see
GET  /{user}/posts?discover=true&sort=trending  → trending posts
GET  /{user}/posts?discover=true&tags=web10     → posts with tag
GET  /{user}/posts/{id}              → single post (by ID, if permitted)

POST /{user}/posts                   → create a post
PATCH /{user}/posts/{id}             → update a post
DELETE /{user}/posts/{id}            → delete a post (tombstone)

# Same pattern for reactions, comments, follows
GET  /{user}/reactions?discover=true → reactions the user can see
GET  /{user}/comments?discover=true  → comments the user can see
```

One endpoint per resource. The `discover` flag controls cross-user visibility. The `sort` and `tags` parameters control ordering and filtering. ClickHouse handles the rest.

## Why This Is Better

**1. No double-write.** One insert. One table. No discovery index mirror. No public ledger mirror. The API writes once. ClickHouse queries it.

**2. No sync problem.** The data is in one place. ClickHouse filters at query time. No stale projections. No reconciliation. No tombstone cleanup for the index.

**3. Simpler API.** One endpoint per resource. The `discover` flag is a boolean. The client doesn't think about which endpoint to hit. It just sets the flag.

**4. Simpler stack.** No discovery index table. No public ledger table. No server-side hooks. No client-side mirrors. One table for posts. One table for reactions. One table for comments.

**5. Real-time.** No delay between write and discovery. The post is discoverable immediately because it's in the same table ClickHouse queries.

**6. The author controls it.** The `discoverable` flag is per-record. The author decides. The API respects it. No platform override. No shadow-banning. No algorithmic suppression.

## The Developer Experience

```ts
// Read my posts
const myPosts = await readPosts({ username: 'alice' });

// Read discoverable posts (feed)
const feed = await readPosts({ username: 'alice', discover: true });

// Read trending posts
const trending = await readPosts({ discover: true, sort: 'trending' });

// Read posts with a tag
const tagged = await readPosts({ discover: true, tags: ['web10'] });

// Create a discoverable post
await createPost({ text: "hello", visibility: "public", discoverable: true });

// Create a non-discoverable post (visible by link only)
await createPost({ text: "secret", visibility: "public", discoverable: false });
```

The dev doesn't think about endpoints. They don't think about the discovery index. They don't think about the ledger. They just set `discover: true` and it works.

## Summary

`/discover` and `/public` disappear. Discovery is a CRUD parameter. One endpoint. One table. No mirrors. No sync. The `discover` flag controls cross-user visibility. The `discoverable` flag controls whether the author wants to be found. ClickHouse filters at query time. The API writes once. The client sets a boolean. That's it.