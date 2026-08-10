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

## v3 — No Transcoding

v3 does not transcode. The `transcoding_settings` field exists but is `false`. The source video is the only thing:

```json
{
  "doc_id": "doc-source-abc",
  "collection_name": "media",
  "body": {
    "url": {
      "type": "minio",
      "value": "alice/video/vacation-raw.mp4",
      "transcoding_settings": {
        "enabled": false
      }
    }
  }
}
```

The `"url"` is a `minio` type — the API converts it to a presigned URL. That's it. One blob, one URL, no variants.

## v4 — Transcoded

When transcoding happens (v4), the settings expand. The source document becomes the manifest — it carries the array of variants and thumbnails:

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
              "value": "alice/video/vacation-360p.mp4"
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
              "value": "alice/video/vacation-720p.mp4"
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
              "value": "alice/video/vacation-1080p.mp4"
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

Each variant `url` is itself a `minio` type. The API resolves all of them to presigned URLs — recursively. The player reads the variants array, starts at the lowest bitrate, adapts up as bandwidth allows. Like YouTube starting fuzzy and getting crispier.

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

On read: ref → source video doc → `transcoding_settings.variants` → presigned URLs. The player gets the adaptive bitrate array.

## Why `transcoding_settings` on the `minio` Type

The `minio` type is the only type where transcoding matters. Text, numbers, bools — none of them get transcoded. By putting `transcoding_settings` on the `minio` object, the encoding details travel with the blob reference. The API sees a `minio` type, converts to presigned URL, and the settings come along as context.

For v3, `enabled: false` — the field exists, nothing to resolve. For v4, `enabled: true` — the API recursively resolves all the nested `minio` types in the variants array.

## What v3 Does Not Do

- No ffmpeg. No transcoding queue. No Celery workers.
- No automatic thumbnail extraction.
- No video analysis.

`transcoding_settings.enabled` is `false`. The client uploads the raw file, that's what the user sees. v4 turns it on.

## Reference

Full transcoding strategy: `../web10-v4/media/transcoding.md`
Client-side transcoding: `../web10-v4/media/client-side-transcoding.md`
Mobile transcoding: `../web10-v4/media/mobile-transcoding.md`
Streaming approaches: `../web10-v4/media/streaming.md`