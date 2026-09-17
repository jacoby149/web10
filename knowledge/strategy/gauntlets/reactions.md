# Reactions gauntlet — likes & dislikes, tortured

[← back to the gauntlet doctrine](./README.md)

The like button is the surface the operator actually touches, and it is the one
that has shipped the most "I can't trust this" bugs (the 28-likes stacking, the
forgot-my-like gap, the refresh-gone bug, the swap-delta). This gauntlet is the
proof that the doctrine works: it is the first one built, and it is the one that
would have caught every like bug on the first run.

## The surface

The reaction pair (like + dislike) on a post. One reaction per user, like XOR
dislike (`post-actions.md`). The data model: a reaction is a `reactions` doc with
`ref_value` = the target post's `doc_id`, `body.type` = `'like'` | `'dislike'`,
`author_key` = the bare username. Reactions are written to the **discover group**
(the default reaction group) and read back by `ref_value`.

**Where it shows (the forks):**
- Feed — `data-testid="like-button"` / `"dislike-button"` in `PostCard`
- Discover — the same testids in the shared `DiscoverCard`
- Profile feed — the same testids in `PostCard` (the profile's feed lens)
- Lightbox — the same testids in `PostLightbox` (the `/u/:username/p/:postId` deep link)
- Groups — the same testids in `GroupPostCard` (group-scoped)

Every fork renders the shared `<PostActions>`; the forks differ in *which handler
seeds the state and which group the reaction is written to*. That is exactly why
the fork rule matters here: a bug in the feed's refresh read does not show up in
the lightbox, and vice versa.

**The truth (the source of truth, not the UI):** the reaction docs for the target
post, read by `ref_value` over the discover group (where reactions are written).
The truth is `{ likeCount, dislikeCount, myLike, myDislike }` — the counts and
whether the *reader* holds each.

## The state machine

The full permutation, driven per post. Each step asserts the truth (UI == DB).
`reload` = `page.reload()` + re-assert (the return run).

```
cold            like:0  dislike:0  heart:off  thumb:off
→ click like    like:1  dislike:0  heart:on   thumb:off
→ click like    like:0  dislike:0  heart:off  thumb:off        (unclick)
→ click like    like:1  dislike:0  heart:on   thumb:off
→ RELOAD        like:1  dislike:0  heart:on   thumb:off        ← "refresh my like is gone"
→ click like    like:0  dislike:0  heart:off  thumb:off
→ RELOAD        like:0  dislike:0  heart:off  thumb:off        ← the un-like persists
→ click dislike like:0  dislike:1  heart:off  thumb:on
→ click like    like:1  dislike:0  heart:on   thumb:off        ← the swap (swap-delta bug)
→ RELOAD        like:1  dislike:0  heart:on   thumb:off        ← the swap persists
→ click dislike like:0  dislike:1  heart:off  thumb:on
→ RELOAD        like:0  dislike:1  heart:off  thumb:on
→ MASH ×10      settles at like∈{0,1}, dislike∈{0,1}, never 10  ← the 28-likes bug
```

The **mash** is the anti-stacking check: rapid-fire the heart 10 times and assert
the truth settles at a valid state (exactly 0 or 1 reaction for the reader, never
10). This is the 28-likes bug caught by the flow.

**The count semantics (the dislike counter):** the heart shows the *like* count,
the thumb shows the *dislike* count — each tally is its own type, not the total.
A post with 3 likes and 2 dislikes shows `3` on the heart and `2` on the thumb.
This is the fix for the operator's "there should be a dislike counter, likes and
dislikes should be the same."

## The forks (drive each, truth asserted)

The same state machine, driven from each surface. The feed is the reference; the
others are the forks. At minimum, drive the **like → RELOAD** sub-sequence from
each fork (the full permutation on the feed, the like+reload on the others — the
full permutation on every fork is the stretch goal):

| Fork | Route / trigger | The code path that differs |
|---|---|---|
| Feed | `/feed` → `PostCard` | `FeedScreen.handleToggleReaction` + `readFeedReactions` (the refresh read) |
| Discover | `/discover` → `DiscoverCard` | `DiscoverScreen.handleToggleReaction` + the board reaction read |
| Profile feed | `/u/:username` (feed lens) → `PostCard` | `ProfileFeed.handleToggleReaction` + the per-post `readReactions` |
| Lightbox | `/u/:username/p/:postId` → `PostLightbox` | `PostLightbox.handleToggleReaction` + the lightbox `readReactions` |
| Groups | `/groups/:id` → `GroupPostCard` | `GroupPostCard.handleToggleReaction` + the group-scoped `readReactions` |

The fork that has historically broken is the **feed's refresh read**
(`readFeedReactions` read the followers groups, not the discover group where
reactions are written — the "refresh my like is gone" bug). The gauntlet's
`click like → RELOAD → assert truth` on the feed is the step that catches it.

## The truth fields (what `assertTruth` compares)

For a target post, `assertTruth` reads:
- **DB:** the reaction docs by `ref_value` over the discover group → `likeCount`
  (count where `type='like'`), `dislikeCount` (count where `type='dislike'`),
  `myLike` (a doc where `author_key` = the reader's username AND `type='like'`),
  `myDislike` (same, `type='dislike'`).
- **UI:** the like button's `aria-pressed` (== `myLike`), the like button's text
  (== `likeCount`, empty when 0), the dislike button's `aria-pressed` (==
  `myDislike`), the dislike button's text (== `dislikeCount`, empty when 0).

The assertion: all four UI values match their DB counterparts. On a mismatch, the
failure names the field + the UI value + the DB value.

**The count-at-zero convention:** a count of 0 renders as an empty string
(`{count || ''}`), so the assertion is "the text is empty" for 0, not "the text
is '0'." The `aria-label` always carries the number (`"Like, 0 likes"`), so the
truth check can key off the `aria-label` for the exact count and the visible text
for the rendered state.

## The anti-tests (the broken states)

- **I3:** a like on a post the reader has no read access to → the reaction is not
  created (or the read returns empty); the UI shows the post as unreadable, not
  a silently-dropped like.
- **Revoked contract:** a like with the app contract revoked → the create 403s,
  the UI rolls back the optimistic update (the heart un-fills), the error is
  surfaced.
- **Deleted post:** a like on a post that was deleted → the refresh read returns
  no reactions; the UI does not show a phantom like.
- **Stranger's reaction:** a like by a *different* user on the same post → the
  reader's heart stays off (the truth is the reader's reaction, not the total);
  the like count includes the stranger's like.

## The multi-user dimension (Rule 4)

The single-user state machine above is one user's slice. The social dimension:

- **Cross-user (browser, 2 contexts):** user A likes a post; user B (separate
  context) views the same post → B's like count includes A's like, B's heart is
  off. B likes → both counts are 2. **Reload B** → B still sees both. (The "does
  B see A" test — the single-user gauntlet could never see a like that only
  updates A's count.)
- **The race (API floor, 100 users):** 100 users like the same post in parallel
  → the count is exactly 100, the DB has 100 distinct rows (no lost updates, no
  duplicates). 50 unlike → the count is 50, the dedup picks the tombstones. (The
  like storm — the data-integrity core, in `scale.md`.)
- **The double-session (API floor):** the same user, two contexts, likes in both
  → the count is 1 (the dedup keys on the user, not the session), not 2.

The cross-surface scale + race tests live in [scale.md](./scale.md); this is the
reaction-specific slice.

## The bites

1. **API floor** — the state machine via raw `create`/`delete` reaction calls,
   truth asserted after each step, the mash included. Proves the data layer +
   ClickHouse (the stacking, the swap, the delete, the group attach).
2. **Browser gauntlet — Feed × text post** — the full permutation via real
   clicks, truth asserted after each step + across the reloads. Proves the client
   (the optimistic update, the refresh read, the swap-delta). This is the
   load-bearing bite.
3. **Browser gauntlet — the forks** — the like → RELOAD sub-sequence from
   Discover, Profile feed, Lightbox, Groups. Proves each fork's refresh read.
4. **Browser gauntlet — image + video posts** — the feed permutation on an image
   post and a video post (the reaction path is post-type-agnostic, but the
   gauntlet proves it — a media post's card must not break the reaction row).

Bite 2 is the minimum that makes this surface trustworthy. Bites 1 + 2 + 3 are
the "bulletproof" set.
