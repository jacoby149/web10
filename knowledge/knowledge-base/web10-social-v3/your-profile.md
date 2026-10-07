# Your Profile

You visit your own profile. You see your avatar, bio, groups, and posts.

## What the Screen Shows

```
[avatar] jacoby149
         bio text here

Groups:    Posts:    Followers:
3          42        1,203

[web10.app/groups/jacoby149/followers]     [open]
[web10.app/groups/jacoby149/close-friends] [invite only]
[web10.app/groups/dave/jazz-collectors]        [request]

--- posts ---
post 1 | 2h ago | [like] [comment]
post 2 | 1d ago | [like] [comment]
```

## Protocol Mapping

**Avatar and bio:** A document in the profile collection.

```ts
const profile = await w.read('profile', { groups: ['me'] })
// → { avatar: { type: 'minio', value: 'jacoby149/avatar.png' }, bio: { type: 'text', value: 'builder' } }
```

API converts minio to presigned URL. One SDK call.

**Groups you belong to:**

```ts
const groups = await w.getGroups({ member: 'jacoby149' })
// → [
//    { group_id: 'web10.app/groups/jacoby149/followers', name: 'Followers', join_policy: 'open', member_count: 1203, my_role: 'owner' },
//    { group_id: 'web10.app/groups/jacoby149/close-friends', name: 'Close Friends', join_policy: 'invite_only', member_count: 12, my_role: 'owner' },
//    { group_id: 'web10.app/groups/dave/jazz-collectors', name: 'Jazz Collectors', join_policy: 'request', member_count: 450, my_role: 'member' },
//  ]
```

**Follower count:** Member count from the followers group.

```ts
const followers = groups.find(g => g.group_id === 'web10.app/groups/jacoby149/followers')
const followerCount = followers.member_count
```

**Your posts:** Read your own documents.

```ts
const posts = await w.read('posts', {
  groups: ['me'],
  $sort: { created_at: -1 },
  $limit: 50,
})
```

`me` returns your own documents regardless of group attachment.

## The Data Flow

The profile **paints on the ONE read** (3.223.0 — the same model the Video wall
3.219.1, Shorts wall 3.220.0, and Watch page 3.221.0 got): the first paint is
one round-trip, and everything non-critical lands in the background and patches
in. The node's read path returns every post's `media_refs` **pre-resolved**
(presigned `thumbnail_url` + `read_url` + dimensions + HLS settings on each ref
object), so the grid's media map is built synchronously from those inline refs
— no second media round-trip holds the first paint.

```
Owner (/u/<me>):
  → Promise.all([ readProfile, readMyPosts, countFollows, countFollowers, countStagingPosts ])
  → build the media map from the posts' inline refs (synchronous)
  → PAINT (banner, avatar, name, bio, stats, the grid with thumbnails) — one round-trip
  → background (patches in, never blocks the paint):
      getMyCollections (the Saved tab) + the face/string-ref media fallback

Visitor (/u/<other>):
  → Promise.all([ readUserProfile, readFollow, readUserPublicProfile ])
  → build the media map from the posts' inline refs + the face URLs (synchronous)
  → PAINT (banner, avatar, name, bio, follow, the grid with thumbnails) — one round-trip
  → background (patches in, never blocks the paint):
      readUserPublicCollections (the Saved tab) + countFollowers + countUserFollowingReal
```

**The wall pages** (3.223.0, the feed-paging lane): the posts read is paged
(`readMyPosts` / `readUserPublicProfile` take an `offset`; the node's
`read_documents_in_groups` + the D73 query already apply `LIMIT … OFFSET`). A
sentinel (`profile-wall-sentinel`, `IntersectionObserver` `rootMargin: 200px`)
appends the next page (offset +50, deduped by id, the page's inline media
merged into the map); `hasMore` keys off the page size (`page.length >= 50`),
so a creator with N > 50 posts sees more than the first page and a short last
page ends the scroll. The visitor's face is re-merged from a ref on each page
(the face query is `LIMIT 1` — only page one carries it).

## The Face (avatar + banner)

The profile's face is two media refs on the profile doc (`avatar_ref`,
`banner_ref`) — each points at a `public_media` doc. The avatar renders as a
circle, the banner as a full-width band (`object-cover`).

**The face lightbox** (click the avatar or banner): everyone sees the face
enlarged; the **owner** additionally gets a picker — "set as {face}: pick a
photo, or upload one." Two sources, one crop step:

- **Pick from your posts** — a grid of the owner's own posts' media (the
  Facebook-like "your profile picture is a photo you picked from your posts").
- **Upload** — a first-class "Upload" tile in the same grid (a dashed tile,
  always present for the owner). Picking a file from disk opens the **same
  crop step** (the file's object URL is the crop source). No post is required
  to set a face — the upload is the no-post path the picker used to lack
  (the old empty state was "post a photo first," which forced a post just to
  get a profile picture).

**The crop step** (owner, the Facebook-style "how it displays"): tapping a
pickable tile **or** the upload tile does not save immediately — it opens a
crop view of that image in the **actual display frame** (a circle for the
avatar, the wide band for the banner). The user pans (drag) + zooms (wheel /
pinch / the ± buttons) to frame it; the pan is clamped so the image always
covers the frame (the `object-cover` invariant). On confirm the visible window
is cropped client-side (canvas, `src/lib/faceCrop.ts` — the preview and the
crop share one transform model, so what you see is what ships) and **uploaded
as a new media doc** through the normal `uploadMedia` path; the profile then
points at that new doc. The face IS the crop — every surface (feed avatar,
profile, share card) shows the framed image, not a center-cropped guess. The
original post's media is untouched (for the pick path).

**Post on my behalf** (upload path only): the crop step offers an
"Also post this photo to my feed" checkbox when the source is an upload.
Checked, the confirmed crop is **also** written as a real post (a `posts` doc
in the owner's followers group, `media_refs` = the same media doc the face
points at, public) — so the photo appears in the owner's feed + profile grid
as a post, not just as the face. The post is best-effort: a post failure never
undoes the face (the face save already landed). The pick-from-posts path has no
checkbox (the photo is already a post).

The crop output: the avatar is a 512×512 JPEG (the circle mask is applied at
render, the doc is square); the banner is a 1536×352 JPEG (≈4.36:1, the
desktop display ratio — `object-cover` re-crops it per viewport at render,
the same move as the video editor's ratio presets).

**The group face** reuses the same `ProfileMediaLightbox` (3.194.0): a manager
gets the enlarged view + pick-from-the-group's-posts + the **upload tile**
(upload → crop → set as the group's face via `writeGroupIdentity`). The group
surface has no "post on my behalf" (a group face is not a user post).

## TODO

- [x] Avatar upload flow — `w.upload()` then update profile with minio ref (the face lightbox's upload tile + crop step, 3.204.0)
- [ ] Bio edit — update profile document
- [ ] Group join policy display — fetch from group metadata
- [x] Post list pagination — the wall pages on `offset` (the node's `LIMIT … OFFSET`), 3.223.0
- [ ] Follower count caching — Redis counter, increment/decrement on group membership change

## Proof

Your profile is one read (the posts, media resolved inline) + the face + some
counts, painted on that one read; the rest (collections, the face fallback, the
counts) lands in the background. No dedicated profile endpoint. No user table.
No followers table. The protocol handles it.