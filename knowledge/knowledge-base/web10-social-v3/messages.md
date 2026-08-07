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

**Inbox:** Documents attached to your inbox group, excluding your own.

```ts
const inbox = await w.read('outbox', {
  groups: ['web10.app/groups/jacoby149/inbox'],
  $sort: { created_at: -1 },
})
// Filter out your own sent messages client-side
const received = inbox.filter(msg => msg.author_key !== 'jacoby149')
```

**Sent:** Your documents in the outbox collection.

```ts
const sent = await w.read('outbox', {
  groups: ['me'],
  $sort: { created_at: -1 },
})
```

**DM thread:** A group with two members. Both sides' messages appear.

```ts
const thread = await w.read('outbox', {
  groups: ['web10.app/groups/jacoby149/alice-and-bob'],
  $sort: { created_at: 1 },  // chronological, oldest first
})
```

Alice's messages live in her collection, attached to the DM group. Bob's messages live in his collection, attached to the same group. One SDK call returns both.

**Unread count:** The app tracks read state locally (or in a `message_read` table).

```ts
// Mark as read
await w.create('message_read', {
  doc_id: { type: 'ref', value: 'msg-123' },
})
```

Unread = inbox documents minus read documents.

## The Data Flow

```
User opens /messages
  → w.read('outbox', { groups: ['web10.app/groups/jacoby149/inbox'] })  (inbox)
  → w.read('outbox', { groups: ['me'] })                                (sent)
  → parallel: resolve sender avatars
  → parallel: check read status
  → render

User opens a DM thread
  → w.read('outbox', { groups: ['web10.app/groups/jacoby149/alice-and-bob'] })
  → mark messages as read
  → render
```

## Send a Message

```ts
await w.create('outbox', {
  text: { type: 'text', value: 'hey' },
}, {
  groups: ['web10.app/groups/alice/inbox'],
})
// → One document. One group attachment.
// → Alice discovers it when she queries her inbox.
```

One SDK call. One group attachment. No fan-out. Alice sees it when she queries.

## TODO

- [ ] Read receipts — message_read tracking, mark on thread open
- [ ] Typing indicators — WebSocket signal, ephemeral (not stored)
- [ ] DM creation flow — `w.createGroup({ members: [...], join_policy: 'invite_only' })`
- [ ] Message attachment — media in JSON body (minio type), same as documents
- [ ] Unread badge — counter in Redis, increment on inbox write, decrement on read
- [ ] Search messages — filter documents by group_id and text search on body

## Proof

Messages are documents with group attachments. Inbox is a group. Sent is your collection. DMs are a two-person group. No dedicated mail table. No dedicated DM table. No fan-out on send. The protocol handles it.