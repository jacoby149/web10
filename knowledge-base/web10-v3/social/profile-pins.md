# Profile Pins — the posts you hold up

A creator's profile is their storefront. The newest thing floats to the top
on its own; the important thing does not. Pins are the curation: up to three
posts held at the top of the profile's Posts tab, in the order the owner
chose them, marked as pinned so nobody mistakes them for the latest drop.
The operator asked for exactly this on 11.11.2026 ("pinning on your profile
should be a thing").

## The use case

You are the owner. A launch post, a link to the new series, a statement —
three things you want every visitor to see before the chronological wall.
You open one of your posts, ⋯ → "Pin to profile". It moves to the top of
your profile's Posts tab and stays there (in the grid it wears a pin badge;
in the feed view a "Pinned" overline sits above the card) until you unpin it.
A visitor opening your profile sees the pinned posts first, in your order —
without any new read authority: a pinned post they cannot read (private,
close-friends-only) simply does not appear for them. The pin list is
presentation, not ranking: the feed, Discover, Shorts and the Media tab are
untouched, and pins never change how anyone else's content is ordered.

## The storage: the face doc, not a new service

The pin state is a `pinned_post_ids` body field on the owner's **profile
face doc** (the `profile` service, the owner's followers group — the same
doc that carries the display name, bio, avatar and banner refs,
`../db/attachments.md`'s neighbor and D58's public grant). One doc, one
write path, one public read path. That is not laziness, it is the grant
geometry: the followers group's `anyone` read grant is `profile`-service-only
(D58 point 7 — "the face is public, the content stays member-gated"). A
second service (or a second `profile` doc) would be invisible to visitors
until every existing public profile re-toggled its visibility — or worse,
would widen the public surface beyond the face. The face is already the
public presentation record; "which posts I hold up" is presentation.

The D60 mapping, stated plainly: this is app data in an app-owned service
(`profile`), written through the normal CRUD path by the owner alone, read
through the owner's own reads and the face's public read. No node table,
endpoint, function or column learned "pinned post". The node stays generic.

Rules:

- **At most 3 pins** (Instagram parity, `MAX_PROFILE_PINS`). The data layer
  throws on a fourth; the UI hides the pin item when the slots are full.
- **Order is display order.** The array's index 0 is the top slot. A new pin
  APPENDS (the owner's first pin is the top slot; re-pinning after unpinning
  moves it to the bottom of the pinned block). No separate sort key —
  pin/unpin is the whole editing model.
- **Personal content only.** Group-authored posts (`author_key` with
  `/groups/`) cannot be pinned — the pin menu item is not offered for them
  (a group's curation belongs to the group's surface, not the person's).
  Ads and products (`ad` / `product` tags, D89) are inventory, not content,
  and are excluded from every profile read that pins touch.
- **The list holds doc_ids, nothing else.** No body copy, no media refs.
  A pin is a pointer; the pointed-at post still has to pass its own read
  gate for the reader to see it (I3 — the pin is not an access grant, see
  below).

## The reads: no new authority, one bounded exact-id query

The profile screen already reads the posts (owner: `readMyPosts` over
followers + close-friends groups; visitor: `readUserPublicProfile` over
followers + discover, author-filtered — `../overview.md`). Pins add one
bounded read for the gap: pinned ids that are not on the loaded page
(the profile's first-50 read) are fetched by exact doc_id through the D73
query engine (`readPinnedPosts`, `../../strategy/../web10-v3/query-engine.md`
— the app writes its own SELECT, the node hardcodes nothing):

```
SELECT … FROM posts p
WHERE p.author_key = '<owner>' AND p.doc_id IN ('…', '…')
  AND NOT has(p.tags, 'ad') AND NOT has(p.tags, 'product')
ORDER BY toUnixTimestamp64Milli(p.created_at) DESC
LIMIT <missing>
```

scoped to the same groups the profile's main read uses (owner: followers +
close-friends; visitor: followers + discover), `prepare: { media: true,
ads: true }` so the pinned tiles render with minted media exactly like the
rest of the wall, `surface: 'profile'` so the D86 delivery logging treats
them as the profile's own views. Three ids maximum — this is the 5.9.2
exact-id pruning case, not a board read.

Failures are two-valued and mean different things:

- **The read itself failed (5xx, malformed) → `null`.** Unknown. The screen
  shows what it already has and does NOT self-heal (healing on unknown would
  wipe pins on a flaky node).
- **The read succeeded but returned fewer rows → those ids are dead** (the
  post was deleted, or the reader cannot see it). Dead ids drop out of the
  rendered wall. For the OWNER that is a real cleanup: the post no longer
  exists in their own groups, so the screen persists the cleaned list
  best-effort (the 5.16.0 stale-cover self-heal precedent — the owner's
  read heals the doc, the write is fire-and-forget and logged). For a
  VISITOR the missing rows may simply be unreadable (a private pinned post
  on a public profile), so visitors never write: they heal in-session only,
  the doc stays until the owner's next read.

### I3, stated for reviewers

The pin list is readable wherever the face is readable — anon on a public
profile included. It is three opaque doc_ids. Every pinned post still
travels its ordinary read path with its ordinary gate (the exact-id query is
group-scoped + author-filtered, the main reads are I3-gated as always), so
the worst a pin list leaks is "these three posts exist and the owner holds
them up" — and for a public profile the owner's public posts are already
publicly enumerable. A pinned PRIVATE post's content does not reach anyone
who cannot read that post. No access widened, nothing bypassed.

## The surfaces (and the ones it does not touch)

| Surface | Behavior |
|---|---|
| Profile Posts tab — grid | Pinned posts first, in pin order, each tile with the pin badge (top-left; the multi-media count stacks under it). The rest follow in the loaded order. |
| Profile Posts tab — feed | Same order; a "Pinned" overline (micro step, brand-tinted pin icon) above each pinned card. |
| Post ⋯ menu on the profile feed | "Pin to profile" / "Unpin from profile" for the owner's personal posts only. The pin item hides at 3 pinned (the slots are full). |
| Profile lightbox (grid tile → post detail) | The same two items in the shared post-detail owner menu (`PostIdentityRow`), for the owner's personal posts. |
| Media tab | Untouched — the media wall is the raw media list, not the curated post list. |
| Group profiles, the `/u/:username/p/:postId` permalink lightbox, Discover, feed, Shorts, Watch | No pin items, no pin ordering. Pins are the profile's presentation; nothing else re-orders or re-labels content. |

Optimistic toggle with rollback (the house pattern): the screen flips its
local pin list immediately (the wall re-orders on the same tick), persists
through `saveProfile` (the face doc's update-in-place path — the pins field
is only written when present, so a Bio edit that carries the loaded list
round-trips it and never clobbers it), and rolls back + toasts on failure.

## The code

- `marketing/web10-social/src/data/profilePins.ts` — `MAX_PROFILE_PINS`,
  `normalizePinnedPostIds`, `togglePinnedPostIds`, `orderPinnedPosts` (the
  pure, tested core), `readPinnedPosts` (the bounded exact-id D73 read),
  `savePinnedPostIds` (the face-doc write).
- `src/data/types.ts` — `ProfileRecord.pinned_post_ids` + the `fromV3DocToProfile`
  parse (string-only, deduped, capped — the wire is not trusted to be tidy).
- `src/data/profile.ts` — `saveProfile` writes `pinned_post_ids` only when the
  caller supplied it (absent = preserved, never nulled by a partial save).
- `src/components/Bio/UserProfileScreen.tsx` — load (pinned read + merge +
  owner self-heal), the ordered wall, the optimistic `handleTogglePin`, the
  lightbox wiring.
- `src/components/Bio/UserProfileScreen.tsx` (`WallTile`) — the pin badge.
- `src/components/Bio/ProfileFeed.tsx` — the "Pinned" overline + the card
  menu wiring.
- `src/components/Feed/FeedScreen.tsx` (`PostCard`) — the pin menu items
  (owner, personal posts, slot-full hidden).
- `src/components/Feed/PostDetail.tsx` + `src/components/Bio/PostLightbox.tsx`
  — the pin items in the shared post-detail menu (profile lightbox only).
- Tests: `src/__tests__/data/profilePins.test.ts` (pure core + the read's
  SQL/shape + the write), `src/__tests__/profilePinsScreen.test.tsx` (grid
  order + badge, feed overline + menu pin/unpin + rollback, the slot-full
  hiding, visitor private-pin exclusion, the lightbox menu, owner
  self-heal, the 50-post-boundary fetch).
- Screenshot harness: `screenshots/harness/mock-data.ts` seeds
  `pinned_post_ids` on the owner face; captures in `.context/profile-pins/`.

## Open / out of scope

- The permalink lightbox's menu (a separate screen with a separate load —
  pinning there would need the face read; queued, not built).
- Group-profile pins (a different face doc, a different curation — own lane
  when someone asks).
- Reordering pins without unpin/re-pin (drag) — the pin/unpin order model is
  the whole feature until it is not.
- Deployment + connected acceptance (the usual gates).
