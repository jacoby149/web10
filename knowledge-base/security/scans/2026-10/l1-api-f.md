# L1 API Scope F Receipt

- Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol (API ID `openrouter/openai/gpt-6.1-sol`).
- Pinned source: `8af7e0fce922cada30002dff190a5bb3abcf4f63` (HEAD verified; assigned files have no diff).
- Coverage complete for assigned lines: **614/614**, no unscanned lines.
- Disposition: **review/signoff pending**; zero confirmed local vulnerabilities, four UNVERIFIED L2+ handoffs. Not a secure/PASS or independent design-review claim.

## Orientation

- Read AGENTS, strategy directory/thesis, plan/lane/changelog scan state, security learnings/record, I1-I6, all checklist classes, design-intent gate and groups/access.md.
- Onboarding: I3 has no storage-layer backstop; app contracts and effective group roles must both hold. Known B-1/B-3/B-4/B-6 and BP-2 are not assumed fixed.
- Recession: compare create attachment gate to update replacement, all read variants, metrics and media/ad enrichment; do not infer helper behavior from names/comments.
- Obvious gap: secondary capability minting and metrics provenance can cross a different boundary from primary document reads. Helpers are outside this assigned L1 scope.
- Intent: generic CRUD and readable-node/public reads, body tokens, content-free telemetry conventions and reader-bound HLS capabilities are deliberate; do not flag them generically. Scope F receipt absent; coordinator owns central updates.

## Exact Coverage

| File | Read ranges and symbols |
|---|---|
| `api/app/v3/endpoints/documents.py` (433 lines) | 1-24 imports/router/log; 25-35 `_log_deliveries`; 36-64 `_moderate_post`; 65-94 `_mint_ref_manifest`; 95-149 `_mint_hls_manifest_urls`; 150-161 `_check_app_permission`; 162-195 create; 196-308 read (single/me/explicit/ref/count/group); 309-341 update; 342-355 delete; 356-382 track event; 383-402 creator analytics; 403-433 content views |
| `api/app/v3/models/documents.py` (181 lines) | 1-15 AdPreference; 16-31 CreateDocument; 32-49 PowerMeanSort; 50-106 ReadDocuments; 107-118 UpdateDocument; 119-125 DeleteDocument; 126-146 TrackContentEvent; 147-163 ContentAnalyticsRequest; 164-181 ContentViewsRequest |

## Checklist Dispositions

| Class | L1 disposition |
|---|---|
| 1 Access control (I1/I2/I3/I5) | Mutations/analytics use `_user`; public reads use `user_or_anon`. No local unsigned decode. App gate applies per operation for authenticated readers when Origin exists. Create filters writable groups; read delegates readable groups/by-id authorization; update/delete pass author to primary document helpers. Delegated expiry, revocation, scope and attachment authority unverified. |
| 2 Injection | No local SQL/raw-table access, shell, filesystem, template or executable deserialization. Sort/cursor/order/service/refs and arbitrary body/tag fields reach helpers; actual query binding/validation needs L2. URL strings interpolate doc IDs/HLS signatures; no outbound fetch here. |
| 3 Boundaries/transport | Body tokens intentional; absent Origin explicitly skips app check at 152-154 (BP-2 context). HLS signature in manifest URL is an intended scoped media capability, not automatically a full bearer-token leak. Signature format/TTL and downstream verification not inspected. No cookies/postMessage/SSRF sink locally. |
| 4 Availability | Reliability only: models have no numeric/list/string size bounds, non-finite sort values not constrained locally; read/enrichment fan-out and metrics windows delegated. No C+I issue allocated. |
| 5 Lifecycle | Create inserts before group authorization (167-189), update writes version before replacing groups (322-335), delete tombstones before detachment (351-352): partial failure/atomicity review owed, not a demonstrated unauthorized access. Revocation/tombstone visibility delegated. |
| 6 Hygiene | No literal secret/build artifact or direct bearer/body logging in assigned lines. Moderation errors log exception text at 62; sensitivity of helper exceptions unknown. Credential rotation/defaults not implemented here. |
| I4/I6 | Node-readable/public reads respected; no direct cross-node fetch/store access. Media resolution/signature helpers remain delegated trust boundaries. |

## Confirmed Findings

None demonstrated within this local scope. A missing inline check is not proof that an uninspected delegated helper lacks enforcement.

## UNVERIFIED L2+ Handoffs

- **F-C1, update group authority (priority):** endpoints:333-335 forwards caller-supplied `data.groups` to `ch.replace_doc_groups(doc_id, groups)` without the create path's `can_write_group` filter (179-189). Models:107-116 accepts arbitrary group IDs. Inspect `replace_doc_groups` and auth context; replay with an actual author-owned doc plus non-writable target before confirming unauthorized attachment. A fake accepting sink would prove only call arguments, not a vulnerability.
- **F-C2, enrichment capabilities:** endpoints:65-147,224-227,280-306 resolve media and mint signatures from document bodies/refs/ad rows. Trace `attach_pinned_ads`, `attach_node_ads`, `resolve_media_urls_in_docs`, `mint_sig` and HLS consumption for canonical doc/author/object binding and current I3 checks. Related B-6 ordering must be verified, not inferred.
- **F-C3, read/metrics authority:** endpoints:216,234-298,372-399,432-433 delegate by-id/ref/count/full reads, delivery gating and metrics visibility. Verify service isolation, block/sharing/hidden policies, reserved principal classes, author scope and tombstone filtering. No helper assurance claimed.
- **F-C4, delegation/revocation (existing BP-2):** endpoints:150-159 and every caller use Origin-derived app authority with absent-Origin skip. Trace `_user`/`user_or_anon` credential purpose, expiry and revocation plus `ch.has_permission`; an omitted header is not by itself a verified app-scope bypass.

## Evidence And Limits

- All **2 files, 614 lines** read using Read; pin verified with `git rev-parse HEAD`. Scope F recheck: `git diff 8af7e0fce922cada30002dff190a5bb3abcf4f63 -- api/app/v3/endpoints/documents.py api/app/v3/models/documents.py` emitted nothing.
- No F exploit probe executed: local suspicion requires real helper authorization/storage behavior. No candidate promoted using permissive stubs.
- No network/live services, inherited secrets, package installs, runtime edits, central-doc edits or git mutations. No tests of deployment or helper behavior; independent convergence/document/design review pending.
