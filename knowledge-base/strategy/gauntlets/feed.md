# Feed gauntlet — the following feed, tortured

[← back to the gauntlet doctrine](./README.md)

The feed is the "following" feed: the reader's own posts + posts from people the
reader follows. It reads the **followers groups only** (`getFeedGroups` — the
reader's own + the ones they follow), minus discover/DM/community/app-storage
groups. A follow is a join of the creator's followers group; an unfollow is a
leave. The feed is ranked by the D36 knobs (server-side power-mean sort),
deep-linkable (`?knobs=`) and persisted to the settings service.

This is the surface the operator lives in, and it is where "my feed shows
everybody's posts" / "my post isn't in my feed" / "the feed forgot my like" bugs
live. The gauntlet drives the feed *membership* (follow/unfollow) and the feed
*content* (the posts that appear/leave) with the truth asserted.

## The surface

- **Route:** `/feed`.
- **Testids:** `data-testid="post-composer"`, `"post-card"`, `"feed-skeleton"`,
  `"feed-empty"`, the knob rack (`KnobRack`), `"like-button"` / `"dislike-button"`
  / `"comment-button"` (per card — the reaction/comment gauntlets cover those;
  this gauntlet covers the *feed* read + membership).
- **The truth:** the reader's followers groups (the DB membership rows), and the
  posts attached to those groups (the feed read). The feed's truth is *two
  things*: the membership (who the reader follows) and the content (which posts
  are in those groups).

## The state machine

```
cold (fresh viewer, follows nobody)
→ viewer follows creator    membership: creator's followers group
→ creator's post appears in /feed
→ RELOAD                    the follow persists; the post is still in the feed
→ viewer unfollows creator  membership: (none)
→ creator's post leaves /feed
→ RELOAD                    the unfollow persists; the post is gone
→ viewer posts (own)        the post is in the viewer's OWN feed (own followers group)
→ RELOAD                    the own post persists in the own feed
→ viewer follows a 2nd creator  both creators' posts in the feed
→ knobs: Newest → Most Loved  the ranking changes (server-side re-read)
→ RELOAD                    the knob state persists (?knobs= + settings)
```

**The membership truth (the load-bearing assertion):** after a follow/unfollow,
assert the DB membership row (the `group_members` row for the viewer in the
creator's followers group) AND the feed content (the post appears/leaves). A
follow that updates the button but not the membership row, or a membership row
that doesn't change the feed, is a bug the UI-only assertion misses.

**The own-post truth:** a viewer's own post is attached to the viewer's OWN
followers group (the `createPost` → `ensureFollowers` path). The gauntlet asserts
the own post is in the viewer's feed (the own followers group is in
`getFeedGroups`) and NOT in a stranger's feed.

**The knobs truth:** a knob twist is a server-side re-read (the `sort` config
carried to the node). The gauntlet asserts the ranking changes (the post order)
AND the knob state persists across a reload (`?knobs=` + the settings service).

## The forks

- **Follow:** the follow button on the creator's profile is the reference. (The
  "suggested users" rail follow, if present, is a fork.)
- **Post:** the composer (feed) is the reference.
- **Read:** the feed read is one path; the same posts are also read by the
  discover read (public posts) and the profile read. The feed gauntlet asserts
  the feed read specifically (the followers-groups-only filter).

## The truth fields

- **DB:** the `group_members` rows for the viewer (which followers groups they're
  in); the posts attached to those groups (the feed read by `ref_value`/group).
- **UI:** the follow button's label (Follow/Following), the feed's post list
  (which posts render), the knob rack's active preset.

## The anti-tests

- **I3:** a stranger who never followed cannot read the creator's followers group
  (the existing `social-groups` anti-test — migrated in).
- **DM/community leak:** a DM message (a `posts` doc in a DM group) does NOT
  appear in the feed (the 3.70.2 bug); a community post does NOT appear in the
  feed (the 3.70.0 bug).
- **Knob deep-link:** a shared `?knobs=` link restores the ranking on a fresh
  load (the deep-link rule).
- **Empty feed:** a viewer who follows nobody sees the designed empty state (not
  a crash).

## The multi-user dimension (Rule 4)

- **Cross-user (browser, 2 contexts):** user A follows creator C; user B (who
  also follows C, separate context) → both A's and B's feeds show C's posts. A
  unfollows C → A's feed drops C's posts, B's feed still has them (the follow is
  per-user, not global).
- **The follow burst (API floor, 100 users):** 100 users follow a creator in
  parallel → the creator's follower count is 100, the `group_members` table has
  100 distinct rows (no duplicates — the ReplacingMergeTree dedup under
  concurrent writes).
- **The feed at 50 follows (API floor):** a user follows 50 creators, each with
  posts → the feed has all 50 creators' posts, ranked correctly. The
  `getFeedGroups` filter is correct at 50 groups.

The cross-surface scale tests live in [scale.md](./scale.md).

## The bites

1. **API floor** — follow/unfollow via raw group joins/leaves, the membership +
   feed content asserted after each step.
2. **Browser gauntlet — follow/unfollow through the app** — the full
   membership + content permutation, truth + reloads. (Migrates the existing
   `social-groups` gauntlet, adding the truth rule.)
3. **Browser gauntlet — own post** — compose → own feed → reload.
4. **Browser gauntlet — the knobs** — twist → ranking changes → reload → persists.
