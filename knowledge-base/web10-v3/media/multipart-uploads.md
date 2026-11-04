# Native resumable upload transport (R2)

Implementation target: real browser-to-MinIO multipart uploads, behind the
default-off `RESUMABLE_UPLOADS_ENABLED` switch until connected acceptance. R1
session records remain in a separate private bucket. No movie bytes pass through
FastAPI during transfer. Completion streams the stored object internally through
FastAPI for full-file checksum verification; HLS uses the existing FFmpeg workers.

## Protocol

`GET /v3/media/uploads/capabilities` reports enablement, 8 MiB part size and the
unchanged 500 MiB admission cap. The authenticated POST operations are `start`,
`status`, `sign-part`, `complete` and `abort` under `/v3/media/uploads/`.
Every POST supplies a token, immutable UUID session ID and media service; start
also supplies filename/type/size and a full-file SHA-256. No request can choose
the bucket, object key, owner or native multipart ID.

Verify signature/custom expiry, local issuer, non-anonymous active human,
active OAuth client when present, and current app `create` authority on the
requested service before storage. Browser sessions require a valid Origin with
a current app contract, following the existing CRUD authority model; it is not
used as authority by itself. Delegated sessions use the verified client ID,
never a caller's Origin. Bind the current verified app and service into R1's
owner scope. Foreign write credentials must use their home node; do not borrow
a local namesake's upload namespace.

Start reserves stable intent and binds a server-created native multipart ID.
Known losing creations are aborted; a lost create response may leave an unbound
empty MPU, which expiration cleanup must reconcile by exact reserved object key.
Status lists storage-confirmed parts, not browser counters. Sign-part derives
the exact expected byte length from the immutable file size and fixed part size,
binds a SHA-256 part checksum, and caps URL lifetime by both session and credential
deadlines. A pause does not abort stored parts.

Complete ignores caller ETags and obtains the canonical ordered part list from
MinIO. Reject missing/extra/wrong-size parts; atomically claim completion, then
complete only that list. Independently bind the final object's metadata to the
reserved owner/session/key, verify exact size and stream-hash its bytes against
the admitted full-file checksum before recording completion. A lost response is
recovered by the same session ID and verified existing object, never a new file.
Storage result observation may occur after session expiry; no new completion or
part issuance may start after expiry. ETags are not full-file content hashes.

Abort is explicit and idempotent, with a durable tombstone before returning
success; competing completion claims must be reconciled instead of claiming
cancellation won. Expired transfers can be aborted for cleanup. Never remove a
completed/confirmed media object as a retry workaround. Unbound/expired MPU
cleanup and late-part behavior need isolated real-storage tests before enablement.

## Browser integration target

Use Uppy behind the existing UI, without its Dashboard or Companion. The pinned
AWS S3 plugin 5.x callback API lets our authenticated server own multipart
creation/completion and canonical verification; upgrade to the changed 6.x
sign-only API only with equivalent control-boundary tests. No temporary storage
credentials are handed to the browser. File hashes are computed incrementally,
not by copying a 500 MiB movie into a single ArrayBuffer.

Versioned IndexedDB saves owner-scoped draft metadata, operation IDs, content
fingerprints and confirmed media refs, never JWTs/signed URLs or the whole movie.
On reselect, verify the file's full checksum and reconcile native parts before
Uppy resumes. Existing account/session/attempt invalidation rules still apply.
`confirm` materializes one canonical media ID only after verified completion;
`retry-transcode` reuses its owned original. Neither revives a deleted media ID.
The generic [deferred-create operation](deferred-creates.md) owns publication after
browser close. Notification here means an in-app result on return, not OS push.

## Local continuation evidence — 4.6.0

Real Uppy/IndexedDB/browser → authenticated API → MinIO → ClickHouse → FFmpeg →
deferred publication is exercised with a synthetic 17 MiB, two-second video.
Closing the first page after part 1 and selecting the original in a fresh page
sends only parts 2 and 3. No post exists before HLS. With the browser closed,
a fresh API process recovers preparation and creates one group-authored post
with the original human audit actor and exact targets. Stored bytes match SHA-256;
the actual 240p HLS output decodes with FFmpeg. The fixture's padding exercises
multipart bytes, not feature-film transcode duration or playback renewal.

Receipt and limits: [bounded security/integration record](../../security/scans/2026-11/resumable-r2-r5.md).
Default-off remains binding. Orphan/expired MPU cleanup, ambiguous storage races,
cross-process HLS coordination, full application auth/composer/player acceptance,
Nosferatu and independent release review remain OPEN. No production activation.
