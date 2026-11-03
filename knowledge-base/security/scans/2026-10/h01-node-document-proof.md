# H01 Node-Ad Document History Evidence

03.11.2026. Source pin `ae875d27b77986eec3b02401efea32ae8d086309` plus
test-only extension. Author/fresh reviewer: separate
`openrouter/openai/gpt-6.1-sol` contexts. Finding OPEN; no runtime repair.

## Orient And Scope

Checked plan/lane/changelog and learnings. Discover attachment repair #1339 is
merged. This continuation of H01-AD-AUTHORITY isolates the remaining document
prefilters in `get_active_node_ads`: `has(tags, 'node_ad') AND deleted = 0` runs
before `row_number`. Newer ineligible versions are discarded before ranking.
Read node-ad current/public inventory and conversion intent, plus the compiler
dedup-then-filter invariant. Public delivery is intentional; stale inventory is
not a reason to add owner-only or explicit viewer-membership restrictions.

Scope: actual loader SQL, registered read enrichment, actual compiler document
subquery and raw-media signer. No runtime code changes or full authorization scan.

## Eight Replays

Extend the isolated signer harness in `test_media_read_url_owner.py`. Canonical
Discover attachment remains live in every document case; no explicit reader
membership exists. Carrier is readable/unpinned, density 100%, overwrite disabled.
One Bob-uploaded creative has strictly increasing integer history versions.

Execute the actual compiler `_boundary_cte_sql` document subquery (alias d) on the
same fixture snapshot. Evaluate its current row's node_ad tag/status in the test
to distinguish current inventory from stale selection. This is a document-version
reference, not complete compiler authorization or direct-read HTTP denial.

Execute the actual loader SQL and registered /v3/read enrichment, then actual
resolver and real botocore signer using synthetic credentials. Independent HMAC
verification checks path, timestamp, expiry, credential scope and signature.

| Document history | Current inventory | Actual node creative/signing |
|---|---|---|
| Active | Eligible | Original signed |
| Newer deletion | Ineligible | Older signed: disclosure |
| Newer node_ad removal | Ineligible | Older signed: disclosure |
| Newer paused body | Ineligible | No ad/no signer |
| Pause then reactivation | Eligible | Latest active signed |
| Delete then restoration | Eligible | Latest restored signed |
| Detag then retag | Eligible | Latest retagged signed |
| Newer deletion, group author/Bob uploader | Ineligible | Older signed as Bob: disclosure |

Body text markers distinguish old creative content from newer current versions.
The group-author case retains posted_by=Bob, not carrier Alice or group authority.
Pause works because its node-tagged/live row survives the prefilter and Python
rejects the current paused body. Do not generalize this to a pause bypass.
Passing deletion/detag disclosure assertions establish evidence, not desired policy.

## Verification And Review

```sh
# from api/
uv run pytest tests/test_media_read_url_owner.py -k 'node-doc or node-link' -q
H01_AD_CLICKHOUSE=1 uv run pytest tests/test_media_read_url_owner.py -k node-doc -q
uv run pytest -q --disable-warnings
uv run ruff check .
uv run ruff format --check .
```

Twenty document/link SQLite probes pass; all eight document probes pass on isolated
network-none ClickHouse-local Memory tables. Full API after final fixture change:
1,894 passed plus eight subtests, one opt-in lifecycle skip. Full Ruff passes.
Initial ClickHouse active control exposed fixture defaults added after insertion;
move projection-column setup before any history insert and use explicit insert
columns. Rerun all eight ClickHouse cases and full API successfully. This is a
fixture correction, not a production migration or schema guarantee.

Fresh reviewer independently ran all twenty SQLite document/link probes, then
rechecked final fixture initialization. No blocking evidence defect. Same-model
only, not diverse-family or three-dry assurance.

## DESIGN-INTENT REVIEW

1. Intent: serve current active node-tagged Discover inventory publicly at
   configured density, preserving independent creative uploader contexts.
2. Delta: tests only; stale deleted/detagged delivery becomes reproducible while
   pause suppression and newest restored/retagged/reactivated delivery stay pinned.
3. Conflict: none in the evidence change. Runtime prefilters conflict with
   dedup-then-filter intent; public/service-agnostic delivery is not the finding.
4. Standard deviation: none introduced; readable-node and cross-user public
   distribution remain intentional, not grounds for owner-only gating.
5. Untested intent: real writer/merge lifecycle, ties/concurrency, anonymous
   routing, inventory provenance, density/overwrite, HLS and old URL TTL remain.

## Separate Repair Gate

H01-NODE-DOC-REPAIR: rank complete document history before deletion/tag eligibility,
convert the three disclosures to no-node-ad/no-signer and preserve legitimate
pause/reactivation/restoration/retagging/public/uploader behavior. Add identity
isolation controls. One finding, <=500 code/test lines, red -> denied green,
fresh intent review, KB write-back and all CI checks green.

Reduced Memory/SQLite fixtures are not production DateTime64/ReplacingMergeTree,
actual detach/delete/retag writes or concurrent lifecycle evidence. Carrier reads
are doubled; no full auth boundary, actual object retrieval, deployed exploit or
whole-node-ad closure. Broader ad authority, provenance, real lifecycle/CI/rollout/
diverse and protocol L1 remain OPEN; L2 stays gated.

Publication reconciliation: PR #1341 merges dev at `5b910658f`, preserving incoming
Discover UI/planning work; API source/tests are unchanged by that merge. Restore
incoming changelog 3.257.5 and renumber only this evidence entry and its plan/lane
references to 3.257.6. This is not runtime repair or rollout assurance.

A second dev merge at `19ebb1085` changes only research/changelog documents.
Preserve its release 3.257.6 and renumber only this branch's evidence/plan/lane
to 3.257.7. API source/tests remain unchanged; the first post-reconciliation
head passed all 13 checks before this second base advance.
