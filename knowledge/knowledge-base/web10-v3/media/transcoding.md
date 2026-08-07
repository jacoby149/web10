# Transcoding

## The Problem

A user uploads a video. It could be anything: 4K ProRes from a camera, a screen recording at 144p, a phone video at 1080p H.265. The server needs to convert it into something that plays everywhere, streams efficiently, and doesn't cost a fortune to store.

## What Platforms Do

### YouTube

YouTube transcodes every upload into **many bitrates and resolutions**. A single upload becomes:

```
144p  @ 256 kbps
240p  @ 500 kbps
360p  @ 1 Mbps
480p  @ 2.5 Mbps
720p  @ 3.5 Mbps
720p  @ 5 Mbps (high)
1080p @ 8 Mbps
1080p @ 12 Mbps (high, 60fps if source supports)
1440p @ 20 Mbps
2160p @ 35 Mbps (4K)
```

Each resolution is an HLS manifest with adaptive segments. The client picks the best bitrate based on bandwidth. YouTube stores **all of them**. Storage cost is 5-10x the original file.

**Codec:** AV1 for new uploads (better compression than H.264/H.265). VP9 for older content. H.264 as fallback.

### Netflix

Netflix doesn't do adaptive bitrate per-file. They do **per-title encoding** — they analyze each video and pick the optimal bitrates for that specific content. A simple animation needs less bitrate than an action movie at the same resolution.

```
Simple animation @ 1080p → 3 Mbps
Action movie @ 1080p     → 8 Mbps
```

They use **CBR (Constant Bitrate)** encoding per rendition, not VBR. Storage is optimized because they don't over-encode simple content.

**Codec:** H.265 (HEVC), VP9, AV1.

### PeerTube

PeerTube transcodes to **HLS with multiple resolutions**. The admin configures which resolutions to produce:

```
Upload → ffmpeg → optimized H.264/AAC .mp4
              → HLS 360p (.m3u8 + .ts segments)
              → HLS 480p
              → HLS 720p
              → HLS 1080p (if source supports)
```

Each HLS variant is stored as `.ts` segments in the instance's storage. The HLS manifest (`.m3u8`) points to all segments. P2P Media Loader fetches segments from peers or HTTP.

**Codec:** H.264/AAC. No AV1. No per-title encoding.

### Twitch (Live)

Live streaming is different — you can't wait for transcoding. Twitch uses **real-time transcoding**:

```
RTMP ingest → real-time ffmpeg → multiple HLS bitrates
                                    160p @ 0.5 Mbps
                                    360p @ 1.5 Mbps
                                    480p @ 3 Mbps
                                    720p @ 3.5 Mbps
                                    1080p @ 6 Mbps
```

Transcoding happens as the stream plays. Viewers see whatever is available. Lower bitrates appear first, higher bitrates as the encoder catches up.

**Codec:** H.264 (AV1 rolling out). AAC audio.

## The web10 Approach

### Option 1: Single Bitrate (Simple)

Pick one bitrate. Transcode everything to it. Store one file.

```
Upload → ffmpeg → 720p @ 2.5 Mbps H.264/AAC → MinIO
```

**Pros:** Simple. One file. Low storage. No manifest.
**Cons:** Bad on slow connections (too heavy). Wasteful on fast connections (too low quality). No adaptive streaming.

**Verdict:** Too simple for a social platform. Users have different devices and connections.

### Option 2: Multiple Bitrates, HLS (Standard)

Transcode to 3-5 bitrates. Generate HLS manifest. Store segments in MinIO.

```
Upload → ffmpeg → 360p @ 1 Mbps   → MinIO (alice/video/360p/*.ts)
              → 720p @ 3 Mbps   → MinIO (alice/video/720p/*.ts)
              → 1080p @ 6 Mbps  → MinIO (alice/video/1080p/*.ts)
              → manifest.m3u8   → MinIO (alice/video/manifest.m3u8)
```

Document references the manifest:
```json
{
  "stream": {"type": "minio", "value": "alice/video/manifest.m3u8"}
}
```

**Pros:** Adaptive bitrate. Industry standard. Works with P2P Media Loader. Plays everywhere.
**Cons:** Storage multiplies (3-5x). Transcoding takes time. Upload-to-play latency.

**Verdict:** The standard approach. Worth the complexity.

### Option 3: Per-Title Encoding (Optimized)

Analyze the source. Pick optimal bitrates for this specific content.

```
Upload → analyze → "this is a screen recording, low motion"
              → 480p @ 1 Mbps (enough)
              → 720p @ 2 Mbps (enough)
              → skip 1080p (source is 720p anyway)
```

```
Upload → analyze → "this is an action video, high motion"
              → 360p @ 1.5 Mbps
              → 720p @ 4 Mbps
              → 1080p @ 8 Mbps
```

**Pros:** Optimal storage. Optimal quality. No waste.
**Cons:** Complex analysis pipeline. Requires ffmpeg + video analysis tools (like `ffmpeg -stats` or `vmaf`).

**Verdict:** Netflix does this because they optimize for petabytes of storage. For a social platform, standard bitrates are fine until scale matters.

### Option 4: AV1 Encoding (Future)

AV1 compresses 30-50% better than H.264. Same quality, half the bitrate.

```
Upload → ffmpeg → AV1 720p @ 1.5 Mbps (same quality as H.264 @ 3 Mbps)
```

**Pros:** Half the storage. Half the bandwidth. Better quality at same bitrate.
**Cons:** Slow encoding (CPU-heavy). Not all devices support AV1 playback yet (Safari 17+, Chrome, Firefox — but not older devices). Requires H.264 fallback.

**Verdict:** Start with H.264. Add AV1 as a background job for popular content. Fallback to H.264 for older devices.

## The ffmpeg Pipeline

### Standard HLS Transcoding

```bash
# Single pass, multiple resolutions
ffmpeg -i input.mp4 \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_segment_filename "output/360p/seg%d.ts" \
  -s 640x360 -b:v 1M -b:a 128k \
  "output/360p/index.m3u8" \
  -s 1280x720 -b:v 3M -b:a 128k \
  -hls_segment_filename "output/720p/seg%d.ts" \
  "output/720p/index.m3u8"
```

This produces `.ts` segments (6 seconds each) and `.m3u8` manifests for each resolution. Upload all segments to MinIO. The master manifest points to all variants:

```
# MASTER MANIFEST (manifest.m3u8)
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=640x360
360p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3500000,RESOLUTION=1280x720
720p/index.m3u8
```

### Two-Pass for Quality

```bash
# Pass 1: analyze
ffmpeg -i input.mp4 -b:v 3M -pass 1 -f null /dev/null

# Pass 2: encode
ffmpeg -i input.mp4 -b:v 3M -pass 2 \
  -hls_time 6 \
  -hls_segment_filename "output/seg%d.ts" \
  "output/index.m3u8"
```

Two-pass is slower but produces better quality at the same bitrate. For social media, single-pass is fine.

## Storage in MinIO

HLS segments are small files (6 seconds × bitrate). A 10-minute video at 3 Mbps produces ~200 segments of ~270KB each.

```
alice/video/123/
  manifest.m3u8          (master manifest, 200 bytes)
  360p/
    index.m3u8           (variant manifest, 2KB)
    seg000.ts            (270KB)
    seg001.ts            (270KB)
    ...
  720p/
    index.m3u8           (variant manifest, 2KB)
    seg000.ts            (600KB)
    seg001.ts            (600KB)
    ...
```

## Storage in MinIO

HLS segments are small files (6 seconds × bitrate). A 10-minute video at 3 Mbps produces ~200 segments of ~270KB each.

```
alice/video/123/
  manifest.m3u8          (master manifest, 200 bytes)
  360p/
    index.m3u8           (variant manifest, 2KB)
    seg000.ts            (270KB)
    seg001.ts            (270KB)
    ...
  720p/
    index.m3u8           (variant manifest, 2KB)
    seg000.ts            (600KB)
    seg001.ts            (600KB)
    ...
```

MinIO handles millions of small files fine. The question is: how do presigned URLs work when a viewer fetches hundreds of segments over 10 minutes?

## Presigned URLs for Streaming

HLS fetches the manifest, then fetches segments one-by-one. Each segment is a separate HTTP request. MinIO presigned URLs are per-object — you can't presign "this prefix for 10 minutes."

**The problem:** a 10-minute video has 100+ segments. You can't presign each one individually. And a 60-second presigned URL expires mid-video.

**Two approaches:**

### Approach 1: Long TTL on the Manifest (Simpler, Insecure)

Presign the master manifest with a 30-minute TTL. The manifest contains relative paths to segments. Once someone has the manifest URL, they can share it — anyone can watch for 30 minutes. Group membership is bypassed.

**This is what PeerTube does.** For public content it's fine. For private groups it's a leak.

### Approach 2: Signed Manifest + Token on Every Segment (Recommended)

The API returns a manifest URL with a signature:

```
GET /alice/video/manifest.m3u8?sig=eyJhbGciOi...  (JWT, 10 min TTL)
```

The manifest embeds the token in every segment URL:

```
# manifest.m3u8
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=640x360
360p/index.m3u8?sig=eyJhbGciOi...
#EXT-X-STREAM-INF:BANDWIDTH=3500000,RESOLUTION=1280x720
720p/index.m3u8?sig=eyJhbGciOi...
```

Segment variant manifests also carry the token:

```
# 720p/index.m3u8
#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
seg001.ts?sig=eyJhbGciOi...
#EXTINF:6.0,
seg002.ts?sig=eyJhbGciOi...
```

A **MinIO middleware** validates `sig` on every segment request. It's a JWT — the middleware verifies the signature and checks expiry. No database hit. If the token is expired, the viewer re-fetches the manifest (which re-checks group membership via the API).

**Why this works:**
- Every segment is permission-gated
- Token expires → re-auth → group membership re-checked
- Lightweight — JWT validation is fast, no DB
- Shared URLs expire in 10 minutes
- The API controls the token lifetime

**The middleware:** a thin proxy in front of MinIO. Validates JWT, forwards to MinIO. Or a MinIO lifecycle policy with custom auth headers.

## Auth: Bifurcated

Not all MinIO files need the same auth. Video HLS is the only thing that breaks presigned URLs — 100+ segments over 10 minutes can't be presigned individually, and a short-lived presigned URL expires mid-video. Everything else works fine with presigned URLs.

| File type | Auth | How |
|---|---|---|
| Images, audio, docs | Presigned URL (1 hr TTL) | API generates URL, browser fetches directly from MinIO |
| Video (HLS segments) | JWT on every segment | Middleware validates, token expires → re-auth |

**Why bifurcated:** the permission gate for non-video files is the document. You got the document (group membership checked), the file URL is part of it. One presigned URL per file. Done. If someone shares it, it expires in an hour — same as sharing a YouTube link.

Video is different. 100+ segments over 10 minutes need JWT + middleware. Bifurcated handles the one case that breaks, keeps everything else simple.

**The middleware is video-only.** It sits in front of MinIO for HLS paths (`alice/video/*/seg*.ts`). Everything else bypasses it.

## The React Player

hls.js works in React/TypeScript. The library handles ABR — it monitors bandwidth and switches quality automatically. You don't implement adaptation.

```tsx
import Hls from 'hls.js';
import { useEffect, useRef } from 'react';

function VideoPlayer({ manifestUrl }: { manifestUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Safari plays HLS natively — no library needed
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = manifestUrl;
      return;
    }

    // Chrome, Firefox, etc. — use hls.js
    const hls = new Hls();
    hls.loadSource(manifestUrl);
    hls.attachMedia(video);

    // Optional: track quality switches
    hls.on(Hls.Events.LevelSwitched, (e, data) => {
      console.log('Quality:', data.details.levelId); // 0=360p, 1=720p, etc.
    });

    return () => hls.destroy();
  }, [manifestUrl]);

  return <video ref={videoRef} controls />;
}
```

Types via `@types/hls.js`. That's it. The player:
1. Loads the manifest
2. Reads available bitrates (360p @ 1Mbps, 720p @ 3Mbps, 1080p @ 6Mbps)
3. Fetches first segment, measures download speed
4. Picks the best quality that fits the bandwidth
5. Continues monitoring — drops quality if bandwidth drops, raises if it recovers
6. Maintains a buffer — pre-fetches segments ahead so playback is smooth

The UI doesn't need to know about bitrates. It loads the manifest, the player adapts.

## Viewing: Real-Time, No Queue

**Transcoding needs a queue.** ffmpeg takes time. Celery (Python) or BullMQ (Node) handles the queue — job is enqueued, workers pick it up, ffmpeg runs, segments upload to MinIO, document is updated.

**Viewing does not.** Segments are pre-transcoded and sitting in MinIO. The browser fetches them on demand via HTTP. No queue, no worker, no latency. It's just:

```
Browser → HTTP GET → MinIO → .ts segment → browser
```

The only "queue" is hls.js's internal buffer — it pre-fetches a few segments ahead. That's client-side. The server just serves files.

## The Pipeline

```
UPLOAD (queued):
  1. User uploads video → MinIO (raw file, temporary)
  2. Celery job picks up upload
  3. ffmpeg transcodes → multiple HLS variants → MinIO
  4. Raw file deleted (or kept for re-encoding later)
  5. Document updated with stream URL
     {"stream": {"type": "minio", "value": "alice/video/123/manifest.m3u8"}}

VIEWING (real-time):
  6. API returns document (permission check: group membership)
  7. UI sees stream field → passes manifest URL to hls.js
  8. hls.js fetches manifest → fetches segments → plays
     No queue. No worker. Just HTTP.
```

## Summary

| Approach | Bitrates | Storage | Complexity | When |
|---|---|---|---|---|
| Single bitrate | 1 | 1x | Low | Prototypes only |
| Multiple bitrates (HLS) | 3-5 | 3-5x | Medium | Standard approach |
| Per-title encoding | Variable | Optimized | High | At scale |
| AV1 encoding | 3-5 | 1.5-2.5x | Medium | Future-proof |

**Recommendation:** Start with multiple bitrates (HLS). 360p, 720p, 1080p. ffmpeg single-pass. Store segments in MinIO. Presign the master manifest (30-min TTL, segments are relative). Celery for transcoding queue. hls.js for playback — it handles ABR, you don't. Add AV1 as a background optimization later. Add per-title encoding if storage costs become a problem.