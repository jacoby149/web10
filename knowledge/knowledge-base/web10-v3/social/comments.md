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

1. **`ref_value` is the comment's PARENT** — the post's `doc_id` for a
   top-level comment, the parent comment's `doc_id` for a reply. This is the
   Facebook/Instagram model: a reply is queryable by its parent, which is what
   makes "view more replies" a clean server page.
2. **A reply also carries `body.parent_id`** — the parent comment's `doc_id`
   (redundant with `ref_value` on a reply, kept for the client + the nudge
   path). A top-level comment has no `parent_id`.

```
top-level:  ref_value = post-123        body = { text, post_id, author_username, … }
reply:      ref_value = cm-456          body = { text, post_id, parent_id: cm-456, author_username, … }
```

### Why `ref_value` is the parent (the Facebook model)

A hot post has thousands of comments. You cannot read them all in one call —
the thread must **page**. Paging needs the server to be able to pull "page N
of X" for two different X's: the post's top-level comments, and one comment's
replies. `ref_value` is the column the server filters on, so it must point at
the thing being paged:

- **Top-level comments** page on `ref_value = post_id` (cursor on
  `created_at`). "View more comments."
- **A comment's replies** page on `ref_value = comment_id` (cursor on
  `created_at`). "View more replies."

If a reply's `ref_value` pointed at the post instead, "view more replies"
could not be a server page — you'd have to read the post's *entire*
conversation and slice it client-side, which is exactly the unbounded read
this model exists to avoid. So replies ref their parent. That is the whole
reason, and it is the same call Facebook and Instagram made.

### The cost: the post's comment count is no longer one `GROUP BY`

Because replies no longer ref the post, `GROUP BY ref_value` over
`ref_value = post_id` counts only top-level comments. The post's **total**
comment count (the "N comments" badge) is now **top-level count + the sum of
each top-level comment's reply count**. Two ways to compute it:

- **Derived (what we ship):** the feed/board count stays a `GROUP BY
  ref_value` over the post (top-level only — cheap, exact, and the number the
  ranking knobs care about). The thread's *total* (top-level + replies) is
  computed by the client from the pages it has loaded + a per-comment reply
  count, or by a single recursive/summed query when the exact total is needed
  for the badge. At node scale a summed count is affordable; this is the seam
  where a **maintained counter** (Facebook's eventual answer at their scale)
  slots in later without a client change.
- **Maintained counter (the scale answer):** increment a counter on the post
  doc on every comment/reply write. Facebook runs this because a `COUNT(*)`
  per render is too expensive at their volume. We do not need it yet — the
  derived count is exact and cheap at node scale — but the model is shaped so
  the swap is a data-layer change, not a protocol change.

The load-bearing invariant is unchanged: **the count is decoupled from the
read.** The badge number never blocks on reading the thread, and the thread
never blocks on computing the badge.

### The reply write

A reply writes `ref_value = parent_id` (the parent comment's doc_id) *and*
`body.parent_id = parent_id` + `body.post_id = <the post>`. The `post_id` in
the body is what keeps the reply attributable to the post (the nudge path, the
import join, and any future "all comments on this post" query key off it). The
D69 nudge targets the **comment author** for a reply, the **post author** for
a top-level comment — unchanged.

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

## Photos in comments

A comment can carry up to **four photos** (the X/Twitter parity — a reply is a
text + a small photo grid, not a second post). The photos are **images only**
for v1; video in a comment is a separate, larger build (transcode + a player
in a compact thread row) and is deliberately out of scope.

### The wire: `media_refs`, the post's own convention

A comment's photos ride in `body.media_refs` — an array of **media doc_ids**,
exactly the convention a post already uses for its own media. There is no new
field vocabulary and **zero node changes**:

- **Write.** The composer uploads each photo through the standard media
  pipeline (presigned form → object storage → `confirm`, the same `uploadMedia`
  a post uses) and stores the returned doc_ids in `body.media_refs`. The media
  doc lands in `media_metadata` (where every upload lands); the comment body
  only ever carries the doc_id, never a URL (the document-typing rule).
- **Read.** The node's read path already runs `resolve_media_urls_in_docs` on
  **every** doc it serves — a post's `media_refs` are rewritten to resolved
  objects (`{doc_id, object_key, mime_type, width, height, read_url,
  thumbnail_url, …}`) with a fresh presigned `read_url`, keyed on the doc's
  **author** (the media owner). A comment is just another doc, so its
  `media_refs` are resolved by the same pass, for the same author. A reader who
  can read the comment gets the photos; the resolution is gated by the same
  group read that gated the comment (I3 holds — see below). No new endpoint, no
  new collection, no schema.

The client maps the resolved refs onto the shared thread's `MediaItem[]` (the
`read_url` → `url` rename) so the thread renders what it is given, the same way
it renders the injected like state.

### The render: a compact grid, not a carousel

A comment's photos render **below the text** as a bounded grid — a comment is a
dense row, not a media card:

- **1 photo** → a single image, full thread width, capped in height
  (`object-cover`, rounded, `loading="lazy"`).
- **2–4 photos** → a 2-column grid of square cells (`object-cover`).
- Every image carries its `alt_text` (or an empty alt when decorative); a
  missing/unresolvable ref is dropped, never a broken-image icon.

The compose box gets a photo-attach control (an image icon) that opens the OS
file picker (`accept="image/*"`, multiple), shows a removable preview tray
(capped at 4), and uploads the picked files **on send** (the `PostComposer`
idiom: preview locally, upload at submit) through an injected `uploadMedia`
seam. The seam is app-owned — the shared thread knows nothing about wapi; it
only needs the resulting doc_ids (for the write) and a local preview (for the
tray). Absent the seam (e.g. `remote` marketing mode) the attach control is
hidden and the thread degrades to text-only, exactly as it does today.

### The data seam (the write side)

`createComment` gains `mediaRefs?: string[]` (the uploaded doc_ids) and writes
them to `body.media_refs`. The shared `CreateComment` seam carries the same
optional `mediaRefs`; the social app's `createThreadComment` threads it through.
The read side needs no new seam — the resolved refs arrive on the comment doc
itself and the app maps them to `MediaItem[]` before handing the page to the
shared thread.

## The thread render

The thread is a tree, rendered from **paged reads** (not one big read):

```
top-level comment
├─ like · reply · count
└─ reply (indented)
   ├─ like · reply
   └─ reply
      └─ …
"View more replies"          ← a comment with more replies than shown
…
"View more comments"         ← the post has more top-level comments
```

Rules:

- **Top-level first, replies nested under their parent.** A reply whose
  parent is not in the loaded set (deleted, or in a group the reader can't
  read) renders as top-level — the thread degrades, it never drops content.
- **One level of visual indent.** Replies render indented under their
  parent; a reply-to-a-reply nests one level deeper. The indent is the
  thread — no connector lines, no collapse-by-default.
- **Paged, with the two "view more" affordances (the Facebook model).**
  The thread opens with the first page of top-level comments (a bounded
  read). A hyperlink-style **"View more comments"** at the bottom loads the
  next top-level page and appends. Each comment shows its first few replies;
  if it has more, a **"View more replies (N)"** link under it loads that
  comment's next reply page. Both are server cursor pages — a 10k-comment
  post opens in one bounded read and grows on demand.
- **Every comment has the same row:** author, text, a like button (count +
  filled when the reader liked it), and a Reply action. The reply action
  opens the compose box *targeting that comment* (the box shows who it
  replies to; cancel returns to the post-level compose).
- **The compose box is one.** There is a single compose input at the bottom
  of the thread. "Reply" retargets it (it shows `Replying to @name —` with a
  cancel); it does not spawn a per-comment input. The post-level compose and
  a reply compose are the same box in two states.
- **Counts are live.** A newly posted comment/reply appends to the loaded
  tree and ticks the visible count; the badge total is the decoupled count
  (see above), not a re-read of the thread.

## The data seam

The shared thread (`@web10/discover`) is presentational — the data is
injected, the same way the discover card injects its data (D74). The seam is
**paged**:

- `readComments(postId, groups, { cursor?, limit? })` — one page of
  **top-level** comments (the server filters `ref_value = postId`, orders by
  `created_at`, applies the keyset cursor). Returns the page + a
  `next_cursor` (null when exhausted).
- `readReplies(commentId, groups, { cursor?, limit? })` — one page of a
  comment's **replies** (the server filters `ref_value = commentId`, same
  cursor). Returns the page + a `next_cursor`. This is the "view more
  replies" page.
- `createComment({ postId, text, parentId?, … })` — `parentId` absent =
  top-level (`ref_value = postId`), present = a reply (`ref_value =
  parentId`).
- `onToggleCommentLike?(commentId)` — the app's comment-like writer
  (optimistic + rollback on the app, the same pattern as the post like).
  Absent (e.g. `remote` mode) → the like renders display-only (count, no
  tap target), the same rule as the post like in remote mode.

Each page's comments carry `likeCount` + `likedByMe` when the app resolves
them (web10-social does, from the reactions read — over the *loaded*
comments only, never the whole thread); the thread renders what it is given
and degrades to no like UI when a seam is absent.

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

- **Not a maintained counter (yet).** The post's total comment count is
  derived (top-level `GROUP BY` + summed reply counts), not a write-time
  counter. That is the Facebook model at *their* scale; at node scale the
  derived count is exact and cheap. The model is shaped so a counter slots
  in later as a data-layer change, not a protocol change.
- **Not "Top comments" ranking (yet).** The thread pages chronologically
  (`created_at`). Facebook's default is engagement-ranked "Top comments";
  we don't have a comment-ranking signal yet, so we ship "Most recent"
  order. Ranking is a separate decision (see the ranking note below).
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
