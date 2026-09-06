# SDK Implementation: ClickHouse SQL

Every SDK call triggers specific ClickHouse operations. This doc maps each SDK
function to the SQL it executes — the "How Layer" of the v3 SDK. The surface is
the real one (`sdk/src/v3.ts`); the SQL is the real one
(`api/app/v3/services/clickhouse.py` + `api/app/v3/endpoints/`).

The whole store is **append-only**. There is no `UPDATE` and no `DELETE`
statement anywhere. An update is a new row with a higher `updated_at`; a delete
is a new row with `deleted = 1` (a tombstone). `ReplacingMergeTree(updated_at)`
eventually collapses each key to its latest row, but a background merge is not
deterministic — so **every read dedups first** (latest row per key wins,
tombstones included) and *then* filters `deleted = 0`. That dedup-then-filter
is the load-bearing pattern in this doc; a raw `deleted = 0` read can return a
stale row until a merge happens.

Tombstones and version bumps use `now64(6)` (microsecond precision), not
`now()` (second precision), so the new row's `updated_at` is never earlier than
the row it supersedes when both land in the same second — the dedup keys off
`updated_at`, and a second-precision tie can lose to the old row.

## The Tables

Source: `clickhouse-init/001-init-v3-schema.sql.template`.

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
    deleted UInt8 DEFAULT 0,
    ad_mode String DEFAULT 'none',
    ad_target String DEFAULT ''
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (author_key, doc_id);

CREATE TABLE doc_groups (
    doc_id String,
    group_id String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (doc_id, group_id);

CREATE TABLE group_contracts (
    group_id String,
    roles String,
    join_policy String,
    discoverable UInt8 DEFAULT 0,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY group_id;

CREATE TABLE group_members (
    group_id String,
    member_key String,
    role String,
    joined_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (group_id, member_key);

CREATE TABLE group_join_requests (
    group_id String,
    requester_key String,
    status String,
    role String DEFAULT '',
    requested_at DateTime64(3),
    resolved_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (group_id, requester_key);

CREATE TABLE user_blacklist (
    user_key String,
    blocked_key String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_key, blocked_key);

CREATE TABLE group_blacklist (
    user_key String,
    group_id String,
    blocked_key String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_key, group_id, blocked_key);

CREATE TABLE user_group_sharing (
    user_key String,
    group_id String,
    sharing_enabled UInt8,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_key, group_id);

CREATE TABLE app_contracts (
    user_key String,
    allowed_origin String,
    permissions String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_key, allowed_origin);

CREATE TABLE users (
    username String,
    password_hash String,
    phone String DEFAULT '',
    phone_verified UInt8 DEFAULT 0,
    email String DEFAULT '',
    email_verified UInt8 DEFAULT 0,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY username;

CREATE TABLE apps (
    url String,
    name String DEFAULT '',
    description String DEFAULT '',
    icon_url String DEFAULT '',
    screenshots String DEFAULT '',
    visits UInt64 DEFAULT 0,
    approved UInt8 DEFAULT 0,
    review_state String DEFAULT 'pending',
    metadata_version UInt32 DEFAULT 1,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY url;

CREATE TABLE app_ratings (
    author String,
    target_app_id String,
    rating UInt8,
    comment String DEFAULT '',
    provider String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (target_app_id, author);

CREATE TABLE app_visits (
    app_url String,
    username String,
    seen_at DateTime64(3)
) ENGINE = MergeTree
ORDER BY (app_url, username, seen_at)
TTL toDateTime(seen_at) + INTERVAL 2 YEAR;
```

`ref_value` is the universal link. The API writes it on create (a top-level
field on the create request, not in the body). Any document can point to any
other — comments, reactions, replies, quotes, bookmarks, votes are all just
documents with a `ref_value`. It is a column, so the ref filter and the
engagement counts key off it directly.

`documents` has no TTL — content is durable. `app_visits` is the one
self-expiring table (usage log, 2 years).

## CRUD

### `w.create(collection, body, { groups, ref_value, ad_preference })`

One document insert. N group-attachment inserts. The D58 write gate drops any
group the author's effective role does not grant `create` on this service in
(a bystander with no write grant to any requested group gets a 403).

```sql
-- Document insert (11 columns; ad_mode/ad_target from ad_preference, else defaults)
INSERT INTO documents
  (doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at, deleted, ad_mode, ad_target)
VALUES
  (:doc_id, :author, :collection, :body_json, :ref_value, :tags, now(), now(), 0, 'none', '');

-- Group attachments (one per writable group)
INSERT INTO doc_groups VALUES (:doc_id, '{provider}/groups/web10/discover', now(), now(), 0);
INSERT INTO doc_groups VALUES (:doc_id, 'web10.app/groups/users/jacoby149/followers', now(), now(), 0);
```

### `w.read(collection, { groups: ['me'] })`

`me` is a reserved group. It resolves to the groups the reader's effective role
can read this service in (the reader's memberships, filtered by the D58 read
gate), then runs the discover query over that set. No special shortcut — `me`
is just "all my readable groups".

```sql
-- Step 1: the reader's groups (dedup-then-filter on both sides)
SELECT gc.group_id, gc.join_policy, gm.role AS my_role
FROM (SELECT group_id, member_key, role, deleted,
        row_number() OVER (PARTITION BY group_id, member_key ORDER BY updated_at DESC, deleted DESC) AS rn
      FROM group_members) gm
JOIN (SELECT group_id, join_policy, deleted,
        row_number() OVER (PARTITION BY group_id ORDER BY updated_at DESC, deleted DESC) AS rn
      FROM group_contracts) gc ON gm.group_id = gc.group_id
WHERE gm.rn = 1 AND gc.rn = 1 AND gm.deleted = 0 AND gc.deleted = 0
  AND gm.member_key = :user;

-- Step 2: the discover query over the readable subset (same as the groups read below)
```

### `w.read(collection, { groups, limit, offset })`

The core discover query. `documents` ⋈ `doc_groups` [⋈ `group_members`],
filtered by tombstones, the user-wide and per-group blacklists, paused sharing,
and hidden docs. The D58 read gate pre-filters `groups` to the readable set
before this runs, so the read endpoint drops the membership join
(`require_membership=False`) — a public group's reader is not a member.

```sql
SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at, p.ref_value, p.ad_mode, p.ad_target
FROM (
  -- latest document version per (doc_id, author_key), not deleted, in this service
  SELECT doc_id, author_key, body, tags, created_at, ref_value, ad_mode, ad_target, deleted
  FROM (SELECT *, row_number() OVER (PARTITION BY doc_id, author_key ORDER BY updated_at DESC) AS rn
        FROM documents WHERE collection_name = :collection)
  WHERE rn = 1 AND deleted = 0
) p
JOIN (
  -- latest doc→group attachment, not deleted
  SELECT doc_id, group_id FROM doc_groups WHERE deleted = 0
  QUALIFY row_number() OVER (PARTITION BY doc_id, group_id ORDER BY updated_at DESC) = 1
) pg ON p.doc_id = pg.doc_id
-- (membership join only on the legacy require_membership=True path:
--  JOIN (deduped group_members, deleted=0) gm ON pg.group_id = gm.group_id
--  with gm.member_key = :reader in the WHERE)
LEFT ANTI JOIN (
  -- user-wide block: the author blocked the reader (everywhere)
  SELECT user_key, blocked_key FROM (SELECT user_key, blocked_key, deleted,
    row_number() OVER (PARTITION BY user_key, blocked_key ORDER BY updated_at DESC, deleted DESC) AS rn
    FROM user_blacklist) WHERE rn = 1 AND deleted = 0
) ub ON ub.user_key = p.author_key AND ub.blocked_key = :reader
LEFT ANTI JOIN (
  -- per-group block: the author blocked the reader in THIS group (one-directional)
  SELECT user_key, group_id, blocked_key FROM (SELECT user_key, group_id, blocked_key, deleted,
    row_number() OVER (PARTITION BY user_key, group_id, blocked_key ORDER BY updated_at DESC, deleted DESC) AS rn
    FROM group_blacklist) WHERE rn = 1 AND deleted = 0
) gb ON gb.user_key = p.author_key AND gb.group_id = pg.group_id AND gb.blocked_key = :reader
LEFT ANTI JOIN (
  -- sharing paused: the author paused sharing in THIS group (the author's own reads exempt)
  SELECT user_key, group_id, sharing_enabled FROM (SELECT user_key, group_id, sharing_enabled, deleted,
    row_number() OVER (PARTITION BY user_key, group_id ORDER BY updated_at DESC) AS rn
    FROM user_group_sharing) WHERE rn = 1 AND deleted = 0
) ugs ON ugs.user_key = p.author_key AND ugs.group_id = pg.group_id
     AND ugs.sharing_enabled = 0 AND p.author_key != :reader
LEFT ANTI JOIN (
  -- hidden docs: a moderator hid this doc from this group
  SELECT group_id, doc_id FROM (SELECT group_id, doc_id, deleted,
    row_number() OVER (PARTITION BY group_id, doc_id ORDER BY updated_at DESC, deleted DESC) AS rn
    FROM group_hidden_docs) WHERE rn = 1 AND deleted = 0
) hd ON hd.doc_id = p.doc_id AND hd.group_id = pg.group_id
WHERE pg.group_id IN (:group1, :group2, ...)
ORDER BY p.created_at DESC
LIMIT :limit OFFSET :offset;
```

The anti-joins dedup first (latest row per key, tombstones included) and then
filter `deleted = 0` — a raw `deleted = 0` join would keep matching the stale
pre-unblock / pre-restore row and the unblock would not take effect until a
background merge (nondeterministic).

An explicit `groups` request that the reader's role grants read on **none** of
is a 403 (`not a member of the requested group`), not an empty list — the app
can act on it. Anon is exempt: it reads the public board, and an empty board is
a valid result.

### `w.read(collection, { groups, ref })`

The ref filter — "give me the comments/reactions for these posts". `ref` is a
single `doc_id` or a list. It is routed through the **safe-query engine**
(`build_safe_query`), not a raw `WHERE` — so it carries the full boundary (group
filter + block/sharing/hidden anti-joins). The engine rewrites the service name
to a boundary CTE and validates the query before execution.

```sql
-- As written by the caller, then compiled to a boundary CTE by the engine:
SELECT doc_id, author_key, body, ref_value, tags, created_at, updated_at
FROM comments
WHERE ref_value = :postDocId          -- or: ref_value IN (:id1, :id2, ...)
LIMIT :limit;
```

### `w.readRefCounts(collection, { groups, ref })`

The engagement-count shape — `{ ref_value: count }` for a set of posts. Same
safe-query boundary as the ref filter, but a `GROUP BY ref_value`. The count is
exact for the reader's readable groups and never capped (the server-side
replacement for "read a capped sample, count client-side"). A ref with no docs
is absent (the caller treats absent as 0).

```sql
-- As written, then compiled to a boundary CTE by the engine:
SELECT ref_value, count() AS n
FROM reactions
WHERE ref_value IN (:id1, :id2, ...)
GROUP BY ref_value;
```

### `w.readById(docId, collection)`

Single-doc read by `doc_id`, with the group permission check (the doc must be
attached to a group the reader belongs to) and the user-wide blacklist
anti-join. Serves the pinned ad inline (the post-detail deep link is a read).

```sql
SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at, p.ref_value, p.ad_mode, p.ad_target
FROM documents p
LEFT SEMI JOIN (
  -- the doc is attached to a group the reader belongs to
  SELECT pg.doc_id FROM doc_groups pg
  JOIN group_members gm ON pg.group_id = gm.group_id
  WHERE gm.member_key = :reader AND pg.deleted = 0 AND gm.deleted = 0
) membership ON membership.doc_id = p.doc_id
LEFT ANTI JOIN (
  SELECT user_key, blocked_key FROM (SELECT user_key, blocked_key, deleted,
    row_number() OVER (PARTITION BY user_key, blocked_key ORDER BY updated_at DESC, deleted DESC) AS rn
    FROM user_blacklist) WHERE rn = 1 AND deleted = 0
) ub ON ub.user_key = p.author_key AND ub.blocked_key = :reader
WHERE p.doc_id = :doc_id AND p.deleted = 0 AND p.collection_name = :collection
ORDER BY p.updated_at DESC LIMIT 1;
```

### `w.update(docId, body, { groups, ad_preference })`

New document version (same `doc_id`, higher `updated_at`, `created_at`
preserved). If `groups` is provided, the group attachments are replaced
(tombstone old, insert new). The body is merged over the existing body at the
endpoint (`{**existing, **new}`).

```sql
-- New document version (created_at preserved, updated_at bumped)
INSERT INTO documents
  (doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at, deleted, ad_mode, ad_target)
VALUES
  (:doc_id, :author, :collection, :merged_body, :ref_value, :tags, :created_at, now(), 0, :ad_mode, :ad_target);

-- Replace group attachments: tombstone the old ...
INSERT INTO doc_groups (doc_id, group_id, created_at, updated_at, deleted)
SELECT doc_id, group_id, created_at, now(), 1
FROM doc_groups WHERE doc_id = :doc_id AND deleted = 0;

-- ... and insert the new
INSERT INTO doc_groups VALUES (:doc_id, '{provider}/groups/web10/discover', now(), now(), 0);
```

### `w.delete(docId)`

Tombstone the document and all its group attachments.

```sql
-- Tombstone the document
INSERT INTO documents (doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at, deleted)
SELECT doc_id, author_key, collection_name, body, ref_value, tags, created_at, now64(6), 1
FROM documents WHERE doc_id = :doc_id AND author_key = :author AND collection_name = :collection AND deleted = 0;

-- Tombstone the group attachments
INSERT INTO doc_groups (doc_id, group_id, created_at, updated_at, deleted)
SELECT doc_id, group_id, created_at, now(), 1
FROM doc_groups WHERE doc_id = :doc_id AND deleted = 0;
```

## The Flexible Read — `w.query(sql, { groups })`

Write a ClickHouse `SELECT` over your **services** and the node runs it.
Read-only by construction: the safe-query engine rejects anything but a single
`SELECT`, raw node tables, and table functions before anything executes. Every
service name you reference is replaced by an API-built **boundary CTE**
filtered to the groups you can read that service in — so aggregations,
self-joins, subqueries, and your own CTEs are all fair game, and none of them
can leak past your groups (the raw tables are unreachable — a wall, not a
membrane). See `safe-query.md` for how the boundary works.

Each service CTE exposes: `doc_id`, `author_key`, `body` (a JSON string — use
`JSONExtractString(body, 'field', 'value')` for fields), `ref_value`, `tags`,
`created_at`, `updated_at`.

The endpoint (`POST /v3/query`) runs, in order: the per-user rate limit (D65 —
60 queries / 60 s, anon exempt), the app-contract gate (the query may only touch
services the app's contract grants `readAll` on), `query_services` (parse +
validate — an unsafe query is a **403** before any group lookup), the D58 read
gate per service, `build_safe_query` (boundary CTEs injected), and
`execute_query` with `max_execution_time = 10`. A compiled query that then fails
in ClickHouse is the **caller's** SQL (a column the CTE doesn't expose, a bad
function arg) — a **400**.

- **Anon-capable** — works without a token (reads the public board), like `w.read`.
- **Scoped** — `{ groups: [...] }` limits the read to specific group IDs (default: all the reader's groups, the "me" semantics).
- **Bounded** — an unbounded query gets `LIMIT 1000` appended server-side; a `LIMIT` you write is honored as-is. Queries time out at 10 s.
- **Returns** `{ rows: Record<string, unknown>[], count: number }`. A `body` column comes back parsed (like `read`); datetimes are ISO-8601 UTC.

> **ClickHouse gotcha — LEFT JOIN counts.** A `LEFT JOIN` non-match yields
> default values (empty string for `String`), **not** `NULL`. So
> `count(c.doc_id)` over a left join overcounts. Use
> `countIf(c.ref_value = p.doc_id)` (or `countIf(c.doc_id != '')`) for an
> accurate "how many comments" count.

**Example: trending posts — cross-service self-join + aggregation**

```ts
const { rows } = await w.query(`
  SELECT p.doc_id, p.author_key, countIf(c.ref_value = p.doc_id) AS reactions
  FROM posts p
  LEFT JOIN reactions c ON c.ref_value = p.doc_id
  GROUP BY p.doc_id, p.author_key
  ORDER BY reactions DESC
  LIMIT 20
`)
```

**Example: reaction breakdown by type — JSON body fields**

```ts
const { rows } = await w.query(`
  SELECT JSONExtractString(body, 'reaction_type', 'value') AS type, count() AS n
  FROM reactions
  WHERE ref_value = '<the post's doc_id>'
  GROUP BY type
`)
```

**Example: your own CTEs + subqueries**

```ts
const { rows } = await w.query(`
  WITH hot AS (
    SELECT ref_value, count() AS n FROM reactions GROUP BY ref_value HAVING n > 10
  )
  SELECT p.doc_id, p.body
  FROM posts p
  WHERE p.doc_id IN (SELECT ref_value FROM hot)
  ORDER BY p.created_at DESC
`)
```

**Example: scoped to specific groups**

```ts
const { rows } = await w.query(
  'SELECT doc_id, author_key FROM posts ORDER BY created_at DESC LIMIT 50',
  { groups: [discoverGroupId, followersGroupId] },
)
```

## Group Operations

### `w.createGroup(name, joinPolicy, roles, members)`

Insert the group contract. Insert each initial member. The `group_id` is
derived server-side: `{provider}/groups/users/{creator}/{slug}`. Idempotent —
re-creating an existing group does not append duplicate rows (demo apps re-send
the group-creation contract on every login). If the creator is not among the
members, they are added with the `admin` role.

```sql
INSERT INTO group_contracts (group_id, roles, join_policy, discoverable, created_at, updated_at, deleted)
VALUES (:group_id, :roles_json, :join_policy, 0, now(), now(), 0);

INSERT INTO group_members VALUES (:group_id, 'jacoby149', 'admin', now(), now(), 0);
INSERT INTO group_members VALUES (:group_id, 'alice', 'member', now(), now(), 0);
```

Roles use the D58 per-service permission map: each role is `{ name,
permissions }` where `permissions` maps a service (or the `group` structural
key) to the ops granted.

### `w.getMyGroups()`

Groups the reader belongs to, with metadata (dedup-then-filter on both sides,
plus a batched member-count lookup).

```sql
SELECT gc.group_id, gc.join_policy, gm.role AS my_role
FROM (SELECT group_id, member_key, role, deleted,
        row_number() OVER (PARTITION BY group_id, member_key ORDER BY updated_at DESC, deleted DESC) AS rn
      FROM group_members) gm
JOIN (SELECT group_id, join_policy, deleted,
        row_number() OVER (PARTITION BY group_id ORDER BY updated_at DESC, deleted DESC) AS rn
      FROM group_contracts) gc ON gm.group_id = gc.group_id
WHERE gm.rn = 1 AND gc.rn = 1 AND gm.deleted = 0 AND gc.deleted = 0
  AND gm.member_key = :user;

-- member_count (one batched query, window function at top level):
SELECT group_id, count() AS cnt
FROM (SELECT group_id, member_key, deleted
      FROM group_members WHERE group_id IN (:group_ids)
      QUALIFY row_number() OVER (PARTITION BY group_id, member_key ORDER BY updated_at DESC, deleted DESC) = 1)
WHERE deleted = 0
GROUP BY group_id;
```

### `w.getGroupsManages()`

Same query as `getMyGroups`, plus the `roles` JSON. The management filter runs
in Python: the reader's role must grant `manageRoles` (under the `group` key in
the D58 shape, or the `*` wildcard in the legacy shape).

### `w.getGroup(groupId)`

Latest group-contract version (dedup-then-filter — a deleted group must not be
found by its stale active row).

```sql
SELECT group_id, roles, join_policy, discoverable, created_at, updated_at
FROM (SELECT group_id, roles, join_policy, discoverable, created_at, updated_at, deleted,
        row_number() OVER (PARTITION BY group_id ORDER BY updated_at DESC, deleted DESC) AS rn
      FROM group_contracts WHERE group_id = :group_id)
WHERE rn = 1 AND deleted = 0;
```

### `w.updateGroup(groupId, { join_policy, roles })`

Insert a new group-contract version (preserving `created_at`). The API also
accepts `discoverable` (carried over from the existing contract when omitted).

```sql
INSERT INTO group_contracts (group_id, roles, join_policy, discoverable, created_at, updated_at, deleted)
VALUES (:group_id, :roles_json, :join_policy, :discoverable, :created_at, now(), 0);
```

### `w.joinGroup(groupId)` / `w.requestJoin(groupId)`

Both hit `POST /v3/groups/join`. The `join_policy` decides:

```sql
-- open policy — instant membership
INSERT INTO group_members VALUES (:group_id, :user, 'member', now(), now(), 0);

-- request policy — pending join request (resolved_at is a zero-datetime sentinel)
INSERT INTO group_join_requests (group_id, requester_key, status, role, requested_at, resolved_at, updated_at, deleted)
VALUES (:group_id, :user, 'pending', '', now(), toDateTime(1970, 1, 1), now(), 0);
```

### `w.leaveGroup(groupId)`

Tombstone the membership.

```sql
INSERT INTO group_members (group_id, member_key, role, joined_at, updated_at, deleted)
SELECT group_id, member_key, role, joined_at, now64(6), 1
FROM group_members WHERE group_id = :group_id AND member_key = :user AND deleted = 0;
```

### `w.inviteMember(groupId, memberKey, role)`

Create an `invited` join request carrying the offered role.

```sql
INSERT INTO group_join_requests (group_id, requester_key, status, role, requested_at, resolved_at, updated_at, deleted)
VALUES (:group_id, :member, 'invited', :role, now(), toDateTime(1970, 1, 1), now(), 0);
```

### `w.acceptInvite(groupId)`

Resolve the reader's pending/invited request as `approved`, then add the member
(with the invited role, or `member`).

```sql
-- Resolve the request (a new row, status = approved)
INSERT INTO group_join_requests (group_id, requester_key, status, role, requested_at, resolved_at, updated_at, deleted)
SELECT group_id, requester_key, 'approved', role, requested_at, now64(6), now64(6), 0
FROM group_join_requests WHERE group_id = :group_id AND requester_key = :user AND deleted = 0;

-- Add the member
INSERT INTO group_members VALUES (:group_id, :user, :role, now(), now(), 0);
```

### `w.declineInvite(groupId)`

Resolve the reader's request as `declined` (no membership insert).

```sql
INSERT INTO group_join_requests (group_id, requester_key, status, role, requested_at, resolved_at, updated_at, deleted)
SELECT group_id, requester_key, 'declined', role, requested_at, now64(6), now64(6), 0
FROM group_join_requests WHERE group_id = :group_id AND requester_key = :user AND deleted = 0;
```

### `w.getGroupMembers(groupId)`

Active members (dedup-then-filter — a removed/left member must not be
resurrected by a stale active row).

```sql
SELECT member_key, role, joined_at
FROM (SELECT member_key, role, joined_at, deleted,
        row_number() OVER (PARTITION BY member_key ORDER BY updated_at DESC, deleted DESC) AS rn
      FROM group_members WHERE group_id = :group_id)
WHERE rn = 1 AND deleted = 0
LIMIT 100 OFFSET 0;
```

### `w.addGroupMember(groupId, memberKey, role)`

Requires the `assignRoles` management permission.

```sql
INSERT INTO group_members VALUES (:group_id, :member, :role, now(), now(), 0);
```

### `w.removeGroupMember(groupId, memberKey)`

Requires the `revokeRoles` management permission. Tombstone the membership.

```sql
INSERT INTO group_members (group_id, member_key, role, joined_at, updated_at, deleted)
SELECT group_id, member_key, role, joined_at, now64(6), 1
FROM group_members WHERE group_id = :group_id AND member_key = :member AND deleted = 0;
```

### `w.getJoinRequests(groupId)` / `w.approveJoinRequest(groupId, requesterKey)` / `w.denyJoinRequest(groupId, requesterKey)`

All require `assignRoles`. List reads the pending/invited requests (deduped to
the latest per requester). Approve resolves the request as `approved` + adds
the member (the `acceptInvite` pair, driven by a moderator); deny resolves it
as `denied`.

```sql
-- List pending/invited
SELECT requester_key, status, role, requested_at
FROM (SELECT requester_key, status, role, requested_at, deleted,
        row_number() OVER (PARTITION BY requester_key ORDER BY updated_at DESC, deleted DESC) AS rn
      FROM group_join_requests WHERE group_id = :group_id)
WHERE rn = 1 AND status IN ('pending', 'invited') AND deleted = 0;

-- Approve / deny — resolve the request (status = 'approved' / 'denied'),
-- approve additionally inserts the member (same as acceptInvite)
```

## Blocking + Sharing

### `w.blockUser(blockedKey)` / `w.unblockUser(blockedKey)`

User-wide blacklist. Block inserts; unblock tombstones.

```sql
-- Block
INSERT INTO user_blacklist VALUES (:user, :blocked_key, now(), now(), 0);

-- Unblock (tombstone)
INSERT INTO user_blacklist (user_key, blocked_key, created_at, updated_at, deleted)
SELECT user_key, blocked_key, created_at, now64(6), 1
FROM user_blacklist WHERE user_key = :user AND blocked_key = :blocked_key AND deleted = 0;
```

### `w.blockUserInGroup(blockedKey, groupId)` / `w.unblockUserInGroup(blockedKey, groupId)`

Per-group blacklist. Same insert/tombstone shape against `group_blacklist`.

```sql
-- Block in group
INSERT INTO group_blacklist VALUES (:user, :group_id, :blocked_key, now(), now(), 0);

-- Unblock in group (tombstone)
INSERT INTO group_blacklist (user_key, group_id, blocked_key, created_at, updated_at, deleted)
SELECT user_key, group_id, blocked_key, created_at, now64(6), 1
FROM group_blacklist WHERE user_key = :user AND group_id = :group_id AND blocked_key = :blocked_key AND deleted = 0;
```

### `w.setSharing(groupId, enabled)`

Toggle sharing for the caller in a group (opt-out model — no row means sharing
is on). The read path's `user_group_sharing` anti-join enforces it.

```sql
INSERT INTO user_group_sharing VALUES (:user, :group_id, :enabled, now(), now(), 0);
```

## App Contracts

The table is `app_contracts` (one row per app; `permissions` is the per-service
permission map as JSON). There is no `service_contracts` in the v3 SDK surface.

### `w.addAppContract(allowedOrigin, permissions)`

```sql
INSERT INTO app_contracts VALUES (:user, :allowed_origin, :permissions_json, now(), now(), 0);
```

### `w.listAppContracts()`

Active contracts (dedup-then-filter on `allowed_origin`).

```sql
SELECT allowed_origin, permissions
FROM (SELECT allowed_origin, permissions, deleted,
        row_number() OVER (PARTITION BY allowed_origin ORDER BY updated_at DESC) AS rn
      FROM app_contracts WHERE user_key = :user)
WHERE rn = 1 AND deleted = 0;
```

### `w.revokeAppContract(allowedOrigin?)`

With an origin, tombstone that one contract; without, tombstone all of the
user's contracts (the kill switch).

```sql
-- One app
INSERT INTO app_contracts (user_key, allowed_origin, permissions, created_at, updated_at, deleted)
SELECT user_key, allowed_origin, permissions, created_at, now64(6), 1
FROM app_contracts WHERE user_key = :user AND allowed_origin = :origin AND deleted = 0;

-- All apps (kill switch)
INSERT INTO app_contracts (user_key, allowed_origin, permissions, created_at, updated_at, deleted)
SELECT user_key, allowed_origin, permissions, created_at, now64(6), 1
FROM app_contracts WHERE user_key = :user AND deleted = 0;
```

## Media

Three-step upload: request a presigned URL, upload to object storage, confirm.
Only the confirm and the list/delete touch ClickHouse — the presigned URLs are
S3 operations.

### `w.requestMediaUploadUrl({ filename, mimeType, sizeBytes })`

No SQL — the API generates an S3 presigned PUT. Returns `{ upload_url, fields,
object_key, content_type }`.

### `w.confirmMediaUpload(metadata)`

Store the metadata as a document in the `media_metadata` collection. The
metadata body carries the `object_key` (the blob reference) — never a URL. The
confirm response is the standard document envelope (the metadata is the doc's
`body`), same shape as create/read.

```sql
INSERT INTO documents
  (doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at, deleted, ad_mode, ad_target)
VALUES
  (:media_doc_id, :user, 'media_metadata', :metadata_json, '', [], now(), now(), 0, 'none', '');
```

### `w.getMediaReadUrl(objectKey)`

No SQL — the API generates an S3 presigned GET. Returns `{ read_url,
expires_in }`.

### `w.listMedia({ limit, offset, doc_ids })`

List the user's media metadata. An optional `doc_ids` filter narrows the list
to specific documents — the exact-ref resolution the app's avatar/banner/post
media refs need (a bare latest-N list misses refs older than the window).

```sql
SELECT doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at
FROM documents
WHERE author_key = :user
  AND collection_name IN ('media_metadata', 'public_media')
  AND deleted = 0
  -- AND doc_id IN (:doc_ids)  -- optional exact-ref filter
ORDER BY created_at DESC
LIMIT :limit OFFSET :offset;
```

### `w.deleteMedia(docId)`

Tombstone the media record.

```sql
INSERT INTO documents (doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at, deleted)
SELECT doc_id, author_key, collection_name, body, ref_value, tags, created_at, now(), 1
FROM documents WHERE doc_id = :doc_id AND author_key = :user AND deleted = 0;
```

### Read-time URL resolution

A media doc's blob is addressed by its `object_key`; the document never stores
a live URL (stored URLs go stale). On read, the API mints a FRESH presigned URL
from the `object_key`:

- `media_refs` in a post body → each ref resolves to `{doc_id, object_key,
  mime_type, filename, size_bytes, read_url}` with a fresh presigned `read_url`
  (a legacy stored `url` is only the fallback when no `object_key` exists).
- `minio` types anywhere in a body → a fresh presigned `url` added alongside
  the `value` (see `document-typing.md`).

## Auth (the users table)

### `POST /v3/signup` — `w.signup(username, password, phone?, email?)`

Create a user account and auto-enroll them in the discover group (every account
is a member of the universal public board by default). Username must be unique.

```sql
-- Uniqueness check
SELECT count() FROM (SELECT 1 FROM users WHERE username = :username AND deleted = 0
                     ORDER BY updated_at DESC LIMIT 1);

-- Insert (phone_verified / email_verified start at 0)
INSERT INTO users VALUES (:username, :password_hash, :phone, 0, :email, 0, now(), now(), 0);

-- Auto-enroll in the discover group
INSERT INTO group_members VALUES ('{provider}/groups/web10/discover', :username, 'member', now(), now(), 0);
```

### `POST /v3/login` — `w.login(username, password, site?)`

Verify credentials, return JWT.

```sql
SELECT username, password_hash, phone, phone_verified, email, email_verified, created_at
FROM users WHERE username = :username AND deleted = 0
ORDER BY updated_at DESC LIMIT 1;
```

The API compares the submitted password against the stored hash. On match it
mints a JWT (`username`, `provider`, `site`, `expires`).

### `POST /v3/change-pass` — `w.changePassword(currentPassword, newPassword)`

New `users` row with the new hash. `updated_at` is a Python microsecond clock
(so the new row strictly outranks the old one in the `updated_at`-ordered
dedup read — a second-precision `now()` can tie or lose when both writes fall
in the same second, and the read would return the stale hash).

```sql
INSERT INTO users (username, password_hash, phone, phone_verified, email, email_verified, created_at, updated_at, deleted)
SELECT username, :new_password_hash, phone, phone_verified, email, email_verified, created_at, :updated_at, 0
FROM users WHERE username = :username AND deleted = 0;
```

### `POST /v3/change-phone` — `w.changePhone(phone)`

New row, new phone, `phone_verified` reset to 0.

```sql
INSERT INTO users (username, password_hash, phone, phone_verified, email, email_verified, created_at, updated_at, deleted)
SELECT username, password_hash, :phone, 0, email, email_verified, created_at, :updated_at, 0
FROM users WHERE username = :username AND deleted = 0;
```

### `POST /v3/set-email` — `w.setEmail(email)`

New row, new email, `email_verified` reset to 0.

```sql
INSERT INTO users (username, password_hash, phone, phone_verified, email, email_verified, created_at, updated_at, deleted)
SELECT username, password_hash, phone, phone_verified, :email, 0, created_at, :updated_at, 0
FROM users WHERE username = :username AND deleted = 0;
```

### `POST /v3/verify-phone` — `w.verifyPhone(code)`

Mark phone verified. Selects only the LATEST row (selecting every row would
re-insert each one, and the `updated_at`-ordered read could then pick a stale
row).

```sql
INSERT INTO users (username, password_hash, phone, phone_verified, email, email_verified, created_at, updated_at, deleted)
SELECT username, password_hash, phone, 1, email, email_verified, created_at, :updated_at, 0
FROM (SELECT * FROM users WHERE username = :username AND deleted = 0 ORDER BY updated_at DESC LIMIT 1);
```

### `POST /v3/verify-email` — `w.verifyEmail(code)`

Same shape, `email_verified = 1`.

```sql
INSERT INTO users (username, password_hash, phone, phone_verified, email, email_verified, created_at, updated_at, deleted)
SELECT username, password_hash, phone, phone_verified, email, 1, created_at, :updated_at, 0
FROM (SELECT * FROM users WHERE username = :username AND deleted = 0 ORDER BY updated_at DESC LIMIT 1);
```

### `POST /v3/send_code` — `w.sendCode()`

Send a verification code to the user's phone. No write — a Twilio operation.
The API looks up the phone first.

```sql
SELECT username, password_hash, phone, phone_verified, email, email_verified, created_at
FROM users WHERE username = :username AND deleted = 0
ORDER BY updated_at DESC LIMIT 1;
```

If no phone is set, returns `PHONE_NUMBER_MISSING`.

### `POST /v3/set-recovery-phone` — `w.setRecoveryPhone(phone)`

Set the recovery phone on the authenticated user. Same SQL as `change-phone`
(phone must match `^\+?[0-9][0-9 ()-]{5,18}[0-9]$` or it returns `BAD_NUM`).

### `POST /v3/profile` — `w.getProfile()`

```sql
SELECT username, password_hash, phone, phone_verified, email, email_verified, created_at
FROM users WHERE username = :username AND deleted = 0
ORDER BY updated_at DESC LIMIT 1;
```

The response omits the password hash.

## App Store

### `POST /v3/apps/register` — `w.registerApp({ url, name, description, icon_url, screenshots })`

Register an app (anonymous — the app identifies itself by `url`, canonicalized:
lowercase host, no `www.`, one trailing slash, `/index.html` folded to the
directory). Appended on first registration or a real metadata change only — not
per ping. A verified (token-bearing) ping also appends a counted visit to
`app_visits`, gated to one per (app, user) per 3 h; anon pings are dropped.

```sql
-- First registration
INSERT INTO apps (url, name, description, icon_url, screenshots, visits, approved, review_state, metadata_version, created_at, updated_at, deleted)
VALUES (:url, :name, :description, :icon_url, :screenshots_json, 0, 0, 'pending', 1, now(), now(), 0);

-- Metadata change (a new apps row, metadata_version bumped; unchanged fields carried over)
INSERT INTO apps (url, name, description, icon_url, screenshots, visits, approved, review_state, metadata_version, created_at, updated_at, deleted)
SELECT url, if(:name != '', :name, name), if(:description != '', :description, description),
       if(:icon_url != '', :icon_url, icon_url), screenshots, visits, approved, review_state,
       metadata_version + 1, created_at, now64(6), 0
FROM (SELECT url, name, description, icon_url, screenshots, visits, approved, review_state,
             metadata_version, created_at, updated_at, deleted,
             row_number() OVER (PARTITION BY url ORDER BY updated_at DESC, deleted DESC) AS rn
      FROM apps) WHERE rn = 1 AND deleted = 0 AND url = :url;

-- Counted visit (real, verified users only, 1 per 3h)
INSERT INTO app_visits (app_url, username, seen_at) VALUES (:url, :username, now());
```

### `POST /v3/apps/list` — `w.getApps()`

List approved apps (dedup-then-filter on `url`).

```sql
SELECT url, name, description, icon_url, screenshots, visits, review_state, metadata_version
FROM (SELECT url, name, description, icon_url, screenshots, visits, approved, review_state,
             metadata_version, updated_at, deleted,
             row_number() OVER (PARTITION BY url ORDER BY updated_at DESC, deleted DESC) AS rn
      FROM apps)
WHERE rn = 1 AND deleted = 0 AND approved = 1
ORDER BY url;
```

### `POST /v3/apps/rating` — `w.rateApp(appId, rating)`

Submit a star rating (1–5). Upsert by `(target_app_id, author)` — a re-rate
appends a new row; the read dedups to the latest.

```sql
INSERT INTO app_ratings (author, target_app_id, rating, comment, provider, created_at, updated_at, deleted)
VALUES (:author, :target_app_id, :rating, '', :provider, now(), now(), 0);
```

### `POST /v3/apps/ratings` — `w.getAppRatings(appId)`

Read all ratings for an app (dedup-then-filter on `(target_app_id, author)`).

```sql
SELECT author, rating, comment, provider, created_at
FROM (SELECT author, rating, comment, provider, created_at, deleted,
        row_number() OVER (PARTITION BY target_app_id, author ORDER BY updated_at DESC, deleted DESC) AS rn
      FROM app_ratings WHERE target_app_id = :target_app_id)
WHERE rn = 1 AND deleted = 0
ORDER BY created_at DESC;
```

## Summary

| SDK call | ClickHouse |
|---|---|
| `w.create(collection, body, { groups, ref_value })` | `INSERT INTO documents` + `INSERT INTO doc_groups` (N rows) |
| `w.read(collection, { groups: ['me'] })` | reader's groups (dedup) → readable subset → discover query |
| `w.read(collection, { groups, limit, offset })` | `documents` ⋈ `doc_groups` + blacklist/sharing/hidden anti-joins, deduped |
| `w.read(collection, { groups, ref })` | safe-query engine: boundary CTE + `WHERE ref_value = …` |
| `w.readRefCounts(collection, { groups, ref })` | safe-query engine: boundary CTE + `GROUP BY ref_value` |
| `w.readById(docId, collection)` | `documents` + `LEFT SEMI JOIN` membership + blacklist anti-join |
| `w.update(docId, body, { groups })` | `INSERT INTO documents` (new version) + tombstone old `doc_groups` + new `doc_groups` |
| `w.delete(docId)` | `INSERT INTO documents` (tombstone) + tombstone `doc_groups` |
| `w.query(sql, { groups })` | safe-query engine: boundary-CTE SQL, `max_execution_time = 10`, `LIMIT 1000` if unbounded |
| `w.createGroup(name, joinPolicy, roles, members)` | `INSERT INTO group_contracts` + `INSERT INTO group_members` (per member) |
| `w.getMyGroups()` | `group_contracts` ⋈ `group_members` (dedup) + batched member count |
| `w.getGroupsManages()` | same + `manageRoles` filter (Python) |
| `w.getGroup(groupId)` | `group_contracts` (dedup, latest) |
| `w.updateGroup(groupId, {…})` | `INSERT INTO group_contracts` (new version) |
| `w.joinGroup(groupId)` | `INSERT INTO group_members` (open) |
| `w.requestJoin(groupId)` | `INSERT INTO group_join_requests` (pending) |
| `w.leaveGroup(groupId)` | tombstone `group_members` |
| `w.inviteMember(groupId, member, role)` | `INSERT INTO group_join_requests` (invited) |
| `w.acceptInvite(groupId)` | resolve request (approved) + `INSERT INTO group_members` |
| `w.declineInvite(groupId)` | resolve request (declined) |
| `w.getGroupMembers(groupId)` | `group_members` (dedup) |
| `w.addGroupMember(groupId, member, role)` | `INSERT INTO group_members` |
| `w.removeGroupMember(groupId, member)` | tombstone `group_members` |
| `w.getJoinRequests(groupId)` | `group_join_requests` (dedup, pending/invited) |
| `w.approveJoinRequest(groupId, requester)` | resolve request (approved) + `INSERT INTO group_members` |
| `w.denyJoinRequest(groupId, requester)` | resolve request (denied) |
| `w.blockUser(blockedKey)` | `INSERT INTO user_blacklist` |
| `w.unblockUser(blockedKey)` | tombstone `user_blacklist` |
| `w.blockUserInGroup(blockedKey, groupId)` | `INSERT INTO group_blacklist` |
| `w.unblockUserInGroup(blockedKey, groupId)` | tombstone `group_blacklist` |
| `w.setSharing(groupId, enabled)` | `INSERT INTO user_group_sharing` |
| `w.addAppContract(origin, permissions)` | `INSERT INTO app_contracts` |
| `w.listAppContracts()` | `SELECT FROM app_contracts` (dedup) |
| `w.revokeAppContract(origin?)` | tombstone `app_contracts` (one, or all) |
| `w.requestMediaUploadUrl(…)` | no SQL (S3 presigned PUT) |
| `w.confirmMediaUpload(metadata)` | `INSERT INTO documents` (`media_metadata`) |
| `w.getMediaReadUrl(objectKey)` | no SQL (S3 presigned GET) |
| `w.listMedia({ limit, offset, doc_ids })` | `SELECT FROM documents WHERE collection_name IN (media_metadata, public_media)` |
| `w.deleteMedia(docId)` | tombstone `documents` |
| `w.signup(…)` | `INSERT INTO users` + discover-group `INSERT INTO group_members` |
| `w.login(…)` | `SELECT FROM users` (latest) → mint JWT |
| `w.changePassword(…)` | `INSERT INTO users` (new hash) |
| `w.changePhone(…)` | `INSERT INTO users` (new phone) |
| `w.setEmail(…)` | `INSERT INTO users` (new email) |
| `w.verifyPhone(…)` | `INSERT INTO users` (phone_verified = 1) |
| `w.verifyEmail(…)` | `INSERT INTO users` (email_verified = 1) |
| `w.sendCode()` | `SELECT FROM users` → Twilio send |
| `w.setRecoveryPhone(…)` | `INSERT INTO users` (new phone) |
| `w.getProfile()` | `SELECT FROM users` (latest, no hash) |
| `w.registerApp(…)` | `INSERT INTO apps` (first / metadata change) + `INSERT INTO app_visits` (counted) |
| `w.getApps()` | `SELECT FROM apps WHERE approved = 1` (dedup) |
| `w.rateApp(appId, rating)` | `INSERT INTO app_ratings` |
| `w.getAppRatings(appId)` | `SELECT FROM app_ratings` (dedup) |

Everything is append-only. Updates are new inserts with a higher `updated_at`.
Deletes are tombstones (`deleted = 1`). `ReplacingMergeTree` keeps the latest
version on a background merge; reads do not wait for it — they dedup first
(latest row per key, tombstones included) and then filter `deleted = 0`.
