# L1 API N: ClickHouse CRUD and Group Permissions

- Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Pinned commit: `8af7e0fce922cada30002dff190a5bb3abcf4f63`.
- Exact scope: `api/app/v3/services/clickhouse.py:791-1615`, 825 lines of a 4,944-line file.
- Every assigned line read, including comments/blank lines. Coverage complete for assigned lines only; unscanned within scope: none. No P-R claims.
- Disposition: review/signoff pending. Confirmed vulnerability IDs: none. Existing B-6 remains an unverified caller-boundary question, not a reproduced exploit. No PASS/fix/convergence claim.

## Orient

- Onboarding: root AGENTS, security method/checklist/design-intent gate, learnings/record/I1-I6, thesis, canonical `groups/access.md`, seed backend audit, plan/lane security queues and recent changelog read.
- Recession: no trust in seed read-path PASS. Compared real member/grant branches and document tombstone handling against revocation and per-service policy.
- Obvious gap: DB has no per-row ACL; principal identity, `authenticated`, caller scoping and caller role validation are load-bearing. Supply chain remains assumed.
- Design intent: preserve generic CRUD, reserved public/authenticated classes and creator ownership; node readability is intentional. Canonical access spec requires per-service role checks, while code/seed audit describe member-wide access; reconcile before repair.
- Existing middleware/settings scans do not complete this scope; M/N/O were absent when checked. Central state left to coordinator.

## Coverage by Symbols/Ranges

| Lines | Inspected surface |
|---|---|
| 791-898 | `insert_document`, `read_documents` |
| 899-1010 | Update/delete/get, `get_document_any_author` |
| 1011-1056 | `can_read_carrier_post`, section separators |
| 1057-1095 | Attachment, detach/replace and attachment lookup |
| 1096-1257 | Group create/get/delete/update |
| 1258-1377 | Member add/remove, creator-owner heal, paged/single reads, membership predicate |
| 1378-1484 | Role normalization, effective union, read/write predicates, readable groups |
| 1485-1567 | Batched readable-groups SQL and merge |
| 1568-1615 | Management/moderation predicates and member-key list |

## Checklist Dispositions

| Class | Disposition |
|---|---|
| 1 Access control / I1-I3,I5 | No JWT decode/verification here; CRUD and management primitives accept trusted actor/IDs. Missing inline auth alone is not a finding. `read_documents(None, ...)` removes author scoping; caller proof required. Reserved grants and member shortcuts examined; candidates below. |
| 2 Injection | Query values bound, inserts use row sinks. Dynamic SQL is fixed conditions/order and generated placeholder names, not input SQL. JSON parse has no code-execution sink. No shell/template/path traversal/eval found. |
| 3 Boundaries/transport / I5,I6 | No HTTP fetch/browser messaging/cookie/CORS/token-URL sink in slice. HLS trust boundary is referenced, not verified. No cross-store query observed. |
| 4 Availability | Per-group permission fan-out, unrestricted membership-list size and candidate placeholder growth are reliability concerns only. Batched helper reduces queries but is not a security proof. |
| 5 Lifecycle | Member/group reads dedup including tombstones with deleted tie-breaks. `read_documents` ranks versions then filters `deleted=0` (867-875), the correct order. Affected getters/carrier/attachment reads prefilter deleted rows; N-C2 below. Detach/attach and get/update operations nontransactional; no interleaving exploit demonstrated. |
| 6 Hygiene | No secret literals/token logs in owned lines. Public/wildcard grants are explicit policy, not automatically insecure defaults. Role/body validation belongs to caller boundary; malformed input alone not a confirmed C+I issue. |
| I4 | No operator-blindness requirement imposed. Public grants remain intentional; excess access beyond role/terms needs demonstration. |

## Local Evidence

Ran real gate AST bodies with synthetic dependency results (no module imports/DB):

```sh
python3 -B -c 'import ast,pathlib; t=ast.parse(pathlib.Path("api/app/v3/services/clickhouse.py").read_text()); ns={"is_group_member":lambda *a:True,"effective_role_perms":lambda *a:{}}; exec(compile(ast.Module([n for n in t.body if isinstance(n,ast.FunctionDef) and n.name in {"can_read_group","can_write_group"}],[]),"scan-N","exec"),ns); print(ns["can_read_group"]("g","alice","notes"),ns["can_write_group"]("g","alice","notes"))'
```

Exit 0: `True True`. This proves member short-circuit behavior only. It does not establish an endpoint bypass; injected helpers are not independently tested here. Initial real-AST/fake-query-sink probe of `get_document('doc','alice')` with empty result returned `None` and captured SQL with `AND deleted = 0 ORDER BY`; no database semantics simulated or deleted data recovered. Pin equality to source verified as recorded in M.

## UNVERIFIED L2+ Handoffs

- N-C1: 1444-1471 member shortcuts allow read/create regardless of effective role. Canonical `groups/access.md:119,262-275` requires service/operation grants; seed backend audit instead accepts all-service member reads. Trace callers for independent checks and replay a member with a reader-only role creating content. Local behavior proven, unauthorized access not demonstrated.
- N-C2: The getters `get_document`/`get_document_any_author` (957-1008) filter `deleted=0` before latest-row selection; the carrier read (1037-1049) also filters old body matches before ranking and joins un-deduped live attachments. Attachment lookup (1082-1088) similarly ignores newer detach tombstones. This observation excludes `read_documents`, which correctly ranks versions then filters `deleted=0` (867-875). Replay deletion/media-removal/detach before merges, then trace HLS/read consumers. Old media authorization may survive, but no exploit established.
- N-C3: 1485-1565 retain `member_groups` without intersecting live group contracts; 1451/1468 likewise return on membership before checking group existence. Demonstrate a deleted contract plus surviving/latest membership and a consumer accepting its documents; no all-flow safety or exploit claim.
- Existing B-6: 982-1008 is author-unscoped by design for document-bound HLS checks. Verify signature validation precedes use and reauthorization follows; do not allocate a duplicate ID or call absence inline a confirmed leak.
- N-C4: trace caller ownership/service binding for 791-979 and 1057-1315, including chosen doc IDs, group attachment IDs, creator argument and `read_documents` null author; distinct authors can supply the same doc ID while attachments key only on doc ID. Requires caller/model validation and a collision replay, not an L1 confirmed finding.

## Limits

No live DB/merge-state tests, network, secrets, package installs, runtime or central docs edits, git mutation, or independent design/convergence review. Claimed coverage stops at 1615. Only receipts written; no probe files retained.
