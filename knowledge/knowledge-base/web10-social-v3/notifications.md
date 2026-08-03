# Notifications

Real-time alerts for reactions, comments, follow requests, group activity.

## What the Screen Shows

```
Notifications
─────────────────────
alice liked your post · 2m ago
bob commented on your post · 15m ago
charlie requested to follow · 1h ago
dave joined jazz-collectors · 3h ago
```

## Protocol Mapping

Notifications are not a table. They're events derived from writes.

**Reaction notification:** Someone created a post in the `reactions` collection with a ref to your post.
```sql
-- New reactions on your posts in the last hour
SELECT p.post_id, p.author_key, p.body, p.created_at
FROM posts p
WHERE p.deleted = 0
  AND p.collection_name = 'reactions'
  AND p.created_at > now() - INTERVAL 1 HOUR
  AND hasToken(p.body, '{your post_ids}');
```

But you need to know which posts are yours. Join:
```sql
SELECT r.post_id AS reaction_id, r.author_key AS reactor,
       extractJSONString(r.body, '$.reaction_type.value') AS rtype,
       p.post_id AS target_post
FROM posts r
JOIN posts p ON hasToken(r.body, p.post_id)
WHERE r.deleted = 0
  AND r.collection_name = 'reactions'
  AND p.author_key = 'jacoby149'
  AND r.created_at > now() - INTERVAL 1 HOUR
ORDER BY r.created_at DESC;
```

**Comment notification:** Someone created a post in the `comments` collection with a ref to your post.
```sql
SELECT c.post_id AS comment_id, c.author_key AS commenter, c.body, c.created_at
FROM posts c
WHERE c.deleted = 0
  AND c.collection_name = 'comments'
  AND c.created_at > now() - INTERVAL 1 HOUR
  AND hasToken(c.body, '{your post_ids}');
```

**Follow request notification:** New row in group_join_requests for your groups.
```sql
SELECT gjr.requester_key, gjr.group_id, gjr.requested_at
FROM group_join_requests gjr
JOIN group_contracts gc ON gjr.group_id = gc.group_id
WHERE gjr.status = 'pending'
  AND gc.admin_key = 'jacoby149'
  AND gjr.created_at > now() - INTERVAL 1 HOUR;
```

**Group activity:** New members in your groups.
```sql
SELECT gm.member_key, gm.group_id, gm.joined_at
FROM group_members gm
WHERE gm.group_id IN (
  SELECT group_id FROM group_contracts
  WHERE admin_key = 'jacoby149' AND deleted = 0
)
AND gm.joined_at > now() - INTERVAL 1 HOUR;
```

## The Push Model

Polling is wasteful. The right model is push:

**On every write, the API emits a notification event:**
```
Bob reacts to jacoby149's post
  → API writes reaction to posts table
  → API: who is the post author? (read the target post)
  → API: push notification to jacoby149 via WebSocket
     { "type": "reaction", "from": "bob", "post_id": "post-123", "reaction_type": "like" }
```

**On every join request:**
```
Bob requests to join jacoby149.followers
  → API writes to group_join_requests
  → API: who is the admin? (read group_contracts)
  → API: push notification to jacoby149 via WebSocket
     { "type": "follow_request", "from": "bob", "group_id": "jacoby149.followers" }
```

The API knows about the write. It pushes the notification. No polling. No background job.

## The Notification History

Notifications are ephemeral by default. But the user needs a history screen.

**Option 1: Query on demand.** Run the notification queries above when the user opens the screen. Accurate, but slow for large datasets.

**Option 2: Notification table.** The API writes to a lightweight notifications table on every event:
```sql
CREATE TABLE notifications (
    notification_id String,
    user_key String,          -- who gets the notification
    type String,              -- 'reaction', 'comment', 'follow_request', 'group_join'
    from_key String,          -- who triggered it
    ref_post_id String,       -- related post (if any)
    ref_group_id String,      -- related group (if any)
    read UInt8 DEFAULT 0,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_key, created_at);
```

The API writes to this table on every relevant event. The notification screen queries it. TTL cleans up old notifications.

Option 2 is better for the app. It's a lightweight table, not a core protocol table. The social app owns it.

## The Data Flow

```
User opens /notifications
  → GET /notifications
  → ClickHouse: SELECT FROM notifications WHERE user_key = 'jacoby149' ORDER BY created_at DESC
  → parallel: resolve avatar for each "from_key"
  → mark as read
  → render

Real-time:
  → WebSocket: subscribe to notifications channel
  → New notification arrives → append to list, show badge
```

## TODO

- [ ] Notification table — lightweight, social-app-owned, not core protocol
- [ ] WebSocket push — on reaction, comment, follow request, group join
- [ ] Read/unread state — toggle read flag on notification row
- [ ] Notification badge — counter of unread notifications
- [ ] Notification preferences — per-type toggle (reactions on/off, comments on/off)
- [ ] Batch notifications — "15 people liked your post" instead of 15 separate notifications

## Proof

Notifications are derived events, not a core protocol concept. The social app owns the notification table. The API pushes on relevant writes. No polling. No background job. The protocol enables it without defining it.
