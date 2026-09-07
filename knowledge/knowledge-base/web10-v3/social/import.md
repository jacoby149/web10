# Web10 Import (port your YouTube)

An import is **a creator's existing catalog, moved onto their node** — exported
from another platform (today: YouTube, via Google Takeout), parsed, and written
into the node's own store so the creator can triage and publish it. The whole
point is the reach gap: on YouTube the audience is the platform's asset; on
web10 the catalog is the creator's data, staged under their account, ready to
become posts with 100% delivery.

This is the **first import target** and it is deliberately narrow: YouTubers.
Not a generic "import anything" pipeline. The architecture is generic enough
that a new platform is a new *parser*, not a new pipeline — but the product
surface is "port your YouTube."

## The Honest Gaps (what does NOT come over)

Verified against a live Takeout export ("jacobs multimedia" — 81 videos, 115
comments, 1 channel, 80 MP4s / ~27GB). Two things stated plainly:

- **View/like counts don't come over.** Takeout's `video metadata/videos.csv`
  carries no `statistics` — the view/like/comment counts stay on YouTube.
  Everything else about each video (title, description, publish date, duration,
  tags, privacy) does come over.
- **The subscriber list doesn't come over.** There is no export path for it —
  Takeout gives you the channels *you* subscribe to (`subscriptions.csv`), not
  your subscribers; the Data API has no subscriber-list endpoint; Studio has no
  export. The audience is the one thing the platform keeps for itself. So the
  import brings your **catalog** + your **commenters** + your **profile** + your
  **video files**; the *audience* is the people who choose to follow you on
  web10. That fits the pitch better than a list import would: the fans who
  migrate are the ones you actually own.

**The video files DO come over** (correcting the earlier "no bytes" belief):
Takeout exports the actual MP4s under `videos/*.mp4` (that's why a real export
is multi-GB). The metadata import (the parser) brings the catalog; the **video
pipeline** (Phase 2) streams each MP4 from the export to MinIO, creates a media
doc, and wires it to the post. Playback is a **direct presigned MP4 read**
(`web10-social`'s `<video src={read_url}>`), so storing the MP4 is enough for
native playback — no HLS transcode required (the D44 transcode,
`../media/transcoding.md`, stays available for adaptive streaming).

## Where It Runs: the Node, Not a Sidecar

The import runs **on the node** (`api/`), not in a separate marketing service.
The old v2 pipeline lived in `marketing-api` and drove the v2 node API over
HTTP — it 404'd against v3 and is retired. The v3 pipeline writes straight into
the node's own ClickHouse + MinIO, because the node owns the data it's
importing. No cross-service writes, no legacy API shape.

### The Worker: in-process + durable, not Celery

The heavy work (stream a multi-GB export, extract it, fan out thousands of
writes) runs in an **in-process worker** — the same idiom as the D44 HLS
transcode worker (`app/services/transcode.py`): bounded daemon threads, a
queue, started at boot. The difference that matters: **the queue is durable**.
A job is a row in the `import_jobs` ClickHouse table, not an in-memory item. At
boot, every non-terminal job is re-submitted, and the pipeline is idempotent
(`origin_id` dedup), so a node restart never loses an import and a re-run never
duplicates.

Why not Celery: a Celery worker needs a broker (Redis/RabbitMQ). D66 is
explicit — **no Redis** for the node (the lean multi-container fleet:
ClickHouse + MinIO, nothing else). An in-process worker with a durable
ClickHouse-backed queue gets the same "survives a restart, doesn't block
requests" property with zero new infrastructure. The concurrency is bounded
(`IMPORT_WORKER_CONCURRENCY`, default 1) so a multi-part extraction can't eat
the node's disk + network; the thumbnail fan-out inside a job is where the
parallelism lives (bounded `ThreadPoolExecutor`).

## The Flow (one job)

1. **Create** — `POST /v3/imports` `{token, platform, parts:[{filename,
   size_bytes}]}`. The node mints a job (phase `pending`) and returns a
   **presigned POST upload URL per part** (the parts land in the node's own
   MinIO bucket, namespaced `imports/{user}/{job_id}/part-NNN`). The export
   never touches another service.
2. **Upload** — the client (the authenticator's import card) POSTs each part
   straight to MinIO.
3. **Start** — `POST /v3/imports/start` `{token, job_id}`. The node verifies
   every part landed (`head_object`), flips the job to `queued`, and submits it
   to the worker.
4. **Process** — the worker:
   1. streams the parts from MinIO to a temp dir,
    2. extracts the data members (**CSV/JSON**, tar or zip, any split size —
       Takeout exports YouTube as CSV; the video MP4s are deliberately not read),
   3. runs the **platform parser** (pure: entries → record dicts),
   4. ensures the user's followers group (the owner-only home for staged
      content — `ensure_followers_group`, the node-side twin of the social
      app's `ensureFollowers`),
   5. **writes in order** (see below),
   6. marks the job `complete` and **deletes the export from MinIO** (the
      privacy promise: the node never keeps the raw export).
5. **Poll** — `POST /v3/imports/status` `{token, job_id}` returns the job row
   (phase, `total_records`, `written_records`, `skipped_records`, `errors`,
   `message`). The client renders it.

The job row is the status surface. Phases: `pending → queued → processing →
complete | error`.

## The Write Pipeline (order matters)

`_write_records` writes in a fixed order because of the D62 comment join:

1. **Media** — the thumbnails. Download → MinIO → `media_metadata` doc. Bounded
   concurrency (a 10k-video channel is 10k small downloads). A failed
   thumbnail is non-fatal — the post still imports.
2. **Posts** — `staging_posts`, attached to the followers group, with
   `created_at` = the **original publish date** (the catalog keeps its real
   dates — "take your videos exactly"). `insert_document` gained a `created_at`
   param for this (backdates the doc; `updated_at` stays now, which is what the
   ReplacingMergeTree dedup keys off).
3. **Comments** — `comments` with **`ref_value` = the imported post's
   `doc_id`** (the D62 engagement join). The `doc_id` is server-generated, so
   the post must be written first and its `doc_id` captured. A comment whose
   post wasn't imported is an **orphan** — skipped, not written.
4. **Profile** — the channel → the creator profile. Never overwrites an
   existing profile (the user's current profile wins).

### Why `staging_posts` (D30)

Imports land in `staging_posts` — the **owner-only** tier of the D30 content
lifecycle. Discovery ignores it; only the creator can read it. The social app's
staging UI reads `staging_posts` filtered by the followers group, so the worker
attaches each staged post to the followers group (the same group-id derivation
+ `FOLLOWER_ROLES` the social app uses). Publishing is a later, explicit move
(create-in-target + delete-from-source) — **nothing auto-publishes**. This is
the safe default: an import never exposes the creator's old private/unlisted
content (D30: only `public`-source stages as public; unlisted/private stage
private).

## Idempotency

Every record carries an `origin_id` (the Takeout id — video id, comment id,
channel id) in **both** the record and the doc body. Before writing, the worker
pre-scans the user's existing `origin_id`s per service (`_existing_origin_ids`)
and skips what's already there. A re-run (a restart re-submitting a job, or the
user importing the same export twice) is a no-op for what's already imported.
The media dedup key is `thumb_{video_id}`.

## The Platform Parsers

`app/services/importers/` holds **pure parsers**: `(path, bytes)` archive
entries → record dicts. No I/O, no ClickHouse — the worker does the writing.
`PARSERS` is the registry (`{"youtube": parse_youtube}`). A new platform is a
new module + a registry entry; the worker, endpoints, and UI are unchanged.

The YouTube parser reads the **real Takeout CSV shape** (verified against a live
export — Takeout exports YouTube as CSV, not the Data-API JSON):
- `video metadata/videos.csv` → `staging_posts` (one per video). Columns:
  `Video ID`, `Video Title (Original)`, `Video Description (Original)`,
  `Privacy`, `Approx Duration (ms)`, `Tag 1..17`, `Video Publish Timestamp`,
  `Video Category`. The thumbnail is derived from the video id (the public
  `i.ytimg.com` CDN — the CSV carries none). Only `Public`-source stages public;
  Unlisted/Private stage private (D30).
- `comments/comments.csv` → `comments` — **only** comments on a video that's in
  the export (a comment on a deleted video is an orphan → dropped). The
  `Comment Text` field is a **JSON sequence** (one or more concatenated objects,
  not an array) — the parser flattens the `text` segments.
- `channels/channel.csv` → `profile` (`Channel Title (Original)`,
  `Channel Description (Original)`, `Channel ID`).
- Everything else (`playlists/*.csv`, `subscriptions/*.csv`, `video texts.csv`,
  `videos/*.mp4`) is ignored by the metadata parser — classified by precise path
  (a loose "video" substring would misfire on `playlists/*-videos.csv`).

## Endpoints

| Endpoint | Body | Returns |
|---|---|---|
| `POST /v3/imports` | `{token, platform, parts:[{filename, size_bytes}]}` | `{job_id, platform, job, uploads:[{part_index, object_key, upload_url, fields}]}` |
| `POST /v3/imports/start` | `{token, job_id}` | `{job_id, status}` (400 if parts missing) |
| `POST /v3/imports/status` | `{token, job_id}` | `{job_id, job}` |

All token-gated; a user may only start/status **their own** job (403 otherwise,
404 if unknown). The presigned upload URLs are scoped to the exact object keys
(the S3 key is the boundary — a URL can only address this job's parts).

## The UI

The authenticator's **Settings → Import from YouTube** card
(`ui/src/components/Settings/Import.tsx`): pick the Takeout files (tar or zip,
multiple) → Start Import. It creates the job, uploads each part to MinIO,
starts the job, and polls the status, rendering the phase + progress. The node
deletes the raw export when the job finishes.

## What This Is Not

- Not a scraper. web10 never pulls from the other platform; the user exports,
  keeps the file, uploads it.
- Not a live sync. It's a one-shot port of the catalog at export time.
- Not a subscriber import. There's no list to import (see the honest gaps).
