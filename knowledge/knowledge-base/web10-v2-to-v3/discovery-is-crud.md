# Discovery Is CRUD: No Separate Endpoints

## The Problem

v2 had `/public` and `/discover` as separate endpoints from CRUD. The discovery index was a separate data surface. The public ledger was a separate data surface. The client wrote to CRUD and mirrored to the ledger. The server indexed to the discovery table. Three surfaces. Sync problems. Double-write.

The discovery index existed because MongoDB can't query across users. ClickHouse can. The discovery index was a MongoDB workaround, not a platform feature.

## The Solution

Discovery is a CRUD parameter. One endpoint. One table. No mirrors. No sync.

```
GET /alice/posts?discover=true    → posts Alice can see (groups she belongs to)
GET /alice/posts?discover=false   → only Alice's own posts
GET /alice/posts                  → default: Alice's own posts (private)
```

The `discover` flag tells the API to apply cross-user visibility filtering. Without it, the API returns only the authenticated user's own data. With it, the API returns data from other users where the user is a member of a group the post is attached to.

## How It Works

The CRUD endpoint handles everything. ClickHouse filters by group membership at query time:

```sql
-- discover=false: only the user's own posts
SELECT * FROM documents
WHERE author_key = 'alice' AND deleted = 0
ORDER BY created_at DESC;

-- discover=true: posts Alice can see (cross-user, group membership)
SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at
FROM documents p
JOIN doc_groups pg ON p.doc_id = pg.doc_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.deleted = 0
  AND gm.member_key = 'alice'
  AND gm.deleted = 0
  AND NOT EXISTS (
    SELECT 1 FROM user_blacklist
    WHERE user_key = p.author_key AND blocked_key = 'alice'
  )
  AND NOT EXISTS (
    SELECT 1 FROM group_blacklist
    WHERE user_key = p.author_key
      AND group_id = pg.group_id
      AND blocked_key = 'alice'
  )
ORDER BY p.created_at DESC
LIMIT 50;
```

Alice sees every post attached to a group she belongs to. No visibility column. No collection ceiling. Just group membership.

**The discover group.** Public posts are attached to `web10/discover` — an open group with auto-enrollment on signup, including the anon user. Anyone can read posts attached to it. The author controls it: attach to the group for public, don't for private.

## What Disappears

- `/discover` endpoint — replaced by `?discover=true` on CRUD
- `/public` endpoint — replaced by `?discover=true` (discover group membership)
- Discovery index table — replaced by ClickHouse filtering on the documents table
- Public ledger — replaced by ClickHouse aggregation on documents with `ref` type
- Server-side indexing hooks — replaced by a single insert into documents + doc_groups
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
PATCH /{user}/posts/{id}             → update a post (tombstone + new version)
DELETE /{user}/posts/{id}            → delete a post (tombstone)

# Same pattern for reactions, comments, everything
GET  /{user}/reactions?discover=true → reactions the user can see
GET  /{user}/comments?discover=true  → comments the user can see
```

One endpoint per service. The `discover` flag controls cross-user visibility. The `sort` and `tags` parameters control ordering and filtering. ClickHouse handles the rest.

## Why This Is Better

**1. No double-write.** One insert. One table. No discovery index mirror. No public ledger mirror. The API writes once. ClickHouse queries it.

**2. No sync problem.** The data is in one place. ClickHouse filters at query time. No stale projections. No reconciliation.

**3. Simpler API.** One endpoint per service. The `discover` flag is a boolean. The client doesn't think about which endpoint to hit. It just sets the flag.

**4. Simpler stack.** No discovery index table. No public ledger table. No server-side hooks. No client-side mirrors. One table for documents. Groups for permissions.

**5. Real-time.** No delay between write and discovery. The post is discoverable immediately because it's in the same table ClickHouse queries.

**6. The author controls it.** Attaching a post to a group is the author's choice. The discover group makes it public. The followers group makes it followers-only. No groups makes it private. No platform override. No shadow-banning. No algorithmic suppression.

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

// Create a public post (attach to discover group)
await createPost({ text: "hello", groups: ["web10/discover"] });

// Create a private post (no groups)
await createPost({ text: "secret" });

// Create a followers-only post
await createPost({ text: "behind the scenes", groups: ["alice.followers"] });
```

The dev doesn't think about endpoints. They don't think about the discovery index. They don't think about the ledger. They attach to groups and set `discover: true`. That's it.

## Summary

`/discover` and `/public` disappear. Discovery is a CRUD parameter. One endpoint. One table. No mirrors. No sync. The `discover` flag controls cross-user visibility. Group membership controls what's visible. The discover group makes posts public. ClickHouse filters at query time. The API writes once. The client sets a boolean. That's it.