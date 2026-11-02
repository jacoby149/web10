# H01 Canonical Query Carrier Repair

02.11.2026. Local working-tree repair on `66330ed99` plus the retained owner-proof
slice. Author/reviewer: separate `openrouter/openai/gpt-6.1-sol` contexts.
One finding: projected carrier fields reaching media/ad capability minting.
Protocol L1 remains OPEN; no commit, PR, deployment or diverse-model sign-off.

## Boundary And Repair

Read plan/lane/changelog, thesis, security learnings and the prepared-owner proof.
Confirmed #1312 merged with thirteen green checks; do not redo its HLS repair.
Input CTE scoping does not establish output alias authority. For media/ad prepare,
only document-shaped rows (nonempty string doc_id/author_key plus body) request
canonical reads. Other rows no-op. Ordinary unprepared SQL remains unchanged.

Server-written SELECTs use the safe compiler over the original readable services
and groups, including its visibility/sharing/moderation boundary. The original
app-service gate still runs before any execution. Canonical body, author,
posted_by and ad preferences replace projections; projected inline ads are dropped.
Absent/ambiguous canonical identity or failed canonical execution returns 403
before carrier signing. Additional aliases/counts and result order remain.
The boundary CTE now exposes posted_by for correct group uploader resolution.

## Repro Gate And Controls

The retained isolated compiler/ASGI/real-signer probes now require no foreign
capability for anonymous and authenticated constants; unprepared control still
returns ordinary data without signing. In-memory baseline replay replaces only
the prepare function with its HEAD implementation (signature adapted); the anon
probe independently verifies foreign SigV4 then fails its denial assertion.
No source rollback, real credentials, network access or real object retrieval.
SQLite executes the compiled constant SELECT, not ClickHouse.

22 authority cases cover canonical body/uploader replacement, dropped projected
ads, missing authority, invalid/non-document IDs, aggregates with reserved aliases,
1001-row results, read failure, ambiguous authors and app-contract denial.
Anon/auth composition uses real pinned/node loaders, resolver and HLS minting
with synthetic DB rows: canonical real-ad replaces forged-ad, three uploader
contexts survive and actual JWT verification pins stream prefixes/principal flags.
These doubles do not certify loader access predicates or actual DB execution.

Final: 163 focused cases; full API **1,694 passed plus eight subtests**. Focused
Ruff lint/format and whitespace checks pass. Fresh same-model review found an
overbroad aggregate detector and missing composition coverage; both repaired.
Follow-up review reran all 163 focused cases and found no remaining blocker.

## DESIGN-INTENT REVIEW

1. Intent: generic render-ready query rows in one HTTP request, preserving public,
   cross-user/group media, ads, joins and non-document aggregates (D41/D60/D73).
2. Delta: document-shaped carriers incur canonical reads before minting; canonical
   capability fields replace transformed projections and invalid identity denies.
3. Conflict: none after restoring the documented three-field carrier detector.
   This does not impose viewer-owned-only media or a social-specific endpoint.
4. Standards: no new deviation; anonymous public reads and node readability stay
   deliberate. Carrier read authorization still uses the existing scoped gate.
5. Risk: actual ClickHouse, connected playback and multi-service latency remain
   unverified. Concurrent deletion/hide fails a page closed. These are recorded
   integration gates, not evidence of successful production behavior.

## Open Boundaries

Face projection authority and attached-ad loaders' independent access/latest-state
semantics require separate bounded repairs/evidence. Stored reference provenance,
legacy URLs, existing capability TTL, persisted ClickHouse inputs, connected
playback, CI/rollout and required different-family review remain OPEN. This is
carrier rebinding only, not whole-query/media no-escalation or L1 closure.
