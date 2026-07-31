# Lane-A seam note: web10 node export endpoint

**From:** ws-D/marketing-api (bite d — D-import-revamp)
**To:** ws-A/api (lane A owns `api/app/`)
**Date:** 2026-07-30

## What's needed

The marketing-api can now **ingest** a web10 export ZIP (the import half is
done). The missing half is the **export** endpoint on the node itself:
authenticated users need a way to download their own collections as a ZIP.

## ZIP format (authoritative — marketing-api parser in `app/web10.py`)

```
web10_export.json              — manifest (exported_at, source_node, username)
{service}/records.json         — one JSON file per service, array of records
```

Each record in `records.json`:
```json
{
  "_id": "<mongo _id>",
  "body": { ... the record's body ... }
}
```

Services to include: all user collections except `services` and `*` (star
record). The marketing-api remaps `posts`, `public_posts`, `private_posts`
to `staging_posts` on import (D19/D30 rule: imports don't auto-publish).

## API contract (suggested)

```
GET /{user}/export
```

- Auth: same token as CRUD (`is_permitted` for read on each service)
- I3-safe by construction: the token's `username` = the addressed user
- Streaming response: `Content-Type: application/zip`, `Content-Disposition: attachment; filename="web10-export-{username}.zip"`
- Should stream the ZIP (not buffer entirely in memory) for large collections
- Media blobs are NOT included — only the metadata records with their S3 URLs
  (the import pipeline preserves `url` fields as-is)

## Why this matters

This is the sovereignty escape hatch. The operator's words (29.07 rant #2):
> "web10 export! and make a note, yes you can export from your current web10
> node, and import somewhere else!"

The marketing-api import pipeline (bite d, merged) accepts this ZIP format and
feeds it through the existing bite-b pipeline (S3 upload → parse → staging →
DELETE original). A zip is a zip — no new protocol needed.
