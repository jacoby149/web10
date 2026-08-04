# The Streaming Problem: When `minio` Isn't Enough

## The Current Model

One type: `minio`. The API converts a MinIO path to a presigned URL. Done.

```json
{"type": "minio", "value": "alice/video.mp4"}
→ {"type": "minio", "url": "https://minio/...?sig=..."}
```

The browser downloads the whole file. Works fine for small files. Breaks for large videos.

## The Counter-Argument

If web10 supports **advanced video streaming** — chunked delivery, adaptive bitrate, HLS/DASH — the API can't just presign a URL. It needs to know the file is a video to trigger different behavior:

```
Current:  presigned URL → browser downloads entire file
Streaming: generate manifest → serve chunks → adaptive bitrate
```

This means the API needs type information. `minio` is too generic — it doesn't tell the API "this is a video that needs transcoding and chunked delivery."

## Options

### 1. Subtypes

```json
{"type": "minio", "subtype": "video", "value": "alice/video.mp4"}
{"type": "minio", "subtype": "image", "value": "alice/photo.jpg"}
{"type": "minio", "subtype": "document", "value": "alice/proposal.docx"}
```

The API checks `subtype`. `video` → trigger streaming pipeline. `image` → presign. `document` → presign.

**Problem:** Now the API knows about subtypes. Every new subtype is a code path. But this is bounded — `video` is the only subtype that needs special treatment. Images and documents just presign.

### 2. MIME Type Detection

The API checks the MinIO object's metadata (MIME type) before deciding behavior:

```
GET /alice/video.mp4
→ API checks MinIO metadata: content-type = video/mp4
→ API triggers streaming pipeline
```

**Problem:** The API is still format-aware. It just learns the format at runtime instead of from the type field. Same complexity, less explicit.

### 3. Streaming Is a Separate Endpoint

```
POST /alice/upload → web10.app/alice/video.mp4  (regular upload)
POST /alice/upload/stream → web10.app/alice/video/stream.m3u8  (streaming upload)
```

The streaming endpoint handles transcoding, manifest generation, and chunk storage. The document references the manifest URL, not the raw file:

```json
{"type": "minio", "value": "alice/video/stream.m3u8"}
```

The API still just presigns. The streaming infrastructure is behind the scenes. The type stays `minio`.

**Problem:** Streaming upload is heavier. Transcoding takes time. The upload flow is different. But the type system stays clean.

### 4. Streaming Is a Background Job

Upload a video → background job transcodes → generates manifest → writes manifest URL back to the document:

```json
{
  "raw": {"type": "minio", "value": "alice/video.mp4"},
  "stream": {"type": "minio", "value": "alice/video/stream.m3u8"}
}
```

The UI checks for `stream` first. Falls back to `raw` if missing. The API never needs to know about video — it just presigns both URLs.

**Problem:** Adds latency between upload and stream availability. But the type system stays clean, and the API stays simple.

## The Real Question

Is streaming a **type concern** or an **infrastructure concern**?

If streaming is a type concern, the type system grows. Every new media capability (transcoding, thumbnails, OCR, audio extraction) adds complexity.

If streaming is an infrastructure concern, the type system stays simple. Background jobs handle the heavy lifting. The document just references URLs.

## The Verdict (For Now)

Keep `minio` generic. Streaming is infrastructure, not a type. Use option 3 or 4 — separate streaming endpoint or background job. The type system describes what data *is* (a MinIO reference), not how it's delivered (presigned, chunked, adaptive).

If streaming becomes central enough that the API *must* know about video, add a `subtype` field. It's a bounded expansion — `video` is the only subtype that needs special treatment. Everything else presigns.

But don't start there. Start with background jobs and separate endpoints. Keep the type simple until the product demands otherwise.