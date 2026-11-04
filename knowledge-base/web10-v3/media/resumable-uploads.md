# Resumable uploads: lifecycle contract

**Status: implementation contract, not a shipped capability.** The new resumable
upload experience is a screenshot-harness simulation. Native multipart upload,
durable recovery and deferred publication are not implemented. This document
defines their acceptance gates; a preview test never closes a storage/API gate.

## The thing being saved

A pending post is a draft plus one or more media transfers, not just a percentage.
Nosferatu must recover its title, formatted description, human owner, acting
author, exact audience intent, media order, captions/alt text, music flag, pinned
ad reference and original-file identity. Recovery must not rebuild any of those
from the current navigation identity or a newly loaded default setting.

| State | Where it belongs | Authority and limits |
|---|---|---|
| Draft metadata and manifest of media IDs/file hints | Browser IndexedDB, versioned and partitioned by destination node + issuer + human account | Durable local intent, not permission. No credentials, signed URLs, full movie copies or blob URLs. Local-data loss must be reported honestly. |
| Selected File objects/optional supported handles | Memory; handles only where browser permission permits | May disappear on close/restart; reselect the original file. Do not promise uploads while the browser is closed. |
| Multipart session, exact object key, completed parts/checksums and recovery expiry | Owner-bound server session + S3/MinIO | ListParts/current storage state wins over browser progress. Client percentages, ETags and upload IDs alone grant no authority. |
| Processing job, result and original-media reference | Server, after completed-object verification | Survives the page; failures retain the original within the advertised retention period. |
| Publish intent and final document ID | Durable idempotent publication operation | Distinguish requested, uncertain, committed, failed and cancelled; retry discovers the original result instead of creating another post. |

The browser cannot guarantee recovery after its data is cleared or evicted. The
server returns an explicit `recoverable_until` deadline. The UI must explain
expiry rather than promising that progress lasts forever. Retention and cleanup
policy are required backend decisions before rollout, not hidden client defaults.
Recovery on a different device is not promised by a local-only draft store.

## Identity is three different things

1. **Owner:** the verified human account and issuer, scoped to the destination
   node. Changing the destination node is also a different queue partition.
2. **Author:** the personal identity or exact group ID captured for this draft.
   Group upload ownership remains the human's; changing author never moves an
   object into the group's storage namespace.
3. **Authority:** current app/service/group permissions, checked by the server
   at the operation. Neither an owner partition nor a remembered group ID is an
   authorization credential.

At Post, capture owner, draft revision and author. Resolve/freeze the intended
destinations before publication; record explicit group choices separately from
the ordinary follower/default audience mode. A later change in group membership
must not silently add a new destination or substitute another author's audience.
Revalidate each intended write using the existing generic gates. If a target is
unavailable, stop and ask; do not silently publish to a smaller/different set.

| Event | Required behavior |
|---|---|
| Switch acting group A → B within the same human account | A's open/queued draft stays A. Existing tasks remain visible with their frozen author. A new composer uses B. |
| Switch account/issuer/node or log out | Invalidate the client session generation before new work; stop/abort client transports where possible; hide the previous partition and release File references. Late callbacks cannot mutate another session. |
| Account A → B → A | Return A's records, but not A's old callbacks or in-flight attempt. Reauthenticate/reconcile storage and reselect files as necessary. |
| Credential expiry/refresh | Pause new authenticated work; use the current credential only after same-owner validation. A token refresh is not a different author and does not silently resume a user-paused task. |
| Group permission/app grant revoked, group removed or destination changed | Keep recoverable media; show publication blocked. No automatic personal-author fallback or permission snapshot. |
| Already-accepted server work after logout | Stop client callbacks. Processing may finish; an admitted durable publish intent may continue only as its captured original actor under fresh server authority, never as the next browser account. Reconcile its result on the owner's return. |

The approved target remains automatic publication/notification after processing,
even if the creator leaves. **Its durable execution mechanism is an OPEN design
gate**, not something a React provider can implement. Before R5 runtime work,
choose an app-owned orchestrator or a reviewed generic conditional-operation
primitive; `api/` must not learn “social posts” (D60). Admission captures the
verified human, app and acting author; execution revalidates live authority,
without saving a user token as the job credential. Do not silently downgrade the
product to “return and press Publish” to dodge this gate. Keep integration disabled
until the accepted lifecycle is implemented. Preview copy proves no background
publication or notification delivery.

## Transfer, retry and cancellation rules

- Queue one post with an ordered manifest of independent media transfers. Never
  upload completed siblings again because a later item failed. Supporting images,
  audio artwork and edited output need their own recovery entries.
- Uploading starts on Post, not attach. Until a successful queue handoff, leave
  the composer draft intact. Once accepted, one queue operation owns it; closing
  the sheet or navigating cannot restart it or create a duplicate task.
- Persist an operation ID before side effects. Multipart completion, metadata
  confirmation, transcode submission and post creation each need retrievable,
  idempotent outcomes. An unanswered request is **unknown**, not “failed safely”.
- Every async callback belongs to `(owner, session generation, task ID, attempt)`.
  Pause, cancellation, replacing a file, retry and account transitions invalidate
  relevant old callbacks. The A→B→A sequence must not revive them.
- Refresh/reopen reconciles server/storage state first. Completed parts survive;
  an interrupted part may be resent. Display progress distinguishes transferred
  bytes from storage-confirmed bytes; “saved” refers only to confirmed parts.
- Filename/size/type/date are hints, not content identity. Verify the reselected
  bytes against the original upload's content/checksum contract before combining
  them with existing parts. A different edit/crop is a new transfer, not a resume.
- Network reconnect resumes only automatically interrupted work with a valid
  session and file access. User-paused work stays paused. Permission/validation/
  quota errors are not “connection lost” and must not enter an endless retry loop.
- Two tabs use local coordination for UX, but the server's completion/publication
  operation must remain idempotent without that coordination. A browser lock is
  not a backend safety guarantee. Recover cleanly when the owning tab crashes.
- Cancellation is a request until acknowledged. Persist a tombstone/version so
  a late part, worker result or retry cannot resurrect publication. Before the
  publish commit, cancellation must prevent publication; after it, report the
  actual post and offer its normal delete flow, never a false “won't publish”.
- A worker retry uses the completed original; a publication retry uses the ready
  media. Neither goes back through the file picker or transfer unless the source
  really expired/was removed. Verify processing status before issuing another job.

## Surface scope

“Video composer” and “post composer” are the same new-post sheet. Route all new
post media through its queue once real integration is ready, irrespective of
where the sheet was opened. Do not accidentally intercept edits or reposts.

| Entry point | Existing seam | Required acceptance |
|---|---|---|
| Posts, Video, Shorts, own profile | NewPostFab → ComposerContext → NewPostSheet → PostComposer | Same queue, owner/author/audience captured, title/body/media retained |
| Group posting | GroupDetailScreen → openComposer({groups}) → same sheet | Exact destinations and captured group author retained through identity switch/recovery |
| Music-tagged video/audio with artwork/supporting images | Same composer, music flag/media metadata | Tags, artwork and ordered supporting refs survive partial failure |
| Edit an existing post | Same sheet in edit mode | Keep update/removal path; no accidental new-post queue or duplicate post |
| Repost from feed/profile/watch/group/lightbox | Same sheet in repost mode | Keep reference-based repost path; no needless media copy/upload |
| Comment photos, profile/group avatar/banner, ad/product media | Separate upload callers | Explicitly outside initial post-publication orchestration; inventory and test before reusing generic multipart transport there |

The preview currently accepts one video. It is not all-surface or multi-file
integration. Production NewPostSheet does not pass the new queue callback.

## Acceptance matrix

`P` means local preview evidence, **not** production assurance. All other gates
remain OPEN until an actual implementation drives the named seam.

| ID | Reproduction and required assertion | Evidence required |
|---|---|---|
| U01 | Attach via picker and drag/drop; no bytes sent before Post | Real sheet, both paths; preview has picker evidence only |
| U02 | Open composer as group A; switch navigation to B; Post remains A; fresh composer uses B | Actual picker + composer snapshot |
| U03 | Account/issuer/node A→B→A, same username collisions, logout/relogin | No foreign task display/mutation; old session callbacks ignored; P only until real auth wiring |
| U04 | Pause/resume/retry/cancel with delayed progress, complete and error events | Old attempt ignored even after returning to the same phase |
| U05 | Refresh/crash/reopen; reselect identical file | Actual IndexedDB + ListParts; completed parts not retransmitted |
| U06 | Same filename/size/date, different bytes; modified crop; missing source | Content verification rejects mix; original task/progress preserved |
| U07 | Empty/corrupt/old-version/evicted/quota-denied IndexedDB | Explicit recovery limitation, no lost-queue success or automatic duplicate restart |
| U08 | Token expiry, permission revocation, group deletion | Real authenticated endpoints deny before side effects; retain safe retry context |
| U09 | Presigned URL expires during retry; slow/offline network | Renew only pending part authorization; bounded retry/backoff; paused stays paused |
| U10 | Two tabs race; active tab crashes mid-complete | One completion result; takeover cannot duplicate publication |
| U11 | Complete/confirm/create response lost after commit | Reconcile operation status; exactly one confirmed media/post ID |
| U12 | Cancel during part completion, processing and publish commit | Durable cancellation outcome or truthful already-published result; no resurrection |
| U13 | Worker timeout/failure, app closed during processing | Original reused; owner sees real status after reopen, publication waits for authority |
| U14 | Multi-media partial failure and image/artwork/video combinations | Retain completed refs/order/metadata; retry failed siblings only |
| U15 | Every row in the surface inventory | Real sheet/caller tests, not a seeded standalone composer |
| U16 | 375/640/768/1280/1440px and phone suspension | Readable actions, no FAB/player overlap, explicit background limits |
| U17 | Nosferatu whole plus existing Steamboat Willie/short clips | Real upload/process/post/playback, seeking and renewal past ten-minute HLS TTL |

## Execution order: no all-in-one security PR

- **R0:** contract, surface inventory and preview-only session/attempt regressions.
  Does not implement authentication, persistence or transport.
- **R1:** durable generic upload-session ownership/expiry and operation-status
  contract. Choose a store with the required atomicity; append-only ClickHouse
  history alone is not proof of compare-and-set or exactly-once behavior.
- **R2:** S3 multipart create/sign/list/complete/abort, actual-object size/checksum
  verification and cleanup. Fresh auth per operation, owner-bound keys/IDs;
  complete-after-lost-response and bystander-denial tests. Backend/security lane.
- **R3:** versioned IndexedDB draft store, owner partitions, quota/migration/error
  behavior and server reconciliation. No credentials/signed URLs persisted.
- **R4:** Uppy adapter and real shared-sheet integration; generation/attempt
  invalidation and file-content verification. U01–U09/U14/U15 against real paths.
- **R5:** decide/review the durable publication execution mechanism first; then
  implement idempotent publication using ready media, status recovery,
  notification delivery and cancel/commit semantics. No social-specific node
  endpoint; preserve the approved automatic-publication behavior.
- **R6:** connected lifecycle/browser gauntlet, followed by a separately measured
  2 GiB size increase. Production remains 500 MiB until these gates pass.

R1/R2 are backend-first security work and must be separately scoped/reviewed.
Independent review, real persistence/transport/concurrency and deployment remain
release gates. No UI test or metadata partition substitutes for server checks.

## R0 evidence — 4.1.2, local only

- Reproduced and repaired two preview defects: owner changes retained the old
  visible queue, and browsing away removed connectivity listeners. The first
  repaired path is synthetic owner input, not the live authenticator.
- The in-memory preview now partitions by node/issuer/human and rejects old
  session/attempt callbacks, including A→B→A, same-owner reauthentication,
  pause/resume and resetting a scenario with the same task ID. Returning to an
  owner requires file reselection. Metadata snapshots contain no File objects.
- U02 has an actual acting-picker + video-composer handoff regression: the
  existing group draft remains group-authored after choosing personal; a new
  composer uses personal. No API mutation is involved in that test.
- All 1,817 social tests (122 files), production typecheck/build and synthetic
  real-composer browser smoke pass. The browser's A→B→logout→A scenario observes
  no foreign card and requires original-file reselection on return, with zero
  POST/PUT/DELETE requests. Desktop/375px account-controls and signed-out captures
  in `.context/upload-lifecycle-*` were inspected.

R0 is not completion of U01–U17, real account-change integration, IndexedDB,
multipart uploads, server authorization, file-content verification or automatic
publication. The remaining queue is R1 → R2 → R3/R4 → R5 → R6, with dependencies
and individual review gates above.
