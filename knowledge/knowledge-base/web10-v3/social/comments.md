# Comments — threaded replies + comment likes

A comment is a fan talking at a post. A reply is a fan talking at another
fan. A comment like is a fan saying "this comment deserves eyes." This doc
defines what a comment *is* on the wire, how a thread is built from one read,
and how the client renders it. The engagement model (D62) defines what a
comment *is* (a document in the engager's own service, joined to its target
by `ref_value`); `post-actions.md` defines the engagement row that mounts the
thread; this doc fills in the thread itself — the part that was a flat list.

## The use case

A fan opens a post's comments. They see a conversation, not a wall: top-level
comments, and under each one, its replies, indented. They tap "Reply" on a
comment and their compose box targets that comment, not the post. They tap
the heart on a comment and it likes the comment — the post's like count is
untouched. That is the whole feature.

## What a comment is on the wire

A comment is a `comments` doc. The shape is fixed by two rules:

1. **`ref_value` is always the post's `doc_id`** — for top-level comments
   *and* for replies.
2. **A reply carries `body.parent_id`** — the parent comment's `doc_id`. A
   top-level comment has no `parent_id`.

```
top-level:  ref_value = post-123        body = { text, post_id, author_username, … }
reply:      ref_value = post-123        body = { text, post_id, parent_id: cm-456, author_username, … }
```

### Why `ref_value` stays the post, even for replies

This is the load-bearing decision, and it is not a preference — it is what
keeps every existing count true:

- **The post's comment count** is a server-side `GROUP BY ref_value` over
  `comments WHERE ref_value IN (postIds)` (the D73 feed query's engagement
  join, the feed's `readFeedEngagementCounts`, the discover board's client
  tally). If a reply's `ref_value` pointed at the parent comment, the reply
  would vanish from the post's count the moment it was written — the feed
  would show "2 comments" under a post with a 12-deep conversation.
- **The thread read is one call.** `readComments(postId)` (the safe-query
  `ref` filter) returns the *entire* conversation — top-level and replies —
  in a single read, because every doc in it shares the post as its
  `ref_value`. The client groups by `parent_id` and builds the tree. No
  per-comment fetch, no N+1, no second read to "expand" a thread.
- **The convention is already in the data.** The YouTube import pipeline
  (D62 comment join) writes imported replies exactly this way:
  `ref_value = post_id`, `body.parent_id = <parent comment id>`
  (`api/app/services/importers/youtube.py`). This doc is the spec the
  importer was already following.

`body.post_id` is kept as a convenience (the nudge path resolves the post
author from it), but `ref_value` is the join key — the read's `ref` filter,
the counts, and the I3 boundary all key off `ref_value`.

### The reply write

`createComment` writes `ref_value = comment.post_id` and `parent_id` in the
body (a reply passes `parent_id`; a top-level comment does not). The D69
nudge targets the **comment author** for a reply, the **post author** for a
top-level comment — the existing behavior, unchanged.

## Comment likes — a reaction on the comment

A comment like is a `reactions` doc with `type: 'like'`,
`target_service: 'comments'`, `target_id` = the comment's `doc_id`, and
`ref_value` = the comment's `doc_id`. It is the same shape as a post like —
the engagement model (D62) already defines reactions as documents joined to
their target by `ref_value` — so a comment like needs **zero node changes**:
no new collection, no new endpoint, no schema.

The same invariants as post likes apply, verbatim:

- **One reaction per user** — `like` XOR `dislike` on a comment, enforced by
  the same `setReaction` / `toggleReactionKind` primitives (they take a
  `targetService` now, so the doc's `target_service` field is honest:
  `'comments'` for a comment, `'posts'` for a post).
- **Username-alone ownership** (the 3.87.2 rule): the "is this mine?" match
  is `author_username === token.username` alone.
- **Self-heal** — stacked duplicate docs collapse to the newest on the next
  interaction (the same filter-not-find pass).
- **Independent of the post's like** — liking a comment never touches the
  post's like, and vice versa. The two are different `ref_value`s.

The comment's like count is the number of `type: 'like'` reactions whose
`ref_value` is the comment's `doc_id` — read with the same `readReactions`
that reads a post's likes (the ref filter does the scoping).

## The thread render

The thread is a tree, rendered from the one read:

```
top-level comment
├─ like · reply · count
└─ reply (indented)
   ├─ like · reply
   └─ reply
      └─ …
```

Rules:

- **Top-level first, replies nested under their parent.** A reply whose
  parent is not in the read (deleted, or in a group the reader can't read)
  renders as top-level — the thread degrades, it never drops content.
- **One level of visual indent.** Replies render indented under their
  parent; a reply-to-a-reply nests one level deeper. The indent is the
  thread — no connector lines, no collapse-by-default.
- **Every comment has the same row:** author, text, a like button (count +
  filled when the reader liked it), and a Reply action. The reply action
  opens the compose box *targeting that comment* (the box shows who it
  replies to; cancel returns to the post-level compose).
- **The compose box is one.** There is a single compose input at the bottom
  of the thread. "Reply" retargets it (it shows `Replying to @name —` with a
  cancel); it does not spawn a per-comment input. The post-level compose and
  a reply compose are the same box in two states.
- **Counts are live.** The thread's comment count (the number on the
  comment button) counts every doc in the read — top-level *and* replies —
  so a reply ticks the count.

## The data seam

The shared thread (`@web10/discover`) is presentational — the data is
injected, the same way the discover card injects its data (D74). The seam
grows two seams:

- `readComments(postId, groups)` — unchanged: returns the whole
  conversation (top-level + replies), each item carrying `parent_id` when it
  is a reply.
- `createComment({ postId, text, parentId?, … })` — gains `parentId?`:
  absent = top-level, present = a reply to that comment.
- `onToggleCommentLike?(commentId)` — the app's comment-like writer
  (optimistic + rollback on the app, the same pattern as the post like).
  Absent (e.g. `remote` mode) → the like renders display-only (count, no
  tap target), the same rule as the post like in remote mode.

The read seam returns `likeCount` + `likedByMe` per comment when the app
resolves them (web10-social does, from the reactions read); the thread
renders what it is given and degrades to no like UI when a seam is absent.

## Security invariants

- **I3 holds** — a comment (or a reply, or a comment like) attaches to the
  same group as the post's other comments. For a group post, writing a
  comment requires membership in that group (the same gate as before). The
  thread read is a `ref`-filtered read through the safe-query engine, so a
  reader only ever sees comments in groups they can read.
- **No escalation** — a comment like is a content-free `reactions` doc
  keyed to a comment the reader can already see (the thread read proved it).
  Liking a comment grants nothing the thread read did not.
- **The `parent_id` is not a security boundary** — it is a render hint.
  Access is decided by the group + `ref_value` read, never by the body.

## What this is not

- **Not infinite-expand.** The thread renders the whole conversation in one
  read (the safe-query `ref` filter returns every doc with the post as its
  `ref_value`). There is no "show more replies" pager — a post's
  conversation is one read, and a post with 10,000 replies is a
  moderation problem, not a pagination problem.
- **Not a notification change.** The reply nudge (D69) already targets the
  comment author; the notification row already deep-links to the post with
  the comment highlighted (`?comment=`). Nothing new here.
- **Not a ranking signal.** Comment likes do not feed the power-mean
  scorer (the scorer counts post reactions + top-level engagement). Wiring
  comment-level signal into ranking is a separate decision.

## Reference

- The engagement model (comments + reactions as docs, the `ref_value`
  join): `../overview.md` + `../../decisions.md` (D62)
- The shared engagement bar that mounts the thread: `./post-actions.md`
- The discover card that shares the thread (the data seam): `./discover-card.md`
- The comment + reaction data layers: `../../../../marketing/web10-social/src/data/comments.ts`,
  `../../../../marketing/web10-social/src/data/reactions.ts`
- The import pipeline that established the `parent_id` convention: `./import.md`
- The visual bar (tokens, states, the screenshot test): `../../../strategy/design.md`
