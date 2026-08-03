# Your Messages

Inbox and sent mail. DMs and group messages. All the same model.

## What the Screen Shows

```
Messages
─────────────────────
Inbox (3)          Sent (12)

[alice] 2h ago
  "hey, how's the project going?"

[bob] 5h ago
  "check this out"
  [📷 attachment]

[alice-and-bob DM] 1d ago
  alice: "sounds good"
  bob: "let's do it"
```

## Protocol Mapping

**Inbox:** Posts attached to your inbox group. Sender owns the post. You discover it.
```sql
SELECT p.post_id, p.author_key, p.body, p.created_at
FROM posts p
JOIN post_groups pg ON p.post_id = pg.post_id
WHERE p.deleted = 0
  AND pg.group_id = 'jacoby149.inbox'
  AND pg.deleted = 0
  AND p.author_key != 'jacoby149'     -- not your own sent mail
ORDER BY p.created_at DESC;
```

**Sent:** Your posts attached to someone's inbox group.
```sql
SELECT p.post_id, p.body, p.created_at,
       pg.group_id                    -- the group name tells you who it's for
FROM posts p
JOIN post_groups pg ON p.post_id = pg.post_id
WHERE p.deleted = 0
  AND p.author_key = 'jacoby149'
  AND p.collection_name = 'outbox'
ORDER BY p.created_at DESC;
```

**DM thread:** A group with two members. Both sides' posts appear.
```sql
-- alice-and-bob DM
SELECT p.post_id, p.author_key, p.body, p.created_at
FROM posts p
JOIN post_groups pg ON p.post_id = pg.post_id
WHERE p.deleted = 0
  AND pg.group_id = 'alice-and-bob'
  AND pg.deleted = 0
ORDER BY p.created_at ASC;            -- chronological, oldest first
```

Alice's messages: `alice.messages` collection, attached to `alice-and-bob` group.
Bob's messages: `bob.messages` collection, attached to `alice-and-bob` group.
Same group. Different collections. One query returns both.

**Unread count:** The app tracks read state locally (or in a `message_read` table).
```sql
CREATE TABLE message_read (
    user_key String,       -- who read it
    post_id String,        -- which message
    read_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (user_key, post_id);
```

Unread = inbox posts minus read posts.

## The Data Flow

```
User opens /messages
  → GET /messages/inbox       (posts in jacoby149.inbox group)
  → GET /messages/sent        (jacoby149's posts in outbox collection)
  → parallel: resolve sender avatars
  → parallel: check read status
  → render

User opens a DM thread
  → GET /groups/alice-and-bob/posts  (all posts in the group, chronological)
  → mark messages as read
  → render
```

## Send a Message

```
User types message, taps send to alice
  → POST /jacoby149/outbox
     { "text": {"type": "text", "value": "hey"},
       "groups": ["alice.inbox"] }
  → API: INSERT INTO posts (jacoby149's collection)
  → API: INSERT INTO post_groups (alice.inbox)
  → alice discovers it next time she checks her inbox
```

One insert. One group attachment. No fan-out. Alice sees it when she queries.

## TODO

- [ ] Read receipts — message_read table, mark on thread open
- [ ] Typing indicators — WebSocket signal, ephemeral (not stored)
- [ ] DM creation flow — create group with two members, invite the other person
- [ ] Message attachment — media in JSON body (minio type), same as posts
- [ ] Unread badge — counter in Redis, increment on inbox write, decrement on read
- [ ] Search messages — filter posts by group_id and text search on body

## Proof

Messages are posts with group attachments. Inbox is a group. Sent is your collection. DMs are a two-person group. No dedicated mail table. No dedicated DM table. No fan-out on send. The protocol handles it.
