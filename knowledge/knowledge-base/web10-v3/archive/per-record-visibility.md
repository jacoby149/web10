# Per-Record Visibility: Groups, Tokens, and Discovery

## The Current Problem

Visibility is per-**collection**, not per-record. `public_posts` has `whitelist: [".*"]` — anyone can read everything in it. `private_posts` has `whitelist: []` — only the owner. A post is either public or private. No middle ground.

There's no way to post to a group. No "followers only." No "people with this token." The collection IS the permission.

## The Question

Should groups be separate collections (`group-a-posts`)? That's the old model. It's what created the double-write problem. Each group needs its own collection, its own term record, its own discovery index. N groups = N collections. It doesn't scale.

**The answer: per-record permissions.** Every post carries its own visibility. ClickHouse filters at query time.

## How It Works

Each post has a `visibility` column and a `visibility_scope` column:

```sql
CREATE TABLE posts (
    post_id String,
    author_key String,
    body String,              -- JSON: full post content
    visibility String,         -- 'public', 'private', 'followers', 'group', 'token'
    visibility_scope String,   -- the scope: group_id, token_id, etc.
    tags Array(String),
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (author_key, post_id);

CREATE TABLE group_members (
    group_id String,
    member_key String,
    joined_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (group_id, member_key);

CREATE TABLE follows (
    follower_key String,
    following_key String,
    created_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (follower_key, following_key);

CREATE TABLE access_tokens (
    token_id String,
    record_id String,
    granted_to String,
    expires_at DateTime64(3),
    revoked UInt8 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (record_id, granted_to);
```

The dev posts to a group:

```ts
await createPost({
  text: "hello team",
  visibility: "group",
  visibility_scope: "web10-dev-team",
  tags: ["internal"]
});
```

The dev posts publicly:

```ts
await createPost({
  text: "check this out",
  visibility: "public",
  tags: ["web10"]
});
```

The dev posts to followers only:

```ts
await createPost({
  text: "behind the scenes",
  visibility: "followers"
});
```

## The Discover Query

When Alice hits discover, ClickHouse returns only what she's allowed to see:

```sql
SELECT post_id, author_key, body, tags, created_at
FROM posts
WHERE deleted = 0
  AND created_at > now() - INTERVAL 30 DAY
  AND (
    -- Public posts: everyone sees them
    visibility = 'public'

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

    -- Token posts: Alice sees them if she has a valid token
    (visibility = 'token'
     AND EXISTS (
       SELECT 1 FROM access_tokens
       WHERE record_id = post_id
         AND granted_to = 'alice'
         AND revoked = 0
         AND (expires_at IS NULL OR expires_at > now())
     ))

    OR

    -- Private: Alice sees her own posts
    (visibility = 'private' AND author_key = 'alice')
  )
ORDER BY created_at DESC
LIMIT 50;
```

One query. All permissions evaluated at query time. No over-fetching. No client-side filtering. Alice sees exactly what she's allowed to see.

## The Feed Query

Alice's friends feed — posts from people she follows, filtered by visibility:

```sql
SELECT post_id, author_key, body, tags, created_at
FROM posts
WHERE deleted = 0
  AND author_key IN (
    SELECT following_key FROM follows
    WHERE follower_key = 'alice' AND deleted = 0
  )
  AND (
    visibility = 'public'
    OR visibility = 'followers'
    OR (visibility = 'group'
        AND visibility_scope IN (
          SELECT group_id FROM group_members
          WHERE member_key = 'alice' AND deleted = 0
        ))
    OR (visibility = 'private' AND author_key = 'alice')
  )
ORDER BY created_at DESC
LIMIT 50;
```

## The Profile Query

Bob views Alice's profile. He sees only her public posts and group posts where he's a member:

```sql
SELECT post_id, body, tags, created_at
FROM posts
WHERE deleted = 0
  AND author_key = 'alice'
  AND (
    visibility = 'public'
    OR (visibility = 'group'
        AND visibility_scope IN (
          SELECT group_id FROM group_members
          WHERE member_key = 'bob' AND deleted = 0
        ))
    OR (visibility = 'token'
        AND EXISTS (
          SELECT 1 FROM access_tokens
          WHERE record_id = post_id AND granted_to = 'bob' AND revoked = 0
        ))
  )
ORDER BY created_at DESC;
```

## Why Per-Record, Not Per-Collection

| | Per-Collection (current) | Per-Record (ClickHouse) |
|---|---|---|
| Post to a group | Need a new collection | `visibility: "group"` |
| Post to followers | Need a new collection | `visibility: "followers"` |
| Post with a token | Not possible | `visibility: "token"` |
| Change visibility after posting | Move to another collection | `INSERT` new row with new visibility |
| Discovery query | Separate index per collection | One query, filters by visibility |
| N groups | N collections, N term records | One table, N group_members rows |

Per-record permissions are flexible. Per-collection permissions require infrastructure for every new visibility type.

## The Developer Experience

The dev doesn't think about collections. They don't think about term records. They don't think about whitelists. They just set visibility on the post:

```ts
// Public post
await createPost({ text: "hello", visibility: "public" });

// Followers only
await createPost({ text: "behind the scenes", visibility: "followers" });

// Group post
await createPost({ text: "team update", visibility: "group", visibility_scope: "my-team" });

// Token-gated post
await createPost({ text: "early access", visibility: "token", visibility_scope: "token-abc-123" });

// Private
await createPost({ text: "private note", visibility: "private" });
```

The API writes the row to ClickHouse. The discover query filters by permissions. That's it.

## Groups

Groups are just a membership table. No collections. No term records. No infrastructure:

```sql
INSERT INTO group_members VALUES ('my-team', 'alice', now(), 0);
INSERT INTO group_members VALUES ('my-team', 'bob', now(), 0);
INSERT INTO group_members VALUES ('my-team', 'charlie', now(), 0);
```

Alice posts to `my-team`. Bob and Charlie see it on discover because they're members. Dave doesn't because he's not. The query handles it.

## The Write Flow

```
Client → POST /alice/posts → API
                                  → ClickHouse INSERT (the post, with visibility)
```

One write. One table. The visibility is on the record. No collection routing. No term record checks. No discovery index mirror.

If the post is to a group, the API also inserts into `group_members` if the group doesn't exist (or it already exists from group creation). The post itself is just one row with `visibility: "group"` and `visibility_scope: "group-id"`.

## What Happens to the Old Model

The collection-based visibility (`public_posts`, `private_posts`) disappears. There's one `posts` table. The `visibility` column replaces the collection. The `visibility_scope` column replaces the need for separate group collections.

The term records (`whitelist`, `blacklist`) disappear for posts. They're replaced by the `visibility` column. The same for reactions, comments, follows — per-record permissions replace per-collection permissions.

The services collection (which stored term records) can be repurposed for app-level permissions (can this app create posts on behalf of the user). But content-level permissions are per-record.

## Summary

Per-record visibility in ClickHouse replaces the collection-based model. Every post carries its own permissions. The discover query filters by what the user can see. Groups are a membership table. Tokens are a grants table. Follows are a follows table. One query handles all of it.

The dev sets `visibility` on the post. The API writes one row. ClickHouse filters at query time. No collections. No term records. No double-write. No discovery index mirror.

This is the WordPress for YouTube vibe. One table for posts. A `visibility` column for permissions. The query does the rest.