# Media

**Who this is for:** you — a developer uploading, storing, or streaming
media on web10.

## The model

Media blobs live in **object storage** (MinIO) on the node. Documents hold
**references** to blobs — never the bytes, never a URL. The node never
proxies your media: it presigns, and your client talks to storage directly.

The rule that makes everything else work: **store the reference, not the
URL.** URLs are minted per read and expire. References are permanent.

## Uploading (three steps)

1. **Request a presigned POST form** for the file.
2. **Upload the file to storage** via that form (a plain `fetch` POST — no
   SDK involved, no node proxy).
3. **Record the reference** in a document.

```ts
// 1. Ask the node for a presigned upload
const presigned = await w.requestMediaUploadUrl({
  filename: 'clip.mp4',
  mimeType: 'video/mp4',
  sizeBytes: file.size,
})
// → { upload_url, fields, object_key, content_type }

// 2. POST the file to storage (the presigned form)
const formData = new FormData()
for (const [key, value] of Object.entries(presigned.fields)) {
  formData.append(key, value)
}
formData.append('file', file, file.name)
const res = await fetch(presigned.upload_url, { method: 'POST', body: formData })
if (!res.ok) throw new Error(`upload failed: ${res.status}`)

// 3. Record the reference in your document
const doc = await w.create('media', {
  video: { type: 'minio', value: presigned.object_key },  // the reference
  filename: file.name,
  mime_type: 'video/mp4',
  size_bytes: file.size,
}, { groups: [myGroup] })
```

## Two ways to reference media

**Inline `minio` leaf** — the object key lives in your document body:

```json
{ "image": { "type": "minio", "value": "alice/media/img-abc.jpg" } }
```

On read, the API adds a fresh presigned `url` alongside the `value` (the
key is kept). Works anywhere in the body — nested arrays and objects
recurse.

**Media metadata documents + `media_refs`** — for media that's referenced
from many places (a profile photo, a post's media set). Confirm the upload
as its own document, then point at it by doc id:

```ts
// The media document (service: media_metadata)
const mediaDoc = await w.confirmMediaUpload({
  object_key: presigned.object_key,
  mime_type: 'image/jpeg',
  filename: 'avatar.jpg',
  size_bytes: file.size,
})

// Any document references it by doc id
await w.create('posts', {
  text: { type: 'text', value: 'new avatar' },
  media_refs: [mediaDoc.doc_id],
}, { groups: [myGroup] })
```

On read, each `media_refs` entry resolves to
`{ object_key, mime_type, filename, size_bytes, read_url }` — a fresh
presigned URL, I3-checked (a ref the reader can't see simply doesn't
resolve).

## Reading media

```ts
// A presigned GET for a specific object
const { read_url, expires_in } = await w.getMediaReadUrl(objectKey)

// List the user's media documents
const media = await w.listMedia({ limit: 50 })
const some = await w.listMedia({ doc_ids: ['doc-1', 'doc-2'] })  // exact refs

// Delete a media document (tombstone)
await w.deleteMedia('doc-media-1')
```

You rarely need `getMediaReadUrl` directly — reads of documents that
reference media already come back with resolved URLs. Use it when you have a
bare object key and need a URL for it.

## Video: the HLS pipeline (D44)

Raw video files play via range requests (progressive download). For
**adaptive bitrate** streaming, the node transcodes to HLS:

1. **Create the document** with the raw file as a `minio` ref under
   `video`:

   ```ts
   const doc = await w.create('media', {
     video: { type: 'minio', value: presigned.object_key },
     // ...
   }, { groups: [myGroup] })
   ```

2. **Queue the transcode** (in-process ffmpeg worker on the node):

   ```
   POST /v3/media/transcode
   Body: { token, doc_id }
   → { doc_id, status: "queued" }   // or "processing" if already running
   ```

   The document must carry `video: { type: 'minio', value: <object_key> }` —
   that's what the worker reads.

3. **Poll the document** — it's the status surface. The worker writes
   `body.transcoding_settings`:

   ```json
   {
     "transcoding_settings": {
       "enabled": true,
       "status": "done",
       "variants": [ { "type": "minio", "value": ".../720p/index.m3u8" }, ... ],
       "thumbnails": [ { "type": "minio", "value": ".../thumb-0s.jpg" } ]
     }
   }
   ```

   `status` goes `processing → done | failed`. Re-queueing a `processing`
   doc is a no-op.

4. **Play.** When `enabled` is true, reads of the document carry a signed
   `manifest_url` in `transcoding_settings` — point hls.js at it. If
   `enabled` is false or missing, fall back to the raw file via its
   presigned URL + range requests.

**Authorization is per-fetch.** The manifest/variant/segment URLs carry a
short-lived signature (10 minutes) bound to (reader, document, HLS tree).
Every manifest (re)fetch re-verifies group access — so a user who leaves the
group stops the stream within a segment, even if the URL is still in
flight. Segments are sig-only (no database hit) — the signature is the
access check.

## What the read does for you

On every document read, the API:

- Resolves `media_refs` to `{ object_key, mime_type, filename, size_bytes,
  read_url }`
- Adds a fresh presigned `url` to every `minio` leaf in the body
- Injects the signed HLS `manifest_url` for transcoded video
- Applies the same resolution to attached ads (`doc.ad`, `doc.node_ad`)

If the reader can't read the group, the document isn't returned at all — no
URLs leak.

## Reference implementation

The [Media demo](/docs/media/) is this exact flow, live: image upload
(presigned → create → read-back), video upload with client-side reframe,
HLS transcode queueing + polling, and adaptive playback. Read its
`script.js` — it logs every step.
