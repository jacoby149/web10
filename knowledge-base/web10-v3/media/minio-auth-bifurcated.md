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

### Direct Refresh Is Owner-Only

`POST /v3/media/read-url` accepts an object key, not proof that the caller can
read a carrier document. It may mint a fresh URL only for a key in the verified
caller's exact `username/` object namespace. This includes uploads awaiting
metadata confirmation and owned derivatives; metadata presence is not required.
A viewer cannot refresh somebody else's key directly. To obtain a new URL,
the viewer re-reads an authorized carrier document, where the document/group
gate decides whether media may be resolved. Public thumbnails continue through
their existing document-access path, not through direct key refresh.

Keys are opaque S3 names: ownership checks must not decode or normalize a
caller key into a different object. Existing URLs remain bearer capabilities
until expiry; membership removal does not invalidate an already-issued URL
before its TTL. This endpoint restriction does not repair forged foreign keys
stored in metadata/minio references or certify every resolver; those remain
separate object-provenance obligations in the security record.

### Stored Media References

For `media_refs`, looking up an owner-scoped metadata row does not authorize
every key written into that row. `resolve_media_urls(body, media_owner)` may
mint original and thumbnail URLs only for nonempty keys in that owner's exact
`username/` namespace. A rejected supplied key yields no URL and cannot fall
back to a stored URL; an allowed companion key and other references still
resolve. Genuinely keyless legacy metadata retains its existing URL fallback.
Keys remain opaque, not decoded or normalized. The owner comes from the already
authorized document's media-owner context (`posted_by` for group-authored posts),
not from the viewer, so group-authorized cross-user media remains supported.

This is the metadata-reference signing boundary, not certification of recursive
raw minio leaves, legacy stored URLs, HLS provenance or caller-selected owner
columns. Those separate sinks/authority contexts remain recorded security debt.

### Why Video Needs JWT + Middleware

HLS segments are small (270KB each), numerous (100+), and fetched continuously over minutes. You need auth on every segment without presigning each one.

**The solution:** signed manifest + JWT on every segment.

```
GET /alice/video/manifest.m3u8?sig=JWT(10min)
→ manifest returns segments with sig: 720p/seg001.ts?sig=JWT(10min)
→ MinIO middleware validates JWT on every segment request
→ token expires → viewer re-fetches manifest → API re-checks access
```

The middleware is lightweight — JWT validation is fast, no database hit. Token expires every 10 minutes → access is re-checked. Shared URLs die in 10 minutes.

**The access re-check (v3, D68).** The sig is bound to (reader, doc, hls
prefix). On every manifest (re)fetch the API re-runs `can_view_doc`: the
reader may view the media doc if they are (1) the author, (2) a member of a
group the media doc belongs to, **or (3) a reader of a post that carries the
media** — a `posts` doc whose `media_refs` include the media doc_id, in a
group the reader can read. Rule (3) is the cross-user feed path: social
media docs (confirmMediaUpload) are groupless, so a follower streams a
creator's video through the post's groups — the post is the access model,
the media doc is owned data, not a boundary. It leaks nothing new: the post
read already grants every post reader a presigned `read_url` for the raw
file (the renditions are strictly less data). A removed/blocked follower
loses the stream within one sig TTL.

**Rule (3) is the read path's own gate — not a second model.** "Can read the
group" means the D58 effective-role check (`can_read_group`): membership OR
the group's `anyone`/`authenticated` grant. The public board's reader is NOT
a member — it reads through the `anyone` grant (the D58 backfill renamed the
discover board's `anon` member row to `anyone`). A literal-membership check
here would 403 every anon-minted sig: the marketing `/trending` board reads
anon, the read granted the post, but the manifest re-check said no → the
player degraded to "can't be played in your browser" while the same video
played fine in the social app (a real user, a real membership row). The
re-check and the read must answer "can this reader see this?" the same way —
the re-check exists to make revocation work within one sig TTL, not to be a
stricter second gate. The sig carries an `authenticated` flag (minted at
read time) so the re-check evaluates the same principal classes the read
did: an anon read re-checks as anon and can never upgrade to
`authenticated`-only grants.

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
