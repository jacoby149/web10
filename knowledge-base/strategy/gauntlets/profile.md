# Profile gauntlet — follow, the face, the profile feed

[← back to the gauntlet doctrine](./README.md)

The profile is a user's public surface: their face (avatar + banner, which are
posts' media — `ProfileMediaLightbox`), their posts (the insta-shaped grid or the
facebook-shaped feed lens), and the follow control. The profile feed lens renders
the same `PostCard` as the feed (the reaction/comment gauntlets cover those);
this gauntlet covers the *profile* surface: the follow, the face, and the
profile's post set.

## The surface

- **Route:** `/u/:username` (the profile), `/u/:username/p/:postId` (the post
  deep link → the lightbox).
- **Testids:** `data-testid="follow-button"`, `"profile-face"` (the avatar),
  `"profile-banner"`, the profile posts grid, `"profile-feed"` (the feed lens),
  `"profile-post-cell"`, `"profile-media-lightbox"`.
- **The truth:** the user's profile doc (the `profile` service — display name,
  `avatar_ref`, `banner_ref`), the user's posts (the `posts` docs in the user's
  own followers + close-friends groups), the reader's follow state (the
  `group_members` row in the user's followers group).

## The state machine

```
cold (a reader viewing a creator's profile)
→ reader follows the creator   the follow button → Following; the membership row
→ RELOAD                        the follow persists
→ reader unfollows              the follow button → Follow; the membership row gone
→ RELOAD                        the unfollow persists
→ owner sets the face (avatar)  the avatar_ref points at a post's media
→ RELOAD                        the face persists (the media resolves)
→ owner sets the banner         the banner_ref points at a post's media
→ RELOAD                        the banner persists
→ owner posts                   the post appears in the profile's post set
→ RELOAD                        the post persists in the profile
→ owner deletes a post          the post leaves the profile's post set
→ RELOAD                        the delete persists
```

**The follow truth:** the follow is a join of the creator's followers group. The
gauntlet asserts the `group_members` row (the DB truth) AND the follow button's
label, across a reload. (This overlaps the feed gauntlet's membership — the
profile is where the follow button lives, the feed is where the consequence
shows. Both assert the same row.)

**The face truth:** the face (avatar/banner) is a post's media, referenced by
`avatar_ref`/`banner_ref` on the profile doc. The gauntlet asserts the profile
doc's refs AND that the media resolves (the face renders the post's media, not a
broken image). The "the face IS a post's media" data model is the load-bearing
assertion — a face that points at a ref that doesn't resolve is a bug.

**The profile post set truth:** the profile shows the user's OWN posts (the
`readMyPosts` path — the user's own followers + close-friends groups, NOT the
user's feed). The gauntlet asserts the profile's post set is the user's own posts
(the "my profile shows everybody's posts" bug, 3.79.3-class) and that a delete
removes the post from the set.

## The forks

- **Follow:** the follow button on the profile is the reference. (The suggested-
  users rail follow is a fork — see the feed gauntlet.)
- **Face:** the face lightbox (view + pick) is the reference. The owner's hover
  upload buttons are forks.
- **Post set:** the insta-shaped grid vs. the facebook-shaped feed lens — the
  same posts, two renderings. Drive both (the posts must be identical).

## The truth fields

- **DB:** the profile doc (display name, `avatar_ref`, `banner_ref`), the user's
  own posts (the `readMyPosts` set), the reader's follow state (the membership
  row).
- **UI:** the follow button's label, the face (the resolved media), the banner,
  the profile's post set (the grid cells / the feed cards).

## The anti-tests

- **I3:** a stranger's private posts are not in their profile's public post set
  (only the public/friends posts are).
- **Face on a deleted post's media:** the face ref points at a deleted media doc
  → the designed fallback (not a broken image).
- **Follow yourself:** the follow button is absent on your own profile.
- **The return run:** following a creator you already follow does not create a
  duplicate membership row (the idempotency — the state rule).

## The multi-user dimension (Rule 4)

- **Cross-user (browser, 2 contexts):** user A follows creator C; C's profile
  (separate context) → the follower count includes A. A's feed → C's posts
  appear. (The follow is per-user; the follower count is the aggregate.)
- **The follow burst (API floor, 100 users):** 100 users follow a creator in
  parallel → the follower count is 100, the `group_members` table has 100 distinct
  rows (no duplicates).
- **The profile post set at N (API floor):** a creator with 100 followers and 50
  posts → every follower's view of the creator's profile shows the same 50 posts
  (the public/friends ones), and no follower sees the creator's private posts.

The cross-surface scale tests live in [scale.md](./scale.md).

## The bites

1. **API floor** — the follow (membership row) + the profile doc + the post set,
   asserted after each step.
2. **Browser gauntlet — follow/unfollow** — the follow permutation, truth +
   reloads.
3. **Browser gauntlet — the face** — set the avatar/banner → the media resolves →
   reload.
4. **Browser gauntlet — the post set** — post → appears → delete → leaves, truth
   + reloads, on both the grid and the feed lens.
