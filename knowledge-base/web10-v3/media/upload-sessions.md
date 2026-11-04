# Durable upload sessions (R1)

**Status: internal backend foundation, not an enabled upload API.** R2 supplies
verified caller context, multipart operations and endpoint-level authorization.
This store does not authenticate anyone and is not wired into current uploads.

## Storage and ownership

Use the node's existing S3-compatible storage, with a **separate server-only
bucket**, not the media bucket. Session records contain no credentials, signed
URLs, post content or group concepts. Browser media URL helpers remain scoped
to the media bucket, so a username/prefix cannot expose session records through
that path. R2 must provision/check the state bucket's private policy and service
credential permissions before enabling endpoints.

One record key is derived from a hash of the destination node, verified issuer,
human username and originating app identity, plus a UUID request ID. App identity
is the canonical app/client identity derived by the authenticated adapter, never
an unchecked Origin string. Group author selection grants no upload ownership.
Every call receives this verified context again from R2; possession of a UUID
alone does not select someone else's partition. The stored owner is checked on
load as well, so a misplaced record fails closed.

The human's raw object key is server-generated `username/<random UUID>/source`.
Filename/type/size are immutable metadata; filenames never construct paths. A
raw key must also fit S3's 1,024-byte encoded-key ceiling, not just a character
limit on usernames. A
caller-provided operation UUID is an idempotency key, not the raw object's UUID.
Two apps choosing the same operation UUID cannot collide on the raw object key.

## Atomicity and retries

- Reserve with `PutObject(IfNoneMatch='*')`. An existing identical request returns
  the durable record; a reused UUID with different filename/type/size conflicts.
- Change state with `PutObject(IfMatch=<loaded ETag>)` and a matching record
  revision. Each successful change has a fresh random revision. No unconditional
  write fallback, in-process lock or assumed ClickHouse transaction.
- Storage rejects a stale writer. Completion/cancellation cannot both claim
  the same uploading revision. A conflict requires a fresh status read, not an
  automatic replay of an old decision.
- An ambiguous network error stays ambiguous. Reopen the same operation ID and
  read its durable result; never allocate a new ID just because a response was
  lost. CAS covers this record only; it is not a transaction with S3 multipart,
  media confirmation, transcoding or publication.

States: `reserved → uploading → completing → completed`, or
`reserved → aborted` / `uploading → aborting → aborted`. Terminal records are
immutable. Starting completion and starting abort compete atomically. If
completion has already won, cancellation must reconcile the actual storage
outcome rather than announce success. R2 owns recovery of interrupted
`completing`/`aborting` operations; this store never steals a timed-out lease.

`reconcile_completed` is a distinct internal observation seam: after independently
verifying that the final object already exists, R2 can record its ETag from the
current `completing` revision even after expiry. It never starts/completes an S3
upload or authorizes new parts. Normal `advance` still denies post-expiry work.
Missing-object/ambiguous in-flight completion recovery remains an R2 gate; do not
pretend an expired claim proves completion failed or can safely be stolen.

Binding `uploading` requires the actual multipart upload ID. Recording `completed`
requires the verified object ETag, but R1 does not itself verify object bytes.
R2 must independently verify the completed object, exact size/checksum and upload
ID/key provenance before those transitions. A stored ETag alone is not evidence
that this gate ran, nor a complete-file content hash.

## Expiry, limits and deployment gates

The initial internal lifetime is seven days, set by the server at reservation.
It never slides on read/retry. The API returns that deadline as recoverability,
not a promise of forever. Current maximum reservation size remains 500 MiB;
the store accepts an explicit server limit for future coordinated rollout.
The current size limit applies only to a new reservation. Reducing it does not
hide or overwrite an already-admitted operation: identical replay still returns
that record/result (subject to its original expiry), and changed intent still
conflicts. A new over-limit operation is rejected without a storage write.

Read-only status remains available after expiry, including terminal outcomes.
Expired sessions cannot advance transfer/completion, but can enter/finish abort
for cleanup or record an independently verified existing completion through the
observation seam. Encoded writes obey the same 16 KiB ceiling as reads; character
limits alone do not guarantee a record fits. Expiry does not delete records,
parts or raw objects on its own;
R2 must implement cleanup and retain outcome/tombstone information long enough
to prevent retry resurrection. Presigned-part expiry must not exceed the session
deadline, and already-issued capabilities have their own bounded lifetime.

Before admitting a nonterminal record, the writer also reserves enough encoded
space for the largest schema-valid completion ETag. An upload cannot bind an ID
that leaves its later terminal result unrecordable. This is aggregate lifecycle
capacity, not merely checking the current serialized body.

No new database, daemon, volume or dependency is required. S3-compatible does
**not** automatically mean conditional writes work: R2 deployment must prove
create-only and ETag writes on the configured backend. Unsupported/failed
conditions fail closed. The initial R1 smoke uses the cached local MinIO image
and an isolated private bucket; it is not production verification.

R1 gates: same/different intent replay, owner/issuer/node/app separation,
revision/ETag conflicts, terminal immutability, exact deadline behavior, corrupt
record rejection, bounded reads, isolated real storage races and restart/result
recovery. JWT/app-grant/bystander endpoint tests remain R2 gates because R1 adds
no endpoint and cannot turn supplied owner fields into authorization.

## Local verification — 3.260.0

The internal store and 24 focused tests are implemented. Fresh same-family
reviews found and repaired serialized bounds, post-expiry result observation,
lowered-limit replay and future-result capacity defects. The final further
review is one dry pass; independent/model-diverse release review remains open.
All 2,001 API tests plus eight subtests pass (one opt-in skip); Ruff passes.

Disposable real MinIO tests prove conditional reservation/CAS, simultaneous
reservation replay, both ordered completion/abort claim winners, owner/app/node
partition selection, response loss after actual record commits and exact terminal
record recovery across a fresh Python process and a MinIO container restart.
Multipart IDs/result ETags in these probes are synthetic; no movie bytes,
authenticated endpoint, configured production bucket or browser resume is tested.

R2 must next derive context from current verified issuer/account/app authority
(not unsigned metadata, a bare username helper or an untrusted Origin), add real
multipart/provenance/recovery/cleanup and prove private bucket/capability policy.
Keep activation disabled. Before PR publication, separate the contract, runtime
store/focused tests and standalone storage-probe bites from earlier UI work.
