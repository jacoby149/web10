# Movie uploads without starting over

A creator should be able to post a film, browse the app while it uploads,
and recover from a dropped connection without sending the entire film again.
Nosferatu is the first acceptance case: 91:54, 514,619,769 bytes, one post.

## The publishing experience

1. **Compose.** Keep the existing picker, editor, title, description, identity
   and audience controls. Attaching a file does not start a network upload.
2. **Post.** Freeze that draft and queue it. A full upload card shows the film,
   identity, audience, percentage, transferred bytes and an estimated remaining
   time when the transport has enough evidence. Pause and Cancel are explicit.
3. **Browse.** The queue outlives the composer and route. A compact indicator
   opens `/uploads`; an individual task is `/uploads?upload=<id>`. Back/forward
   choose the same task without restarting its work.
4. **Disconnect.** Show that completed parts are saved, stop the estimate and
   retry when connectivity returns. Paused uploads do not auto-resume.
5. **Return.** Restore the draft and server-confirmed progress. Ask for the
   original file if browser access was lost. Reject a mismatching selection
   without losing the task. File hints are not a substitute for the transport's
   content verification. Closing a tab or suspending a phone can pause transfers.
   Say explicitly that uploaded progress is saved: reselect the original file
   on return to resume where it stopped, rather than starting from zero. This
   reassurance belongs on the active upload card too, not just the recovery state.
6. **Prepare.** Upload complete is not publication complete. Show an indeterminate
   Preparing video state, not a made-up processing percentage. Server-side work
   can continue after the browser closes. Retain the original if processing
   fails; Retry processing must not upload it again.
7. **Publish.** Publish only after playable media is confirmed. Publishing has
   its own state; failure retries publication, not upload or transcode. Completion
   exposes a real post link only when the publishing adapter returns one.

Cancel asks for confirmation and distinguishes active transfer cancellation
from stopping a pending publication. Published posts cannot be deleted through
an upload card. Discarding a restored task is explicit. Statuses and errors
remain readable on a 375px phone; actions have 44px targets and keyboard focus.

## This bite: UI, not a pretend uploader

Build reusable upload view models, reducer, cards, upload center and compact
indicator. Wire the existing composer to an optional queue handoff; production
callers keep their existing path. Only the screenshot harness supplies the
simulated queue and transitions. Preview copy explicitly says no bytes are
uploaded and no posts published. No fake-progress timers in production, no
Uppy dependency until a real adapter exists, no new live upload route/nav item,
no local storage of drafts/credentials and no 2 GiB limit change in this bite.

The preview uses explicit scenario controls for connection loss, reload/file
loss, transfer completion and server success/failure. They are not product
controls. Queue state survives internal navigation in this preview, not real
browser restart. No backend resumability or recovery guarantee is inferred.

## Next bites and gates

The binding lifecycle, state ownership, surface inventory and acceptance matrix
are in [media/resumable-uploads.md](../web10-v3/media/resumable-uploads.md).
Its R0–R6 queue replaces the earlier broad “backend and Uppy adapter” bite.
Server processing can continue after close. The approved automatic publication
and notification target needs a separately reviewed durable execution mechanism;
the preview implements neither. Do not replace that target with a manual
return-and-publish flow or add social-specific endpoints to the generic node.

- **Multipart backend:** generic owner-bound S3/MinIO create, sign, list,
  complete and abort operations; durable upload ownership/size accounting,
  short-lived authorization, idempotent completion and abandoned-part cleanup.
  Follow the security method. Scope this separately from the UI.
- **Uppy adapter and durable recovery:** use Uppy behind these components,
  preserve drafts per account/provider and verify reselected file content;
  server-listed parts are authoritative. Abort/invalidate work on logout or
  account changes. No credentials or signed URLs in recovery records or logs.
- **Publication orchestration:** freeze author/audience, revalidate live
  authority at writes, wait for playable media, avoid duplicate posts on
  ambiguous retries, expose processing/publication results after reopen.
- **Connected acceptance and larger limits:** interrupt, refresh, reselect,
  resume without resending completed parts, process and publish one film;
  prove foreign-account operations are denied. Then target 2 GiB, with storage,
  worker, browser-editing and playback-renewal evidence. Keep 500 MiB until then.

UI gates: state-transition tests, late-event suppression after pause/cancel,
invalid file selection, cancellation confirmation, processing versus publication
retry, full composer handoff, navigation persistence, URL selection, full social
suite/build and inspected desktop/375px captures. Preview evidence is never
reported as real upload, persistence, processing or publication acceptance.

## Local evidence — 4.3.0

The UI-only bite is implemented. All 1,804 social tests (121 files) and the
production typecheck/build pass. One verification run timed out while browser
capture/build were competing with tests; the final standalone full run passes.
Existing jsdom media and bundling warnings remain.

The browser smoke drives the real composer with a synthetic 91:54 MP4, presses
Post, pauses, navigates to the feed and back through the indicator, simulates
connection loss/online, rejects a wrong file, accepts the original with progress
retained, and retries processing/publication independently. It observes zero
POST/PUT/DELETE requests. This proves the UI flow, not an upload transport.

Captures for all preview phases are in `.context/upload-ui-*-{desktop,375}.png`.
Active, file-reselection, preparation, processing failure, cancellation and
browse-indicator desktop/375px screenshots were inspected. Inspection caught
the indicator covering the New Post button; the positions now leave both
available, with browser non-overlap checks at 375, 640, 768, 1280 and 1440px.
The preview is not mounted by production `App.tsx`; live posting, storage,
credentials, notification delivery and publication timing are unchanged.
