# Deferred document creation after media is ready

The operator confirmed **wait for HLS**, not publishing the original first.
That requires a server-owned durable operation after upload; a closed browser
cannot execute the final write. The node still must not learn social concepts.

## Generic primitive and authority

`/v3/deferred/create` admits one immutable normal document-create intent plus
owned media-document dependencies. A notes/music/shop app can use the same
primitive; the caller chooses service, body, exact groups and optional author_as,
ref/ad preferences. There is no post/feed/follower endpoint or table. Token and
current node/issuer/human/app authority are verified at admission. The original
human/app/acting author are server-captured; **no human token is persisted**.

Execution checks the account is still active, the app/client still has current
create authority, the captured group-author grant still permits create, and
**every** captured destination remains writable as that author. No filtering to
a smaller audience and no fallback to the current browser identity. An admitted
single operation can finish after the request credential expires, within its
seven-day operation deadline, under those live grants; this is not a reusable
replacement credential. Revoked authority blocks publication.

## Durability and races

Use the same separately private server-state bucket under a distinct deferred
prefix. Every record binds its owner, UUID operation ID, immutable request hash,
server-generated result document ID, original server version time and CAS
revision. Records contain private document intent and are never served through
media URLs. Provisioning/worker scans must verify private bucket policy. A
background API thread polls durable pending records; browser lifetime is irrelevant.

The worker waits until all canonical human-owned media dependencies have real
enabled/done transcoding settings. Failed dependencies produce an explicit
retryable operation failure, never a public placeholder post. Existing FFmpeg
workers prepare video; the deferred worker coordinates the final generic write.
Pending owned `media_metadata` dependencies also recover missing process-local
transcode work after API restart. Queued/running work is deduplicated within one
process; cross-process HLS execution/output fencing is a separate release gate.

Creation and cancellation compete through CAS. Cancel of an absent operation
creates a tombstone, so a late browser admission cannot resurrect it. Once a
create claim wins, cancellation reports that outcome rather than pretending it
won. The original `publish_at` is an irreversible claim marker: failed/blocked
states and retries never reopen cancellation after an executor may have started.
Retain terminal outcomes/tombstones; do not silently allocate a fresh ID on
an ambiguous response.

Retries/restart reuse the same result doc_id and original **aware UTC** version timestamp.
Late replay cannot overwrite newer human edits or attachment removals. This is
logical idempotence over existing ClickHouse versioned documents, **not** a
cross-engine transaction. If a partial/ambiguous create has an existing document
but missing intended attachments, stop for review instead of recreating the post
or restoring audiences automatically. Moderation still runs through the existing
node moderation seam. Terminal status is owner/app scoped and visible on return.
Dependency and result reads rank full document history before interpreting
deletion; tombstones win timestamp ties. A deleted result requires review, never
recreation. This narrow reconciliation read does not repair every legacy getter.

The normal in-app completion indicator reports the server outcome after reopen;
this does not promise OS push delivery while the browser is closed. Activation
stays off until authenticated storage/worker/restart/revocation/cancellation tests
and the real browser upload → HLS → one-document acceptance pass.
