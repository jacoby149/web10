# Notifications

Real-time alerts for reactions, comments, follow requests, group activity.

## What the Screen Shows

```
Notifications
─────────────────────
alice liked your post · 2m ago
bob commented on your post · 15m ago
charlie requested to follow · 1h ago
dave joined web10.app/groups/dave/jazz-collectors · 3h ago
```

## Protocol Mapping

Notifications are not a core protocol concept. They're events derived from writes.

**Reaction notification:** Someone created a document in the `reactions` collection with a ref to your post.

```ts
const reactions = await w.read('reactions', {
  groups: ['me'],  // reactions attached to groups you belong to
  $match: { target: 'post-123' },
  $sort: { created_at: -1 },
})
```

**Comment notification:** Someone created a document in the `comments` collection with a ref to your post.

```ts
const comments = await w.read('comments', {
  groups: ['me'],
  $match: { target: 'post-123' },
  $sort: { created_at: -1 },
})
```

**Follow request notification:** New join requests for groups you manage.

```ts
const pending = await w.getPendingRequests('web10.app/groups/jacoby149/followers')
// → [{ requester_key: 'charlie', requested_at: '2026-01-15T10:30:00' }]
```

**Group activity:** New members in groups you manage.

```ts
const members = await w.getMembers('web10.app/groups/jacoby149/followers')
// App compares against cached list to detect new members
```

## The Push Model

Polling is wasteful. The right model is push:

**On every write, the API emits a notification event:**

```
Bob reacts to jacoby149's post
  → API writes reaction via w.create('reactions', ...)
  → API: who is the post author? (read the target document)
  → API: push notification to jacoby149 via WebSocket
     { "type": "reaction", "from": "bob", "doc_id": "post-123", "reaction_type": "like" }
```

**On every join request:**

```
Bob requests to join web10.app/groups/jacoby149/followers
  → API writes join request via w.requestJoin(...)
  → API: who is the owner? (read group_members with role='owner')
  → API: push notification to jacoby149 via WebSocket
     { "type": "follow_request", "from": "bob", "group_id": "web10.app/groups/jacoby149/followers" }
```

The API knows about the write. It pushes the notification. No polling. No background job.

## The Notification History

Notifications are ephemeral by default. But the user needs a history screen.

**Option 1: Query on demand.** Run the notification queries above when the user opens the screen. Accurate, but slow for large datasets.

**Option 2: Notification table.** The API writes to a lightweight notifications table on every event. The social app owns it — not a core protocol table.

```ts
// API writes on each event
await w.create('notifications', {
  type: 'reaction',
  from: 'bob',
  ref_doc_id: 'post-123',
}, {
  groups: ['web10.app/groups/jacoby149/notifications'],
})
```

The notification screen reads from this collection:

```ts
const history = await w.read('notifications', {
  groups: ['web10.app/groups/jacoby149/notifications'],
  $sort: { created_at: -1 },
  $limit: 50,
})
```

Option 2 is better for the app. It's a lightweight table, not a core protocol table. The social app owns it.

## The Data Flow

```
User opens /notifications
  → w.read('notifications', { groups: ['web10.app/groups/jacoby149/notifications'] })
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

Notifications are derived events, not a core protocol concept. The social app owns the notification collection. The API pushes on relevant writes. No polling. No background job. The protocol enables it without defining it.