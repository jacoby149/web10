# H01 Metadata Signing Ownership

01.11.2026. Base `d5f06c6d07def9eb7cb78c4480e1d79209c239d0` plus local
one-sink repair. Author and separate reviewer: `openrouter/openai/gpt-6.1-sol`.
**Metadata-reference mint locally repaired. Not merged/deployed or L1 PASS.**

## Intent And Scope

Operator-approved principle: users see media through authorized groups/documents;
an author cannot create authority for unrelated objects by inserting their keys.
Direct endpoint repair #1305 is already merged. This slice concerns only
`clickhouse.py::resolve_media_urls`, which queries owner-scoped metadata then
signs its stored original and thumbnail keys. Owner-scoped records are not proof
that their key fields name owner-scoped objects.

Read strategy/plan/lane/changelog, media intent, H-01 evidence and S5 boundaries.
KB Stored Media References defines independent original/thumbnail owner checks,
safe per-field rejection and legitimate legacy/posted_by behavior. This is a
bounded helper/source repair, not a whole-file refresh or L2 campaign.

## Delta

Only nonempty strings in the exact `user_key + "/"` namespace, with a nonempty
suffix, may enter deduplication, dictionary lookup and signing. Original and
thumbnail fields are independent: rejected supplied key yields `None`, never a
stored-URL fallback. Valid companion/sibling references continue resolving.

Absent/None/empty-string keys preserve genuinely keyless legacy fallback. Other
malformed falsy values (0, False, lists/dicts) are rejected without TypeError or
fallback. Preserve order, input nonmutation, other metadata, dimensions,
transcoding settings and signer-error propagation. Keys remain opaque, with no
decode/normalization/UUID requirement/HEAD/write-schema change. Logs contain only
accepted-key count and fixed completion, no keys/content/identity/URLs.

The trusted owner argument is unchanged: authorized main documents use
`posted_by or author_key`, not the viewer. Existing ad/node-ad/thumbnail owner
wiring remains unchanged, with its integration/provenance limits explicit.

## Exploit-First Evidence

Reused the existing isolated real-SigV4 harness in
`api/tests/test_media_read_url_owner.py`, removing conftest boto mocks, disabling
AWS metadata and blocking Python socket/DNS operations. Explicit synthetic
credentials and endpoint; actual helper and real boto3/botocore 1.43.50 signer;
only metadata query results and signer factory are doubled. Independent
standard-library HMAC reconstruction verifies exact bucket/key and SigV4 scope.

Baseline: **two intended failures**, one for original and one thumbnail. Each
Alice-scoped metadata row names `bob/private.png`. Each returned foreign-key
capability independently verifies before the expected-no-URL assertion fails.
Current source returns no foreign URL and never creates the signing client for
those probes. This is helper-level minting evidence, not persisted HTTP injection,
deployed IAM authority, an existing object or retrieval.

## Verification

From `api/`:

```sh
uv run --frozen pytest tests/test_media_read_url_owner.py tests/test_v3_clickhouse.py tests/test_thumbnail.py tests/test_hls.py -q --disable-warnings
uv run --frozen pytest -q --tb=short --disable-warnings
uv run --frozen ruff check .
uv run --frozen ruff format --check .
```

**335 focused / 1,533 API tests plus four subtests pass**; lint/format (111 files)
and `git diff --check` pass. Parent independently reran full checks. New 56 cases
cover real-signature probes, namespace/type/fallback matrix, malformed owners,
valid companions, mixed/duplicate refs, opaque keys and error propagation. The
existing group route control now executes the actual resolver with storage/
signing doubles and confirms `posted_by` ownership. Code/test delta: 207 lines.

## Fresh Review

Separate same-model reviewer ran 559 selected tests (61 in the changed file),
including helper/thumbnail/HLS/endpoint/query cases. Independently loaded the
base helper's `__code__` in memory: both foreign capability probes verify then
fail denial; restored current code denies both before signer creation. No new
blocking defect found. No edits, live services or real data in review.

DESIGN-INTENT REVIEW: intent is fresh media for authorized documents, not
arbitrary-object minting by metadata authors; delta removes foreign-key URLs
without breaking valid siblings; no by-design conflict found; shareable bearer
URLs/TTL-limited revocation remain intentional. Untested contracts include real
ClickHouse persistence/owner propagation, actual group checks, MinIO/proxy opaque
keys, rendering of None media fields, external consumers and deployment. No
model-diverse three-dry credit or whole-media assurance.

## Acceptance And Remaining Gates

Accepted locally on 01.11.2026: previously accepted foreign/malformed supplied
keys now render without fresh URLs. No HTTP-wide failure or silent substitution
of stored URLs for those rejected keys. Legacy keyless URL passthrough is
preserved, not certified as safe; source URLs are separate data/provenance debt.
Reopen on new metadata key fields, ownership-context changes, fallback changes,
or downstream handling that turns an absent URL into another signing path.

Recursive raw `{type:"minio"}` signing is **still a separate open sink**. HLS
provenance, legacy stored URLs, caller-selected query owner columns and existing
group-as-author ad/thumbnail owner wiring also need separate assessment. This
does not prevent every alternate media-signing path. CI, real services/browser,
deployment/history and diverse sign-off remain OPEN. No commit or PR created.
