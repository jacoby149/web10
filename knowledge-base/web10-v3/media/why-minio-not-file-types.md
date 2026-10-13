# The `minio` Type: Why Not `video`, `audio`, `image`?

## The Current Model

There is one media type: `minio`. The API doesn't distinguish between file formats.

```json
{"type": "minio", "value": "alice/photo.jpg"}
{"type": "minio", "value": "alice/video.mp4"}
{"type": "minio", "value": "alice/presentation.pdf"}
```

The API behavior is the same for all: convert the MinIO path to a presigned URL. That's it.

## Why Not Separate Types?

You could have `video`, `audio`, `image`, `document` types. Each could trigger different API behavior:

- `video` → transcode, generate thumbnails, extract duration
- `audio` → generate waveform, extract duration
- `image` → resize, generate thumbnails
- `document` → extract text, generate preview

**Don't do it.** Here's why:

### 1. The API Shouldn't Know About Formats

The API's job is permission enforcement and URL conversion. It checks "can this user access this blob?" and returns a URL. What the blob *is* — video, audio, docx, fbx — is the UI's problem.

Every new format you add to the type system is a new code path in the API. Every new code path is a new bug. The `minio` type has one code path: presigned URL.

### 2. The UI Already Knows

The UI has the file extension. It has the MIME type from the HTTP response headers. It can decide how to render:

```
.mp4  → <video> tag
.mp3  → <audio> tag
.jpg  → <img> tag
.pdf  → embedded viewer or download link
.docx → Office online viewer or download link
```

The UI is in the best position to make this decision because it controls the rendering surface. A mobile app might downsample video. A desktop app might show full resolution. A smart watch might just show a thumbnail. Same file, different rendering.

### 3. Formats Proliferate

Today you have jpg, mp4, mp3. Tomorrow you have avif, webm, opus, flac, ogg. Next year something else. If the API has to know about every format, it's always behind. If the API just returns a URL, it's format-agnostic forever.

### 4. Processing Is Optional, Not Mandatory

Thumbnail generation, transcoding, text extraction — these are nice-to-have features. They should be background jobs, not part of the type system. The type system describes what data *is*, not what you *do* with it.

If you want thumbnails, run a background job that watches MinIO uploads and generates them. The type stays `minio`. The thumbnail is another `minio` reference the app chooses to include.

### 5. A `file` Type Would Be the Same Thing

Collapsing `minio` to `file` doesn't change anything. The API still just returns a URL. The only difference is the name. `minio` is more specific — it tells the API "this value is a MinIO path, convert it." `file` is ambiguous — is it a local path? A URL? A MinIO reference?

Keep `minio`. It's specific about what the value is (a MinIO object path) and what the API should do (presign it).

## What About Rich Document Support?

If you want the UI to render a `.docx` nicely, the document body can carry metadata:

```json
{
  "text": {"type": "text", "value": "project proposal"},
  "attachment": {"type": "minio", "value": "alice/proposal.docx"},
  "preview": {"type": "text", "value": "executive summary..."}
}
```

The `preview` field is the app's choice. The API doesn't care. The UI renders what it can.

## Summary

One media type. `minio`. The API converts to presigned URLs. The UI renders based on format. The API stays simple. The UI stays flexible. New formats don't break anything.

The type system describes what data *is*, not what you *do* with it. Processing (thumbnails, transcoding, extraction) is a background concern, not a type concern.