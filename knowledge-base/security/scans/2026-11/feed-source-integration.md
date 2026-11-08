# Feed source integration — bounded candidate review, 08.11.2026

Status: OPEN. Current workspace integration; not a released security guarantee.
Method: How layer, use-case-driven; restrained Clive voice.

## What the reader is allowed to do

A reader chooses a server, explicitly approves that exact destination for the
current credential, and queries its existing engine. The destination certifies
the issuer and applies its live app-contract/group-role gates. Saving a server
preference is not consent, and consent is not a role grant. Marketing instead
uses explicit public transport with no credential. Neither path retries a denied
authenticated request anonymously.

The private catalog uses a closed, undiscoverable group with hidden membership
and exactly its human owner. Existing unsafe groups and duplicate catalogs fail
closed; the client does not silently repair them. Source removal revokes the
tab-local approval and stops new reads without unfollowing creators.

## Review and reproduced deltas

Reviewer: fresh general-agent session `ses_e445c6124ffevEHqrDmGL1KG9p`, default
model selected by the harness; model-family diversity not established. Read-only
bounded L1/L2 review of catalog/approval/controller, shared reader and SDK seam.
The first review independently passed 51 existing focused tests and found two
concrete blockers, not a dry pass:

1. A retained same-account approval callback could restore removed consent.
   After removing a source, calling the old callback, then externally restoring
   its catalog row made it dispatch-eligible without fresh approval. The actual
   hook regression now requires captured generation and write-sequence ownership.
   A second review reproduced the sibling `save(staleSources, trustOrigin)` path;
   the same captured ownership now gates both callbacks. Its retained red/green
   receipts are `.context/server-editor-save-review-{red,green}.log`.
2. A raw-string credential check preceded URL normalization. Inserting a newline
   into an echoed credential, or percent-encoding its bytes, bypassed the guard
   before automatic media loading. The actual reader/transport regression now
   checks normalized href and bounded decoded octets, rejecting deeper encodings.

Repro gates: `feedSourceOwnership.test.tsx` retained-callback case and
`data/mixedFeed.test.ts` two normalized/encoded media cases. All three fail before
repair and pass afterward; local receipts are
`.context/server-editor-review-red.log` and `server-editor-review-green.log`.
No claim is made that an already-approved malicious node can never transform a
credential in some other way. This is not cryptographic audience restriction.

## Design-intent disposition

The repairs preserve the requested authenticated engine query and live roles.
They do not substitute public-only federation, invent node-specific endpoints,
persist JWTs, or turn local preference approval into receiving-node authority.
Foreign source-owned actions and renewal remain unavailable where no adapter
exists, rather than sending foreign IDs to home. Group faces are optional reads
on the serving node; their failure must not suppress readable posts.

Remaining gates: post-repair dry review, three consecutive fresh dry reviews,
model diversity, split-sized trust-boundary PRs and every CI check; actual HTTPS
nodes/independent keys, browser Origin/app grants, revoke/regrant and connected
media; broader L3/L4 coverage. No deployment or production assurance.

Isolated catalog review also reproduced the canonical `service` versus stale SDK
`collection_name` mismatch and hidden external attachments omitted by ordinary
readById. Repairs preflight existing catalogs through `update(doc_id, {})` and
check the author response's complete groups before any new preference data.
This advances a version/requires updateOwn on reload, never replaces links, and
does not make check/write races transactional. Canonical-shape and hidden-link
controls have retained red/green receipts in `.context/server-editor-*`.
