# Conventions & Schemas

Shared conventions for web10 apps. The data model is schemaless — any app can write anything to any service. These conventions are the shared vocabulary that makes apps interoperate.

## Document Typing

Documents are opaque JSON. The API doesn't enforce a schema. But there's a convention for typing at the leaf level — so the API knows what to do with values.

### The Convention

Every leaf value is wrapped in a type object:

```json
{
  "text": { "type": "text", "value": "hello web10" },
  "photo": { "type": "minio", "value": "alice/media/img-abc.jpg" },
  "views": { "type": "number", "value": 42 },
  "pinned": { "type": "bool", "value": true },
  "posted": { "type": "datetime", "value": "2026-08-09T12:00:00Z" }
}
```

### The Types

| Type | What it is | API behavior |
|---|---|---|
| `text` | Plain text | Render as-is |
| `minio` | Media reference | Convert to presigned URL on read |
| `number` | Numeric value | Sortable, filterable |
| `bool` | Boolean | Filterable |
| `datetime` | ISO 8601 timestamp | Sortable, filterable |
| `ref` | Reference to another document | Resolve on read |
| `array` | Array of typed values | Recurse into children |
| `object` | Nested object | Recurse into children |

### How the API Uses It

The API recursively scans JSON for typed values. When it finds `minio`, it converts the value to a presigned URL (if group permissions pass). If permissions fail, the whole document is hidden — no URLs exposed.

```
1. Request: read a document
2. API: check group permissions → allowed
3. API: recursively scan JSON body
4. API: find { "type": "minio", "value": "alice/henry.png" }
5. API: convert → { "type": "minio", "url": "https://minio/...?sig=..." }
6. Return document with URLs
```

### Nested Structures

Arrays and objects recurse, so nested structures work:

```json
{
  "media": {
    "type": "array",
    "value": [
      { "type": "minio", "value": "alice/photo.jpg" },
      { "type": "minio", "value": "alice/video.mp4" }
    ]
  }
}
```

## The Ref Pattern

Two mechanisms, both real:

**The `ref_value` column (the engagement join).** A top-level field on the
document, set at create time. This is how comments, reactions, and replies
point at their target post — the server stores it, and the read's `ref`
filter keys off it:

```ts
// A comment on a post — a `comments` document authored by the commenter
await w.create('comments', {
  text: { type: 'text', value: 'great post!' },
}, {
  groups: ['{provider}/groups/web10/discover'],
  ref_value: postDocId,        // the target post's doc_id — sent at create
})
```

```ts
// Read back: the post's comments (the ref filter)
const comments = await w.read('comments', {
  groups: ['{provider}/groups/web10/discover'],
  ref: postDocId,
})

// Or exact counts for a batch of posts (the count shape)
const counts = await w.readRefCounts('reactions', {
  groups: ['{provider}/groups/web10/discover'],
  ref: [postDocId1, postDocId2],
})  // → { "doc-1": 42, "doc-2": 7 }
```

A `ref_value` that was never written at create time is an orphan — it never
matches a ref read. Send it in the create call.

**The `ref` leaf type (app-internal references).** A typed value inside the
JSON body, for references between a document's own fields (e.g. a post's
`media_refs` point at media document ids). The app decides what a ref means —
the platform doesn't interpret body-level refs.

## Reading

Every read is group-filtered. The real read surface:

```ts
// The group read — groups is required
const posts = await w.read('posts', {
  groups: ['{provider}/groups/web10/discover'],
  limit: 50,        // default 50
  offset: 0,
})

// The ref filter — "give me the comments/reactions for these posts"
const comments = await w.read('comments', {
  groups: ['{provider}/groups/web10/discover'],
  ref: postDocId,   // or a list: [postDocId1, postDocId2]
})

// The count shape — { ref_value: count } instead of the docs (exact, no cap)
const counts = await w.readRefCounts('reactions', {
  groups: ['{provider}/groups/web10/discover'],
  ref: [postDocId1, postDocId2],
})

// A single document by id
const post = await w.readById(postDocId, 'posts')
```

There are no `$match` / `$sort` / `$limit` opts — that was the v2 Mongo
shape. Arbitrary filtering, joins, and aggregation live in the **flexible
read** (`w.query`, a caller-written ClickHouse `SELECT` over your services):

```ts
// Tag filtering, trending, self-joins — the query engine
const { rows } = await w.query(`
  SELECT doc_id, author_key, created_at
  FROM posts
  WHERE has(tags, 'jazz')
  ORDER BY created_at DESC
  LIMIT 20
`)
```

## Media References

Media blobs live in object storage (MinIO). Two mechanisms reference them,
both resolved on read:

**`media_refs`** — an array of media document ids (the primary mechanism the
reference apps use). The read resolves each to `{ object_key, mime_type,
filename, size_bytes, read_url }`:

```json
{
  "text": { "type": "text", "value": "check this out" },
  "media_refs": ["doc-media-123", "doc-media-456"]
}
```

**The `minio` leaf type** — an object key inline in the body. The read adds a
fresh presigned `url` alongside the `value`:

```json
{
  "photo": { "type": "minio", "value": "alice/media/img-abc.jpg" }
}
```

Store the reference (the doc id or the object key), not a URL — URLs are
minted per read and expire.

## Service Names

Services are just labels in the `collection_name` column. No schema migration. No approval process. No limit. Common conventions:

| Service | Purpose |
|---|---|
| `posts` | User-authored content |
| `reactions` | Reactions (documents with refs) |
| `comments` | Comments (documents with refs) |
| `notes` | Personal notes (no groups = private) |
| `outbox` | Sent messages (mailer pattern) |
| `saved` | Saved content (opt-in copies) |

## Tags

The `tags` column on documents enables fast filtering. Use tags for:

- Hashtags: `#jazz`, `#webdev`
- Content types: `photo`, `video`, `text`
- Categories: `announcement`, `behind-the-scenes`

```ts
// tags live in the body — the create reads body.tags into the tags column
await w.create('posts', {
  text: { type: 'text', value: 'new record drop' },
  tags: ['music', 'jazz', 'announcement'],
}, {
  groups: ['{provider}/groups/users/alice/followers'],
})
```

Tags are not a fixed read filter — filter on them with the query engine
(`WHERE has(tags, 'jazz')`, §Reading).

## Versioning

Schema evolution is **additive only**: never remove or repurpose a field — only add optional ones. Old records must validate against new schemas forever; the data outlives any app, so migrations are not an option.

## Summary

- Documents are opaque JSON with leaf-level type conventions
- The `ref_value` column (set at create) is the engagement join — comments, reactions, replies; the `ref` leaf type is for app-internal references
- Reads are group-filtered: `read(collection, { groups, limit?, offset?, ref? })` + the `readRefCounts` count shape; arbitrary filtering is the query engine (`w.query`)
- `media_refs` (doc ids) and the `minio` leaf type both resolve to URLs on read
- Services are freeform labels — no schema, no migration
- Tags live in `body.tags` and enable query-engine filtering
- Additive-only evolution — the data outlives the app