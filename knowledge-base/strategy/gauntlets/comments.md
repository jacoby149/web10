# Comments gauntlet — the thread, tortured

[← back to the gauntlet doctrine](./README.md)

A comment is a `comments` doc with `ref_value` = the target post's `doc_id`. The
thread is the shared `<CommentThread>` mounted by `<PostActions>` (the
`comments="inline"` axis). The count is the number of comment docs by `ref_value`.
The thread's live count wins once open; the seed count is the prop.

## The surface

- **Where it shows:** the comment button + inline thread on every post — Feed,
  Discover, Profile feed, Lightbox, Groups (the same `<PostActions>`).
- **Testids:** `data-testid="comment-button"` (the toggle), `"comment-thread"`
  (the open thread), `"comment-input"`, `"comment-send"`, and per-comment rows.
- **The truth:** the comment docs for the target post by `ref_value` → the count,
  the list of comment texts, and (for the reply case) the reply's `ref_value`
  pointing at the parent comment.

## The state machine

```
cold              count:0  thread:closed
→ open thread     count:0  thread:open  (empty state)
→ type + send     count:1  thread:open  (the comment renders)
→ RELOAD          count:1  thread:closed (the count survives; the thread re-seeds)
→ open thread     count:1  thread:open  (the comment is there)
→ edit comment    count:1  (the text changes)
→ RELOAD          count:1  (the edit survives)
→ delete comment  count:0  (the comment is gone)
→ RELOAD          count:0  (the delete survives)
→ send 5 comments count:5
→ MASH send ×5    count:10 (no dedup — comments stack by design, unlike reactions)
```

The comment **count** is the load-bearing assertion: it must match the DB count
after every send/edit/delete, and across every reload. The "the count is wrong"
bug (a send that doesn't bump the count, a delete that doesn't drop it, a reload
that resets it to the seed) is caught by the truth rule.

**Replies (the open item in `post-actions.md`):** when the thread supports
replies, the reply's `ref_value` points at the parent comment (not the post). The
gauntlet extends to: reply → the reply renders under the parent → RELOAD → the
reply is still there. (Gated on the reply feature shipping; the plan reserves the
step.)

## The forks

The same state machine from each surface (Feed is the reference; the others are
the like surface's forks). The comment path is the shared `<CommentThread>`, so
the forks differ mainly in *which group the comment is written to* (the post's
group vs. the discover group) and *which read seeds the count*. Drive the
**send → RELOAD** sub-sequence from each fork.

## The truth fields

- **DB:** the comment docs by `ref_value` → `count`, the list of `body.text`.
- **UI:** the comment button's text (== `count`, empty when 0), the thread's
  open/closed state, the rendered comment texts (== the DB list, in order).

## The anti-tests

- **I3:** a comment on a post the reader can't read → not created; the thread
  shows the post as unreadable.
- **Revoked contract:** a comment with the contract revoked → 403, the thread
  rolls back, the count does not bump.
- **Deleted post:** a comment on a deleted post → the refresh read returns no
  comments; no phantom count.
- **Empty state:** an open thread on a post with no comments → the designed empty
  state renders (not a crash, not a blank).

## The multi-user dimension (Rule 4)

- **Cross-user (browser, 2 contexts):** user A comments on a post; user B (separate
  context) views the post → the thread shows A's comment. B comments → the thread
  shows both, in order. **Reload B** → both persist.
- **The comment burst (API floor, 100 users):** 100 users comment on the same
  post in parallel → the count is exactly 100, the thread has 100 distinct
  comments (no lost updates).
- **The reply at scale (when replies ship):** a post with 100 comments, each with
  replies → the thread renders the full tree, the count is correct.

The cross-surface scale tests live in [scale.md](./scale.md).

## The bites

1. **API floor** — send/edit/delete via raw calls, the count asserted after each
   step + the mash.
2. **Browser gauntlet — Feed × text post** — the full permutation, truth +
   reloads.
3. **Browser gauntlet — the forks** — send → RELOAD from Discover, Profile,
   Lightbox, Groups.
4. **Browser gauntlet — image + video posts** — the comment row on a media post.
