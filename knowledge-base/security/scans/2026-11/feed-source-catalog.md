# Private feed-source catalog foundation — 08.11.2026

Status: bounded local candidate; broader security and activation OPEN.

The reader needs to save servers without publishing the list to followers.
This split adds storage and approval ownership only. Nothing imports the hook
into a screen, dispatches a foreign credential or changes creator follows.

Existing generic settings CRUD stores a versioned catalog in a dedicated closed,
undiscoverable group with hidden membership and exactly the human owner. Read
and write check that group, unique catalog, human document author and exact sole
attachment. Invalid existing state fails rather than silently widening/repairing
it. Origins/weights are bounded; the catalog never stores a JWT. Cross-tab CAS
and cross-check/write transactions are not promised by these client checks.

Ordinary `readById` filters unreadable attachments, so its groups are not proof
of exclusivity. Existing-catalog read/save performs `update(doc_id, {})` first:
the author-only update response returns complete groups without replacing links
or adding new preferences. This advances the document version and requires
updateOwn even on catalog reload. Unexpected extra links deny; the client never
repairs them by replacing a filtered list. Canonical responses use `service`,
not the stale SDK declaration's `collection_name`. Independent review reproduced
both the shape mismatch and hidden-link problem; canonical-shape and hidden-link
tests fail before repair and pass after. Concurrent attachment/ACL changes remain
a cross-request race; this preflight is not a server transaction.

Catalog rows confer no token-dispatch consent. A separate tab-local key uses a
SHA-256 digest of the current credential and the exact origin. A changed token
does not reuse approval. Saving/removing sources invalidates retained callbacks
through captured generation and write-sequence checks; removing a source clears
its approval before the asynchronous save. Grant enforcement remains at the node.

Review during assembly reproduced a retained same-account approve callback
restoring removed consent, followed by the sibling consent-bearing stale save.
The actual-hook regression fails before each guard and passes afterward; receipt
names in the assembly workspace are `server-editor-review-{red,green}.log` and
`server-editor-save-review-{red,green}.log`. The permanent regression is
`src/__tests__/feedSourceOwnership.test.tsx`. Store tests cover unsafe ACLs,
ownership/attachments, duplicate catalogs, stale identity and bounded origins.

Fresh reviewer `ses_e44508694ffeHfd5LbDqAXKXsU` independently reads all six TS
files and direct SDK/API seams: bounded DRY, 17 focused tests pass. Default model
selected by the harness; family diversity is not established. A separate repair
re-review `ses_e445547daffeqy7j2DlSsKsWJp` replays actual endpoint semantics with
auth/storage doubles and confirms both shape/hidden-link repairs. Original split
full social suite passes 2,217 tests in 148 files; refreshed-dev build passes.
The first full run timed out in an infinite-scroll case; the unchanged full rerun
passes, without a timeout/config/assertion change or pre-existing-failure claim.
Refreshed-dev suite passes all 2,240 tests in 150 files; build/typecheck passes.
Two further fresh bounded reviews `ses_e444e586bffe8C4y1qdAwwY6qq` and
`ses_e444d2a24ffexKS1jdv6Xa243V` independently pass all 17 focused controls and
are DRY. These are three consecutive fresh same-family dry reviews after repair,
not model-diverse approval. Draft PR #1440 has no conflict; every CI check remains
the publication/readiness gate, and no merge is requested.
Review is bounded L1/L2, not a whole-surface security PASS. Independent
model diversity, full L3/L4 coverage, actual browser/two-node Origin/app grants,
concurrent storage lifecycle and consumer integration remain OPEN. Normal PR
checks still apply; no production action or deployment.
