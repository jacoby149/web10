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
```
User selects image
  → GET /jacoby149/upload
  → API: presigned MinIO PUT URL (valid 5 mins)
  → Client: direct upload to MinIO
  → Client: "I uploaded it, key is jacoby149/media/img-abc.jpg"
```

**Group picker:** Groups the user belongs to (as member or owner).
```
GET /groups?member=jacoby149
→ [web10.app/groups/web10/discover,
   web10.app/groups/jacoby149/followers,
   web10.app/groups/jacoby149/close-friends,
    web10.app/groups/charlie/st-louis-chess-club,
   web10.app/groups/dave/jazz-collectors, ...]
```
The app filters to groups where posting makes sense. Shows group name and member count.

**Publish:**
```
User taps POST
   → POST /jacoby149/posts
      { "text": {"type": "text", "value": "just shipped the new groups feature"},
        "media": [{"type": "minio", "value": "jacoby149/media/img-abc.jpg"}],
        "tags": ["web10", "groups"],
        "groups": ["web10.app/groups/web10/discover",
                    "web10.app/groups/jacoby149/followers",
                    "web10.app/groups/charlie/st-louis-chess-club"] }
   → API: INSERT INTO documents
   → API: INSERT INTO doc_groups (one row per group)
   → WebSocket: push to subscribers in both groups
```

One insert into documents. N inserts into doc_groups. Done.

## The Write Flow

```
Client → POST /jacoby149/posts { body, groups: [...] }
  API → INSERT INTO documents (doc_id, author_key, 'posts', body_json, tags, ...)
  API → INSERT INTO doc_groups (doc_id, 'web10.app/groups/web10/discover', ...)
  API → INSERT INTO doc_groups (doc_id, 'web10.app/groups/jacoby149/followers', ...)
  API → INSERT INTO doc_groups (doc_id, 'web10.app/groups/charlie/st-louis-chess-club', ...)
  API → Redis: update group:web10/discover:recent, group:jacoby149/followers:recent, ...
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

Create post is one CRUD call. Groups are an attachment. Media is a minio ref in the JSON body. Tags are an array. No dedicated compose endpoint. No media table. No validation schema. The protocol handles it.
