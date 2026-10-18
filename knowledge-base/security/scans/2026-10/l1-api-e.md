# L1 API Scope E Receipt

- Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol (API ID `openrouter/openai/gpt-6.1-sol`).
- Pinned source: `8af7e0fce922cada30002dff190a5bb3abcf4f63` (HEAD verified).
- Coverage complete for assigned lines: **826/826**, including comments/imports/blank lines; no unscanned lines.
- Disposition: **OPEN** (L1-E-01); independent review/signoff pending. No whole-file security assurance, fix, three-dry, model-diverse, or design-review signoff.

## Orientation

- Read AGENTS, strategy directory, thesis, plan/lane scan queues, recent changelog, security learnings/record, I1-I6, checklist and design-intent gate; also groups/access.md.
- Onboarding: B-1/B-3 issuer/decode and BP-2 delegation remain known debt; B-4 is the separate middleware logging sink. Middleware/settings not rescanned.
- Recession: inspect management permissions, membership visibility, request resolution and revocation assumptions; prior service-level audit rows do not establish endpoint safety.
- Obvious gap: storage has no row ACL; caller-to-helper authority and tombstone handling are load-bearing. Supply chain remains outside this file scan.
- Intent: public directory/metadata and public membership enumeration are intentional; hidden memberships/content require policy gates. Creator ownership healing is explicitly intended. Token-in-body/node readability/accepted lifetime are not findings.
- Plan/lane/changelog checked: scope E receipt did not already exist; central updates reserved to coordinator.

## Exact Coverage

| File | Read ranges and symbols |
|---|---|
| `api/app/v3/endpoints/groups.py` (586 lines) | 1-35 imports/router; 36-140 permission/moderation/key/id/summary helpers; 141-231 create/list/get/update; 232-272 member enumeration/add/remove; 273-365 join/invite/accept/decline/leave/request list/approve/deny; 366-447 management/directory/by-user; 448-492 detail; 493-548 block/unblock/sharing/delete/heal; 549-586 hide/unhide/hidden |
| `api/app/v3/endpoints/contracts.py` (81 lines) | 1-23 imports/router/origin helper; 24-40 add; 41-47 list; 48-67 revoke; 68-81 cleanup |
| `api/app/v3/models/groups.py` (147 lines) | 1-40 create/get/update; 41-68 own/public-user/member lists; 69-124 membership/invite/request/delete payloads; 125-147 moderation payloads |
| `api/app/v3/models/contracts.py` (12 lines) | 1-8 AddAppContract; 9-12 RevokeAppContract |

## Checklist Dispositions

| Class | L1 disposition |
|---|---|
| 1 Access control (I1/I2/I3/I5) | `_user`, `user_or_anon`, verified decode flag, permission/admin helpers present. No unsigned local decode. Delegated signature/expiry/app scope/revocation unverified. Management/update/invite handoffs below; public endpoints are not inherently missing-auth findings. |
| 2 Injection | No local SQL construction/execution, shell, filesystem, template render or executable deserialization. Unrestricted dictionaries/identifiers flow to storage helpers: binding/validation remains L2. |
| 3 Boundaries/transport | L1-E-01 token query parameter. Contract management uses origin gate, allows absent Origin, and parses host by replacements/splits (contracts:12-21); origin is not proof of token delegation authority (BP-2 handoff). No local outbound fetch/cookie/postMessage. |
| 4 Availability | Reliability only: unbounded plain-int pagination and bulk members/roles/tags; duplicate member loop at groups:160-166. No C+I finding allocated. |
| 5 Lifecycle | Request check/resolve/add and membership check/update are separate calls; atomicity, stale invitations, tombstones and deleted-group handling require L2+. No exploit established. |
| 6 Hygiene | L1-E-01 credential transport exposure; no literal credential, artifact secret, credential log or local security configuration found. Helper logging/configuration not covered. |
| I4/I6 | Readable node respected; no cross-store or outbound network operation locally. Provider normalization/healing authority needs L2+ identity review. |

## Confirmed Local Finding

**L1-E-01: bearer token accepted in GET query (transport hygiene, OPEN).**
Exact static evidence: groups:448-460 declares `@router.get("/detail")`, plain `token: str | None = None`, and passes it to `user_or_anon(SimpleNamespace(token=token or ""))`.
FastAPI's non-path scalar parameter convention exposes this as `GET /detail?group_id=...&token=...`; intentional JSON-body transport does not exempt an account bearer token accepted in a URL.
Precondition: a client supplies a real credential through this supported parameter. URLs can enter access logs/history; actual client usage, proxy logging, persistence and credential theft were **not** demonstrated.
This is a source-proven hygiene property, not an authorization exploit. No live token used. Existing plan S7 already names group-detail transport work; no earlier finding ID located for this specific property.

## UNVERIFIED L2+ Handoffs

- **E-C1, management mass assignment:** groups:199-228 checks membership then forwards replacement roles/visibility/join policy to `ch.update_group` without caller argument or local `manageRoles` check. Inspect `_user`, `get_group_member`, `update_group` and enforcement context; demonstrate a real low-role mutation before confirming escalation.
- **E-C2, request self-approval:** groups:300-310 accepts `has_pending_or_invited_request` then approves/adds caller. Verify that helper distinguishes owner-approved invitations from pending requests; pending-request acceptance is a candidate, not a proven bypass.
- **E-C3, delegation (existing BP-2):** contracts:12-38,48-81 relies on Origin plus `_user`; inspect token purpose/site/target/scopes and storage helper gates. Missing Origin allowance/spoofable HTTP headers alone do not prove app-token escalation.
- **E-C4, create replay:** groups:150-172 skips contract creation when existing but processes supplied members/roles for ownership ensure. Trace storage authorization/role validation and replay effects before calling it a grant bypass.
- **E-C5, read/moderation/revocation:** groups:188-195,232-252,428,460-489,561-586 depend on ch visibility/read/admin gates. `get_document_any_author` is related to existing B-6, but here document contents are not returned; existence/service use is not proof of content disclosure. Verify tombstones and helper scope.

## Evidence And Limits

- `git rev-parse HEAD` returned the pin. Scope E recheck: `git diff 8af7e0fce922cada30002dff190a5bb3abcf4f63 -- api/app/v3/endpoints/groups.py api/app/v3/endpoints/contracts.py api/app/v3/models/groups.py api/app/v3/models/contracts.py` returned no output: **4 files, 826 lines**, each read in full using Read.
- No executable E probe: confirmed issue uses exact static transport evidence; auth candidates cannot be validated with permissive storage stubs.
- L1 only; no helper coverage claimed, network/services/secrets/packages/runtime/central docs/git mutations. Fresh coordinator design/document review remains required.
