# L1 API P: ClickHouse Reads, Ads, Provider Contracts, Media

- Date: 2026-10-18.
- Scanner: OpenCode/gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Pinned commit: `8af7e0fce922cada30002dff190a5bb3abcf4f63`.
- Owned file: `api/app/v3/services/clickhouse.py`, inclusive lines **2413-3218**, **806 lines** of 4944.
- Every owned line read, including comments/blank lines; unscanned owned lines: none.
- Coverage complete for assigned lines; assurance: **review/signoff pending**. No confirmed finding, fix, PASS, independent design review, or model-diverse sign-off claimed.

## Orient

- Read AGENTS, strategy directory/thesis, plan and lane scan queues, recent changelog, security theory/checklist/design-intent gate, security record, learnings, I1-I6, and prior backend findings.
- Onboarding: B-6 concerns an earlier, unowned helper, not an automatic finding against these reads. B-1/B-4 remain existing concerns, not reproduced here.
- Recession: checked membership/read gates, revocation/tombstone order, and read-minted media capability handling against I3/I5; earlier broad read-path approval is not whole-file assurance.
- Obvious gap: storage/query boundaries rely on upstream authority; membership existence is not necessarily service-specific `readAll`. Helpers/callers cannot be certified by inline inspection.
- Preserve readable-node D41, token-in-body, D56 telemetry, operator configuration, and intentionally caller-authorized storage helpers. No behavioral change proposed.

## Coverage Map

| Owned lines | Symbols / work inspected |
|---|---|
| 2413-2460 | `_group_docs_query`, parameter binding, board SQL delegation, returned fields |
| 2461-2541 | `_group_docs_ranked_query`, score construction, global engagement aggregates |
| 2542-2611 | `read_documents_in_groups`, empty-set guard, caller-prefilter contract, `QueryExecutionError` |
| 2612-2749 | `execute_query`, `read_docs_by_ref`, `read_ref_counts_by_ref`, compiler boundary and quoting |
| 2750-2814 | `read_document_by_id`, principal classes, membership SQL, blacklist dedup |
| 2815-2978 | pinned/node ad lookup/attachment, deterministic hash, config and fail-open enhancement paths |
| 2979-3109 | `get_groups_manages`, role normalization delegation, provider contract CRUD/revocation |
| 3110-3218 | `_hls_settings_for_ref`, `resolve_media_urls`, metadata author filter, offline signing |

## Checklist Dispositions

| Class | L1 disposition |
|---|---|
| 1. Access control | By-id principal/membership and media author filters present; trusted precompiled SQL and prefiltered-group APIs explicitly delegate authority. Role/check ordering requires L2; no bypass demonstrated. |
| 2. Injection | Most values bound; generated placeholders are index-derived; score uses numeric conversions/delegated SQL helper. Ref/cursor literals escape quotes, service text enters the safe-query compiler. Compiler/parser and backslash handling need L2, not certified here. No shell/eval/filesystem/template sink in slice; JSON parse is delegated. |
| 3. Boundaries/transport | S3 signing uses configured bucket, not outbound user URL fetching. HLS removes top-level stored `manifest_url`; actual mint/recheck outside scope. No cookie/CORS/postMessage registration or JWT decoding here. |
| 4. Availability | Reliability only: `limit=None`, target/ref fan-out and global engagement aggregation can be costly; no C+I finding allocated. |
| 5. Data lifecycle | Management reads dedup before filtering; several document/membership/ad reads filter active rows before version resolution or do not resolve versions. See candidates below. |
| 6. Hygiene | No literal credentials or direct credential logging in owned lines. Stored legacy URL fallback and exception text require caller/sink context; no actual secret exposure established. |
| I1-I6 | I1/I2 verification delegated; I3/I5 filters inspected with unresolved edges below; I4 respected; no cross-store federation/network query found for I6. |

## Confirmed Findings

None. No exploit demonstration was obtained; candidates below are not confirmed vulnerabilities.

## UNVERIFIED L2+ Handoffs

- **P-C1, read-by-id / pinned ads (2750-2854):** membership queries use raw `gm.deleted = 0` / `pg.deleted = 0`; by-id documents filter `p.deleted = 0` before latest ordering. A still-visible prior version could survive revocation/deletion. Trace endpoint gates, actual schema/merge visibility, role-specific permissions, hidden/group-block/sharing enforcement and reproduce denied-access expectations before assigning a finding.
- **P-C2, node ads/media (2877-2921, 3125-3216):** active-row filtering precedes row-number dedup for documents; discover attachment reads raw nondeleted rows. Test deleted/moved ads and deleted media under pre-merge versions. Configured public inventory is intentional, not itself a bypass.
- **P-C3, query construction (2628-2742):** trace service/ref/cursor validation into the real safe-query compiler, including escaped quotes/backslashes, AST round-trip and raw-table rejection. Direct execution of already-trusted SQL is not proof of injection.
- **P-C4, signing (3148-3178):** media metadata is author-scoped, but stored object/thumbnail keys go to the signer. Verify ownership validation on creation/update; matching metadata ownership does not establish blob-key ownership. Related Q-C1.
- **P-C5, ranked counts (2514-2521):** engagement scans are global and active-filter-before-dedup; assess whether ordering exposes restricted engagement information under intended public-count semantics. No disclosure reproduced.

## Evidence and Limits

- Read-only `git rev-parse HEAD` returned the pin; `git diff 8af7e0fce922cada30002dff190a5bb3abcf4f63 -- api/app/v3/services/clickhouse.py` returned no differences.
- Shared local `python3 -c` count/probe is reproduced in `l1-api-q.md`: 4944 source lines; P=806, Q=875, R=851, total=2532. Earlier inventory's 2531 is short by one.
- No P exploit probe, network, live database, secret output, installs, runtime edits or git mutation. No coverage claimed for earlier slices, endpoints, compiler, SQL helpers, signer implementation or deployment.
