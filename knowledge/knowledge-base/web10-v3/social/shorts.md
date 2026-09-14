# Shorts — the vertical short-form feed

The `video-player.md` doc settled *how* a video renders (one `<VideoPlayer>`, two axes). This doc settles the *surface* it deferred: the full-screen, vertical, swipe-between-posts feed — the TikTok / Reels / YouTube-Shorts shape. It also settles the two questions that decide whether the feature is bulletproof: **how does a post become a short, and can someone fake it?**

## The use case

A fan opens Shorts. They get a full-screen, 9:16, vertical, swipe-up feed of short clips — the same clips creators post, but in the immersive lens. Swipe up for the next one. No card chrome, no feed list, no yank. It is the one surface where the video *is* the screen.

That is the whole goal. Everything below is in service of it.

## A short is a post, not a new thing

The load-bearing fact: **in web10, a post appears in a feed because it is attached to a group the reader can read.** One `posts` collection; groups define access (D30/D58). A short is *already* a public post, so it is *already* attached to the discover group. **The Shorts feed is a *view* over the discover group, filtered to shorts — not a new place, not a new group, not a new collection.**

This kills three of the four "how do we do this" questions at once:

| Question | Answer |
|---|---|
| New `shorts` collection? | **No.** A short is a `posts` doc. A separate collection would fork the read/engagement/discovery/moderation machinery and break the one-collection invariant. |
| New "shorts group"? | **No.** A public short is already on the discover group. The feed reads that group and filters. |
| Auto-detect or user-elects? | **Auto-detect, opt-out.** A post with exactly one 9:16 video *is* a short. The creator already signaled it by shooting/cropping vertical. No "post as short" toggle for the common case. |
| How does it get in the feed? | It's a public post → already on discover → the Shorts feed reads discover and keeps the shorts. |

**Why 9:16, not "under 3 minutes"?** Every video in web10 is already ≤ 3 minutes — there is a hard upload cap, `MAX_VIDEO_DURATION = 180` (`mediaProcessing.ts:11`). Duration is therefore a non-discriminator: it would make *every* video a short, including a 16:9 landscape clip that isn't one. The signal that actually makes something a short is **aspect ratio: 9:16 vertical** (`width < height`). That is what TikTok/Shorts are.

## The mechanism

### Write (one line)

`createPost`'s body (`posts.ts`) writes `tags` — a first-class column the read side already maps (`fromV3DocToPost`, `types.ts:83`) that the create path previously never populated. The composer sets `tags: ['short']` when the attached video is 9:16 (`PostComposer.tsx` — `mediaItems.length === 1 && isVideo && width < height`).

`short` sits alongside the existing post tags — `ad` / `ad_album` (`ads.ts:34-37`) and `video` (Discover already checks `post.tags?.includes('video')`, `DiscoverScreen.tsx:649`). It is the same established mechanism, not a new one.

### Read (the new part)

`ShortsScreen` (`/shorts`) reads the discover group and keeps the shorts:

- **v1 (ship now, zero API change):** `w.read('posts', { groups: [discoverGroup], limit })`, filter client-side to posts whose single media is `video/*` **and** `width < height` (9:16). The read primitives all exist; the only new thing is the surface.
- **v1.5 (server-side, clean):** filter on the server so the feed pulls *only* shorts. The idiom already exists in the API — the node-ad read does `WHERE … AND has(tags, 'node_ad') AND deleted = 0` (`clickhouse.py:2419`). The equivalent is `has(tags, 'short')`. Two ways to expose it: (a) a `tags` param on the `read`/`feed` endpoint threading into `read_documents_in_groups` / `read_feed`, or (b) the flexible read — `w.query("SELECT … FROM posts WHERE has(tags,'short')")`, which is already I3-safe by construction (the boundary CTE) and needs no endpoint change.

### The surface

A full-screen vertical swipe container. Each slide composes the existing player — the one-liner `video-player.md:70` already anticipated:

```
Shorts:  <VideoPlayer source={hlsOrFile} mode="inline" fit="cover" ratio={9/16} />
```

The 9:16 phone-width column is already handled at the player level (`HlsVideoPlayer.tsx:65-69`), and the composer already offers a 9:16 crop preset (`VideoEditorSheet.tsx:16`). The genuinely new code is the **swipe container** (scroll-snap / full-page vertical), which `video-player.md:113` explicitly called "a separate, later surface" — this is that surface.

**Deep link (the address-bar rule):** `/shorts` for the feed, `/shorts/:postId` to land on a specific short. Refresh restores the position; the link is shareable (shorts are public).

## The security questions, answered with code

The operator's concern: *can someone hack the system — put an image in, or a wrong-ratio file, and have it show up as a short?* Here is what the code actually does, and where the trust boundaries are.

### Q1 — Can the API filter to require the `short` tag present?

**Yes, and it already does this for another tag.** `tags` is a first-class `Array(String)` column on the `documents` table (`clickhouse.py:565,590,719`). The node-ad read filters on it today: `WHERE collection_name = 'posts' AND has(tags, 'node_ad') AND deleted = 0` (`clickhouse.py:2419`). `has(tags, 'short')` is the exact same idiom. The only gap is that the standard `w.read` / `w.feed` endpoints do not *expose* a tag param (their opts are `groups, limit, offset, ref, sort`); the tag filter lives in the SQL layer and is reachable today via the flexible read (`w.query`). So: **the capability exists and is proven; exposing it on `read`/`feed` is a small, well-trodden addition.**

### Q2 — Will MinIO "securely tell us it is 9:16 video"? Can someone smuggle an image in?

**No — and this is the one to understand.** MinIO/S3 is a *byte store*. It stores the object and returns the `Content-Type` the **uploader declared**. It does not decode the file, measure its dimensions, or verify it is really video. It is not an oracle for "is this 9:16 video."

What the node actually enforces, and what it doesn't:

| Layer | Enforced? | By what |
|---|---|---|
| Declared `Content-Type` on upload | **Yes** | the presigned POST bakes in `Conditions=[{"Content-Type": mime_type}]` (`media.py:50-52`) — S3 rejects an upload whose declared type differs. |
| Real file is video / real dimensions | **No** | `confirm_media_upload` (`clickhouse.py:3336-3362`) stores the client-asserted `width`/`height`/`duration_seconds`/`mime_type` **as-is**. The node never opens the file. |
| Duration ≤ 180s | **No (server)** | enforced **client-side only** (`mediaProcessing.ts:224`). A direct API caller can assert a longer duration. |

So the honest answer to "can someone put an image in?": **yes, at the metadata level.** A direct API caller (bypassing the composer) can create a `posts` doc tagged `short` whose `media_refs` point at an image, or a video with a lying `width`/`height`. The node will store and serve it. **The `short` tag and the 9:16 dimensions are client-asserted, not server-verified.**

### Q3 — So is it "bulletproof"? What's the actual threat model?

The honest framing, in line with D41 (the node is readable by design; trust is *legal*, not cryptographic):

- **A *malicious* attacker faking shorts is not a meaningful threat.** Faking a short is not a privilege escalation — it produces a piece of *content on the public board*, exactly like any other post. It is subject to the same moderation (`_moderate_post`, `documents.py:17-43`), the same block/sharing/hidden anti-joins, and the same I3 boundary as every post. There is no "shorts admin" to impersonate, no money to touch, no private data to leak. The worst case is a junk post, which is the worst case of *any* post.
- **The real risk is *quality*, not security.** A lying `width`/`height` (or an image tagged `short`) makes the immersive feed render a broken slide — a letterboxed image, a non-playing "video," a layout jump. That is a UX-integrity problem, not a breach.
- **The defense that actually matters is *defense in depth at render*, not server verification.** The Shorts feed should **re-derive 9:16 from the resolved media at read time** (`mime_type` starts with `video/` **and** `width < height`) rather than trusting the `short` tag alone. The tag is the *server-side filter* (cheap, indexable); the aspect-ratio + mime check is the *render-time gate* (drops the fakes). A post that is tagged `short` but whose media isn't actually a vertical video simply doesn't render as a short. No server-side file decoding required.

**The optional hardening (if the operator wants server-side truth):** the transcode worker already runs ffmpeg over every uploaded video (`/v3/media/transcode`, `media.py:110-131`). ffmpeg *does* read the real container — real dimensions, real duration, real codec. We could have the worker **write the verified `width`/`height`/`duration_seconds` back onto the media doc** (overriding the client's assertion) and set a `verified` flag. Then "is this a real 9:16 video" becomes a server-stamped fact. This is the only way to make it truly bulletproof against a lying client, and it is a small addition to a worker that already decodes the file. **Recommendation: ship v1 with the render-time gate (cheap, correct, no new infra); add the worker verification as a follow-up if the operator wants the server-stamped guarantee.**

### The trust-boundary summary

| Claim | Who asserts it | Verified by |
|---|---|---|
| `short` tag present | client (composer) | server stores it; feed filters on it |
| media is `video/*` | client (declared Content-Type) | S3 enforces the *declared* type on upload; render re-checks the stored `mime_type` |
| media is 9:16 | client (asserted `width`/`height`) | **not** server-verified → render-time gate re-derives `width < height`; optional worker verification stamps the truth |
| duration ≤ 180s | client | **not** server-verified → optional worker verification |

## What this is not

- **Not a new collection or group.** A short is a `posts` doc on the discover group. The feed is a filtered view.
- **Not the YouTube-embed "Shorts."** `video-player.md` uses "Shorts" for the *external* YouTube `<iframe>` source case (a post referencing a YouTube id). That is a different, still-open data-model question. This doc's Shorts are **native** 9:16 video posts. (The name collision is a known wart — see Open questions.)
- **Not a server-side content-verification system.** The node is a readable broker (D41). We do not decode files to police content; we gate at render and rely on the existing moderation for the rest.

## Decisions (operator sign-off, 14.09.2026)

1. **Auto-detect** (one 9:16 video ⇒ short), no toggle. Shipped.
2. **v1 client-side filter** (zero API change). The server-side `has(tags,'short')` filter is the v1.5 follow-up.
3. **Worker verification** of dimensions/duration is a follow-up — v1 ships the render-time gate only.
4. **The "Shorts" name collision** with `video-player.md`'s YouTube-embed "Shorts" is accepted as a known wart — this doc's Shorts are the native vertical feed; the YouTube-embed path stays a separate, still-open data-model question.
5. **Swipe container** = native CSS scroll-snap (no dep).

## Reference

- The player it composes (one `<VideoPlayer>`, the 9:16 column, the deferred "immersive feed" note this fulfills): `video-player.md`
- The video experience spec (ratio policy, muted autoplay, hls.js-first): `../media/video-experience.md`
- The transcode worker (the optional verification hook): `../media/transcoding.md`, `../../../../api/app/v3/endpoints/media.py`
- The tag-filter idiom this reuses (`has(tags, …)`): `../../../../api/app/v3/services/clickhouse.py` (node-ad read)
- The flexible read (server-side tag filter, I3-safe): `../../sdk/api.md` (`w.query`)
- The visual bar (tokens, states, the screenshot test): `../../../strategy/design.md`
