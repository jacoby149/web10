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

```
User opens /jacoby149
  → w.read('profile', { groups: ['me'] })     (avatar, bio)
  → w.getGroups({ member: 'jacoby149' })      (groups list)
  → w.read('posts', { groups: ['me'] })       (your posts)
  → parallel: all three calls
  → render
```

Three parallel calls. No joins. No mirrors.

## The Face (avatar + banner)

The profile's face is two media refs on the profile doc (`avatar_ref`,
`banner_ref`) — each points at a `public_media` doc. The avatar renders as a
circle, the banner as a full-width band (`object-cover`).

**The face lightbox** (click the avatar or banner): everyone sees the face
enlarged; the **owner** additionally gets a pick-from-your-posts grid — the
Facebook-like "your profile picture is a photo you picked from your posts."

**The crop step** (owner, the Facebook-style "how it displays"): tapping a
pickable tile does not save immediately — it opens a crop view of that image
in the **actual display frame** (a circle for the avatar, the wide band for
the banner). The user pans (drag) + zooms (wheel / pinch / the ± buttons) to
frame it; the pan is clamped so the image always covers the frame (the
`object-cover` invariant). On confirm the visible window is cropped
client-side (canvas, `src/lib/faceCrop.ts` — the preview and the crop share
one transform model, so what you see is what ships) and **uploaded as a new
media doc** through the normal `uploadMedia` path; the profile then points at
that new doc. The face IS the crop — every surface (feed avatar, profile,
share card) shows the framed image, not a center-cropped guess. The original
post's media is untouched.

The crop output: the avatar is a 512×512 JPEG (the circle mask is applied at
render, the doc is square); the banner is a 1536×352 JPEG (≈4.36:1, the
desktop display ratio — `object-cover` re-crops it per viewport at render,
the same move as the video editor's ratio presets).

## TODO

- [ ] Avatar upload flow — `w.upload()` then update profile with minio ref
- [ ] Bio edit — update profile document
- [ ] Group join policy display — fetch from group metadata
- [ ] Post list pagination — keyset pagination on created_at
- [ ] Follower count caching — Redis counter, increment/decrement on group membership change

## Proof

Your profile is one collection read, one groups call, and some counts. No dedicated profile endpoint. No user table. No followers table. The protocol handles it.