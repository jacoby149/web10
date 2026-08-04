# Client-Side Transcoding

## The Decision

Users transcode their own videos in the browser before upload. The server receives a ready-to-stream file. No server-side ffmpeg. No transcoding queue. No compute cost.

## Why

Server-side transcoding is expensive. Every upload costs CPU time, storage for intermediate files, and queue infrastructure. At scale, it's the biggest infrastructure cost after bandwidth.

Client-side transcoding shifts the cost to the user. Their CPU does the work. Their bandwidth sends the optimized file. The server just stores and serves.

**Instagram, TikTok, Twitter, and Discord all do this.** They don't accept raw files — the app encodes before sending. For a social platform, client-side encoding is the norm, not the exception.

## The Library: ffmpeg.wasm

FFmpeg compiled to WebAssembly. Runs in the browser. No native dependencies. No server.

```tsx
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

async function transcode(file: File): Promise<ArrayBuffer> {
  await ffmpeg.load();
  await ffmpeg.writeFile('input.mp4', await fetchFile(file));

  // Compress to 720p H.264, target 2Mbps
  await ffmpeg.exec(
    '-i', 'input.mp4',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-b:v', '2M',
    '-maxrate', '2.5M',
    '-bufsize', '5M',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-s', '1280x720',
    '-movflags', '+faststart',
    'output.mp4'
  );

  const data = await ffmpeg.readFile('output.mp4');
  return data;
}
```

The output is a 720p H.264 MP4 with faststart (moov atom at the front for progressive playback). Upload that to MinIO. Done.

## The Upload Flow

```
1. User selects video (could be 4K ProRes, 2GB)
2. ffmpeg.wasm transcodes → 720p H.264 @ 2Mbps (~150MB)
3. Upload optimized file to MinIO
4. Document created:
   {"media": [{"type": "minio", "value": "alice/video/upload.mp4"}]}
5. Progressive playback via range requests (MinIO native)
```

No transcoding queue. No Celery workers. No ffmpeg on the server. The file is ready when it arrives.

## The Trade-offs

### Speed

ffmpeg.wasm runs on the CPU. No hardware acceleration. A 5-minute 1080p video takes 5-15 minutes to transcode on a laptop. On a phone, 20+ minutes.

**Mitigation:** show progress. ffmpeg.wasm can report progress via logs. Show a progress bar: "Compressing your video... 45%". Users expect this — Instagram shows it, TikTok shows it.

### Quality

ffmpeg.wasm produces worse quality than server-side ffmpeg. No hardware presets. Slower encoding profiles. The output is "good enough" for social media, not broadcast quality.

**Mitigation:** the pro feature (below) exists for users who care.

### Memory

WASM loads ~30MB. Input file lives in memory. Output lives in memory. Large files can OOM on low-end devices.

**Mitigation:** cap upload size on the client. If the file is over 500MB, show a warning. If it OOMs, fall back to direct upload (no transcoding).

### Browser Support

ffmpeg.wasm works in Chrome, Firefox, Safari. Requires SharedArrayBuffer (needs COOP/COOP headers). Most browsers support it.

**Mitigation:** feature detect. If SharedArrayBuffer is missing, fall back to direct upload.

## Progressive Playback (No HLS Yet)

The uploaded file is a single MP4. MinIO supports range requests natively. The browser can start playing before the full file downloads.

```tsx
<video src={presignedUrl} controls />
```

That's it. No HLS. No manifest. No segments. Range requests handle streaming. For files under 200MB, this works fine.

When HLS becomes a priority (longer videos, adaptive bitrate), add server-side HLS segmentation as a background job. The file is already H.264 — segmentation is fast.

## The Pro Feature: Server-Side Transcoding

Client-side transcoding is the default. Server-side transcoding is a paid feature:

| | Free | Pro |
|---|---|---|
| Transcoding | Client-side (ffmpeg.wasm) | Server-side (ffmpeg, hardware accel) |
| Quality | Good enough | Best quality, multiple bitrates |
| HLS | No (range requests) | Yes (adaptive bitrate) |
| Max resolution | 720p | 4K |
| Formats | H.264 | H.264, AV1, H.265 |
| Upload size | 500MB raw | 4GB raw |

The pro feature is the **server doing the work**. Upload raw, server transcodes to HLS with multiple bitrates, AV1, per-title encoding. The infrastructure cost is covered by the subscription.

This is a clean monetization path. Free users get social media quality. Pro users get broadcast quality. The server only transcodes for paying users.

## The Mobile App (Future)

- **iOS:** `AVAssetExportSession` — hardware-accelerated, fast, high quality
- **Android:** `MediaCodec` — hardware-accelerated, fast, high quality

The mobile app transcodes in seconds, not minutes. The same upload flow applies: transcode → upload → done.

## Summary

ffmpeg.wasm transcodes in the browser. User's CPU does the work. Server receives a ready-to-stream 720p H.264 file. No transcoding queue. No server-side ffmpeg. No compute cost.

**Default:** client-side transcoding, range request playback, 720p H.264. Good enough for social media.

**Pro feature:** server-side transcoding, HLS adaptive bitrate, multiple resolutions, AV1, 4K. For users who care about quality.

**Mobile app:** platform encoders (AVAssetExportSession, MediaCodec). Hardware-accelerated. Fast.

The server doesn't get screwed. The user pays with their CPU. The pro feature pays with their wallet.