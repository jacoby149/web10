# Streaming

## The Problem

A presigned MinIO URL downloads the entire file. For a 500MB video, that's 500MB before anything plays. For a 2GB medical scan, the browser chokes. Streaming delivers chunks — show content while the rest loads.

## What MinIO Supports

**Range requests — yes.** MinIO supports HTTP `Range` headers natively. A client can request bytes 0-1024, then 1024-2048, etc. The server returns 206 Partial Content.

```
GET /alice/video.mp4
Range: bytes=0-1023
→ 206 Partial Content (1KB chunk)

GET /alice/video.mp4
Range: bytes=1024-2047
→ 206 Partial Content (next 1KB chunk)
```

**Adaptive bitrate — no.** MinIO stores blobs. It doesn't transcode. It doesn't generate HLS/DASH manifests. It doesn't split files into chunks.

**Progressive playback — yes, with caveats.** If a video file is properly formatted (mp4 with moov atom at the start, or webm), a browser can start playing while downloading. But this is browser-side behavior, not server-side streaming. The whole file is still being transferred.

## Streaming Approaches

### 1. Range Requests (MinIO Native)

The simplest option. Client requests chunks. MinIO serves chunks. No infrastructure changes.

```
Browser: Range: bytes=0-1MB
MinIO:   → 1MB chunk
Browser: Range: bytes=1MB-2MB
MinIO:   → 1MB chunk
```

**Pros:** No new infrastructure. MinIO does it natively. Works for any file type — video, audio, images, PDFs.

**Cons:** No adaptive bitrate. The client downloads one quality. No manifest. The client must know how to chunk the file.

**Best for:** Audio streaming, progressive video playback, large file downloads.

### 2. HLS/DASH Transcoding (Traditional)

Upload triggers a background job: transcode into multiple bitrates, generate manifest.

```
Upload: alice/video.mp4 (1080p, 500MB)
Background job:
  → alice/video/360p.m3u8  (HLS manifest)
  → alice/video/360p.ts    (chunks)
  → alice/video/720p.ts    (chunks)
  → alice/video/1080p.ts   (chunks)
```

The document references the manifest. The browser fetches chunks as needed. (How the manifest + segments get *authorized* is a separate problem — a plain presigned manifest URL is the insecure option; see `minio-auth-bifurcated.md`.)

**Pros:** Adaptive bitrate. Industry standard. Works everywhere.

**Cons:** Transcoding is expensive. Storage multiplies (3-5x for multiple bitrates). Upload-to-play latency (transcoding time). Requires ffmpeg or similar.

**Best for:** Video streaming where quality adaptation matters (YouTube, Netflix).

### 3. P2P, Edge Caching, Tile-Based (v4)

WebRTC P2P segment sharing (the PeerTube model), CDN edge caching, and tile-based streaming for large images/3D are scale plays — they pay off with concurrent viewers, global latency, or multi-megapixel assets. None of them are needed for video to *work*. They live in `../../web10-v4/media/streaming.md`.

## The web10 Approach

### Layer 1: Range Requests (Day 1)

MinIO already supports this. The API presigns URLs with range request support. Clients that want streaming use `Range` headers. Clients that don't, download the whole file.

No infrastructure changes. Works for everything.

### Layer 2: Background Transcoding (HLS)

Triggered by file type. Video files get transcoded into HLS. The document gets its `transcoding_settings` populated (variants + thumbnails — the shape is defined in `transcoding-foundation.md`).

The UI checks `transcoding_settings.enabled` first. Enabled → signed manifest + hls.js. Not enabled (or missing) → fall back to the raw file via presigned URL + range requests.

### Layer 3+: P2P, Edge Caching (v4)

When popular content costs too much (P2P) or global latency matters (edge caching): `../../web10-v4/media/streaming.md`.

## The Type System

The type stays `minio`. Streaming is infrastructure, not a type. The document carries the raw reference plus its `transcoding_settings` (the full shape: `transcoding-foundation.md`):

```json
{
  "url": {
    "type": "minio",
    "value": "alice/video/vacation-raw.mp4",
    "transcoding_settings": {
      "enabled": true,
      "variants": [ /* minio refs to each rendition's index.m3u8 */ ],
      "thumbnails": [ /* minio refs */ ]
    }
  }
}
```

Everything is still `minio`. The API's special handling for video is keyed off `transcoding_settings`, not off a new type — the type system describes what data *is* (a MinIO reference), not how it's delivered (presigned, chunked, adaptive).

## What About PeerTube's Torrenting?

BitTorrent for video distribution is clever but has trade-offs — and it's a v4 concern (P2P delivery, `../../web10-v4/media/streaming.md`). Short version: torrenting needs the full file before playback (bad for streaming), WebRTC data channels deliver chunks in order (good for streaming), and torrenting's security model (untrusted peer shards, mitigated by piece hashing) is a surface we don't need to open until P2P is actually in scope.

## Summary

| Approach | When to Use | Infrastructure |
|---|---|---|
| Range requests | Everything, Day 1 | MinIO native |
| HLS transcoding | Video, adaptive bitrate | ffmpeg in-process worker |
| WebRTC P2P | Popular content, concurrent viewers | v4 |
| Edge caching | Global audience, low latency | v4 |
| Tile-based | Large images, 3D models | v4 |

Start with range requests. Add transcoding when video matters. Add P2P when popular content costs too much. The type stays `minio`. Streaming is infrastructure.