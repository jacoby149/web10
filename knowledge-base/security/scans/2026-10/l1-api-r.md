# L1 API R: Content Analytics, Apps, Ratings, Reports, Telemetry

- Date: 2026-10-18.
- Scanner: OpenCode/gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Pinned commit: `8af7e0fce922cada30002dff190a5bb3abcf4f63`.
- Owned file: `api/app/v3/services/clickhouse.py`, inclusive lines **4094-4944**, **851 lines** of 4944.
- Every owned line read, including comments/blank lines; unscanned owned lines: none.
- Coverage complete for assigned lines; assurance: **review/signoff pending**. No confirmed finding, fix, PASS, independent design review or model-diverse sign-off claimed.

## Orient

- Read AGENTS, strategy/thesis, plan/lane scan queues, recent changelog, security theory/checklist/design-intent gate, security record/learnings, I1-I6 and prior backend findings.
- Onboarding: D56 telemetry and public report/beacon ingest are intentional. Anonymous attribution is not authorization; missing inline auth in an admin storage helper is not proof of public access.
- Recession: inspected D86 preceding-delivery and dedupe gates, approval visibility, tombstone handling and admin-data boundaries rather than repeating earlier global assurance claims.
- Obvious gap: trusted delivery event names and verified actor identities must survive the endpoint-to-helper edge; caller-provided diagnostic text can carry content/credentials despite a content-free comment.
- Preserve D41 readable-node, D56 heavy content-blind telemetry, public aggregate counts and intentional store curation. Fresh independent design review remains coordinator work.

## Coverage Map

| Owned lines | Symbols / work inspected |
|---|---|
| 4094-4171 | D86 constants, `log_content_deliveries` batching, verification delegation and warning |
| 4172-4228 | `_has_preceding_delivery`, `_log_content_signal`, `record_content_event` |
| 4229-4333 | reach, metrics, surface breakdown, timeseries SQL/row conversion |
| 4334-4410 | `content_event_views_for_docs`, `content_event_creator_rows`, group/author query scopes |
| 4411-4523 | `register_app`, metadata/version/approval preservation, visit delegation, `list_apps` |
| 4524-4663 | admin app/rating aggregates, get/detail/approval paths |
| 4664-4721 | rating create/read/canonicalization/version dedup |
| 4722-4820 | bug report submission/list/detail and screenshot serialization |
| 4821-4944 | marketing event insert and six summary queries/output assembly |

## Checklist Dispositions

| Class | L1 disposition |
|---|---|
| 1. Access control | Delivery rejects anon; client signal checks preceding same-doc/service/reader/surface delivery. On-surface metrics use supplied readable groups; creator metrics use supplied author. Admin/config authority and reader derivation belong to callers. No proved access bypass. |
| 2. Injection | Bound values and index-generated placeholders; interval interpolation uses `int(window_days)`. App fields/report text/metadata go to insert bindings, not executable SQL. No shell/eval/filesystem/template or DOM render sink. JSON/output consumers remain outside L1. |
| 3. Boundaries/transport | App URL operations delegate normalization, no URL fetch here. Page/referrer/diagnostic strings are stored/returned, not dereferenced. No local cookie/CORS/postMessage/JWT policy; endpoint verification must be traced. |
| 4. Availability | Reliability only: per-app admin rating fan-out, unpaged rating lists, report screenshots/diagnostics and public beacon volume. No C+I finding IDs assigned. |
| 5. Data lifecycle | App/rating lists resolve latest before deleted filtering; `get_app` and bug reads filter active first. Content and app visit window gates are check-then-insert; atomicity not established. |
| 6. Hygiene | No literal secret. Delivery warning includes arbitrary exception text (4169); report/telemetry fields can hold arbitrary diagnostics. Actual credential source-to-sink exposure unverified, not a confirmed B-4 extension. |
| I1-I6 | I1/I2/I5 verification delegated; I3 group/author scoping inspected with limitations below; I4 respected; no cross-node query/network fetch in slice for I6. |

## Confirmed Findings

None. No exploit demonstration obtained; static observations below remain candidates, not a new vulnerability inventory.

## UNVERIFIED L2+ Handoffs

- **R-C1, event integrity (4186-4226):** service accepts arbitrary `event_type`, but the same-type gate at 4196-4206 rejects events within one hour. The `delivery` candidate therefore requires the latest matching delivery to be older than the one-hour signal window while still within the one-day preceding-delivery window, for the same doc/service/reader/surface. Real endpoint attacker reachability remains UNVERIFIED: inspect event enum/validation and verified reader derivation, then replay through that boundary before claiming client-forgeable delivery. Direct storage-helper invocation alone is not evidence of attacker access; no new vulnerability claim.
- **R-C2, authorization and stale attachments (4229-4408):** aggregate helpers rely on supplied doc/group/author sets. Views read raw `doc_groups.deleted = 0`; creator rows filter documents active before grouping. Trace endpoint readable-group filtering, per-doc hidden/block/sharing semantics, deletion semantics and source identity; use real schema/version evidence for any disclosure claim.
- **R-C3, registration integrity (4411-4491):** metadata change preserves `approved`/`review_state` while accepting nonempty name/description/icon. Trace who may update a canonical URL and manifest refresh/curation intent before claiming unauthorized or unreviewed metadata replacement. Public app registration alone is not a bypass.
- **R-C4, administrative surfaces (4524-4661, 4765-4818, 4882-4944):** list/admin/approval/report/dashboard helpers contain no local auth; verify admin gates and caller token purpose/authority. Do not label storage-layer delegation a missing endpoint gate.
- **R-C5, diagnostics and D56 (4169, 4722-4757, 4832-4879):** warning uses exception string; reports retain page URLs, stack and screenshots; beacon accepts metadata/error/path/referrer. Follow actual credential/content inputs, sanitization/redaction, retention and protected reads. No secret canary reached these sinks in this scan, so no confirmed B-4 reuse or D56 violation claimed.
- **R-C6, lifecycle/concurrency (4139-4167, 4194-4211, 4575-4599, 4765-4818):** dedupe is non-atomic; app/report reads may select old active rows behind newer tombstones. Reproduce with concurrent ingestion or actual versioned-table deletion behavior before assigning integrity/disclosure impact.
- **R-C7, ratings (4664-4714):** helper does not enforce rating range or author/provider binding. Trace request model and verified identity derivation; lack of duplicate checks is not a bug because ratings intentionally version/dedup.

## Evidence and Limits

- Read-only `git rev-parse HEAD` matched pin; scoped `git diff` against pin empty (exact command in P receipt).
- Shared stdlib inventory/probe in `l1-api-q.md` returned source=4944; owned P=806, Q=875, R=851, total=2532. Prior 2531 inventory disagrees by one; claimed ranges/counts follow actual source.
- No R exploit probe, network, live DB, package installs, secrets, runtime/central-doc changes or git mutation. Endpoints, decoder/compiler/signer, schema and deployment not covered. Coverage is not assurance of helper callers or other slices.
