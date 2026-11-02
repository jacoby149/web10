# H01 Reference HLS Mint Ownership

01.11.2026. Base `3b37e66c4e1ecb83d0c34d47b49b95d5b53eb825` plus local
repair. Author and fresh reviewer: `openrouter/openai/gpt-6.1-sol`.
Local source repair, not merged/deployed, whole-media assurance or L1 PASS.

## Orientation And Scope

Checked plan/lane/changelog, learnings and #1311: direct mint is merged, not to be
repeated. Its last observed CI was 12/13 green with a repeated Discover engagement
race; no all-green exemption or proven base-E2E failure claimed. Read the actual
reference mint and resolver owner propagation. Remaining selected source is
`_mint_ref_manifest`, called by main document and inline/node ad wrapper paths.
No schema, SDK, segment-policy, query-owner authority or access-rule changes.

## Repro Gate

Three probes construct resolved Alice references naming `bob/private/video.mp4`,
one in each main/ad/node-ad slot. The actual mint helper issues a signed URL;
the test cryptographically verifies the foreign prefix, then sends that JWT to
the actual FastAPI segment endpoint with a key-sensitive synthetic object store.
Each baseline response is HTTP 200 with exact synthetic foreign segment bytes;
all three fail expected-no-URL assertions. After repair all three issue no URL.
This is issuance denial, not retroactive rejection of existing stream tokens.
Inputs/storage are synthetic: no persisted injection, actual read authorization,
live objects, private data or deployed IAM authority were established.

## Repair And Compatibility

Reference mint now requires explicit media-owner context, string/nonempty doc ID,
string key and exact nonempty `owner/` suffix. No coercion or key normalization.
Remove stored `manifest_url` before disabled/invalid settings return. Main refs
use their own `posted_by or author_key`; both ad types independently use theirs,
matching `resolve_media_urls_in_docs`. A carrier or viewer namespace is not enough.
Fixed started/completed/denied logs contain no keys, identities, tokens or URLs.

Existing positive test fixtures now supply author context like actual reads.
Valid refs retain reader/authenticated claims; rejected siblings do not prevent
valid minting; copy-on-write leaves input bodies/settings unchanged. Image refs
and settings-free refs are unchanged. Disabled settings retain status, not URLs.

46 added cases: three baseline disclosures; 24 malformed/foreign key cases with
stale suppression, valid siblings and nonmutation; five invalid-owner cases;
six group-uploader authenticated/anonymous controls; three disabled cases;
four malformed-ID cases; one actual resolver-to-mint composition control.
The composition test starts from string media IDs, uses owner-sensitive metadata
query doubles and both real helpers, and verifies distinct Alice/Carol/Dave trees
for main/ad/node-ad in one result. It covers group uploader plus null/empty legacy
posted_by fallback, opaque keys and reader identity. It is not real DB execution.

## Verification And Fresh Review

`uv run --frozen pytest -q --tb=short --disable-warnings` from `api/`:
**1,669 passed plus eight subtests**. Ruff lint and format pass across 111 files.
Fresh same-model reviewer found no blocking defect and ran 535 selected tests
before the final five additions. Recommended composition and malformed-ID
controls were added before the final full-suite run.

DESIGN-INTENT REVIEW: intent is authorized reader streaming of uploader-owned
media with independent ad ownership; delta denies unrelated key minting and
stored capability fallback. No conflict with D41/D68/group-as-author found; TTL
bearer URLs, opaque S3 keys and DB-free segments remain intentional. Actual
loader/resolver/mint/read-recheck/browser composition, legacy fields, and
caller-selected query-owner provenance remain unverified. Same-model review
does not earn model-diverse three-dry sign-off.

## Open Gates

The selected mint sites are now namespace-bound, but namespace matching only
validates keys against the supplied owner. Upstream query-owner authority,
legacy URL fields, service policy, persisted references, old capability TTL,
live storage/worker/player, CI/deployment/history and diverse review remain OPEN.
Protocol L1 is not passed; L2 stays gated. Publication and CI status are tracked
in the repair PR; local evidence does not establish rollout.
