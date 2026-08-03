# web10 v3: ClickHouse + MinIO

## The Stack

Two services. That's it.

```
ClickHouse  — everything structured (posts, reactions, comments, follows, groups, permissions)
MinIO       — every blob (images, video, audio)
```

No MongoDB. No Postgres. No FerretDB. No CDC. No Kafka. No discovery index mirror. No public ledger.

## The Problem v2 Solved (and Broke)

v2 uses MongoDB with one collection per user. Personal data is sovereign — the user owns their collection, controls access via term records. But cross-user queries are impossible. You can't scan `alice.reactions` + `bob.reactions` + `charlie.reactions` to get engagement counts.

The workaround: system collections. `web10.discovery_posts` mirrors public posts. `web10.public` mirrors reactions, comments, follows. The client writes to both. The sync breaks.

v3 eliminates the workaround. One database. One table. Cross-user queries are native.

## Architecture

```mermaid
graph TB
    subgraph Client
        App["Social App"]
    end

    subgraph API
        CRUD["CRUD Endpoints\n/{user}/{service}"]
        Groups["Groups Endpoint\n/groups"]
        Media["Media Endpoint\n/{user}/upload, /read, /list, /delete"]
    end

    subgraph ClickHouse
        Posts["posts"]
        Reactions["reactions"]
        Comments["comments"]
        Follows["follows"]
        GroupsTable["groups"]
        GroupMembers["group_members"]
        Engagement["engagement\n(materialized view)"]
    end

    subgraph MinIO
        Blobs["Media Blobs\n(presigned URLs)"]
    end

    App --> CRUD
    App --> Groups
    App --> Media
    CRUD --> Posts
    CRUD --> Reactions
    CRUD --> Comments
    CRUD --> Follows
    CRUD --> Engagement
    Groups --> GroupsTable
    Groups --> GroupMembers
    Media --> Blobs

    style App fill:#f5f5f5,stroke:#333,color:#000
    style CRUD fill:#e3f2fd,stroke:#1565c0,color:#000
    style Groups fill:#e3f2fd,stroke:#1565c0,color:#000
    style Media fill:#e3f2fd,stroke:#1565c0,color:#000
    style Posts fill:#fff3e0,stroke:#e65100,color:#000
    style Reactions fill:#fff3e0,stroke:#e65100,color:#000
    style Comments fill:#fff3e0,stroke:#e65100,color:#000
    style Follows fill:#fff3e0,stroke:#e65100,color:#000
    style GroupsTable fill:#fff3e0,stroke:#e65100,color:#000
    style GroupMembers fill:#fff3e0,stroke:#e65100,color:#000
    style Engagement fill:#fff3e0,stroke:#e65100,color:#000
    style Blobs fill:#fce4ec,stroke:#c62828,color:#000
```

## The Tables

```sql
-- Posts: everything. JSON body for schema flexibility.
CREATE TABLE posts (
    post_id String,
    author_key String,
    collection_name String,     -- 'public_posts', 'private_posts', etc.
    body String,                -- JSON: full post content
    visibility String,          -- 'public', 'private', 'followers', 'group'
    visibility_scope String,    -- group_id, if group
    discoverable UInt8,         -- can this post appear in feeds?
    tags Array(String),
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (author_key, post_id)
TTL created_at + INTERVAL 90 DAY;

-- Reactions: append-only. Tombstone deletes.
CREATE TABLE reactions (
    reaction_id String,
    actor_key String,
    target_post_id String,
    type String,                -- 'like', 'love', 'laugh', etc.
    created_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (target_post_id, created_at);

-- Comments: append-only. ReplacingMergeTree for edits.
CREATE TABLE comments (
    comment_id String,
    actor_key String,
    target_post_id String,
    parent_comment_id String,   -- for threading
    body String,                -- JSON: comment content
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (target_post_id, created_at);

-- Follows: the social graph.
CREATE TABLE follows (
    follower_key String,
    following_key String,
    created_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = MergeTree()
ORDER BY (follower_key, following_key);

-- Groups: platform primitive. Cross-app identity.
CREATE TABLE groups (
    group_id String,
    name String,
    description String,
    admin_key String,
    settings String,            -- JSON: join_policy, post_policy
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY group_id;

-- Group membership.
CREATE TABLE group_members (
    group_id String,
    member_key String,
    role String,                -- 'admin', 'member'
    joined_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (group_id, member_key);

-- Collection permissions (the ceiling).
CREATE TABLE collection_permissions (
    author_key String,
    collection_name String,
    visibility String,          -- default visibility for this collection
    visibility_scope String,    -- group_id, if group
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (author_key, collection_name);

-- Engagement: materialized view, auto-updates on reaction insert.
CREATE MATERIALIZED VIEW engagement
TO engagement_base
AS SELECT
    target_post_id AS record_id,
    count() AS reaction_count,
    count() * 1.0 AS score,
    now() AS updated_at
FROM reactions
WHERE deleted = 0
GROUP BY target_post_id;
```

## Discovery: `?discover=true`

`/discover` and `/public` endpoints disappear. Discovery is a CRUD parameter. One endpoint. One table.

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant ClickHouse

    Client->>API: GET /alice/posts?discover=true
    API->>ClickHouse: SELECT posts WHERE<br/>visibility check for alice<br/>+ discoverable = 1<br/>+ deleted = 0
    ClickHouse-->>API: 50 post IDs + metadata
    API-->>Client: feed response

    Note over Client,ClickHouse: No discovery index. No ledger mirror.<br/>One table. One query. Permissions filtered at query time.
```

The query ClickHouse runs:

```sql
SELECT post_id, author_key, body, tags, created_at
FROM posts
WHERE deleted = 0
  AND discoverable = 1
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

The `discoverable` flag is per-record. The author controls it. `discoverable: false` means the post exists but doesn't appear in feeds — only visible by direct link or to the author.

## Layered Permissions: Collection Ceiling + Post Narrowing

The collection is the ceiling. The post can only narrow, never widen. Strictest wins.

```mermaid
flowchart TD
    A["Post created in\ncollection"] --> B{"Collection\ndefault visibility"}
    B -->|"public"| C["Post inherits 'public'"]
    B -->|"private"| D["Post inherits 'private'"]
    B -->|"followers"| E["Post inherits 'followers'"]
    B -->|"group"| F["Post inherits 'group'"]

    C --> G{"Post-level\noverride?"}
    D --> G
    E --> G
    F --> G

    G -->|"narrower"| H["Use post-level\n(stricter wins)"]
    G -->|"wider"| I["REJECTED\nAPI blocks it"]
    G -->|"none"| J["Use collection default"]

    H --> K["Post stored with\neffective visibility"]
    J --> K
    I --> L["403 Error"]

    style A fill:#f5f5f5,stroke:#333,color:#000
    style B fill:#fff9c4,stroke:#f57f17,color:#000
    style H fill:#e8f5e9,stroke:#2e7d32,color:#000
    style I fill:#ffebee,stroke:#c62828,color:#000
    style K fill:#e3f2fd,stroke:#1565c0,color:#000
    style L fill:#ffebee,stroke:#c62828,color:#000
```

The visibility hierarchy (most permissive to least):

```
public > followers > group > private
```

A post in `public_posts` can be `public` or `followers` or `group` or `private`. A post in `private_posts` can only be `private`. The API enforces this at write time.

## Private Post Viewing

Private posts are only visible to the author. The discover query includes the author's own posts regardless of visibility.

```mermaid
flowchart TD
    A["User requests\nposts"] --> B{"discover flag?"}
    B -->|"false"| C["Only user's own posts\nvisibility doesn't matter"]
    B -->|"true"| D["Permission-filtered query"]

    D --> E{"For each post, check:"}
    E --> F{"Is it public?"}
    F -->|"yes"| G["Show it"]
    F -->|"no"| H{"Is author followed\nby requester?"}
    H -->|"yes + followers"| G
    H -->|"no"| I{"Is requester in\nthe group?"}
    I -->|"yes + group"| G
    I -->|"no"| J{"Is requester\nthe author?"}
    J -->|"yes"| G
    J -->|"no"| K["Hide it"]

    style A fill:#f5f5f5,stroke:#333,color:#000
    style B fill:#fff9c4,stroke:#f57f17,color:#000
    style G fill:#e8f5e9,stroke:#2e7d32,color:#000
    style K fill:#ffebee,stroke:#c62828,color:#000
```

## Groups: Platform Primitive

Groups are managed by the platform. Membership carries across app experiences. One group, infinite apps.

```mermaid
graph TB
    subgraph Platform
        GroupsAPI["Groups CRUD\n/groups"]
        GroupsTable["groups"]
        MembersTable["group_members"]
    end

    subgraph SocialApp
        SocialPosts["Posts with\nvisibility: 'group'"]
        SocialFeed["Group feed\n?discover=true"]
    end

    subgraph MusicApp
        SharedPlaylist["Playlist with\nvisibility: 'group'"]
    end

    subgraph VideoApp
        WatchParty["Watch party with\nvisibility: 'group'"]
    end

    GroupsAPI --> GroupsTable
    GroupsAPI --> MembersTable
    SocialPosts --> GroupsTable
    SocialFeed --> MembersTable
    SharedPlaylist --> GroupsTable
    WatchParty --> GroupsTable

    style GroupsAPI fill:#e3f2fd,stroke:#1565c0,color:#000
    style GroupsTable fill:#fff3e0,stroke:#e65100,color:#000
    style MembersTable fill:#fff3e0,stroke:#e65100,color:#000
    style SocialPosts fill:#f5f5f5,stroke:#333,color:#000
    style SocialFeed fill:#f5f5f5,stroke:#333,color:#000
    style SharedPlaylist fill:#f5f5f5,stroke:#333,color:#000
    style WatchParty fill:#f5f5f5,stroke:#333,color:#000
```

Alice creates a group. Bob and Charlie join. Now any app on web10 can scope content to that group. The social app posts to it. The music app shares a playlist. The video app hosts a watch party. Same group. Same membership. Managed once.

## The Write Flow

One insert. One table. No mirrors.

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant ClickHouse

    Client->>API: POST /alice/posts<br/>{ text, tags, visibility }
    API->>API: Check collection ceiling<br/>(post can't exceed collection)
    API->>ClickHouse: INSERT INTO posts
    ClickHouse-->>API: OK
    API->>ClickHouse: INSERT INTO reactions<br/>(if reaction, materialized view updates)
    ClickHouse-->>API: OK
    API-->>Client: 201 Created

    Note over Client,ClickHouse: One table. No discovery index mirror.<br/>No public ledger. No double-write.
```

## The Delete Flow

Tombstone. Append-only. TTL cleans up.

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant ClickHouse

    Client->>API: DELETE /alice/posts/abc
    API->>ClickHouse: INSERT tombstone<br/>(same post_id, deleted=1,<br/>higher updated_at)
    ClickHouse-->>API: OK
    API-->>Client: 200 OK

    Note over ClickHouse: ReplacingMergeTree keeps the<br/>tombstone (deleted=1).<br/>TTL physically removes it after<br/>the retention period.
```

## What Disappears From v2

| v2 (MongoDB) | v3 (ClickHouse) |
|---|---|
| One collection per user | One table for everything |
| Term records (whitelist/blacklist) | `visibility` column + `collection_permissions` |
| `/discover` endpoint | `?discover=true` on CRUD |
| `/public` endpoint | Gone (visibility filter) |
| Discovery index table | Gone (posts table IS the index) |
| Public ledger | Gone (reactions table + materialized view) |
| Client-side ledger mirrors | Gone (server writes once) |
| Server-side indexing hooks | Gone (single insert) |
| FerretDB translation layer | Gone |
| DocumentDB/Postgres | Gone |
| `web10.discovery_posts` | Gone |
| `web10.public` | Gone |
| `web10.schemas` | Gone (JSON body) |
| `web10.metering_events` | Gone (ClickHouse table) |

## What Stays

- **The CRUD pattern.** `/{user}/{service}` is still the API surface. The dev writes to it. The API routes to ClickHouse.
- **The sovereignty story.** Collections set the default. Posts can only narrow. The privacy panel manages collections. The user controls their data.
- **The layered permissions model.** Collection ceiling + post-level narrowing. Apps get scoped access. The user can revoke. The platform can't read data without permission.
- **Groups as platform primitive.** One membership, infinite apps. Cross-app identity.

## Summary

ClickHouse + MinIO. Two services. One table for posts. One table for reactions. One table for comments. One table for follows. One table for groups. One table for group membership. Materialized views for engagement. TTL for cleanup. Tombstones for deletes. JSON columns for schema flexibility. Inverted index for search.

No mirrors. No sync. No double-write. No discovery index. No ledger. No FerretDB. No MongoDB. No Postgres.

One CRUD endpoint. `?discover=true` for cross-user visibility. `visibility` column for permissions. `collection_permissions` for the ceiling. Strictest wins.

Groups are a platform primitive. One membership. Infinite apps. The building block for teams, communities, circles.

The dev calls `createPost({ text, tags, visibility })`. The API writes one row. ClickHouse queries it. That's it.