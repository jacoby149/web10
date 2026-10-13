# Client-Side Transcoding

## The Decision

Users can transcode their own videos in the browser before upload. The server receives a ready-to-stream file. This is a **cost optimization, not a gate**: the server always segments to HLS (v3 standard — `transcoding.md`), but if the client pre-encodes to H.264, the server job is *segmentation* (fast, no re-encode), not *transcoding* (expensive).

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
4. Server segments to HLS (fast — already H.264, no re-encode)
5. Document created with transcoding_settings (variants + thumbnails)
6. Adaptive playback via hls.js (signed manifest + JWT-gated segments)
```

If the client does NOT pre-encode (direct upload of a raw file), the server transcodes the full pipeline (re-encode + segment) — slower, more CPU, same result. The document shape is identical either way.

## The Trade-offs

### Speed

ffmpeg.wasm runs on the CPU. No hardware acceleration. A 5-minute 1080p video takes 5-15 minutes to transcode on a laptop. On a phone, 20+ minutes.

**Mitigation:** show progress. ffmpeg.wasm can report progress via logs. Show a progress bar: "Compressing your video... 45%". Users expect this — Instagram shows it, TikTok shows it.

### Quality

ffmpeg.wasm produces worse quality than server-side ffmpeg. No hardware presets. Slower encoding profiles. The output is "good enough" for social media, not broadcast quality.

**Mitigation:** skip pre-encode for quality-critical uploads — the server-side ffmpeg does a full re-encode anyway, so uploading the raw file directly loses nothing.

### Memory

WASM loads ~30MB. Input file lives in memory. Output lives in memory. Large files can OOM on low-end devices.

**Mitigation:** cap upload size on the client. If the file is over 500MB, show a warning. If it OOMs, fall back to direct upload (no transcoding).

### Browser Support

ffmpeg.wasm works in Chrome, Firefox, Safari. Requires SharedArrayBuffer (needs COOP/COOP headers). Most browsers support it.

**Mitigation:** feature detect. If SharedArrayBuffer is missing, fall back to direct upload.

## Progressive Playback (Fallback)

The uploaded file is a single MP4. MinIO supports range requests natively. The browser can start playing before the full file downloads.

```tsx
<video src={presignedUrl} controls />
```

That's the fallback: a file with no `transcoding_settings` (or `enabled: false`) plays progressive via range requests. Once the HLS pipeline has run, the player uses the signed manifest + hls.js instead — adaptive bitrate, no whole-file download.

## Summary

ffmpeg.wasm transcodes in the browser. User's CPU does the work. Server receives a ready-to-stream 720p H.264 file and segments it to HLS (fast — no re-encode). The document carries `transcoding_settings` either way; the player doesn't care which path produced the file.

**Default:** server-side transcode + segment (works for any upload, any device).

**Optimization:** client-side pre-encode (ffmpeg.wasm) — the server job drops from transcode to segment.

**Not a gate:** HLS is the v3 standard for all video. Client-side encoding saves server CPU; it doesn't unlock a feature.