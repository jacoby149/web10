# Post Detail

Single post view. Content, reactions, comments, share options.

> The engagement model — where comments/reactions live (discover default +
> group-picker), the `ref_value` join, and the private-account deferral — is in
> `engagement.md`. This doc is the screen-level protocol mapping.

## What the Screen Shows

```
jacoby149 · 2h ago · [web10.app/groups/charlie/st-louis-chess-club]
─────────────────────
"just shipped the new groups feature"

[📷 attachment]

❤️ 42    💬 8    ↗ Share

--- Comments ---
alice · 1h ago
  "this is fire 🔥"

  bob · 45m ago (reply to alice)
    "agree, the ref type is genius"

  charlie · 30m ago
    "can't wait to try it"
```

## Protocol Mapping

**The post:** Direct read by doc_id.

```ts
const post = await w.read('posts', {
  _id: 'doc-123',
  groups: ['web10.app/groups/charlie/st-louis-chess-club'],
})
// → returns post with presigned media URLs
```

**Reactions:** Documents in the `reactions` collection with a ref to this post.

```ts
const reactions = await w.read('reactions', {
  $match: { ref: 'doc-123' },
  groups: ['web10.app/groups/charlie/st-louis-chess-club'],
  $sort: { created_at: -1 },
})
```

The body contains `{ "ref": { "type": "ref", "value": "doc-123" }, "reaction_type": { "type": "text", "value": "like" } }`.

**Reaction count:**

```ts
const count = await w.aggregate('reactions', [
  { $match: { ref: 'doc-123' } },
  { $count: 'total' },
])
// → { total: 42 }
```

**Reaction breakdown (by type):**

```ts
const breakdown = await w.aggregate('reactions', [
  { $match: { ref: 'doc-123' } },
  { $group: { _id: '$reaction_type', count: { $sum: 1 } } },
])
// → [{ _id: 'like', count: 35 }, { _id: 'love', count: 5 }, ...]
```

**Your reaction:** Check if you've reacted.

```ts
const myReaction = await w.read('reactions', {
  groups: ['me'],
  $match: { ref: 'doc-123' },
})
// → if exists, show active reaction type
// → tap again: tombstone old, insert new
```

**Comments:** Documents in the `comments` collection with a ref to this post.

```ts
const comments = await w.read('comments', {
  $match: { ref: 'doc-123', parent_ref: null },  // top-level only
  groups: ['web10.app/groups/charlie/st-louis-chess-club'],
  $sort: { created_at: 1 },
})
```

**Replies to a comment:** Same query, filtered by parent_ref.

```ts
const replies = await w.read('comments', {
  $match: { ref: 'doc-123', parent_ref: 'comment-abc' },
  groups: ['web10.app/groups/charlie/st-louis-chess-club'],
  $sort: { created_at: 1 },
})
```

**Comment count:**

```ts
const commentCount = await w.aggregate('comments', [
  { $match: { ref: 'doc-123' } },
  { $count: 'total' },
])
```

## React to a Post

```ts
await w.create('reactions', {
  ref: { type: 'ref', value: 'doc-123' },
  reaction_type: { type: 'text', value: 'like' },
}, {
  groups: ['web10.app/groups/charlie/st-louis-chess-club'],
})
```

The reaction is a document. It lives in your collection. It's attached to the same group as the original post so group members can see it.

## Comment on a Post

```ts
await w.create('comments', {
  ref: { type: 'ref', value: 'doc-123' },
  text: { type: 'text', value: 'this is fire' },
}, {
  groups: ['web10.app/groups/charlie/st-louis-chess-club'],
})
```

Reply to a comment: add `parent_ref` to the body. Same endpoint. Same collection.

```ts
await w.create('comments', {
  ref: { type: 'ref', value: 'doc-123' },
  parent_ref: { type: 'ref', value: 'comment-abc' },
  text: { type: 'text', value: 'agree, the ref type is genius' },
}, {
  groups: ['web10.app/groups/charlie/st-louis-chess-club'],
})
```

## The Data Flow

```
User opens post detail
  → w.read('posts', { _id: 'doc-123', groups: [...] })     (the post)
  → w.read('reactions', { $match: { ref: 'doc-123' } })    (reactions)
  → w.aggregate('reactions', [{ $count }])                 (reaction count)
  → w.read('comments', { $match: { ref: 'doc-123' } })     (comments)
  → w.read('reactions', { groups: ['me'], $match: { ref } }) (your reaction)
  → parallel: resolve author avatars
  → render
```

Five parallel calls. One table. Different collections and filters.

## TODO

- [ ] Reaction toggle — tap to react, tap again to change, tap again to remove
- [ ] Comment threading — nested replies via parent_ref
- [ ] Comment pagination — load more on scroll
- [ ] Share flow — attach post to a different group (add doc_groups entry)
- [ ] Report post — create document in moderation collection (future)
- [ ] Reaction animation — client-side, no protocol impact

## Proof

Post detail is one document read, plus queries for reactions and comments — all documents in the same table. The `ref` type links everything. The `collection_name` distinguishes reactions from comments from posts. No dedicated tables. No dedicated endpoints. The protocol handles it.