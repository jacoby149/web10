# Saved collections — playlists on the profile, private by default

A **saved collection** is a named, ordered list of posts the user has saved —
a "watch later" / "playlist" for the things they want to come back to. It
lives on the user's **profile** as a **Saved** tab (the YouTube-channel
"Playlists" shape the operator asked for — "card on profile … like youtube
channels"). A post can be saved into any number of a user's collections, and
a collection can hold posts, videos, and shorts alike (they are all one
`posts` doc — see `shorts.md`). The user can also flip a collection **public**,
so a visitor to their profile can open it and see what they curated; by
default a collection is **private** (only the owner can see its contents),
because the operator's framing is that saved stuff "can be sensitive."

This doc defines what a saved collection *is* on the wire and how the client
creates, saves into, lists, and renders one. It is a **client-side**
composition of existing primitives — a group, a role grant, the identity face,
and a `ref_value` link. **Zero node surface** (D60): no new table, endpoint,
column, or contract.

## The use case

A fan watches a creator's video and wants to come back to it later, or to
round up a set of clips ("guitar riffs I like," "sets from the tour," "things
to show my band"). They tap **Save** on the post, pick a collection (or make a
new one), and it's there — on their profile, under **Saved**, waiting. They
organize their saves into named collections instead of one flat pile.

Separately, a creator (or any user) may want to *show* a curated list — a
"best of" playlist, a reading list, a mix — as part of their public profile,
the way a YouTube channel exposes its Playlists tab. They flip that one
collection **public**; a visitor to the profile sees it as a card and can open
it. Everything else they've saved stays private.

That is the whole feature: **save a post into a named list, organize your
saves, and optionally publish a list to your profile.**

## What a saved collection is on the wire

A saved collection is a **group** — the same node primitive a community, a
DM, and a group chat are. The user is its sole `owner`. It is **not** a
community (it is never `discoverable`, it is not blasted into the public
directory, and it has no public join — you reach it by being the owner or by
the owner having made it public). It is **not** a feed (no one posts *to* it
but the owner; it is a list the owner curates).

### The `kind` marker (the source of truth)

A collection's face lives in the `web10-social-group-identity` service (the
same service communities + group chats use for their name/avatar — D60). A
collection's identity doc carries **`kind: 'saved'`** (a group chat carries
`kind: 'chat'`, a community has no `kind`). This is the single field that
separates a saved collection from every other group the user owns:

```
collection identity:  body = { kind: 'saved', name: 'Guitar Riffs', visibility: 'private', cover_ref: '…' }
group-chat identity:  body = { kind: 'chat',  name: 'The Crew', … }
community identity:   body = { name: 'Synthwave Sessions', tags: […] }   // no kind
```

**Classification is: read the identity, check `kind`.** A group with no
identity, or an identity without `kind: 'saved'`, is not a collection
(backward compatible — every pre-existing group has no `kind: 'saved'`). The
`kind` field is a **render hint only** (collection vs chat vs community) — it
is never a security boundary (access is decided by group membership + the D58
gate, below).

### Membership + the privacy model (the load-bearing part)

The collection group's **membership is the privacy boundary**, and it uses the
exact D58 principal-class grant the app already uses to make a profile public
or private (`groups/access.md`). There is **no separate "visibility" flag on
the node** — publicness *is* a role grant to a principal class. The face's
`visibility` field is the app's *intent* (what the user chose); the node's
membership rows are the *enforcement*.

| collection kind | the membership rows | who can read the contents |
|---|---|---|
| **private** (the default) | `(G, owner, 'owner')` only — no `anyone` / `authenticated` row | **only the owner** |
| **public** | `(G, owner, 'owner')` + `(G, 'anyone', 'reader')` | everyone, signed in or not |

- **Private by default.** A new collection has only the owner row. A
  non-owner's read of its contents 403s (I3) — a stranger on the profile sees
  the collection's *face* (name, cover, item count) but **not** what's in it.
  This is the "sensitive" guard: saved stuff is yours until you say otherwise.
- **Public = one extra row.** Flipping a collection public is the app adding
  the `(G, 'anyone', 'reader')` row via `addGroupMember` (the same call that
  makes a profile public) and setting the face `visibility: 'public'`.
  Flipping it private again removes that row (the app's `removeGroupMember` /
  the reserved-key path) and sets `visibility: 'private'`.
- **The face is always readable by the owner; for a public collection the face
  is also public** (the `anyone` grant on the identity service, the same
  "identity is public, content is role-gated" split as `access.md`). For a
  *private* collection, the face is owner-only too — a non-owner on the
  profile sees the collection card (the app reads the owner's face as the
  owner) but, if they somehow reach the group directly, the contents 403.

**Why the face is public for a public collection but the contents are gated
separately:** the card on the profile (name, cover, "N items") is *metadata
about the list*, not the list. The operator's "see other people's profiles'
saved collections" is satisfied by the face; the actual saved posts are the
content, and those ride the `anyone`→`reader` grant on the `saved` service. A
public collection's face + contents are both `anyone`-readable; a private
collection's face is owner-rendered and its contents are owner-only.

### The saved post (the `ref_value` link)

A saved post is **not** a copy of the post. It is a small doc in the
**`saved`** service (an app-named service — D60, the node stores `{service,
body}` opaquely) that **`ref_value`s the target post's `doc_id`**. The body is
tiny:

```
service:  saved
body:     { post_id: '<the target post doc_id>', note: 'optional why-I-saved-this' }
ref_value: '<the target post doc_id>'
group:    <the collection group>
```

- **One doc per (collection, post).** Saving the same post into two
  collections writes two `saved` docs (one in each collection group). Saving
  the same post twice into the same collection is a no-op (the app checks
  before writing — the same self-heal idiom as a like).
- **The `ref_value` is the join.** To render a collection, the app reads the
  collection's `saved` docs (the `ref_value`s), then batch-resolves each
  `post_id` to the full post (the same `readById` / media-resolve path the
  profile wall uses). A post the owner can no longer read (deleted, or a
  private post from someone else they can no longer access) degrades to a
  "no longer available" tile — the collection never hard-fails on a dead ref
  (the same graceful-degradation rule as a repost's `RepostedEmbed`).
- **Posts, videos, and shorts are all one `posts` doc** (`shorts.md`), so a
  single "save" covers all three — there is no separate "saved videos" /
  "saved shorts" machinery. The collection is a list of post refs, full stop.

### The group_id + the tag

`createGroup` derives the group_id from the caller's token:
`{provider}/groups/users/{owner}/saved-{slug}` (the slug is the slugified
collection name, prefixed `saved-` so it never collides with a community or
chat the user names "Saved"). The **pretty name** lives in the identity doc
(the slug loses capitalization/spaces); the app always displays the identity
`name`, falling back to the slug only when the face read fails.

**Surface disjointness (D78).** A collection carries the platform tag
`web10-social-saved`. My Groups selects communities by the
`web10-social-group` tag (a server-side `getMyGroups({ tags })` read), and
group chats by `web10-social-chat` — so a collection is excluded from the
Groups surface *and* the Messages surface by construction. The Saved tab is
the only surface that lists collections (it selects by the
`web10-social-saved` tag). No client-side pattern matching.

## The data seam

New module `src/data/saved.ts` (sibling to `groups.ts`):

- `createCollection(name, { visibility })` — slugifies the name, calls
  `createGroup('saved-' + slug, 'invite_only', SAVED_ROLES, [owner])` (the
  owner is the only member), takes the **returned** `group_id` (never a
  locally computed one — the API derives it), writes the face
  (`{ kind: 'saved', name, visibility, cover_ref? }`), and — if
  `visibility === 'public'` — adds the `(G, 'anyone', 'reader')` row. It also
  passes **`membership_visibility`** to `createGroup` (`'public'` when the
  collection is public, `'hidden'` when private) — the D80 by-user
  enumeration's visibility policy, so a public collection is enumerable on a
  visitor's profile and a private one is not. Returns the `group_id`.
- `getMyCollections()` — `getMyGroups({ tags: ['web10-social-saved'] })`
  (the server-side tag read, the D78 idiom), then read each group's identity
  → `{ groupId, name, visibility, coverRef, itemCount }[]`. `itemCount` is a
  cheap `readRefCounts` / a `saved`-service count on the group (the list is
  small; per-collection reads are fine at this scale).
- `readUserPublicCollections(username, provider?)` — the **visitor's** read:
  the node's D80 `byUserGroups(user, { tag: 'web10-social-saved' })` (anon-
  capable) returns only the user's **`membership_visibility == 'public'`**
  groups, so a private collection never surfaces on someone else's profile.
  Each returned group is resolved to its face (name) + item count
  (`{ groupId, name, visibility: 'public', coverRef, itemCount, slug }[]`).
  A face-read failure degrades that card to the slug (never the list).
- `readCollection(groupId)` — read the `saved` docs in the group (the
  `ref_value`s), batch-resolve each `post_id` to a full `PostRecord` + media
  (the profile wall's resolve path), return `{ face, posts }`. A non-owner
  reading a *private* collection 403s (I3); reading a *public* collection
  returns the face + the posts the reader can read (a public post from a
  private collection is still resolvable; a dead ref degrades).
- `savePostToCollection(groupId, postId, note?)` — check the collection's
  `saved` docs for an existing `ref_value === postId` (no-op if present), else
  `create('saved', { post_id, note }, { groups: [groupId], ref_value: postId })`.
- `removePostFromCollection(groupId, postId)` — find the `saved` doc with
  `ref_value === postId` in the group, `delete` it.
- `setCollectionVisibility(groupId, visibility)` — set the face
  `visibility`; add the `(G, 'anyone', 'reader')` row for `public`, remove it
  for `private` (the reserved-principal-class member ops, the same calls the
  profile public/private toggle uses); AND flip the group's D80
  `membership_visibility` (`'public'`/`'hidden'`) via `updateGroup` — so the
  by-user enumeration follows the face (a public collection is enumerable on
  a visitor's profile, a private one is absent).
- `renameCollection(groupId, name)` / `deleteCollection(groupId)` — update the
  face `name` / delete the group (the owner-only group-management ops).

**The "Save" affordance is a post action, not a collection concept.** The
save control lives on the post surfaces (the kebab menu / the action bar, the
`PostActions` idiom) — "Save to…" opens a sheet listing the user's
collections + "New collection." It calls `savePostToCollection`. The
collection never knows what a "post" is beyond holding a `ref_value` — the
save is the app's act of writing a `saved` doc into a group.

## The UI (profile + the save affordance)

### The Saved tab on the profile (the YouTube "Playlists" shape)

The profile (`UserProfileScreen`, `/u/:username`) gains a third icon tab:
**Posts | Media | Saved** (the existing two tabs + the new one, deep-linkable
via the same `?tab=` idiom — `?tab=saved`, refresh-safe, shareable). The tab
is **always present on the owner's own profile**; on **someone else's
profile it shows only if they have ≥1 public collection** (a private
collection is invisible to a non-owner — the tab renders for the owner, and
for a visitor only when there's something public to show).

The Saved tab lists the user's **collections as cards** (the "card on profile"
the operator named — the YouTube Playlists-tab card grid): each card shows the
collection's **cover** (the first saved post's media, or a brand-tinted
placeholder when empty/unset — the `hashToColor` idiom), the **name**, and an
**"N items"** meta line. On the owner's own profile the cards are tappable to
edit (rename, change visibility, delete, reorder); on a visitor's view the
cards are tappable to *open* a public collection (read-only).

### Opening a collection

Tapping a card navigates to `/u/:username/saved/:collectionId` (deep-linkable,
refresh-safe — the URL holds which collection is open, the "address bar is
part of the product" rule). The collection view renders the saved posts as a
wall (the profile's 9:16 `WallTile` grid) or a feed (the `ProfileFeed`
lens) — the same render the profile's Posts tab uses, so a saved post looks
exactly like it does everywhere else. A dead ref renders a "no longer
available" tile. The owner sees the per-item **remove** affordance + the
collection's **visibility toggle** (private ⇄ public) in the header; a
visitor sees a read-only wall.

### The save affordance (where "Save" lives)

A **Save** control on the post surfaces (the kebab menu on own/others' posts,
and the `PostActions` bar where it fits): "Save to…" → a sheet listing the
user's collections (with a checkmark on the ones already containing the post)
+ a "New collection" row (name field → `createCollection` → save into it).
Saving is a one-tap optimistic write (the like/repost idiom) with rollback on
failure. The control is **owner-of-the-token only** (you save to *your*
collections; a visitor can't save from someone else's token) — and it is
hidden in anon mode (a signed-out visitor has no collections).

## Security invariants

- **I3 holds, role-gated.** A collection's contents are `saved` docs in the
  group; reading them requires the effective role to grant `readAll` on the
  `saved` service (the D58 gate). A non-owner with no `anyone`/`authenticated`
  grant (a *private* collection) gets **no contents** — the read 403s. A
  *public* collection's `anyone`→`reader` grant lets any principal read the
  contents. The same anti-test as a community: a third party cannot read a
  private collection.
- **The face is never a content leak.** The identity doc (name, cover,
  visibility) is group-keyed display metadata in an app-named service — for a
  public collection it is `anyone`-readable (the front door), for a private
  one it is owner-rendered. Reading the face grants nothing the membership did
  not.
- **`kind` is not a security boundary** — it is a render hint (collection vs
  chat vs community). Access is decided by group membership + the D58 gate,
  never by the `kind` field.
- **`ref_value` is not a grant.** A `saved` doc pointing at a post does not
  make the post readable — resolving the ref runs the post's *own* read gate
  (a private post from someone else stays private even if it's in your
  collection; you can only resolve posts you can already read). The collection
  is a list of pointers, not a copy that bypasses I3.
- **invite_only + never discoverable by construction** — a collection is not
  blasted into the public directory (`discoverable: false`); you reach it by
  being the owner or by the owner's profile exposing a public one.
- **No escalation** — the only new write is a `saved` doc in a group the
  owner owns; the only new membership rows are the owner's own + the optional
  `anyone` reader the owner explicitly adds. Nothing widens a token's scope.

## What this is not

- **Not a community.** A community is a *feed* (posts with author, in the
  Groups surface, optionally public/discoverable). A collection is a *list the
  owner curates* (on the profile, never discoverable, no one posts to it but
  the owner). Same group primitive, different surface + `kind`.
- **Not a copy of the post.** A save is a `ref_value` pointer, not a duplicate
  doc. The post lives in its author's collection; the collection points at it.
  Deleting the post doesn't delete the save (it degrades to "unavailable");
  deleting the save doesn't touch the post.
- **Not a node change.** Groups, roles, the identity service, the
  principal-class grants, `ref_value`, and the `saved`-style app service all
  exist. This is a client-side composition of existing primitives + one new
  `kind: 'saved'` face field + one new app tag.
- **Not a "watch later" queue with a single flat list.** It is *collections*
  (named, multiple, user-organized) — the operator's "playlist" framing. A
  single default "Saved" collection is a convenience the app can seed; the
  model is N named collections.
- **Not cross-user shared collections (yet).** v1: a collection belongs to one
  owner. Collaborative playlists (multiple curators) are a follow-up (the group
  primitive already supports N members — it would be a `kind: 'saved'` group
  with more than one owner-role member).

## Reference

- The group primitive + the identity service (D60) + the community create flow
  this composes: `../../../../marketing/web10-social/src/data/groups.ts`
- The group-chat `kind` marker this mirrors (`kind: 'chat'`): `./group-chat.md`
- The access model (principal-class grants, "publicness is a role grant,"
  identity-public/content-gated): `../../groups/access.md`
- The D78 surface-disjointness tag idiom: `../../strategy/decisions.md` (D78)
- The "a short is a posts doc" model (why one save covers posts/videos/shorts):
  `./shorts.md`
- The profile screen + the `?tab=` idiom + the wall/feed render this reuses:
  `../../../../marketing/web10-social/src/components/Bio/UserProfileScreen.tsx`
- The repost `ref_value` graceful-degradation idiom (a dead ref degrades,
  never hard-fails): `./reposts.md`
- The visual bar (tokens, states, the screenshot test): `../../../strategy/design.md`
