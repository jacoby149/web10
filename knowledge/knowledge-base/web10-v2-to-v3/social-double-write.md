# web10-social: The Double-Write Problem

## The Core Issue

web10-social has to talk to two separate data surfaces for the same action. Not for posts — those are fine. For **reactions, comments, and follows**, the client writes to the user's CRUD collection AND manually mirrors to the public ledger. The mirror is fire-and-forget with no retry. If it fails, the data is silently out of sync.

## What Works — Posts

Post creation is clean. The client writes once, the server handles the rest:

```
Client → POST /alice/public_posts → Server
                                    → CRUD write (awaited)
                                    → background_index_post (server-side hook)
                                    → discovery index upsert
```

The discovery index is a server-side projection. The client never touches it. This is the right pattern.

**Code:** `marketing/web10-social/src/data/posts.ts:37-41`

```ts
export async function createPost(post) {
  const wapi = getWapi();
  const service = post.visibility === 'public' ? 'public_posts' : 'private_posts';
  return wapi.create<PostRecord>(service, post);
}
```

One call. One write. Server handles indexing.

## What's Broken — Reactions, Comments, Follows

These three actions do a **client-side double write**. The CRUD record is awaited. The ledger mirror is fire-and-forget:

**Reactions** — `src/data/reactions.ts:43-70`

```ts
const record = await wapi.create<ReactionRecord>('reactions', reaction);  // CRUD
createPublicEntry({ ... }).catch((e) => {  // ledger — fire-and-forget
  console.error('ledger mirror failed (reaction create):', e);
});
```

**Comments** — `src/data/comments.ts:58-85` — same pattern. Update is worse: CRUD update, then ledger delete, then ledger create (three calls). Delete is four calls (read, query ledger, delete ledger, delete CRUD).

**Follows** — `src/data/follows.ts:118-186` — triple write: CRUD, ledger mirror, plus inbox backfill from the discovery API.

## Why The Ledger Exists

The public ledger (`web10.public`) is the only cross-user read surface. Because of invariant I3, you can't read another user's collection directly for engagement counts. The ledger is the single write-open surface where anyone can record structured interactions, and anyone (including anon) can read them.

The follower count reads from the ledger, not the `follows` collection. The engagement score on the discovery board derives from the ledger. The marketing-ui FeedPreview reads the ledger.

**The ledger IS the source of truth for public engagement.** But the client is responsible for keeping it in sync.

## The Problems

**1. Fire-and-forget mirrors.** Every ledger write uses `.catch(() => { ... })` with no retry. If the network blips, the CRUD record exists but the engagement count is wrong. No reconciliation mechanism exists. The next page load shows stale counts.

**2. Read-then-write races.** `toggleReaction()` reads existing reactions, then creates or deletes. Two simultaneous toggles can both read "not reacted" and both create. Same for `followUser()` — both can read "not following" and both create.

**3. Delete is a read-then-delete.** `deleteComment()` reads the comment to find its `post_id`, queries the ledger, deletes ledger entries, then deletes the CRUD record. If the comment was already deleted between read and delete, the ledger cleanup operates on stale data.

**4. Fan-out is O(followers) on the client.** Post creation fans out to every follower's inbox from the browser — `Promise.allSettled` over the follower list. At demo scale this works. At 10,000 followers it hangs the tab.

**5. Two feed read paths.** The friends feed pulls directly from each followee's `public_posts` (one read per person you follow). The discover feed reads the discovery index. They're different data, different queries, different code paths.

## The Double-Write Map

| Action | Client Writes | Sync Risk |
|--------|-------------|-----------|
| Create post | 1 (CRUD only, server indexes) | None |
| Delete post | 1 (CRUD only, server un-indexes) | None |
| Create reaction | 2 (CRUD + ledger, fire-and-forget) | **High** |
| Create comment | 2 (CRUD + ledger, fire-and-forget) | **High** |
| Update comment | 3 (CRUD update + ledger delete + ledger create) | **High** |
| Delete comment | 4 (read + ledger query + ledger delete + CRUD delete) | **Medium** |
| Follow | 3 (CRUD + ledger + inbox backfill) | **High** |
| Unfollow | 2 (CRUD update + ledger delete) | **Medium** |

## What v3 Should Do

The pattern that works for posts — **server-side hooks** — should apply everywhere. When a reaction is created via CRUD, the server should automatically write the ledger entry. When a follow is created, the server should write the ledger entry. The client makes one call. The server handles the rest.

The hooks already exist for posts (`_index_post_create`, `_index_post_delete` in `crud.py`). The same mechanism should handle reactions, comments, and follows. The ledger mirror should be a server-side concern, not a client-side chore.

The fan-out should move server-side too. Post creation should trigger a background task that writes to followers' inboxes — not a client-side `Promise.allSettled` over the follower list.

The result: every action is one client call to CRUD. The server handles all projections. The client never manages sync between two data surfaces again.