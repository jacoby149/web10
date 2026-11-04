# Resumable upload lifecycle: design inventory, not security closure

Date: 03.11.2026. Model: OpenAI GPT-6.1 Sol. Evidence: local working tree after
3.259.1; no commit, PR, production writes or deployment. **Status: OPEN.** No
completed L1/L2/L3/L4 scan or independent/model-diverse security review claimed.

## Orient and bounded read-only inventory

Read the security learnings, thesis and security-method entry/post-mortem.
Onboarding: media objects belong to the human uploader even when the document
author is a group; remembered acting IDs do not convey permissions. Recession:
the new queue was never connected to production, so preview copy/tests must not
be mistaken for storage/auth assurance. Obvious gap: a displayed author label
does not identify the owning human/issuer/node or invalidate a late callback.

Backend-first source inventory: existing `api/app/v3/endpoints/media.py`
upload_url/confirm and `api/app/services/media.py` expose the current single-POST
upload path. No new multipart endpoints or durable upload-session gate exist.
`marketing/web10-social/src/data/posts.ts` uploads/confirms and queues transcode
through that path. This was an implementation inventory, not an exploit scan of
the complete functions or a declaration that their existing gates are sufficient.

Client inventory: PostComposer captures acting author at mount; NewPostSheet
does not pass onQueueMediaPost. The only adapter is in the screenshot harness.
That adapter held tasks in React memory without owner partitions or session
generations. Its online/offline listeners lived on the upload-center controls,
so browsing away unregistered them. It has no credentials/API writes, and neither
defect establishes a deployed data disclosure or authorization bypass.

## Local preview evidence and repair

- A component regression changes the supplied synthetic owner A→B→logout→A.
  Before repair, A's seeded card remains visible under B. After repair, B and
  logout hide the old partition; A returns with progress intact and needs-file.
- A second regression navigates away and dispatches offline/online. Before
  repair, the indicator stays Uploading; after moving listeners above routes,
  it reports connection loss/recovery while browsing too.
- Preview-only queue tests bind callbacks to owner/session generation/task
  attempt. Old callbacks are ignored after pause/resume, scenario reset,
  reauthentication and A→B→A. Draft snapshots retain metadata, not File objects.
- An actual acting-identity picker + composer handoff test changes group→personal
  before Post: the existing video draft retains its group and exact destinations;
  a newly opened composer queues personally. This is not server-write/revocation
  evidence.

Reproductions are `.context/upload-lifecycle-before.log` and
`.context/upload-lifecycle-browse-before.log`. The repaired paths are in the
screenshot harness only. Full-suite/build/browser evidence is recorded alongside
the changelog. None of this makes the preview store an authentication boundary.

## Gates still OPEN

[Lifecycle contract and U01–U17](../../../web10-v3/media/resumable-uploads.md)
separate browser metadata from storage-confirmed parts, owner from acting author
and authority, and local coordination from server idempotence. R1/R2 need their
own backend/security lane, bounded exploit-first tests and review. Real account
changes, revoked grants, durable browser/server storage, changed-file content,
lost responses, cancel/commit and multi-tab races are not closed by these tests.
Automatic publication/notification remains the accepted target; its durable
execution mechanism must preserve D60 and be decided/reviewed before R5 runtime
work. Keep live integration and the 2 GiB increase disabled until those gates pass.
