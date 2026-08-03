# Layered Permissions: Collection Ceiling, Post-Level Narrowing

## The Model

The collection is the ceiling. The post can only narrow, never widen. The strictest permission wins.

This is the Unix file permission model: directory permission is the ceiling, file permission can only narrow. The user's privacy panel manages collections. Individual posts can only be more private.

## How It Works

Each collection has a default visibility set by the user's privacy panel. Each post inherits that default. The post can override to be stricter — never less strict.

```
Collection: public_posts (whitelist: ".*") → anyone can read
Post-level: visibility = "followers" → only followers see it
Result: followers-only (stricter wins)

Collection: private_posts (whitelist: []) → owner only
Post-level: visibility = "public" → IGNORED
Result: owner-only (collection ceiling)

Collection: group-posts (whitelist: group members)
Post-level: visibility = "followers" → only followers who are also members
Result: intersection (stricter wins)
```

## The ClickHouse Schema

```sql
CREATE TABLE posts (
    post_id String,
    author_key String,
    collection_name String,  -- 'public_posts', 'private_posts', 'group-posts'
    body String,             -- JSON: full post content
    visibility String,       -- post-level: 'public', 'private', 'followers', 'group'
    visibility_scope String, -- group_id, if group
    tags Array(String),
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (author_key, post_id);

-- Collection-level permissions (the ceiling)
CREATE TABLE collection_permissions (
    author_key String,
    collection_name String,
    visibility String,       -- 'public', 'private', 'followers', 'group'
    visibility_scope String, -- group_id, if group
    whitelist String,        -- JSON: who can access this collection
    blacklist String,        -- JSON: who is blocked
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (author_key, collection_name);
```

When a post is created, it inherits the collection's visibility. The dev can narrow it:

```ts
// Inherits collection default (public_posts → public)
await createPost({ text: "hello world", collection: "public_posts" });

// Narrows to followers-only (collection allows it, post is stricter)
await createPost({ text: "behind the scenes", collection: "public_posts", visibility: "followers" });

// Tries to widen (private_posts → public) — REJECTED
await createPost({ text: "going viral", collection: "private_posts", visibility: "public" });
// API rejects: post visibility "public" exceeds collection ceiling "private"
```

## The Privacy Panel

The user's UI shows collections and their default permissions. This is the primary way to manage data privacy:

```
alice/
  public_posts/    → visibility: public (whitelist: ".*")
  private_posts/   → visibility: private (whitelist: [])
  group-posts/     → visibility: group (group: "web10-dev")
  followers-posts/ → visibility: followers
```

The user manages these at the collection level. 99% of posts inherit the collection default. The per-record `visibility` column handles the 1% exception.

Posts that deviate from the collection default are shown in the data viewer as exceptions. The user can see them, understand them, and restore them to the collection default.

## The Query: Both Checks Must Pass

Every discover query enforces both layers:

```sql
SELECT p.post_id, p.author_key, p.body, p.tags, p.created_at
FROM posts p
JOIN collection_permissions cp
  ON p.author_key = cp.author_key AND p.collection_name = cp.collection_name
WHERE p.deleted = 0
  AND cp.deleted = 0
  -- Collection-level check (the ceiling)
  AND collection_visible_to(cp, 'alice')
  -- Post-level check (stricter, can only narrow)
  AND post_visible_to(p, 'alice')
ORDER BY p.created_at DESC
LIMIT 50;
```

The `collection_visible_to()` function checks if the collection allows the user. The `post_visible_to()` function checks if the post allows the user. Both must return true. The strictest permission is always enforced.

## The Validation: API Enforces the Ceiling

When a post is created, the API checks that the post-level visibility doesn't exceed the collection ceiling:

```python
def create_post(author, collection, body, visibility=None):
    # Get the collection's default visibility
    collection_perm = get_collection_permission(author, collection)

    # Use collection default if no post-level visibility specified
    effective_visibility = visibility or collection_perm.visibility

    # Enforce the ceiling: post can only be stricter
    if is_wider(effective_visibility, collection_perm.visibility):
        raise PermissionError(
            f"Post visibility '{effective_visibility}' exceeds "
            f"collection ceiling '{collection_perm.visibility}'"
        )

    # Insert the post with the effective visibility
    clickhouse.execute("""
        INSERT INTO posts VALUES (%s, %s, %s, %s, %s, %s, %s, now(), now(), 0)
    """, (str(uuid4()), author, collection, json.dumps(body),
          effective_visibility, '', body.get('tags', []), ))
```

The `is_wider()` function compares visibility levels:

```
public > followers > group > private
```

A post in a `followers` collection can be `followers` or `private`. It cannot be `public`.

## The Sovereignty Story

The user's privacy panel is the source of truth for their data. Collections set the default. Posts can only narrow. The user manages the 99% at collection level. The per-record column handles the 1% exception.

This is the WordPress for YouTube vibe. The user manages privacy like file permissions. The directory is the ceiling. The file can only be more private. The strictest permission wins.

The data viewer shows posts that deviate from the collection default. The user can understand them and restore them. The system is transparent. The user is in control.

## Summary

- **Collection is the ceiling.** The user's privacy panel manages collections.
- **Post can only narrow.** Individual posts can be more private, never less.
- **Strictest wins.** Both collection and post checks must pass.
- **API enforces it.** The API rejects posts that exceed the collection ceiling.
- **99% collection, 1% post.** Most posts inherit the default. Exceptions are rare.
- **Transparent.** The data viewer shows deviations. The user understands and controls.