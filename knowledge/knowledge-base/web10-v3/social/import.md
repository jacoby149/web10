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

Two things the pitch used to over-claim, now stated plainly:

- **The video files don't come over.** Google Takeout exports *metadata +
  thumbnails* for your videos — never the bytes. Each imported post carries the
  full record (title, description, publish date, duration, view/like counts)
  plus the thumbnail and the watch URL. The creator re-uploads the file for
  native playback when they want it (the normal media + HLS path,
  `../media/transcoding.md`). The post is not "unplayable" — it embeds the
  watch link until the file is re-uploaded.
- **The subscriber list doesn't come over.** There is no export path for it —
  Takeout gives you the channels *you* subscribe to, not your subscribers; the
  Data API has no subscriber-list endpoint; Studio has no export. The audience
  is the one thing the platform keeps for itself. So the import brings your
  **catalog** + your **commenters** + your **profile**; the *audience* is the
  people who choose to follow you on web10. That fits the pitch better than a
  list import would: the fans who migrate are the ones you actually own.

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
   2. extracts the JSON members (**tar or zip**, any split size — Takeout's
      default is tar split into ~2GB parts; the file type shouldn't matter),
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

The YouTube parser maps:
- `My videos/videos.json` → `staging_posts` (one per video).
- `My videos/comments.json` → `comments` — **only** comments on the user's own
  videos (a comment the user left on someone else's video would point at a post
  that doesn't exist on this node, so it's dropped).
- `My channels/…` → `profile`.

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
