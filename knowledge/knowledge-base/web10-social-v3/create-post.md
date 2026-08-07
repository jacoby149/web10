# Create Post

Compose and publish a post. Pick groups. Add media. Write content.

## What the Screen Shows

```
New Post
─────────────────────
[jacoby149 avatar]

Type something...

─────────────────────
📷 Add media    👥 Pick groups

Groups:
  [web10.app/groups/web10/discover] ✓
  [web10.app/groups/jacoby149/followers] ✓
  [web10.app/groups/jacoby149/close-friends]
  [web10.app/groups/charlie/st-louis-chess-club] ✓

[POST]
```

## Protocol Mapping

**Compose:** Client-side. No protocol involvement until publish.

**Media upload:**

```ts
const record = await w.upload(file, {
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  altText: 'screenshot',
})
// → { object_key: 'jacoby149/media/img-abc.jpg', readUrl: '...' }
```

Three-step upload: request presigned URL, upload to MinIO, confirm. The convenience method does all three.

**Group picker:** Groups the user belongs to.

```ts
const groups = await w.getGroups({ member: 'jacoby149' })
// → [
//    { group_id: 'web10.app/groups/web10/discover', name: 'Discover', ... },
//    { group_id: 'web10.app/groups/jacoby149/followers', name: 'Followers', ... },
//    { group_id: 'web10.app/groups/jacoby149/close-friends', name: 'Close Friends', ... },
//    { group_id: 'web10.app/groups/charlie/st-louis-chess-club', name: 'Chess Club', ... },
//  ]
```

The app filters to groups where posting makes sense. Shows group name and member count.

**Publish:**

```ts
const doc = await w.create('posts', {
  text: { type: 'text', value: 'just shipped the new groups feature' },
  media: [{ type: 'minio', value: 'jacoby149/media/img-abc.jpg' }],
}, {
  groups: [
    'web10.app/groups/web10/discover',
    'web10.app/groups/jacoby149/followers',
    'web10.app/groups/charlie/st-louis-chess-club',
  ],
})
// → { doc_id: 'doc-abc' }
```

One SDK call. The API handles document insert and group attachments. WebSocket push to subscribers in each group.

## The Write Flow

```
Client → w.create('posts', body, { groups: [...] })
  API → INSERT INTO documents (doc_id, author_key, 'posts', body_json, tags, ...)
  API → INSERT INTO doc_groups (one row per group)
  API → Redis: update group caches
  API → WebSocket: PUBLISH to all group channels
  API → 201 Created { doc_id }
```

One table write. N group attachments. Cache update. Push notification. Done.

## Media in the Post

The media lives in the JSON body:

```json
{
  "text": {"type": "text", "value": "check this out"},
  "media": [
    {"type": "minio", "value": "jacoby149/media/img-abc.jpg"},
    {"type": "minio", "value": "jacoby149/media/vid-xyz.mp4"}
  ]
}
```

On read, the API scans for minio types and converts to presigned URLs. No separate media table. The JSON body holds the references.

## Draft Posts

Client-side only. No protocol involvement. The app stores drafts locally (localStorage, IndexedDB). On publish, the draft becomes a real post.

## TODO

- [ ] Group picker UI — search groups, show member counts, filter by join policy
- [ ] Media upload — presigned URL flow, progress indicator, retry
- [ ] Character limit — client-side validation, no protocol limit (JSON is freeform)
- [ ] Tag input — client-side, stored in tags array
- [ ] Scheduled posts — TTL on a `drafts` collection, background job publishes at time (future)
- [ ] Post preview — render JSON body as the user types

## Proof

Create post is one SDK call. Groups are an attachment. Media is a minio ref in the JSON body. Tags are an array. No dedicated compose endpoint. No media table. No validation schema. The protocol handles it.