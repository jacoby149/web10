# SDK Implementation: ClickHouse SQL

Every SDK call triggers specific ClickHouse operations. This doc maps each SDK function to the SQL it executes.

## Documents Table

```sql
CREATE TABLE documents (
    doc_id String,
    author_key String,
    collection_name String,
    body String,
    ref_value String DEFAULT '',
    tags Array(String),
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (author_key, doc_id)
TTL created_at + INTERVAL 90 DAY;
```

`ref_value` is the universal link. The API writes it on create (extracts the `ref` from the JSON body). Any document can point to any other. Comments, reactions, replies, quotes, bookmarks, votes — all just documents with a `ref`. Indexed, instant lookup.

## Doc Groups Table

```sql
CREATE TABLE doc_groups (
    doc_id String,
    group_id String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (doc_id, group_id);
```

## CRUD Operations

### `w.create(collection, body, { groups })`

One document insert. N group attachment inserts.

```sql
-- Document insert
INSERT INTO documents VALUES (
    :doc_id, :author_key, :collection, :body_json, :tags,
    now(), now(), 0
);

-- Group attachments (one per group)
INSERT INTO doc_groups VALUES (
    :doc_id, 'web10.app/groups/web10/discover', now(), now(), 0
);
INSERT INTO doc_groups VALUES (
    :doc_id, 'web10.app/groups/jacoby149/followers', now(), now(), 0
);
```

### `w.read(collection, { groups: ['me'] })`

Reserved group — no join. Direct author filter.

```sql
SELECT doc_id, author_key, collection_name, body, tags, created_at, updated_at
FROM documents
WHERE author_key = :user
  AND collection_name = :collection
  AND deleted = 0
ORDER BY created_at DESC
LIMIT 50;
```

### `w.read(collection, { groups: [...] })`

Discover query — join through doc_groups and group_members.

```sql
SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at
FROM documents p
JOIN doc_groups pg ON p.doc_id = pg.doc_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.deleted = 0
  AND p.collection_name = :collection
  AND pg.deleted = 0
  AND gm.member_key = :user
  AND gm.deleted = 0
  AND pg.group_id IN (:group1, :group2, ...)
  AND NOT EXISTS (
    SELECT 1 FROM user_blacklist
    WHERE user_key = p.author_key AND blocked_key = :user
  )
ORDER BY p.created_at DESC
LIMIT 50;
```

### `w.read(collection, { _id, groups })`

Direct read by doc_id with group permission check.

```sql
SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at
FROM documents p
WHERE p.doc_id = :doc_id
  AND p.deleted = 0
  AND p.collection_name = :collection
  AND EXISTS (
    SELECT 1 FROM doc_groups pg
    JOIN group_members gm ON pg.group_id = gm.group_id
    WHERE pg.doc_id = p.doc_id
      AND gm.member_key = :user
      AND pg.deleted = 0
      AND gm.deleted = 0
  );
```

### `w.update(collection, { _id }, { $set }, { $groups })`

Tombstone old document, insert new version. Tombstone old group attachments, insert new ones.

```sql
-- New document version
INSERT INTO documents VALUES (
    :doc_id, :author_key, :collection, :new_body, :tags,
    :created_at, now(), 0
);

-- Tombstone old group attachments
INSERT INTO doc_groups (doc_id, group_id, created_at, updated_at, deleted)
SELECT doc_id, group_id, created_at, now(), 1
FROM doc_groups
WHERE doc_id = :doc_id AND deleted = 0;

-- New group attachments
INSERT INTO doc_groups VALUES (
    :doc_id, 'web10.app/groups/web10/discover', now(), now(), 0
);
```

### `w.delete(collection, { _id })`

Tombstone document and all group attachments.

```sql
-- Tombstone document
INSERT INTO documents (doc_id, author_key, collection_name, body, tags, created_at, updated_at, deleted)
SELECT doc_id, author_key, collection_name, body, tags, created_at, now(), 1
FROM documents
WHERE doc_id = :doc_id AND deleted = 0;

-- Tombstone group attachments
INSERT INTO doc_groups (doc_id, group_id, created_at, updated_at, deleted)
SELECT doc_id, group_id, created_at, now(), 1
FROM doc_groups
WHERE doc_id = :doc_id AND deleted = 0;
```

## Group Operations

### `w.createGroup({ name, join_policy, roles, members })`

Insert group contract. Insert all members.

```sql
INSERT INTO group_contracts VALUES (
    :group_id, :roles_json, :join_policy, now(), now(), 0
);

INSERT INTO group_members VALUES (
    :group_id, 'jacoby149', 'owner', now(), now(), 0
);
INSERT INTO group_members VALUES (
    :group_id, 'alice', 'member', now(), now(), 0
);
```

### `w.getGroups({ member })`

Groups the user belongs to, with metadata.

```sql
SELECT gc.group_id, gc.join_policy, gm.role AS my_role,
       (SELECT count() FROM group_members gm2
        WHERE gm2.group_id = gc.group_id AND gm2.deleted = 0) AS member_count
FROM group_members gm
JOIN group_contracts gc ON gm.group_id = gc.group_id
WHERE gm.member_key = :user
  AND gm.deleted = 0
  AND gc.deleted = 0;
```

### `w.getGroups({ manages })`

Groups where the user has management permissions.

```sql
SELECT gc.group_id, gc.join_policy, gm.role AS my_role,
       (SELECT count() FROM group_members gm2
        WHERE gm2.group_id = gc.group_id AND gm2.deleted = 0) AS member_count
FROM group_members gm
JOIN group_contracts gc ON gm.group_id = gc.group_id
WHERE gm.member_key = :user
  AND gm.deleted = 0
  AND gc.deleted = 0
  AND gm.role IN (
    SELECT name FROM extractJSONArray(gc.roles)
    WHERE has(extractJSONArrayString(permissions), 'manageRoles')
  );
```

### `w.joinGroup(group_id)`

Open join policy — instant membership.

```sql
INSERT INTO group_members VALUES (
    :group_id, :user, 'member', now(), now(), 0
);
```

### `w.requestJoin(group_id)`

Request join policy — pending request.

```sql
INSERT INTO group_join_requests VALUES (
    :group_id, :user, 'pending', now(), NULL, now(), 0
);
```

### `w.acceptInvite(group_id, requester)`

Approve a join request. Update request status. Add member.

```sql
-- Update request status
INSERT INTO group_join_requests (group_id, requester_key, status, requested_at, resolved_at, updated_at, deleted)
SELECT group_id, requester_key, 'approved', requested_at, now(), now(), 0
FROM group_join_requests
WHERE group_id = :group_id AND requester_key = :requester AND deleted = 0;

-- Add member
INSERT INTO group_members VALUES (
    :group_id, :requester, 'member', now(), now(), 0
);
```

### `w.leaveGroup(group_id)`

Tombstone membership.

```sql
INSERT INTO group_members (group_id, member_key, role, joined_at, updated_at, deleted)
SELECT group_id, member_key, role, joined_at, now(), 1
FROM group_members
WHERE group_id = :group_id AND member_key = :user AND deleted = 0;
```

### `w.getMembers(group_id)`

Active members of a group.

```sql
SELECT member_key, role, joined_at
FROM group_members
WHERE group_id = :group_id AND deleted = 0;
```

### `w.removeMember(group_id, member)`

Tombstone membership.

```sql
INSERT INTO group_members (group_id, member_key, role, joined_at, updated_at, deleted)
SELECT group_id, member_key, role, joined_at, now(), 1
FROM group_members
WHERE group_id = :group_id AND member_key = :member AND deleted = 0;
```

### `w.blockSharing(group_id)`

Toggle sharing off for a group.

```sql
INSERT INTO user_group_sharing VALUES (
    :user, :group_id, 0, now(), now(), 0
);
```

### `w.blockUser(user_key)`

User-wide blacklist.

```sql
INSERT INTO user_blacklist VALUES (:user, :blocked_key, now());
```

### `w.blockUserInGroup(user_key, group_id)`

Per-group blacklist.

```sql
INSERT INTO group_blacklist VALUES (:user, :group_id, :blocked_key, now());
```

## Service Contracts

### `w.getServiceContracts()`

Active service contracts.

```sql
SELECT service_name, allowed_origin
FROM service_contracts
WHERE user_key = :user AND deleted = 0;
```

### `w.revokeServiceContract({ allowed_origin })`

Tombstone specific contract.

```sql
INSERT INTO service_contracts (user_key, service_name, allowed_origin, created_at, updated_at, deleted)
SELECT user_key, service_name, allowed_origin, created_at, now(), 1
FROM service_contracts
WHERE user_key = :user AND allowed_origin = :origin AND deleted = 0;
```

### `w.revokeAllServiceContracts()`

Tombstone all contracts.

```sql
INSERT INTO service_contracts (user_key, service_name, allowed_origin, created_at, updated_at, deleted)
SELECT user_key, service_name, allowed_origin, created_at, now(), 1
FROM service_contracts
WHERE user_key = :user AND deleted = 0;
```

## Aggregate Operations

### `w.aggregate(collection, pipeline)`

Server-side pipeline. The `$match`, `$group`, `$sort`, `$count` stages translate to ClickHouse clauses.

**Example: count reactions for a post**

```sql
SELECT count()
FROM documents
WHERE deleted = 0
  AND collection_name = 'reactions'
  AND hasToken(body, :doc_id);
```

**Example: reaction breakdown by type**

```sql
SELECT extractJSONString(body, '$.reaction_type.value') AS rtype, count()
FROM documents
WHERE deleted = 0
  AND collection_name = 'reactions'
  AND hasToken(body, :doc_id)
GROUP BY rtype;
```

**Example: trending posts**

```sql
SELECT p.doc_id, p.author_key, p.body, p.created_at,
       (SELECT count() FROM documents r
        WHERE r.deleted = 0
          AND r.collection_name = 'reactions'
          AND hasToken(r.body, p.doc_id)
       ) AS reaction_count
FROM documents p
JOIN doc_groups pg ON p.doc_id = pg.doc_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.deleted = 0
  AND p.collection_name = 'posts'
  AND pg.deleted = 0
  AND gm.member_key = :user
  AND gm.deleted = 0
ORDER BY reaction_count DESC, p.created_at DESC
LIMIT 50;
```

### `w.read(collection, { groups, $rank })`

Generic ranking — server-side weighted power mean. The API resolves the ranking config (by ID or inline), extracts signals and weights, and computes the score in ClickHouse. Works on any collection.

**Field types** tell the API how to normalize:

| type | normalization | example |
|---|---|---|
| `time` | `exp(-age_hours / half_life)` — recency decay | `created_at` with `half_life: 24` (1 day) |
| `count` | `log1p(value) / (1 + log1p(value))` — saturating | `reactions`, `comments`, any counter |

`half_life` is in hours. `balance` (the power mean exponent `p`) controls how signals combine:

| balance | effect |
|---|---|
| +5 | Score pulled toward the best signal. Specialists win. |
| +1 | High signals dominate. Loose. |
| 0 | Geometric mean. All signals matter equally in log space. |
| -1 | Low signals drag the score down. Generalists win. |
| -5 | Score pulled toward the weakest signal. Strict. |

**Ranking query** (power mean in ClickHouse):

The `ref_count` signal is a subquery on `ref_value` — instant, indexed:

```sql
SELECT
    p.doc_id, p.author_key, p.body, p.tags, p.created_at,
    -- Normalized signals
    CASE WHEN :half_life <= 0 THEN 1
         ELSE exp(-timestampDiff('hour', p.created_at, now()) / :half_life)
    END AS recency,
    (:w_reactions * log1p(
        SELECT count() FROM documents r
        WHERE r.deleted = 0
          AND r.collection_name = 'reactions'
          AND r.ref_value = p.doc_id
    )) / (1 + :w_reactions * log1p(...)) AS reactions_norm,
    (:w_comments * log1p(
        SELECT count() FROM documents c
        WHERE c.deleted = 0
          AND c.collection_name = 'comments'
          AND c.ref_value = p.doc_id
    )) / (1 + :w_comments * log1p(...)) AS comments_norm,
    -- Power mean score
    CASE
        WHEN :balance = 0 THEN
            exp(
                (:w_recency * ln(greatest(recency, 1e-12))
                 + :w_reactions * ln(greatest(reactions_norm, 1e-12))
                 + :w_comments * ln(greatest(comments_norm, 1e-12)))
                / (:w_recency + :w_reactions + :w_comments)
            )
        WHEN :w_recency > 0 AND :w_reactions = 0 AND :w_comments = 0 THEN
            -timestampDiff('millisecond', p.created_at, now())
        ELSE
            power(
                (:w_recency * power(greatest(recency, 1e-12), :balance)
                 + :w_reactions * power(greatest(reactions_norm, 1e-12), :balance)
                 + :w_comments * power(greatest(comments_norm, 1e-12), :balance))
                / (:w_recency + :w_reactions + :w_comments),
                1.0 / :balance
            )
    END AS score
FROM documents p
JOIN doc_groups pg ON p.doc_id = pg.doc_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.deleted = 0
  AND p.collection_name = :collection
  AND pg.deleted = 0
  AND gm.member_key = :user
  AND gm.deleted = 0
  AND pg.group_id IN (:groups)
ORDER BY score DESC
LIMIT 50;
```

Parameters from the `$rank` config:
- `:w_recency`, `:w_reactions`, `:w_comments` — weights from signals
- `:half_life` — time decay half-life in hours (0 = all time, no decay)
- `:balance` — power mean exponent (negative = harmonic-ish, 0 = geometric, positive = arithmetic-ish)

**Rank config as a document:** When `$rank` is a string ID, the API resolves it first:

```sql
SELECT body FROM documents
WHERE doc_id = :rank_id
  AND author_key = :user
  AND collection_name = 'rank'
  AND deleted = 0;
```

The body contains the ranking config (signals, balance). Same query shape whether inline or by ID.

## Media

### `w.upload(file, options)`

Three-step upload:

```sql
-- Step 1: Request presigned URL (no SQL, API generates MinIO presigned PUT)
-- Step 2: Client uploads directly to MinIO (no SQL)
-- Step 3: Confirm upload — store reference in a media metadata collection
INSERT INTO documents VALUES (
    :media_doc_id, :user, 'media_metadata', :metadata_json, [],
    now(), now(), 0
);
```

### `w.getReadUrl(object_key)`

Generate presigned GET URL. No SQL — MinIO operation.

## Cross-Node Addressing

### `w.read(collection, options, username, provider)`

Routes to the specified provider's origin. Same SQL, different node.

```sql
-- Executed on the remote provider's ClickHouse instance
SELECT ... FROM documents ...
```

## Summary

| SDK call | ClickHouse |
|---|---|
| `w.create(collection, body, { groups })` | `INSERT INTO documents` + `INSERT INTO doc_groups` (N rows) |
| `w.read(collection, { groups: ['me'] })` | `SELECT FROM documents WHERE author_key = :user` |
| `w.read(collection, { groups })` | `SELECT FROM documents JOIN doc_groups JOIN group_members` |
| `w.read(collection, { groups, $lens })` | Same + `LEFT JOIN post_engagement`, power mean CASE in SELECT, `ORDER BY score DESC` |
| `w.read(collection, { _id, groups })` | `SELECT FROM documents WHERE doc_id = :id` + EXISTS subquery |
| `w.update(collection, { _id }, { $set }, { $groups })` | `INSERT INTO documents` (new version) + tombstone old `doc_groups` + new `doc_groups` |
| `w.delete(collection, { _id })` | `INSERT INTO documents` (tombstone) + tombstone `doc_groups` |
| `w.createGroup(...)` | `INSERT INTO group_contracts` + `INSERT INTO group_members` |
| `w.getGroups({ member })` | `SELECT FROM group_contracts JOIN group_members WHERE member_key = :user` |
| `w.getGroups({ manages })` | Same + role permission filter |
| `w.joinGroup(...)` | `INSERT INTO group_members` |
| `w.requestJoin(...)` | `INSERT INTO group_join_requests` |
| `w.acceptInvite(...)` | `INSERT INTO group_join_requests` (approved) + `INSERT INTO group_members` |
| `w.leaveGroup(...)` | Tombstone `group_members` |
| `w.getMembers(...)` | `SELECT FROM group_members WHERE group_id = :group` |
| `w.removeMember(...)` | Tombstone `group_members` |
| `w.blockSharing(...)` | `INSERT INTO user_group_sharing` |
| `w.blockUser(...)` | `INSERT INTO user_blacklist` |
| `w.blockUserInGroup(...)` | `INSERT INTO group_blacklist` |
| `w.getServiceContracts()` | `SELECT FROM service_contracts WHERE user_key = :user` |
| `w.revokeServiceContract(...)` | Tombstone `service_contracts` |
| `w.revokeAllServiceContracts()` | Tombstone all `service_contracts` |
| `w.upload(...)` | MinIO presigned PUT + `INSERT INTO documents` (metadata) |
| `w.aggregate(...)` | `SELECT ... GROUP BY ... ORDER BY ...` (pipeline stages) |

Everything is append-only. Updates are new inserts with higher `updated_at`. Deletes are tombstones (`deleted = 1`). `ReplacingMergeTree` keeps the latest version. Background job compacts on schedule.