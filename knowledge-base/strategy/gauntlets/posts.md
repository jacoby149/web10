# Posts gauntlet — create, edit, delete, visibility, repost

[← back to the gauntlet doctrine](./README.md)

A post is a `posts` doc. Visibility is controlled by groups: public → discover +
the author's followers group; friends → the author's followers group; private →
the author's close-friends group (`posts.ts`). The post carries `text`,
`media_refs`, `tags`, `visibility`, and the owner actions (edit, delete,
visibility toggle, share/repost) in the kebab menu.

This is the broadest gauntlet: it drives the post lifecycle across **three media
types** (text, image, video), because the post card renders differently per type
and a bug in one type's card can break the owner actions or the reaction row.

## The surface

- **Where it shows:** the composer (create), the `PostCard` (feed/profile), the
  `DiscoverCard` (discover), the `PostLightbox` (deep link).
- **Testids:** `data-testid="post-composer"`, `"post-submit"`, `"post-card"`,
  `"post-options-button"` (the kebab), `"post-option-edit"`,
  `"post-option-delete"`, `"post-option-visibility"`, `"post-option-share"`,
  `"media-image"`, `"media-video"`, `"media-carousel"`.
- **The truth:** the post doc by `doc_id` → `body.text`, `body.media_refs`,
  `visibility`, `deleted`; the group attachments (which groups the post is in).

## The state machine (per media type)

Driven for **text**, **image**, and **video** (the card differs; the lifecycle is
the same). `reload` = `page.reload()` + re-assert.

```
cold              (no post)
→ compose + send  post exists, text/media renders, in the feed + (public: discover)
→ RELOAD          post persists (text/media intact)
→ edit text       text changes
→ RELOAD          the edit survives
→ toggle visibility (public ↔ private)  the group attachments change
→ RELOAD          the visibility survives (the post appears/disappears from the feed)
→ share/repost    the repost is recorded
→ delete          the post is gone (tombstone)
→ RELOAD          the post is gone (no phantom)
```

**The media-type permutations:**
- **Text:** the composer's text path; the card renders `TextWithLinks`.
- **Image:** attach an image (the presigned upload path) → the card renders
  `media-image` at the natural ratio → the lifecycle.
- **Video:** attach a video (the upload + transcode path) → the card renders the
  HLS player (transcoded) or native (raw) → the lifecycle. The video post is the
  one that exercises the transcode pipeline *and* the post lifecycle together.

**The visibility truth:** a public post is attached to the discover group + the
author's followers group; a private post is attached to the close-friends group
only. The gauntlet asserts the *group attachments* (the DB truth), not just "the
post disappeared from the feed" — a post that disappears from the feed but is
still attached to the discover group is a visibility bug the UI assertion would
miss.

## The forks

- **Create:** the composer (feed) is the reference. (The profile composer, if it
  exists, is a fork.)
- **Owner actions:** the kebab menu on the `PostCard` (feed) vs. the
  `PostLightbox` (deep link) — two code paths for edit/delete/visibility. Drive
  each.
- **Read:** the feed read vs. the discover read vs. the profile read — the same
  post, three surfaces. The post must render identically (same text, same media,
  same counts) on all three.

## The truth fields

- **DB:** the post doc by `doc_id` → `text`, `media_refs` (count + types),
  `visibility`, `deleted`; the `doc_groups` rows (which groups).
- **UI:** the card's text, the media count + type (image/video), the visibility
  (the feed membership), the owner-menu availability (own post vs. stranger's).

## The anti-tests

- **I3:** a stranger's private post → not in the reader's feed, not readable by
  id (403/404).
- **Edit a stranger's post:** the owner menu is absent on a non-own post (the
  3.79.4 bug — the lightbox showed owner actions on every post while signed in).
- **Delete + re-create:** delete a post, create a new one with the same text →
  the new post is distinct (no tombstone collision).
- **Visibility round-trip:** public → private → public → the post returns to the
  feed (the 3.68.0 duplicate-post bug — a public→private→public that duplicated
  the post).

## The multi-user dimension (Rule 4)

- **Cross-user (browser, 2 contexts):** user A posts (public); user B (who
  follows A, separate context) → A's post is in B's feed. User D (who does not
  follow A) → A's post is NOT in D's feed (I3 at the feed level). A's post also
  appears on the discover board (public).
- **The post + reaction at scale (API floor):** a post that 100 users like + 50
  users comment → the like count is 100, the comment count is 50, the post
  renders correctly for every viewer.
- **The visibility at N (API floor):** a public post visible to 100 followers; a
  private post visible to 0 (only the close-friends group). The group attachments
  are correct at scale.

The cross-surface scale tests live in [scale.md](./scale.md).

## The bites

1. **API floor** — the lifecycle via raw calls, the doc + group attachments
   asserted after each step.
2. **Browser gauntlet — text post** — the full lifecycle via the composer +
   kebab, truth + reloads.
3. **Browser gauntlet — image post** — the upload + lifecycle.
4. **Browser gauntlet — video post** — the upload + transcode + lifecycle.
5. **Browser gauntlet — the forks** — the owner actions from the lightbox; the
   same post read on feed + discover + profile.
