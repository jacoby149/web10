# Skeptical Points Addressed

The v2-to-v3 transition raised real concerns. Here's how each resolves.

## "Blacklist tables aren't wired into the discovery query"

**The concern:** `user_blacklist` and `group_blacklist` exist in the schema, but the discovery query at overview.md doesn't filter on them. A blocked user would still see posts.

**The resolution:** It's a WHERE clause. Mechanical fix, not a model problem.

```sql
SELECT p.post_id, p.author_key, p.body, p.tags, p.created_at
FROM posts p
JOIN post_groups pg ON p.post_id = pg.post_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.deleted = 0
  AND p.discoverable = 1
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

Two anti-joins. ClickHouse handles them fine. The model was always correct — the query just needed to be written.

## "The permission model is hand-wavy — where does read/write live?"

**The concern:** The docs say the author decides permission level (read/write) at attachment time, but `post_groups` only had `post_id` and `group_id`. No column for the permission.

**The resolution:** Per-document permission on the `post_groups` row. Uses `ReplacingMergeTree(updated_at)` — same tombstone-append pattern as every other table. Full schema in `contract-schemas.md`. Cleanup strategy in `tombstone-cleanup.md`.

```sql
CREATE TABLE post_groups (
    post_id String,
    group_id String,
    permission String,   -- 'read', 'write' — author decides at attachment time
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (post_id, group_id);
```

The group manages who. The author manages how. Separated at the row level. The group admin can add/remove people but can't escalate `read` to `write` on your doc.

## "Federated queries are optimistic — too much network latency"

**The concern:** `remote()` to 10 providers, merge results, return — that's a lot of hidden latency. What about caching, consistency, slow providers?

**The resolution:** Three layers of reality:
1. **You're not federated yet.** No rush to solve a problem you don't have.
2. **Targeted queries, not broadcasts.** A mail query hits specific providers from the group membership list. One person's mail is likely on one or two shards. It's not a fan-out to every node.
3. **ClickHouse OLTP improvements.** Lightweight updates, Iceberg integration, and better point queries make per-provider targeting faster. The federation is a future problem with future tools.

## "Sender deletion breaks mail — the receiver loses messages they haven't read"

**The concern:** Bob sends mail to Alice. Bob owns it. Bob deletes it. Alice's copy vanishes. For an inbox, losing unread mail is bad UX.

**The resolution:** A mail app can create a `saved_mail` service. The user explicitly saves mail they want to keep. See `cross-app-sharing.md` for the full saved-mail pattern.

```
service:saved_mail → allowed: mailapp.com
```

The mail app reads from the inbox group (Alice has read permission), then writes to Alice's `saved_mail` collection (her own data, no auth needed — it's her app, her collection). It's an opt-in copy, not a default. Slightly fights the ephemeral manifesto, but the user chooses. The sender-deletion default is the feature. The save feature is the app's choice.

The user saves what matters. The ephemeral default protects privacy. The save feature protects utility. Both exist.

## "Discoverable is just a hidden visibility column"

**The concern:** You eliminated `visibility` from posts, but `discoverable` is functionally the same — a boolean controlling feed appearance.

**The resolution:** Different category. Visibility was "who can see this." Discoverable is "should this appear in feeds at all?" A post can be in a group (so members can see it) but `discoverable: false` — only reachable by direct link. The group still controls who. The author controls feed participation. Not the same thing.

```
Post in alice.close-friends, discoverable: false
  → members can find it by direct link
  → does NOT appear in group discover feed
  → author controls feed visibility, group controls access
```

## "Service contracts are redundant if groups handle everything"

**The concern:** During the brainstorm, it seemed like groups could replace service contracts entirely. Why keep both?

**The resolution:** They solve different problems. Service contracts control which websites can talk to your data (CORS, browser-enforced). Groups control which people can see content (server-enforced). Both must pass. The service contract is the outer wall. The groups are the inner permissions. Removing service contracts means any website can query your data — the browser won't stop them. Full schemas for both contract types in `contract-schemas.md`.

## "Dedicated reactions and comments tables are v2 thinking"

**The concern:** v2 had weird dedicated social media endpoints — `/reactions`, `/comments`, `/follows`. v3 is supposed to be a ubiquitous system, not a social media API. Why carry dedicated tables?

**The resolution:** They're gone. Everything is a post. The `ref` type (see `document-typing.md`) is the universal pointer.

```json
// A reaction is a post
{ "ref": {"type": "ref", "value": "post-123"}, "reaction_type": {"type": "text", "value": "like"} }

// A comment is a post
{ "ref": {"type": "ref", "value": "post-123"}, "text": {"type": "text", "value": "great!"} }

// A reply is a post
{ "ref": {"type": "ref", "value": "post-123"}, "parent_ref": {"type": "ref", "value": "comment-abc"}, "text": {"type": "text", "value": "agree"} }
```

One table. One CRUD. One permission model. The app decides what a ref means — reaction, comment, reply, quote, remix, pin. The platform doesn't care. Engagement is a query on the posts table, not a materialized view on a reactions table.

## "Big groups will hammer ClickHouse — every member queries the full table"

**The concern:** A group with 100k members means 100k discover queries hitting ClickHouse. Even fast queries add up. The node takes a hit proportional to group size.

**The resolution:** Two layers. Redis cache for hot group activity (recent posts, trending). WebSocket push for real-time updates. Full treatment in `real-time-feeds.md`.

```
alice.followers → 100k members
  New post attached → written to ClickHouse (one insert)
  Redis: group:alice.followers:recent → cached post IDs, TTL 30s
  Redis: group:alice.followers:trending → engagement-sorted, TTL 5m
  WebSocket: push to subscribed clients in this group
```

Discover flow with cache:
1. **Hot group** (recent activity) → Redis returns cached post IDs. Sub-millisecond.
2. **Trending** (engagement-sorted) → Redis returns cached trending list. Sub-millisecond.
3. **Real-time** (live updates) → WebSocket push. New posts arrive without polling.
4. **Cold path** (cache miss, deep pagination, older posts) → ClickHouse query. Still fast.

The API writes both ClickHouse and Redis on every insert — no pub/sub needed. TTL as fallback. No stale data longer than 30 seconds. The node protects itself. ClickHouse handles the writes. Redis handles the read fan-out. WebSockets handle the live updates.

Eventually, yes. Not day one. Day one, ClickHouse alone handles reasonable group sizes. Redis and WebSockets are the scaling layer for when groups hit 100k+ and activity is hot. The model doesn't change — the infrastructure adds a cache and a push channel.

## Summary

Every skeptical point resolved without changing the architecture. The model collapsed further: no dedicated reactions table, no dedicated comments table, no dedicated social media endpoints. Everything is a post. The `ref` type links posts together. The app decides semantics. One table. One CRUD. One permission model. The foundation holds.
