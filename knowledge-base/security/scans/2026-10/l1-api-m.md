# L1 API M: ClickHouse Initialization and Helpers

- Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Pinned commit: `8af7e0fce922cada30002dff190a5bb3abcf4f63`.
- Exact scope: `api/app/v3/services/clickhouse.py:1-790`, 790 lines of a 4,944-line file.
- Every assigned line read, including comments/blank lines. Coverage complete for assigned lines only; unscanned within scope: none. No P-R claims.
- Disposition: review/signoff pending. Confirmed vulnerability IDs: none. No PASS, fix, independent design review, or convergence claim.

## Orient

- Onboarding: read root AGENTS, security method/checklist/design-intent gate, learnings, security record, I1-I6 overview, thesis, access spec, seed backend audit, plan/lane security queues, and recent changelog.
- Recession: seed read-path PASS is not evidence. Re-examined migrations for widening visibility or resetting policy, not merely their idempotence comments. Existing B-2/B-4 are outside this slice; settings are not re-scanned.
- Obvious gap: storage has no row ACL; migration inference can become an authorization-relevant policy source. Supply-chain trust remains assumed. Node-readable data, public discover board, and telemetry are intentional, not findings.
- Design intent: schema self-heal and public-board enrollment must preserve generic app data and explicit group policy. This read-only scan changes no behavior; fresh design review remains coordinator work.
- Plan/lane/changelog show middleware/settings receipts, not completed M coverage; these receipts did not exist when checked.

## Coverage by Symbols/Ranges

| Lines | Inspected surface |
|---|---|
| 1-56 | Imports, thread-local client, lazy proxy and initialization |
| 57-128 | UTC parsing/serialization, JSON, UUIDv7 helpers |
| 129-276 | `ensure_apps_schema`, all DDL and migration invocations/error path |
| 277-351 | `_tombstone_app_row`, `_migrate_file_index_app_rows` |
| 352-405 | Sentinels, `_migrate_discoverable_default_flip` |
| 406-476 | `_infer_membership_visibility`, visibility backfill |
| 477-569 | `_infer_group_tag`, tag backfill, D58 sentinel |
| 570-648 | `_transform_role`, `_migrate_d58_role_shape` |
| 649-790 | Discover constants, create/enroll/heal routines, section boundary |

## Checklist Dispositions

| Class | Disposition |
|---|---|
| 1 Access control / I1-I3,I5 | No JWT verification/decoding here; startup primitives rely on trusted invocation. Public `anyone` board is intentional. Migration-policy candidates below; caller/token assurance not claimed. |
| 2 Injection | Fixed DDL; values bound or passed to insert. JSON decode is data, not eval. No shell, template, filesystem-path sink, unsafe deserialization, or caller SQL executor in slice. `_canonical_app_url`/other external helpers not certified. |
| 3 Boundaries/transport / I5,I6 | DB destination/credentials/TLS are operator settings at 32-38, not user URL input. No HTTP fetch, token URL, cookie, CORS, postMessage, cross-node query, or remote-control-data sink observed. Imported media clients unused here. |
| 4 Availability | Boot migrations and enrollment are unbounded and catch errors; reliability only, not C+I findings. |
| 5 Lifecycle | Dedup-then-filter app/group reads observed; sentinel reads are prefiltered. Backfill check/write and get/create sequences are nontransactional; concurrent state/policy overwrites need replay. No ephemeral credential persistence observed. |
| 6 Hygiene | No credential literals or token logging in owned lines. Settings references are not leaked values. Logs include identifiers and exception strings; sensitive downstream exception content unverified. Default discoverability/visibility conservative; broad discover role intentional. |
| I4 | Readable-node model respected; policy exposure, not lack of encryption, is the question. |

## Local Evidence

Ran from repo root, no settings import or network, compiling the real AST function bodies:

```sh
python3 -B -c 'import ast,pathlib; t=ast.parse(pathlib.Path("api/app/v3/services/clickhouse.py").read_text()); ns={}; exec(compile(ast.Module([n for n in t.body if isinstance(n,ast.FunctionDef) and n.name in {"_infer_group_tag","_infer_membership_visibility"}],[]),"scan-M","exec"),ns); g="example.invalid/groups/users/alice/private-notes"; tags=ns["_infer_group_tag"](g); print(tags,ns["_infer_membership_visibility"](g,tags))'
```

Exit 0: `['web10-social-group'] public`. This proves classification only, not disclosure or a deployed migration. An earlier isolated AST probe also checked fake query sinks and source equality with `git show <pinned-commit>:api/app/v3/services/clickhouse.py`; equality held, 4,944 source lines. No git mutation.

## UNVERIFIED L2+ Handoffs

- M-C1: 477-563 plus 406-474 can tag arbitrary legacy non-social private groups as community, then set membership public. Trace boot ordering/sentinels and public consumers using synthetic inserted group rows; prove a previously hidden relationship becomes enumerable before calling this a vulnerability. D80 permits social graph backfill, not a blanket private-group disclosure claim.
- M-C2: 381-387, 624-627, 768-781 rewrite group rows without newer policy columns; defaults can discard tags/visibility. Replay upgrade order/concurrent edits and actual table defaults. Usually restrictive, but lost tags can feed M-C1. No confirmed exploit.
- M-C3: migration sentinel check then append and app re-home check then tombstone are not atomic. Demonstrate an integrity-changing interleaving, not merely duplicate rows; no race exploit claimed.

## Limits

Only the assigned slice is covered. No runtime/central docs/git changes, secrets inspected, live DB, network, installs, or production exposure assessment. No helper/caller security certification. Only receipts written; no probe files retained.
