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

The document references the manifest. The API presigns the manifest URL. The browser fetches chunks as needed.

**Pros:** Adaptive bitrate. Industry standard. Works everywhere.

**Cons:** Transcoding is expensive. Storage multiplies (3-5x for multiple bitrates). Upload-to-play latency (transcoding time). Requires ffmpeg or similar.

**Best for:** Video streaming where quality adaptation matters (YouTube, Netflix).

### 3. PeerTube Model (WebRTC P2P)

PeerTube uses **WebRTC data channels** for P2P video delivery. When you watch a video, you download from the server *and* from other viewers watching the same video. Bandwidth is shared across peers.

```
Server → Viewer A (chunks 1-100)
Server → Viewer B (chunks 1-100)
Viewer A → Viewer B (chunks 1-50)  [P2P]
Viewer B → Viewer A (chunks 51-100) [P2P]
```

PeerTube combines this with **BitTorrent** for large file distribution and **HLS** as a fallback.

**Pros:** Server bandwidth scales with viewers, not linearly. 100 viewers ≠ 100x bandwidth. Popular content is cheapest to serve.

**Cons:** Requires viewers to be online simultaneously. First viewer pays the full cost. WebRTC has NAT traversal issues. Small audiences don't benefit. Requires a signaling server.

**Best for:** Popular content with concurrent viewers. Live streams. Community platforms.

### 4. Edge Caching (CDN)

Upload to MinIO → replicate to edge nodes → serve from nearest edge.

```
MinIO (source) → Cloudflare / Fastly / CloudFront (edges)
User → nearest edge → cached chunk
```

**Pros:** Low latency. Scales infinitely. Industry standard.

**Cons:** CDN costs. Egress fees. Not P2P — still linear server cost. Caching invalidation for updates/deletes.

**Best for:** Public content with global audience. Static assets.

### 5. Tile-Based Streaming (Images, Maps, 3D)

For large images and 3D models, split into tiles. Client requests tiles based on viewport and zoom level.

```
alice/blueprint.png (10,000 x 10,000 pixels)
→ alice/blueprint/tile/0/0.png  (level 0, tile 0)
→ alice/blueprint/tile/1/0.png  (level 1, tile 0)
→ alice/blueprint/tile/1/1.png  (level 1, tile 1)
```

Client only downloads visible tiles. Zoom in → download higher resolution tiles for visible area.

**Pros:** Massive files become interactive. Only visible data transfers. Works for images, point clouds, 3D models.

**Cons:** Tiling is a preprocessing step. Different tiling formats per type (XYZ for images, Draco for 3D). Client needs a tile renderer.

**Best for:** Satellite imagery, medical scans, architectural blueprints, 3D models.

## The web10 Approach

### Layer 1: Range Requests (Day 1)

MinIO already supports this. The API presigns URLs with range request support. Clients that want streaming use `Range` headers. Clients that don't, download the whole file.

No infrastructure changes. Works for everything.

### Layer 2: Background Transcoding (When Video Matters)

Triggered by file type. Video files get transcoded into HLS. Audio files get transcoded into Ogg/MP3. The document gets a `stream` field:

```json
{
  "raw": {"type": "minio", "value": "alice/video.mp4"},
  "stream": {"type": "minio", "value": "alice/video/stream.m3u8"}
}
```

UI checks `stream` first. Falls back to `raw`.

### Layer 3: P2P (When Popular Content Costs Too Much)

WebRTC signaling server. When a video has N concurrent viewers, peers share chunks. Server bandwidth is O(1), not O(N).

This is the PeerTube innovation. It's not about quality — it's about **economics**. A video with 10,000 concurrent viewers costs 10,000x bandwidth on a traditional model. With P2P, it costs maybe 100x (seeders + initial fetch).

### Layer 4: Edge Caching (When Global Latency Matters)

Replicate popular content to edge nodes. Not P2P — just faster HTTP. For content that doesn't benefit from P2P (small audiences, non-video files).

## The Type System

The type stays `minio`. Streaming is infrastructure, not a type. The document can carry multiple references:

```json
{
  "raw": {"type": "minio", "value": "alice/video.mp4"},
  "stream": {"type": "minio", "value": "alice/video/stream.m3u8"},
  "thumbnail": {"type": "minio", "value": "alice/video/thumb.jpg"}
}
```

All `minio`. All presigned. The UI decides which to use. The API doesn't care.

## What About PeerTube's Torrenting?

BitTorrent for video distribution is clever but has trade-offs:

- **Torrenting requires the full file** — you can't stream partial torrents easily. You need the whole piece before playback.
- **WebRTC is better for streaming** — data channels deliver chunks in order, low latency.
- **Torrenting is better for distribution** — seed a file, everyone downloads in parallel.

PeerTube uses both: WebRTC for live streaming, torrents for on-demand, HLS for fallback. For web10, WebRTC P2P is the priority. Torrenting is niche — useful for large file distribution (datasets, backups), not for social media video.

## Summary

| Approach | When to Use | Infrastructure |
|---|---|---|
| Range requests | Everything, Day 1 | MinIO native |
| HLS transcoding | Video, adaptive bitrate | ffmpeg background job |
| WebRTC P2P | Popular content, concurrent viewers | Signaling server |
| Edge caching | Global audience, low latency | CDN |
| Tile-based | Large images, 3D models | Tiling background job |

Start with range requests. Add transcoding when video matters. Add P2P when popular content costs too much. The type stays `minio`. Streaming is infrastructure.