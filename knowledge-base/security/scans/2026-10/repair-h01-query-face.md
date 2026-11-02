# H01 Canonical Query Face Repair

02.11.2026. Base `563c96a76` (#1315 merged). Local source repair only.
Author/fresh reviewer: separate `openrouter/openai/gpt-6.1-sol` contexts;
follow-up uses the same reviewer context. No model-diverse convergence credit.

## Orient And Reproduce

Checked plan/lane/changelog and #1315 merged state; face task remains open.
Read query/face KB, thesis, learnings and actual social/shared/marketing consumers.
Existing face queries have no face doc_id, and a joined feed's ID is the post,
not its profile. Keep the generic caller-defined face interface, not app services.

Extend the retained isolated synthetic signer harness. Actual compiler/ASGI/face
resolver receives a constant SELECT inventing Bob's face author and private media
ref; metadata lookup alone is doubled with Bob-owned synthetic metadata. Both
anonymous and authenticated probes independently verify issued SigV4 and fail
their denial assertion on baseline; unprepared control passes without signing.
Initial result: **2 failed, 1 passed**. SQLite executes compiled constant SQL;
socket/DNS APIs are blocked, credentials are explicit synthetic values. No real
object retrieval or ClickHouse authority bypass is claimed.

## Repair

Treat projected author/ref as lookup requests. Server-written safe queries use
only original readable service/group sets and their existing visibility boundary.
Match exact (author, JSON string ref at the configured media-field key), grouping
distinct canonical posted_by/author-fallback uploaders per pair. Combine all
service results before face resolution; require exactly one uploader. Missing,
ambiguous or execution-error authority returns rows without a minted face.
This authorizes the same readable reference, not arbitrary projected body data.

Exact tuple IN avoids deep OR trees; UTF-8 hex literals avoid quote/backslash
reinterpretation through repeated parser/generator passes. Grouping prevents
duplicate docs/groups consuming the pair limit. Repeated identical face requests
share one resolution; unrelated fields/order remain unchanged. No face ID, SDK,
client, schema or hardcoded service changes. Face output must be a new column:
colliding urlField returns 400 from the face helper, not silent data loss/stale
fallback. The initial SELECT and carrier preparation can already have executed.

## Verify And Review

**180 focused cases**, **1,745 API tests plus eight subtests**, full API Ruff,
focused formatting and whitespace checks pass. Two retained disclosure probes
are denied green; unprepared ordinary data remains unchanged. New controls cover
anonymous/authenticated avatar/banner reads, group entities versus human uploaders,
actual metadata resolver composition, malformed/no-face states, exact tuple and
cross-service ambiguity, failure before face signing, output collisions, duplicate
resolution and 1001-pair/Unicode/backslash compilation. Positive signing uses a
signer double; real SigV4 evidence is the isolated negative/retained baseline.
Canonical SQL/Array(String) results are doubled, not actual ClickHouse execution.

Fresh same-model review found unconditional output stripping could delete body
or score. Explicit collision rejection plus four tests repairs it; follow-up
reran all 180 focused cases and found no remaining blocker. No three-dry claim.

## DESIGN-INTENT REVIEW

1. Intent: generic authorized render-ready public/cross-user faces in one HTTP
   request, including standalone people/group and joined profiles (D41/D60/D73).
2. Delta: scoped canonical reference reads precede face minting; canonical
   uploaders replace projected signing authority. Output collisions now return 400.
3. Conflict: none identified; current consumers use new URL outputs and require
   no face IDs. No owner-only read restriction or app-specific node logic added.
4. Standards: no new deviation; public reads/node readability stay intentional.
5. Risk: actual ClickHouse tuple/aggregate execution, driver decoding, connected
   face rendering and multi-service latency remain open verification obligations.

Attached-ad loader authorization/latest-state semantics, stored reference/legacy
URL provenance, existing capability TTL, CI/rollout and required different-family
review remain OPEN. No whole-media/prepare or protocol L1 closure. Uncommitted;
no PR created for this slice.
