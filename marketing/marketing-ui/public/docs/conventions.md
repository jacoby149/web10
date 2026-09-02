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

Documents reference each other through the `ref` type. This is how reactions, comments, replies, and quotes work — no dedicated tables.

### Reaction

```json
{
  "ref": { "type": "ref", "value": "post-123" },
  "reaction_type": { "type": "text", "value": "like" }
}
```

### Comment

```json
{
  "ref": { "type": "ref", "value": "post-123" },
  "text": { "type": "text", "value": "great post!" }
}
```

### Reply (threaded comment)

```json
{
  "ref": { "type": "ref", "value": "post-123" },
  "parent_ref": { "type": "ref", "value": "comment-abc" },
  "text": { "type": "text", "value": "I agree!" }
}
```

### Quote / Repost

```json
{
  "ref": { "type": "ref", "value": "post-123" },
  "text": { "type": "text", "value": "this is important" }
}
```

The `ref` type is the universal pointer. Any document can reference any other document. The API resolves refs on read. The app decides what a ref means — reaction, comment, reply, quote, remix. The platform doesn't care.

## Media References

Media blobs live in object storage (MinIO). Documents reference them through the `minio` type:

```json
{
  "text": { "type": "text", "value": "check this out" },
  "media": {
    "type": "array",
    "value": [
      { "type": "minio", "value": "alice/media/photo.jpg" },
      { "type": "minio", "value": "alice/media/video.mp4" }
    ]
  }
}
```

The API converts `minio` references to presigned URLs on read. If group permissions fail, the whole document is hidden.

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
await w.create('posts', {
  text: { type: 'text', 'value': 'new record drop' },
}, {
  groups: ['web10.app/groups/alice/followers'],
  tags: ['music', 'jazz', 'announcement'],
})
```

```ts
// Fast filter on tags
const posts = await w.read('posts', {
  groups: ['web10.app/groups/web10/discover'],
  $match: { tags: ['jazz'] },
})
```

## Versioning

Schema evolution is **additive only**: never remove or repurpose a field — only add optional ones. Old records must validate against new schemas forever; the data outlives any app, so migrations are not an option.

## Summary

- Documents are opaque JSON with leaf-level type conventions
- The `ref` type links documents — reactions, comments, replies all use it
- `minio` type converts to presigned URLs on read
- Services are freeform labels — no schema, no migration
- Tags enable fast filtering
- Additive-only evolution — the data outlives the app