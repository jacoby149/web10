# L1 API O: ClickHouse Discovery, Policy and Board SQL

- Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Pinned commit: `8af7e0fce922cada30002dff190a5bb3abcf4f63`.
- Exact scope: `api/app/v3/services/clickhouse.py:1616-2412`, 797 lines of a 4,944-line file.
- Every assigned line read, including comments/blank lines. Coverage complete for assigned lines only; unscanned within scope: none. No P-R claims.
- Disposition: review/signoff pending. Confirmed vulnerability IDs: none. No exploit, PASS, fix, fresh design review or convergence sign-off claimed.

## Orient

- Onboarding: root AGENTS, security method/checklist/design-intent gate, learnings/record/I1-I6, thesis, canonical group-access spec, seed backend audit, plan/lane queues and recent changelog read.
- Recession: specifically revisited revocation/dedup and caller-preauthorized board SQL instead of inheriting seed read-path PASS.
- Obvious gap: no storage ACL backstop; doc-ID attachment joins, stale policy rows and caller-populated readable groups carry isolation. Supply chain and SQL-engine semantics remain trust assumptions.
- Design intent: public membership enumeration only by explicit D80 policy, generic contracts and moderation, block/sharing enforcement on board reads. Sharing default-on and public graph are intentional, not findings. No behavior changed; independent design review pending.
- No existing O receipt when checked; middleware/settings completion is unrelated. Central state remains coordinator-owned.

## Coverage by Symbols/Ranges

| Lines | Inspected surface |
|---|---|
| 1616-1652 | Batched active-member counts and discoverable directory |
| 1653-1758 | Private/user memberships, public visibility-filtered memberships |
| 1759-1844 | Join create/resolve, pending list and pending predicate |
| 1845-1907 | Hide/unhide and hidden-document body lookup |
| 1908-1971 | Ban/unban, active names and metadata lists |
| 1972-2036 | Discover-post sweep, moderation flag insertion/aggregate |
| 2037-2139 | App contract add/list/allow/permissions/revoke/cleanup |
| 2140-2228 | User/group block/unblock, block predicate and sharing |
| 2229-2332 | Python and SQL power-mean score construction |
| 2333-2412 | Complete `_board_base_sql`, membership/tag and policy joins |

## Checklist Dispositions

| Class | Disposition |
|---|---|
| 1 Access control / I1-I3,I5 | Public memberships explicitly filter latest `membership_visibility='public'`. Private memberships, moderation bodies and mutation primitives rely on callers. App grants scoped by user/origin/service/op. `require_membership=False` explicitly delegates prior readable-group validation; unverified caller obligation, not a confirmed leak. |
| 2 Injection | User/group/tag/origin/limit values bound; insert data not concatenated. SQL fragments use generated placeholders/fixed branches. Rank SQL accepts raw expression parameters; callers must supply trusted expressions. No eval/pickle/yaml/template/shell/path sinks observed. |
| 3 Boundaries/transport / I5,I6 | Origin strings stored/compared, not fetched. No HTTP fetch, cookie, CORS middleware, token URL, browser messaging or cross-node query here. Actual origin/token binding external and unverified. |
| 4 Availability | Unbounded memberships/pending/moderation lists and board/ranking work are reliability only. Numeric overflow/invalid score inputs not new C+I findings. |
| 5 Lifecycle | Latest-row filtering correct in public memberships, joins, hidden rows and bans; app contract timestamp ties lack deleted tie-break. Attachment and block predicate prefilters differ; candidates below. No one-use token/OTP persistence here. |
| 6 Hygiene | No credential literals or token logging found. Moderation body access must stay privileged; mere node-readable storage is intentional. No file/bucket mode changes or build secrets in this slice. |
| I4 | Public graph/metadata and readable-node model respected; private body authorization remains a caller-boundary handoff. |

## Local Evidence

Ran the actual SQL-builder AST body without imports/connections:

```sh
python3 -B -c 'import ast,pathlib; t=ast.parse(pathlib.Path("api/app/v3/services/clickhouse.py").read_text()); ns={}; exec(compile(ast.Module([n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=="_board_base_sql"],[]),"scan-O","exec"),ns); q=ns["_board_base_sql"](["g"],False,["tag"]); print("attachment_prefilter", "FROM doc_groups WHERE deleted = 0 QUALIFY" in q, "membership_join", " gm ON " in q)'
```

Exit 0: `attachment_prefilter True membership_join False`. This demonstrates generated-query properties, not an unauthorized read. Initial AST probe used a fake query sink for `is_user_blocked('alice','bob')`: synthetic count `(1,)` yielded `True`; captured query prefilters `deleted=0`. No SQL execution, revoked-row recovery or production exposure established. Source equality to pinned commit verified as recorded in M.

## UNVERIFIED L2+ Handoffs

- O-C1: 2379-2380 and 1984-1985 filter attachment tombstones before ranking. Pair an old attached row with a newer detach tombstone and replay the real read path before background merge. Candidate stale-group access; no DB exploit demonstrated. Related N-C2, not a duplicate confirmed ID.
- O-C2: 2166-2173 excludes unblock tombstones before selecting latest, so a stale old block may still count. Trace consumers for actual authorization consequences; observed direction is over-denial, not a demonstrated confidentiality leak. Board blacklist joins at 2383-2390 do dedup before filtering.
- O-C3: 2052-2091 app-contract latest reads lack `deleted DESC` tie-break; after millisecond truncation a same-timestamp grant/revoke can tie. Replay actual schema/driver timestamps and live request permission gate before claiming revocation bypass. Do not infer exploitability from timestamp syntax alone.
- O-C4: 1872-1900 returns all hidden bodies for a group regardless of service. Trace list-hidden caller service scope: `can_moderate_group` (N) grants entry if any service has `hideAll`, while spec scopes moderation per service. Candidate cross-service moderation read; no caller inspected/confirmed leak.
- O-C5: 2345-2349/2364-2371 remove membership checks by explicit caller contract. Trace every caller's readable-group filter and principal/service provenance. Also verify trusted expression sources for 2284-2330; raw expression interpolation alone is not proof of caller SQL injection.
- O-C6: 2037-2137 and 1759-1935 need caller self/admin/group-management gates and status/role validation. Mutators not checking tokens inline is not a confirmed vulnerability. Sharing row ties and check-then-act interleavings require separate deterministic replay.

## Limits

No lines after 2412 claimed; P-R remain separately owned. No DB, network, secrets, installs, runtime/central docs/git changes, or independent design/convergence review. No confirmed new IDs allocated; candidate labels are handoff references only. Only receipts written; no probe files retained.
