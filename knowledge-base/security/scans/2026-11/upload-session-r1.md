# R1 upload-session foundation — bounded local evidence

Date: 03.11.2026. Implementer/review family: OpenAI GPT-6.1 Sol.
**Status: OPEN for release/security sign-off.** Internal service only; no new
endpoint, live transport, production access, deployment or L1–L4 PASS claim.

## Orient and design scope

R0 showed that preview metadata is not upload persistence or authorization.
Onboarding invariants: the human owns uploaded objects, a group author is not
storage ownership, and supplied IDs/remembered permissions grant nothing.
Recession: no live route or existing upload behavior is changed here. Obvious
gap: append-only history and browser locks cannot provide an atomic state claim.

R1 adds only `api/app/services/upload_sessions.py` and focused tests/probe.
[D96/session contract](../../../web10-v3/media/upload-sessions.md) uses a separate
server-only S3 bucket, hashed node/issuer/human/app scope, conditional creation,
ETag CAS and fresh record revisions. UploadOwner is trusted adapter input, **not
authentication**. R2 must derive it from verified current caller/app authority,
provision/check private bucket policy and verify actual multipart provenance.

## Review findings and local repairs

Fresh same-family read-only review found two P2 integrity/design gaps:

1. Individual character bounds allowed an 18,287-byte accepted record while the
   reader rejected anything over 16 KiB. The permanent regression reproduces an
   accepted over-limit transition before repair. `_write` now enforces the
   encoded-byte limit before touching storage; the old record stays readable.
2. A completion claim could expire after the underlying storage operation
   succeeded, leaving no way to record its result. The old `advance` rejects
   completion at the exact deadline. A distinct `reconcile_completed` observation
   seam now records a separately verified existing result from the current
   completing revision after expiry; it never initiates S3 completion or issues
   parts. Normal post-expiry advancement still denies. Unknown/missing-object
   recovery and the actual-object verification remain R2 gates.

Evidence: `.context/upload-r1-review-before.log` (two failures) and
`upload-r1-review-after.log` (18 passing cases). These are defects in a new,
unexposed foundation, not demonstrated vulnerabilities in deployed upload routes.

Subsequent fresh same-family reviews found two more contract edges and prompted
one related raw-key check:

- A lowered server size limit blocked identical replay of admitted/completed
  operations. Three phase-specific regressions fail before repair; the current
  limit now gates only a new reservation, with old intent/expiry preserved.
- A record could fit today but lack capacity for tomorrow's completion ETag.
  Before accepting any nonterminal record, `_write` now bounds its projected
  largest schema-valid terminal serialization too. A failing binding leaves the
  original reservation unchanged; an accepted large binding can record/re-read
  even a worst-case escaped ETag. Raw keys additionally respect S3's encoded
  1,024-byte ceiling.

Artifacts: `upload-r1-limit-before.log`, `upload-r1-headroom-before.log` and
`upload-r1-headroom-after.log` in `.context/`. Final focused coverage is 24 cases.
One further fresh same-family review reports no new finding, including an
independent capacity sweep over 2,048 binding lengths. That is **one dry review**,
not three-dry/model-diverse convergence. All 2,001 API tests plus eight subtests
pass, one opt-in skip; full Ruff lint and new-file formatting checks pass.

## Real storage checks

Disposable loopback MinIO, cached image
`sha256:8f08aee614800a237906bd48114d733e5ac5bfac4ccdf731f141b0e880d7a253`,
release `RELEASE.2025-09-07T16-13-09Z`, arm64. Synthetic credentials, buckets,
multipart IDs and object-result ETags only; **no actual movie upload or endpoint
authentication exercised**.

- Create-only and stale-ETag writes rejected; actual concurrent claim readers
  share one revision and only one write wins. Additional ordered races prove
  both completion-first and abort-first outcomes.
- Concurrent identical reservations return one record. Injected lost responses
  after real reservation/CAS commits reconcile to the stored result; stale retry
  cannot overwrite it.
- All four foreign scope fields select no record. A completed synthetic result
  survives a fresh Python process and an actual MinIO container restart.
- Post-expiry result observation works on real session-record storage while
  ordinary post-expiry advancement denies.

Artifacts: `.context/upload-r1-minio.log`, `upload-r1-extra-minio.log` and
`upload-r1-storage-restart.log`. The initial restart read used a stale ephemeral
Docker host port and failed connection; rediscovering the restarted container's
port restored the exact unchanged record. This was harness addressing, not a
store durability result until the successful replay.

## Open gates

Same-family review is not model-diverse convergence or independent security
sign-off. Authentication/app revocation, canonical caller context, private bucket
policy, real multipart object/size/checksum provenance, part authorization expiry,
orphan cleanup, missing-object completion recovery, publication/notification and
connected lifecycle remain OPEN. Code/test and standalone-storage-probe bites
must be split appropriately before publishing a trust-boundary PR; this working
branch also contains earlier independent UI work. No oversized all-scope PR.

PR preparation: the operator explicitly selected one combined **draft PR for
review**, authorizing that scope exception for the unexposed foundation and UI
work. This permits draft publication only; it does not waive split-PR/release,
model-diverse review, CI or activation gates and is not an agent-written gate
exemption. No SECURITY-GATE-EXEMPT marker is authorized or added.
