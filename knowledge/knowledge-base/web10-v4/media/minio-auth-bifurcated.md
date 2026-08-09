# MinIO Auth: Bifurcated

## The Decision

Not all MinIO files need the same auth. Video HLS is the only thing that breaks presigned URLs. Everything else works fine with them.

| File type | Auth | How |
|---|---|---|
| Images, audio, documents | Presigned URL (1 hr TTL) | API generates URL, browser fetches directly from MinIO |
| Video (HLS segments) | JWT on every segment | Middleware validates, token expires → re-auth |

## Why Bifurcated

### The Problem with Presigned URLs for Video

A 10-minute video transcoded to HLS produces 100+ `.ts` segments. Each segment is a separate HTTP request. MinIO presigned URLs are per-object — you can't presign "this prefix for 10 minutes."

You could presign each segment individually, but that means 100+ presign operations per video view. Or you use a short-lived presigned URL (5 minutes) and it expires mid-video. Either way, presigned URLs don't work for HLS streaming.

### Why Presigned URLs Work for Everything Else

Images, audio, documents — these are single files. One presigned URL per file. The permission gate is the **document**, not the file.

```
User requests feed → API checks group membership → returns 10 posts
5 posts have images → API generates presigned URLs (1 hr TTL)
Browser fetches images → MinIO serves directly → no middleware, no latency
```

If someone shares a presigned image URL, it expires in an hour. Same as sharing a YouTube link. For social media, that's acceptable.

### Why Video Needs JWT + Middleware

HLS segments are small (270KB each), numerous (100+), and fetched continuously over minutes. You need auth on every segment without presigning each one.

**The solution:** signed manifest + JWT on every segment.

```
GET /alice/video/manifest.m3u8?sig=JWT(10min)
→ manifest returns segments with sig: 720p/seg001.ts?sig=JWT(10min)
→ MinIO middleware validates JWT on every segment request
→ token expires → viewer re-fetches manifest → API re-checks group membership
```

The middleware is lightweight — JWT validation is fast, no database hit. Token expires every 10 minutes → group membership is re-checked. Shared URLs die in 10 minutes.

## The Middleware

The middleware sits in front of MinIO for **HLS paths only**:

```
alice/video/*/seg*.ts    → middleware validates JWT
alice/video/*/manifest.m3u8 → middleware validates JWT
alice/photo.jpg           → bypasses middleware (presigned URL)
alice/audio.mp3           → bypasses middleware (presigned URL)
alice/doc.pdf             → bypasses middleware (presigned URL)
```

Path-based routing. Simple. The middleware only touches video segments.

## Why Not Signed Everything

You could put JWT auth on every MinIO request. No presigned URLs anywhere. Every image, every audio file, every document goes through the middleware.

**The cost:** a feed with 10 posts and 30 images means 30 middleware hops. Latency adds up. The middleware becomes a bottleneck. Every image load is now:

```
Browser → middleware (JWT check) → MinIO → image
```

Instead of:

```
Browser → MinIO (presigned) → image
```

**The benefit:** consistent auth. One system. No shared URLs anywhere.

**The verdict:** the benefit doesn't justify the cost. Images don't need segment-level auth. The document is the gate. Presigned URLs expire. Bifurcated handles the one case that breaks (video) and keeps everything else fast.

## What About Audio Streaming?

Audio files are single files, not HLS segments (unless you transcode audio to HLS too). A 5-minute podcast is one `.mp3` or `.ogg` file. Presigned URL works — one URL, one fetch, done.

If you transcode audio to HLS for streaming (range requests, progressive playback), then audio also needs JWT + middleware. But that's a later concern. Start with presigned URLs for audio. Add JWT if you HLS-transcode audio.

## Summary

Bifurcated auth is pragmatic. Video HLS breaks presigned URLs — 100+ segments over minutes need JWT + middleware. Everything else works with presigned URLs — the document is the gate, URLs expire, sharing is bounded. The middleware is video-only. Path-based routing. Simple.