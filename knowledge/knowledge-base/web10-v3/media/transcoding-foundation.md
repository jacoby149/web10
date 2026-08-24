# Transcoding Foundation

## The Model

The source video is a document. Its body carries a `minio` type with `transcoding_settings`. The settings hold the array of what the video was transcoded to — resolutions, bitrates, thumbnails. Each variant blob is uploaded to MinIO separately.

```
Source video document
  └─ body.url (minio type)
       └─ transcoding_settings
            └─ variants [360p, 720p, 1080p]
            └─ thumbnails [0s, 92s]
```

## v3 — Transcoded (HLS)

v3 transcodes. Video uploads go through the HLS pipeline: ffmpeg produces adaptive-bitrate variants + a master manifest, all stored in MinIO. The source document becomes the manifest — it carries the array of variants and thumbnails:

```json
{
  "doc_id": "doc-source-abc",
  "collection_name": "media",
  "body": {
    "url": {
      "type": "minio",
      "value": "alice/video/vacation-raw.mp4",
      "transcoding_settings": {
        "enabled": true,
        "variants": [
          {
            "width": 640,
            "height": 360,
            "fps": 30,
            "bitrate_kbps": 1000,
            "codec": "h264",
            "duration_seconds": 185.3,
            "url": {
              "type": "minio",
              "value": "alice/video/vacation/360p/index.m3u8"
            }
          },
          {
            "width": 1280,
            "height": 720,
            "fps": 30,
            "bitrate_kbps": 2500,
            "codec": "h264",
            "duration_seconds": 185.3,
            "url": {
              "type": "minio",
              "value": "alice/video/vacation/720p/index.m3u8"
            }
          },
          {
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "bitrate_kbps": 5000,
            "codec": "h264",
            "duration_seconds": 185.3,
            "url": {
              "type": "minio",
              "value": "alice/video/vacation/1080p/index.m3u8"
            }
          }
        ],
        "thumbnails": [
          {
            "width": 640,
            "height": 360,
            "timestamp_seconds": 0,
            "url": {
              "type": "minio",
              "value": "alice/video/vacation-thumb-0s.jpg"
            }
          },
          {
            "width": 640,
            "height": 360,
            "timestamp_seconds": 92,
            "url": {
              "type": "minio",
              "value": "alice/video/vacation-thumb-92s.jpg"
            }
          }
        ]
      }
    }
  }
}
```

Each variant `url` is itself a `minio` type, pointing at that rendition's HLS variant manifest (`index.m3u8` + its `.ts` segments). The **master manifest is not stored as a separate source of truth** — the API synthesizes it from the `variants` array (it's just an `EXT-X-STREAM-INF` list) and signs it. The document is the source of truth; the manifest is a view over it. The player reads the variants array, starts at the lowest bitrate, adapts up as bandwidth allows. Like YouTube starting fuzzy and getting crispier.

Non-video files never carry `transcoding_settings` — or carry it as `enabled: false`. One blob, one URL, no variants.

## How a Post References a Video

A post refs the source video document. The source carries the transcoding settings. The player reads the settings, picks a variant, plays:

```json
{
  "doc_id": "doc-post-123",
  "collection_name": "posts",
  "body": {
    "text": { "type": "text", "value": "vacation highlights" },
    "media": [
      { "type": "ref", "value": "doc-source-abc" }
    ]
  }
}
```

On read: ref → source video doc → `transcoding_settings` → the player requests the signed manifest from the API (synthesized from `variants`) → hls.js adapts.

## Why `transcoding_settings` on the `minio` Type

The `minio` type is the only type where transcoding matters. Text, numbers, bools — none of them get transcoded. By putting `transcoding_settings` on the `minio` object, the encoding details travel with the blob reference. The API sees a `minio` type, converts to presigned URL, and the settings come along as context.

`enabled: true` — the video serves through the signed-manifest flow: the API synthesizes the master manifest from `variants`, and segments are JWT-gated (`minio-auth-bifurcated.md`). `enabled: false` — a plain `minio` ref, presigned as usual.

## What v3 Does Not Do

- No per-title encoding (Netflix-style per-content bitrate analysis).
- No AV1 (H.264 only; AV1 is a background optimization for later).
- No P2P delivery (WebRTC segment sharing — v4, `../../web10-v4/media/peertube-p2p-stack.md`).
- No live streaming (real-time RTMP ingest transcoding).
- No edge caching / CDN replication.

The pipeline is: upload → in-process ffmpeg worker → HLS variants + master manifest → MinIO → signed manifest + JWT-gated segments → hls.js playback. Details: `transcoding.md` (the pipeline), `streaming.md` (the layers), `minio-auth-bifurcated.md` (the auth split), `client-side-transcoding.md` (optional pre-encode in the browser).

## Reference

- Full transcoding pipeline: `transcoding.md` (in this folder)
- Streaming layers: `streaming.md` (in this folder)
- Auth split (presigned vs JWT segments): `minio-auth-bifurcated.md` (in this folder)
- Why the type stays `minio`: `why-minio-not-file-types.md`, `streaming-tension.md` (in this folder)
- Client-side pre-encode: `client-side-transcoding.md` (in this folder)
