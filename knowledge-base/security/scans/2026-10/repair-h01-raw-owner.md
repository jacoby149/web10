# H01 Raw MinIO Ownership

01.11.2026. Base `f3cacbff42a15980969d920d12f9cc9652a4dfda` plus local
raw-signing repair. Author and separate reviewer: `openrouter/openai/gpt-6.1-sol`.
**Local source repair. Not merged/deployed, whole-media assurance or L1 PASS.**

## Intent And Scope

Operator-approved principle: document/group readability grants the media an
authorized document may carry, not arbitrary keys injected by its author.
Direct signing and metadata-reference repairs are merged. This slice binds
recursive `{type:"minio", value:key}` resolution to an explicit media owner.
Read plan/lane/changelog, security learnings, prior H01 evidence, media KB and
actual raw resolver/callers before editing. No new schema, SDK or HLS policy.

The old recursive helper had no owner context and coerced keys with `str`.
The wrapper now passes `posted_by or author_key` independently for main docs,
pinned ads and node ads; the viewer/carrier identity is not substituted. Metadata
resolution receives the same per-entry owner. Exactly three production raw
resolver calls were found, all inside this wrapper. Removed private collect/
recursive helpers had no other Python callers.

## Source Repair

`resolve_minio_types(body, media_owner)` requires a nonempty string namespace
and a string key with exact `owner/` prefix/nonempty suffix. A single nested
visitor lazily creates one signing client per invocation only when valid keys
exist. Invalid/foreign/missing/false leaves get `url=None`; stale supplied URLs
cannot survive rejection. Valid siblings, arrays/order, non-MinIO values, input
nonmutation, opaque key bytes, TTL and signer-error propagation remain. Fixed
started/completed/denied logs contain no keys, identity, content or signed URLs.

No raw leaves returns the original body; no valid keys creates no signing client.
The internal signature intentionally has no ownerless default/compatibility path.
Three existing helper tests now pass explicit Alice context; assertions retained.

## Repro And Compatibility

The existing isolated offline harness uses actual wrapper/raw resolver and real
boto3/botocore 1.43.50 after removing conftest mocks. Explicit synthetic keys/
endpoint, AWS metadata disabled, Python sockets/DNS blocked. Independent SigV4
HMAC reconstruction verifies exact object/scope before a denial assertion.

Initial raw probe: **1 failed, 1 passed**. Alice's group-authored document carries
`bob/private.png`; baseline returns an independently verified foreign capability,
then fails the expected-no-URL assertion. Owned raw probe already passes. After
repair the foreign probe yields None without signer creation. Positive real-
signature controls cover main document and independently owned ad/node-ad keys.
This is wrapper-level issuance evidence, not persisted injection, deployed IAM,
an existing object, retrieval or an end-to-end group-access test.

Review caught that actual ad loaders omitted `posted_by`, unlike synthetic
wrapper fixtures. Added two actual-loader-to-resolver regressions: both initially
failed because legitimate uploader media had no URL. Both loaders now project
`posted_by` in inner/outer SELECTs and return it as the fifth tuple field.
Access predicates, ordering, tombstone logic and limits are unchanged. Existing
row fixtures are five columns, with no length-based compatibility workaround.
The reviewer's rerun confirmed both loaded ad shapes preserve owner success,
foreign rejection and metadata owner propagation. Real DB execution remains open.

## Verification

From `api/`:

```sh
uv run --frozen pytest tests/test_node_ads.py tests/test_media_read_url_owner.py tests/test_v3_clickhouse.py tests/test_ads.py -q --disable-warnings
uv run --frozen pytest -q --tb=short --disable-warnings
uv run --frozen ruff check .
uv run --frozen ruff format --check .
```

**347 focused / 1,570 API tests plus four subtests pass**; lint/format (111 files)
and `git diff --check` pass. Parent independently reran all checks. Thirty-seven
new cases include raw key/owner matrices, real signatures, lazy signing,
nonmutation, stale suppression, per-entry owner dispatch and actual ad loaders.
Code/test delta: **297 changed lines**, across four API files.

## Fresh Review

Separate same-model reviewer ran 594 selected tests before the ad-loader fix,
reproduced baseline by AST-loading original raw helpers/wrapper in memory, then
restored current functions. Fixed the concrete missing-owner propagation gap
rather than leaving a known compatibility break as an unexplored assumption.
Reviewer rechecked SQL projection-only changes and reran final 347 focused tests;
no remaining blocking finding. No edits/network/live credentials in review.

DESIGN-INTENT REVIEW: intent is authorized readers receiving owner-bound media;
delta denies injected unrelated objects, keeps uploader-owned group media;
no by-design conflict found; shareable TTL-limited capabilities remain intentional;
real ClickHouse schema/backfill, object/proxy behavior, rendering None fields and
external helper consumers remain untested contracts. Same-model review is not
model-diverse three-dry sign-off.

## Acceptance And Open Gates

Accepted locally on 01.11.2026: invalid raw leaves may render as missing media,
and internal callers must supply an owner. No stale URL substitute, normalization
or invented ownership for rejected keys. Reopen on added raw callers, new media
fields, changed uploader propagation or alternative signing/fallback paths.

Namespace matching validates a key against its supplied owner; it does not prove
that owner's provenance. Caller-selected query owner projections remain an
authority concern. HLS/legacy non-MinIO URL provenance, existing bearer TTL,
actual storage/DB/browser integration, CI/deployment/history and diverse sign-off
remain OPEN. This does not certify all media paths or advance protocol L1.
No commit or PR created.
