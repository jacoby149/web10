# Realism storage — operator decision, 11 November 2026

This is the current storage contract. It supersedes MinIO-only rerun staging
and the earlier `research/costfn/realism-derived/` destination proposal; no
object was published there by this preparation run.

## Operator directive

> Storage (operator decision, Nov 11): after validation, stage the
> dataset in DigitalOcean Spaces (private, droplet region) for the
> rerun, AND sync the canonical archive copy to MinIO
> (minio.web10.app) alongside the V2 datasets under the realism
> dataset's own ID prefix. Verify manifest digests on both copies.
> MinIO is the long-term home; Spaces may be dropped after the rerun.
> Public posting, if any, happens only after freeze, from the MinIO
> copy — no public uploads before the operator reviews the 1M
> statistics receipt.

## Two private copies, one frozen identity

**Latest preparation recovery design:** an explicitly approved persistent
DigitalOcean Volume is the work disk for the one dataset-preparation droplet.
Keep generation/validation files, state and ordinary logs on that disk; preserve
it when deleting compute. Do not add a whole-workflow archive/checkpoint framework
or experiment volumes. Actual volume creation/attachment/replacement and bounded
retention costs require separate operational verification/approval. A work disk
does not make unvalidated bytes accepted inputs, and is not a corruption/deletion
backup. After validation, the two verified object-store copies below remain the
distribution/archive contract. `REALISM-RECOVERY.md` governs the simple prep path.

1. **Spaces:** private rerun distribution copy in the actual droplet region
   (current preparation host: **NYC3**). The Space/bucket and scoped object-store
   credentials must be configured before staging. Droplets import the verified
   frozen input; they do not generate a different dataset for each trial.
2. **MinIO:** canonical long-term archive on existing
   `https://minio.web10.app`, bucket `web10-media`, alongside existing V2 inputs:
   **`research/costfn/datasets/<realism-dataset-id>/`**. This is a new identity,
   never a reused V2 ID or overwrite of a V2 object. Preserve manifest, raw table
   files, validation statistics and provenance under the new ID.

The same validated manifest/identity governs both. Read the copies back and
verify the manifest identity and **every declared file size/SHA-256**; multipart
ETags or successful upload responses are not digest verification. Record the
two endpoints/regions/object keys and verification results in a small artifact
index. Do not put credentials, presigned URLs or large generated reports in Git.

Private staging does not authorize public bucket policies, ACLs, CDN links or
production-object changes. **Both digest-verified copies** and current 1M
validation are gates before claiming the rerun input is ready. Spaces can be
removed only after the rerun and after confirming the canonical MinIO copy;
MinIO is not temporary cleanup material.

## Public release is a separate gate

No public dataset upload/posting before **both** operator review of the 1M
statistics receipt **and** freeze. Any later approved public posting is made
from the verified canonical MinIO copy, not the temporary Spaces staging copy.
The already-public generator/test code and older V2 release do not authorize
publishing the new data. No public release is performed by current tooling.

## Readiness and current limits

Permission is not a completed transfer: neither new copy exists/has been
verified at this checkpoint. A DO management token is not a Spaces S3 key;
configured scoped Spaces and MinIO object-store access is still required.
Never paste or record secret keys in chat/status/logs. Configure a secure local
credential profile or other approved secret channel; no provider management
credential is copied to the preparation host.

Complete preparation and the independent 1M checks first. Keep the connected
Parquet-to-node import, live-view delta checks, full attachment/projected-row
parity and bounded pilot gates in addition to storage verification. This
decision does not declare the full study, deployment or submission ready.
