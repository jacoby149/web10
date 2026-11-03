# H01 Prepared Query Owner Evidence

01.11.2026. Pin `66330ed993a0121ef66df879c177244260f979c1` plus test-only
probe extension. Author and fresh reviewer: `openrouter/openai/gpt-6.1-sol`.
Finding OPEN. No runtime repair, whole-query/H01 assurance or L1 PASS.

## Orientation And Scope

Checked plan/lane/changelog and #1312: merged, thirteen checks passed first
attempt. Read learnings, recent H01 receipts and actual query prepare/resolver
source. Namespace binding checks an object against a supplied owner; it does
not establish where that owner came from. Prior receipts explicitly left this
assumption open. This is a bounded finding follow-up, not a new L2 campaign.

## Reproduction

Extend the existing isolated offline real-SigV4 harness with three probes.
They send table-free literal SELECTs inventing `author_key='alice'`,
`posted_by='bob'` and JSON body `{type: minio, value: bob/private.png}`.
Actual compiler validates service names and adds LIMIT. No services or readable
groups are used. Actual ASGI `/v3/query` handler validates requests, selects anon
or verifies the synthetic Alice JWT, parses JSON body, resolves raw MinIO and
serializes the response. The real signing client uses explicit synthetic keys.

Production `execute_query` alone is replaced with an in-memory SQLite executor
that executes the actual compiled constant SQL and returns cursor columns/rows;
it is not a canned result. Actual ClickHouse acceptance/types/driver are NOT
tested. Docker daemon is unavailable and no ClickHouse executable is installed.
There is no access to real storage, secrets or production fixtures.

Both prepared anonymous and authenticated requests return HTTP 200 with a Bob
object URL. The existing independent HMAC verifier reconstructs SigV4 scope,
canonical request, timestamp, key and signature. Without prepare, the identical
query returns only fabricated data and no signing factory call. Standard Python
socket/DNS connection APIs are blocked. ASGI HTTP is in-process, not a browser
or listening server. The auth case omits Origin/delegated client; app-contract
enforcement under those inputs is not exercised.

## What This Proves

Current source composes arbitrary query projections with capability minting.
The SQL input boundary may hold while output aliases fabricate uploader/body
authority. This supports synthetic capability issuance for known target keys,
not object existence, actual retrieval, production exposure or a live DB bypass.
No separate face/metadata/HLS/ad exploit is claimed by these raw-leaf probes.
The source comment claiming CTEs prove no prepare escalation is unsupported;
the query-engine KB is corrected rather than repeating that assumption.

These are positive-disclosure evidence assertions, not security-denial tests.
Their success means the gap is reproduced, not closed. Convert them to denied-
issuance controls in the separate repair; do not retain vulnerable behavior as
desired API policy.

## Verification And Review

Three probes pass, full API suite **1,672 passed plus eight subtests**; Ruff lint
and format pass (111 files). Fresh same-model reviewer independently ran all
99 media-owner cases, verified real signer/HMAC scope, synthetic credentials,
compiler/HTTP coverage and SQLite limitations. No blocking evidence defect found.
No model-diverse sign-off, ClickHouse run, deployment or historical exposure claim.

## Repair Gate

Separate bounded source repair(s): treat projected identity as lookup requests,
not authority. Canonical data must pass current reader/service/app/group and
visibility gates before owner/body/media minting. Do not authorize a doc ID then
retain substituted projected body or owner. Face and attached-ad authority must
be bound independently. Preserve ordinary unprepared SQL/constants/joins/
aggregates and authorized cross-user/group/public preparation. This direction
matches the existing extraction guidance; implementation and compatibility
contracts still require evidence. Rejecting only table-free SQL or signing only
viewer-owned media would not satisfy the product/security intent.

No production code changed. Finding disposition, actual ClickHouse/persisted
reproduction, denial regression, connected positive playback, CI/deployment and
required model-diverse review remain OPEN. No commit or PR created for this slice.
