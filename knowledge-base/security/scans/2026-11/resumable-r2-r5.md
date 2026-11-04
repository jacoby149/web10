# Resumable transfer and deferred publication — local continuation

03.11.2026 · GPT-6.1 Sol · default-off · no production mutation.

A creator needs to leave a film uploading without throwing away its completed
parts, then leave video preparation without keeping a browser alive. The operator
chose **wait for HLS**: no original-first placeholder and no return-to-publish chore.
Nosferatu remains the eventual feature-film acceptance case, not this fixture.

## Boundary and intent

New multipart routes verify signature, freshness, local issuer, active human/client
and current app/service create authority before private storage. Object keys and
native upload IDs are server-owned. Separate private conditional records bind
immutable transfer intent and full-file checksum. The browser gets short-lived
part URLs, never storage credentials. Browser storage contains draft metadata,
IDs and checksums, never tokens, signed URLs or whole files.

Generic deferred creates capture the original human/app/acting author and exact
destinations, without retaining a human JWT. Live grants are rechecked at execution.
This deliberately permits one bounded admitted operation to finish after the
request credential expires. It is not a replacement login. D60 is retained: the
node knows media dependencies and document creation, not social feeds or followers.

## Reproduced and repaired

- Completion can consume a native multipart ID before the durable result write.
  Status must remain readable; completion reconciles the verified final object.
  Known full-file verification failure gets a durable `failed` disposition.
- A second executor could mark a claimed operation failed, cancel could return
  success, and the first executor could still publish. The persisted publication
  timestamp now makes a claim irreversible across failure, blocking and retry.
  Cancellation wins before a claim or explicitly loses afterward, never both.
- Removing timezone information shifted ClickHouse versions on non-UTC hosts.
  Publication/attachment stamps now stay aware UTC; a non-UTC process-clock test
  checks the actual epoch passed to insertion.
- Filtering deletion before latest-version selection reused stale ready media.
  Narrow canonical dependency/result reads retain tombstones and give deletion
  timestamp ties. Deleted results are not recreated. Confirmation/retry also deny
  a canonical media tombstone. The general legacy getter is not globally repaired.
- Process restart lost in-memory transcode work. Admitted pending dependencies
  requeue owned media preparation; a per-process queued/running set deduplicates
  recovery polls. This is not a distributed HLS execution lock.
- A delayed initial media confirmation could outrank a later deletion or completed
  transcode. Confirmation now replays the immutable private reservation's aware UTC
  version and rereads canonical state. Interleaved registered-route tests fail
  before repair; actual ClickHouse, with merges stopped, preserves both newer
  deletion and completed HLS against the delayed initial insert. Evidence:
  `.context/confirmation-race-{red,green}.log` and `confirmation-real-proof.log`.
- Offline capability discovery never retried, and wrong-content reselection could
  leave no useful file picker. Reconnect retries discovery; wrong bytes retain
  `needs-file` and saved progress so the original can still be selected.

Deterministic regressions fail before the corresponding repairs. Primary logs:
`.context/deferred-review-red.log`, `deferred-review-green.log`,
`upload-provider-red.log`, `upload-provider-reselection-red.log` and
`upload-provider-final.log`. SQL-history unit cases execute the actual narrow
getter SQL against SQLite; real-engine evidence below is separate.

## Disposable integration receipt

The local provider harness uses real Chromium, IndexedDB, cookie-reading HTTP
adapter and Uppy, with actual registered multipart/deferred/document handlers,
synthetically signed local JWTs, real ClickHouse 24.8 users/app/group grants,
real MinIO and real FFmpeg. It invokes the provider queue directly: this is not
full-app signup/login, a real composer click or full social-player acceptance.

The 17,825,792-byte MP4 contains two seconds of synthetic video plus a valid
padding box. It proves transport mechanics, not a 91-minute worker budget.

1. Upload part 1; hold later PUTs; close the page. Native storage confirms 8 MiB.
2. Open a fresh page, restore the saved draft, reselect the original. Only parts
   **2 and 3** are sent. Canonical completion verifies the exact full-file hash.
3. Confirm owned media and admit an exact group-author create. Preparation is
   deliberately not running yet: the durable operation waits and post count is zero.
4. Close Chromium and terminate the API process, discarding its queued transcode.
5. Start a new API process. Durable dependency scanning recovers FFmpeg work;
   the operation becomes done and exactly one canonical post exists, authored by
   the captured group with `posted_by=alice` and exactly the captured attachments.
6. Verify original bytes by SHA-256 and decode the actual 240p HLS output with
   FFmpeg. A separate real-ClickHouse tombstone check denies a deleted dependency
   before replacement merges, with no extra post.
7. Repeat on the final confirmation-version repair, including same-size wrong-file
   denial. Close the persistent browser profile and restart the API again. Exactly
   one new post appears. Reopening that profile under the original-account
   synthetic credential restores Published and its post link with zero new PUTs.

Artifacts: `.context/resumable-acceptance-browser.log`,
`resumable-acceptance-browser-receipt.json`, `resumable-acceptance-browser-v2.log`,
`resumable-acceptance-reopen.log`, `resumable-acceptance-final.log` and
the local `resumable-acceptance-*` scripts. Desktop/375px recovery and preparing
and published cards were inspected in `resumable-real-*`. The initial reopen
probe correctly found no tasks without a credential: its test cookie was
session-only, unlike the SDK's persistent cookie. Restore only the original-account
synthetic token, not draft/file state, and rerun successfully; the failed probe
remains in `resumable-acceptance-reopen-before.log`. The isolated schema bootstrap emits an existing
`updated_at` declaration error outside the exercised tables; this is not a clean
normal-app startup receipt. No shared/production resources are used.
After verification, both probe servers were stopped, the labeled disposable
ClickHouse container/anonymous volumes removed and only the two acceptance buckets deleted.
The preexisting MinIO probe container is retained. Bucket absence is verified in
`.context/resumable-acceptance-cleanup.log`; local scripts/receipts remain.

## Coverage and release disposition

Two fresh same-family read-only reviews found the five backend defects above.
Repairs and regression/integration evidence are not three-dry/model-diverse
convergence and do not advance a whole L1–L4 unit to PASS.

OPEN: orphan/expired multipart cleanup and late parts, ambiguous native-create
outcomes, cross-process HLS output coordination, full real-auth account/client/
group lifecycle and two-tab acceptance, normal app/composer/player flow, OS
notifications, feature-film timeout/seek/signature renewal, independent review
and bounded PR splitting. Keep the 500 MiB cap and default-off flag. No release,
deployment or production readiness is implied by the local green result.

Full-suite verification: 2,019 API cases plus eight subtests pass, one opt-in skip;
1,830 social cases pass. Production typecheck/build and API Ruff lint/format pass.
