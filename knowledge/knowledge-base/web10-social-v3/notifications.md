# Notifications

Real-time alerts for reactions, comments, replies, DMs, follow requests, group
activity. **D69:** derived events the social app owns — CRUD is the source of
truth, the P2P data channel is the nudge. No server push, no node table, no
new endpoint. (This doc's original "API pushes via WebSocket" model is
retired — D66 rejects a server push channel: no Redis, no pub/sub, and
`api/rtc` is a PeerJS *signaling* server, not a fan-out bus.)

## What the Screen Shows

```
Notifications
─────────────────────
alice liked your post · 2m ago
bob commented on your post · 15m ago
carol replied to your comment · 1h ago
dave sent you a message · 2h ago
charlie requested to follow · 3h ago
```

## The Model (D69)

Notifications are not a core protocol concept. They're **derived events**:
"something happened that targets me." The app derives the *list* by reading
the writes it can already read, and the *real-time nudge* rides the existing
P2P inbound bus (`onP2PInbound`, app-wide) — the same "CRUD is truth, P2P is
the nudge" contract the DMs run. The nudge payload is a nudge
(`{type, from, ref_doc_id, ...}`); the recipient **re-reads from CRUD**, it
never trusts the payload's content.

**Read side (source of truth) — derive from reads the app already has:**

- **Reaction / comment on my post** — the server-side ref-count pattern
  (`readRefCounts('reactions' | 'comments', { ref: myPostIds })`, the same
  primitive the feed's engagement knobs use), minus what I've already seen.
- **Reply to my comment** — comments whose `parent_id` is one of my comment
  ids. The ref filter matches `ref_value` only (not `parent_id`), so this is
  `w.query()` (D63) or a client-side filter of the post's comment tree.
- **New DM** — the DM group read minus a per-conversation last-read cursor
  (the `settings.ts` app-owned pattern).
- **Follow request** — the followers group's pending join requests
  (**`getPendingRequests` read — the one missing primitive; `requestJoin`
  exists, the read does not**).
- **Group join** — a membership diff against the last-seen member list.

No new API endpoint: the generic CRUD + the ref-count read + `w.query()`
cover it.

**Write side (the nudge) — the actor's app pushes on a targeting action:**

```
Bob reacts to jacoby149's post
  → Bob's app: w.create('reactions', { ref_value: 'post-123', ... })
  → Bob's app: sendP2P(jacoby149, { type: 'reaction', from: 'bob', ref_doc_id: 'post-123' })
  → jacoby149's app (onP2PInbound): re-read the ref-counts → append + bump the badge
```

The nudge reaches users who are online + opted in (the real-time cohort)
instantly; everyone else gets it on their next read (CRUD is truth, so
nothing is lost). This is the honest model available without a server push
channel, and it is the one the DMs already run — one real-time mental model,
not two.

## The Notification History

Notifications are ephemeral by default, but the user needs a history screen.
The app owns a lightweight `notifications` service in the user's own followers
group (the D60 pattern — app concepts in app-named services + role grants, no
platform table, no node endpoint):

```ts
// The app writes a notification doc when it derives an event (or on a nudge)
await w.create('notifications', {
  type: 'reaction',
  from: 'bob',
  ref_doc_id: 'post-123',
  read: false,
}, { groups: [myFollowersGroup] })

// The screen reads the history
const history = await w.read('notifications', {
  groups: [myFollowersGroup],
  $sort: { created_at: -1 },
  $limit: 50,
})
```

Badge = the unread count (`read: false`). Mark-read on screen open. This is
the durable history + the badge, with no node table.

## The Data Flow

```
User opens /notifications
  → w.read('notifications', { groups: [myFollowersGroup] })
  → parallel: resolve avatar for each "from"
  → mark as read
  → render

Real-time (app-wide, any screen):
  → onP2PInbound: a nudge arrives → re-read from CRUD → append + bump the badge
  → the bell (Layout) + the "N new" banner (the sessionAlert precedent) update
```

The app-wide notification store (the `p2p.ts` listener-set idiom — module
singleton + subscriber set) holds the live unread count + recent items and
subscribes to `onP2PInbound`, so a nudge bumps the badge from *any* screen —
the operator's "whatever app state they are in."

## TODO

- [ ] **Decision: D69** — P2P nudge + CRUD re-read, app-owned, node stays stateless (retires the WebSocket push model)
- [ ] Notification store — app-wide singleton, subscribes to `onP2PInbound`, live unread count
- [ ] Read side — derive from reads (ref-counts, DM cursor, pending requests, membership diff)
- [ ] Write side — the nudge on each targeting action (reuses `sendP2P`)
- [ ] Unread state — app-owned `notifications` service in the followers group (D60)
- [ ] Badge + bell — `Layout` (desktop sidebar + mobile top-header) + the "N new" banner
- [ ] The `/notifications` screen — deep-linkable history, mark-read on open
- [ ] The missing primitive — `getPendingRequests` (followers group pending join requests)
- [ ] Notification preferences — per-type toggle (reactions on/off, comments on/off)
- [ ] Batch notifications — "15 people liked your post" instead of 15 rows (a later refinement)

## Proof

Notifications are derived events, not a core protocol concept. The social app
owns the notification collection (D60). The P2P data channel is the nudge,
CRUD is the source of truth — the same model the DMs run. No server push, no
node table, no new endpoint, no polling. The protocol enables it without
defining it.