# Security Hardening Extraction

Status: **PLANNED, NOT FIXED**. This is an extraction and integration contract,
not a claim that either source PR is merged, audited, deployed, or complete.
Written 11.10.2026. The present task creates planning documentation only: no application
changes, commits, PR publishing, source-branch changes, or deployment.

## The Goal

An operator wants the security work in two large PRs without losing the less
glamorous protections on the way out: recovery contacts, archive bounds,
generated clients, diagnostics, and deployment instructions. Eight workspaces
can research eight domains now. They cannot all merge independently. A locked
front door is little consolation if the importer still holds yesterday's keys.

Extract semantic changes onto current `dev`, not entire source files. Preserve
the security intent, tests, operational requirements, audit corrections, and
explicit unresolved risks. A replacement implementation is acceptable only with
an accounted-for source hunk and equivalent or stronger evidence.

## Source Contract

Repository: `https://github.com/jacoby149/web10`.

| Source | Immutable Head | Use |
|---|---|---|
| PR 1157 | `61ece872c1e9bfb8706e4c4e9776ef01c53a467a` | Issuer/delegation, API boundaries, consent rollout, security KB |
| PR 1159 | `ede48ff19056111b2d15660b7b2667bf85e9b858` | SDK credential transport, popup overlap, RTC admission, detail transport, CI/deploy, security KB |

The original analysis inspected `gh pr diff 1157` and relevant PR 1159 diffs.
Future agents must establish their own immutable inventory. PR heads and base
branches can move; `gh pr diff` is useful orientation, not the source oracle.

Run these separately in each future implementation workspace:

```bash
git status --short
git branch --show-current
git fetch origin dev
git fetch origin pull/1157/head pull/1159/head
git cat-file -t 61ece872c1e9bfb8706e4c4e9776ef01c53a467a
git cat-file -t ede48ff19056111b2d15660b7b2667bf85e9b858
git rev-parse 61ece872c1e9bfb8706e4c4e9776ef01c53a467a^{commit}
git rev-parse ede48ff19056111b2d15660b7b2667bf85e9b858^{commit}
git merge-base origin/dev 61ece872c1e9bfb8706e4c4e9776ef01c53a467a
git merge-base origin/dev ede48ff19056111b2d15660b7b2667bf85e9b858
```

Both object types must be `commit`, and resolved SHAs must match the pins.
Fetching PR heads downloads objects; it does not authorize checkout, resetting,
renaming, or editing either original branch. If a pinned object is absent after
fetch, try fetching that exact SHA; if unavailable, use GitHub contents at the
exact ref and report the limitation. Never silently substitute today's head.

Record both merge-base SHAs as the inventory baselines. For each source, use
`git diff --name-status <recorded-base> <pinned-head>` and
`git diff --unified=80 <recorded-base> <pinned-head> -- <owned-path>`; read full
functions with `git show <pinned-head>:<path>`. Merge-base against current dev
can omit changes already merged there: supplement with source commit history,
the original PR changed-file inventory, and an explicit already-on-dev check.
Freeze the baselines in reports rather than recomputing them without notice.

Exact web links are `https://github.com/jacoby149/web10/blob/<pinned-sha>/<path>`.
Contents alternative: `gh api repos/jacoby149/web10/contents/<path>?ref=<pinned-sha>`.
Decode the returned content, not the moving branch version. Filter inventory
output by domain; the first 100 files in a PR view are not a complete inventory.

## Execution Rules

- Read `AGENTS.md` completely, browse `knowledge-base/strategy/`, scan CHANGELOG, and check `plan.md`, `parallel-execution.md`, and current `dev` before changing code. Already implemented behavior gets evidence, not a second implementation.
- Read `ai-pack/AGENTS.md`, `ai-pack/ai-use-theory/ai-use-theory.md`, and `knowledge-base/strategy/thesis.md`. Use orient -> generate -> compare -> repair and KB -> logs -> tests -> features. Existing audit IDs must be copied accurately; do not invent finding identifiers.
- Keep the assigned workspace branch name. Inspect its base and unrelated changes; do not rename it, reset it, or move original PR refs. If it is not a suitable dev-derived workspace, ask for a new workspace rather than overwriting it.
- Manual edits use `apply_patch`. Do not whole-file-copy, cherry-pick the omnibus PRs, or mechanically overwrite current dev with a pinned version. Preserve intervening features and other agents' work.
- Research and test-design can begin now everywhere. A dependent patch can be prepared against an explicit integration commit, but is not independently merge-ready. Name the prerequisite PR/commit and deployment hold in its report.
- Preserve diagnostic sequence/outcomes, never bearer credentials, tickets, passwords, OTPs, private exports, signed URLs, arbitrary exception text, or content payloads. The security-specific logging boundary supersedes payload-dumping guidance for these flows; document the reconciled policy.
- Read `design.md` before any UI work. Preserve tokens/brand, URL state, all failure/loading/denial states, and desktop plus 375px screenshots. Use `scripts/dev-shot.sh` for ui/marketing and the social screenshot harness for social; never a foreground dev server. Read captures desktop then mobile. A fixture screenshot is not a real popup E2E test.
- A pasted kickoff below authorizes that future workspace to implement, test, commit intended changes, push, and open PRs to `dev`. This document-creation request does not authorize those actions now. No block authorizes merging or deploying.
- Before committing inspect status, diff, and recent log; stage intended files only. Before PR creation inspect tracking, all included commits, and base diff. Open to `dev`, check conflicts immediately, watch every check, use `scripts/ci-failures.sh <n>` on failures, fix until green. Optional checks count. Prove any baseline failure on current dev; never assert it from memory.
- Update a truthful changelog and only genuinely completed lane/plan items in each implementation PR. Shared tracker and architectural-doc edits must be serialized through the coordinator; hand off proposed hunks rather than racing. Do not tick this extraction as fixed because a planning document exists.

## Mandatory Source-Reading Checkpoint

Before application edits, each workspace must create the research section of
its own `knowledge-base/security/scans/2026-10/extraction/Sn.md`. Documentation of
this research can be edited now. Application extraction starts only after the
following evidence exists for the next bounded slice; do not wait for every
future slice to be researched before starting an independent one.

1. Read the actual owned diff from BOTH pinned sources, including deletions,
   source tests, fixtures, docs and helper changes. Read complete changed
   functions and their relevant callers/callees at the pins, not just snippets
   returned by a search. If a source has no relevant changes, demonstrate that
   from its inventory instead of assuming it from the PR title.
2. Record exact source links with `#L<start>-L<end>` anchors, function names and
   diff hunk headers (`@@ -old,count +new,count @@`). Obtain line numbers from
   the pinned file itself, never current dev. If unavailable, record exact
   symbol/hunk anchors and the retrieval limitation; never invent line numbers.
   Include supporting helper, import, constant, schema and test changes.
3. Read the corresponding implementation on the workspace base and current
   `origin/dev`; record their commit IDs. Explain the three-way difference:
   source 1157, source 1159, destination. Mark already-present protections with
   code/test evidence; identify newer features a source copy would overwrite.
4. For each security behavior, state the attack, old behavior, chosen source
   behavior, destination adaptation, dependency, and negative plus positive
   regression tests. Trace at least one concrete request/message/job through
   the real entry point, authorization helper, data access and side effect.
   For changed interfaces, search all callers; a symbol name is not a complete
   call-site inventory.
5. Run the relevant baseline tests and record exact commands/results. Where
   practical add a focused exploit regression and demonstrate failure before
   the fix and success after it. If the test cannot run before a dependency,
   record that gate rather than fabricating a red/green result. Preserve the
   source anti-tests, but inspect whether they actually exercise the boundary.
6. Publish a brief research checkpoint in the workspace conversation: source
   anchors inspected, proposed owned hunks, conflicts, dependencies, baseline
   evidence and any unassigned changes. Continue autonomously for an agreed,
   independent slice. For conflicting security intent, shared-function
   ownership or a missing prerequisite, hand the issue to S3 before changing
   the affected seam. An unavailable source is a blocker, not permission to
   reconstruct security code from this prompt.

Required research receipt, one row per semantic source change:

| Source Anchor | Behavior / Attack | Supporting Code | Destination / Base | Source Test / New Regression | Disposition / Dependency |
|---|---|---|---|---|---|
| PR + pinned SHA + path + line/symbol/hunk | What must be preserved and why | Callers/helpers/constants/schema | Current implementation and adaptation | Exact test name and actual run evidence | Extract, already present, supersede, or hold; named owner |

For example, S7 must read both detail implementations, PR1159's `GroupDetail`
model and SDK `getGroupDetail`, PR1157's detail permission helpers, and the
actual API/SDK/social regression cases before moving the route. S6 must trace
`rtc_authorize` through verification/live-contract checks and ticket issuance,
then trace client destination addressing and upgrade admission. These are
reading obligations, not claims that the proposed integration already works.

The function/path lists in the kickoff blocks are navigation aids, not complete
patch specifications. Every unlisted supporting hunk discovered belongs in a
receipt and gets an owner. Never implement solely from the prose summary.

## Dependency And Rollout Contract

| Workspace | Research Now | Independently Safe Slices | Strict Dependency / Release Gate |
|---|---|---|---|
| S1 | Yes | Metadata-only logging, SDK transport/parser safety, manifest SSRF, bootstrap/admin-list semantics, typed env | Provision secrets/admins before default removal; S3 integrates auth settings; S2 integrates SDK lifecycle |
| S2 | Yes | Sender/origin binding and lifecycle fixes using today's token protocol | App-only token acceptance needs S3; integrate S1 transport and S6/S7 client changes before final bundle build |
| S3 | Yes | Carefully bounded crypto helper/key plumbing only if existing protocol remains coherent | New credential-kind enforcement, app issuance, endpoint gates, authenticator and consumers form a coordinated release cohort |
| S4 | Yes | Role/tombstone/attachment/join fixes, SQL parser and resource bounds | Canonical prepare needs hardened read provenance and S5 media signing boundary; signed-app gates use S3 |
| S5 | Yes | Object/archive/transcode/queue safety in bounded PRs | Persisted import auth needs S3 claims/helpers and S4 roles; HLS key provisioning required for RS256-only deployment |
| S6 | Yes | Logout-generation cleanup can precede ticket protocol | Ticket client/API/RTC deploy together; live app-contract validation needs S3 foundation |
| S7 | Yes | Body-authenticated detail transport with current verified auth | Port S4 service-read checks and S3 app-contract gate into shared detail implementation before cohort release |
| S8 | Yes | OTP/contact verification and verified-contact recovery | Self-only account access and new recovery/session signing need S3 foundation |

S3 is a coordinator and foundation owner, not an instruction to write one
unreviewable mega-PR. Use reviewable foundation, endpoint-family, consent/client,
and integration PRs. Other workspaces supply their owned domain patches and
tests. Do not issue app credentials into a deployment whose untouched endpoints
still interpret every token as owner authority. Do not reject all old sessions
before the replacement login/recovery/consent paths are available.

If sequential merges to dev trigger automatic deployment, hold the cohort until
the operator supplies an explicit deployment freeze or an atomic release
mechanism. Do not invent flags, legacy-token inference, or a compatibility
layer to make the schedule convenient. Dependent PRs may wait ready for review.
Bounded issuer helpers can land earlier only when no half-migrated behavior is
exposed. The submitted `decode_token` is not such a helper: it also rejects
ambiguous credential kinds and legacy sessions.

## Shared Hunk Ownership

Ownership here is semantic. A whole-file checkout defeats the arrangement.
When two changes touch the same function, its materializer integrates the
other workspace's patch and test contract on the agreed foundation commit.

| Shared Surface | Hunk Owner / Materializer |
|---|---|
| `api/app/settings.py` | S1 secret defaults, typed env/admin parsing; S3 auth key/id/legacy cutoff settings. Exchange small patches before applying intersecting hunks. |
| `api/app/middleware.py`, `main.py` | S1 metadata-only logging and safe handlers; S3 supplies `request_origin` set/reset hunk. S1 materializes the combined middleware, including error paths. |
| `api/app/services/auth.py`, auth models/helpers/login | S3 exclusively; S6/S8 supply required contracts/tests instead of rewriting helpers. |
| `api/app/endpoints/system.py` | S1 manifest/ready/config baseline; S3 delegated config capability hunks; S6 RTC request model/authorize route. Each owns named sections, not shared imports wholesale. |
| `api/app/v3/services/clickhouse.py` | S4 document/group visibility, tombstones, carrier authorization; S5 media validation/resolution/list/delete/object lookup; S3 app `has_permission` namespace behavior and node-ad authority selection. |
| `api/app/v3/endpoints/documents.py` | S4 group attachments; S3 signed app gate and node-ad capability guards. S4 integrates calls needed by canonical reads without changing auth helpers. |
| `api/app/v3/services/safe_query.py`, `endpoints/query.py` | S4 materializes SQL and canonical prepare; S3 supplies signed-origin/service-allowlist patch. S5 supplies media-helper contract; no parallel rewrites of `_prepare_rows`. |
| `api/app/v3/endpoints/groups.py` | S4 person-role/create/invite semantics; S3 exact app management/moderation/self-heal gates; S7 detail GET/POST and shared `_group_detail` section. S7 integrates S3/S4 detail-specific checks. |
| `api/app/v3/endpoints/media.py`, `imports.py`, import worker | S5 materializes safety and persisted auth with S3 helper API. S3 supplies permission/node-ad guards as handoffs, not competing endpoint copies. |
| `api/app/v3/endpoints/account.py`, `recovery.py` | S8 materializes contact/recovery plus S3 self-user/signing contracts. |
| `sdk/src/http.ts`, `token.ts` | S1 transport/cookie/JWT parser; S7 supplies detail transport requirements. S1 does not own popup acceptance or issuer trust. |
| `sdk/src/browser.ts`, `popup.ts`, popup `v3.ts` sections | S2 lifecycle materializer; S3 supplies app-only handoff, `delegateApp`, `appContractCovers`, types; S7 owns detail method; S6 owns RTC sources. |
| `sdk/package.json`, `sdk/dist/**`, browser copies | S2 serializes SDK scripts/build/sync and final artifact regeneration; S1/S3/S6/S7 submit source/package hunks. S6 owns RTC dependency requirements; do not hand-merge generated code. |
| Social `data/groups.ts`, tests/types/mock | S3 exact permission/role consumer changes; S7 detail transport and `data/v3.ts` `V3GroupDetail` export; S6 RTC/logout types. Agree shared declaration/mock hunks explicitly. |
| `api/tests/conftest.py`, existing broad API suites | S3 token-kind/signing fixtures; domain owners own scenario hunks. Never replace full suites or weaken baseline permission tests. |
| SDK browser tests and broad social/UI tests | S2 lifecycle assertions; S3 delegation assertions; S1 parser/transport; S6 RTC; S7 detail. Name each test handoff and prevent duplicate lifecycle implementations. |
| CHANGELOG, plan, lanes, decisions, root AGENTS | S3 acts as coordinator/materializer for shared integration hunks; each lane supplies its own truthful release/tracking proposal. Serialize per PR; retain semver union/renumber rules. |

Domain docs are owned by their domain workspace. S3's coordinator role owns
cross-domain synthesis, not the right to silently rewrite another lane's
evidence. Per-workspace reports are unique paths and can be written in parallel.

## Semantic Coverage Ledger

Every row is **planned**. This is the initial semantic index, not the final
proof of complete hunk accounting. S3 must reconcile the full immutable
changed-file/commit inventory from both PRs, including tests and generated files.

| ID | Source Intent To Preserve | Owner / Gate |
|---|---|---|
| E01 | Stop credential/content-bearing request/response/body/error/path logging; avoid response buffering; safe unmatched routes and log-insert failures | S1; S3 context handoff |
| E02 | Safe generic exception/validation responses and correlation IDs; ready failure does not expose DB details | S1 |
| E03 | Remove shared key/admin/payment/SMS/storage/database defaults, typed env parsing, no globals dump | S1; auth settings S3; provisioning gate |
| E04 | Saved admin list replaces bootstrap list, including empty list; malformed admin config fails closed | S1 |
| E05 | Manifest only for approved app; reject URL/parser/private-address ambiguities, validate every DNS answer, pin connection, retain Host/TLS verification, no redirects, bounded decode | S1 |
| E06 | SDK POST/GET redirect refusal and cookie omission; encoded cookie writes, malformed decoding isolation, null-prototype cookie map, three-part/base64url/UTF-8/object JWT parsing | S1; decode is metadata, not authorization |
| E07 | Exact source/origin readiness/auth/contract/close lifecycle, blocked/replaced/closed popup handling, listener/timer cleanup, reuse/fallback, callback identity and duplicate races | S2; both source implementations reconciled |
| E08 | No self credential to app; distinct app-origin credential; canonical identity/expiry checks; trusted opener binding with no-referrer/handshake paths | S3 policy via S2 lifecycle |
| E09 | Locally selected verified signing keys, local issuer/provider/target/expiry/purpose checks, RS256/JWKS, explicit HS256 provisioning/cutoff; no outbound issuer URLs or foreign bare-username mapping | S3; not completed federation |
| E10 | Self/app model, bounded delegation expiry, canonical signed app origin, live contract revocation, Origin mismatch rejection even when omitted Origin cannot grant owner power | S3 |
| E11 | Self-only contract creation/revocation/owner repair/account authority; app lists only its own contract; session oracle understands app/revoked/expired credentials | S3; S8 account materializer |
| E12 | Exact reserved `group/node/user/imports` grants; document wildcard cannot grant management; every management gate intersects current person role/admin authority | S3; domain handoffs S4-S8 |
| E13 | Group structural changes require management; existing create cannot rewrite/enroll as owner; no duplicate initial member loop; pending join cannot self-approve as invite | S4; app intersections S3 |
| E14 | Group service reads/writes require effective roles, not bare membership; batched reads agree; update attachments require destination create authority | S4 |
| E15 | Latest document/group/media/link state before tombstone filter; direct reads share full query visibility, moderation/block/share boundary; carrier media uses actual service | S4; media list S5 |
| E16 | Node ads require current admin author, active ad/node-ad tags/status, current discover attachment; mutation requires delegated monetization plus admin | S3 with S4 tombstone provenance; D60 review |
| E17 | Lexical CTE scope, raw/reserved/qualified/table-function/settings rejection; identifier/literal escaping and round-trip validation; wildcard service rules | S4; reserved wildcard contract S3 |
| E18 | Hard row/byte/time/read-only limits for caller limits/set operations and prepared output; shared anon budget; sanitized SQL/error diagnostics | S4 |
| E19 | Canonical carrier/face/ad refetch; projected bodies/authors/refs are hints, not signing authority; current service/group boundary and exact canonical pair before minting | S4 after S5 signing boundary |
| E20 | Owned object trees, filename/service validation, upload/confirm bounds, metadata validation, author-bound minio/media URL resolution, media-only delete/current service lookup | S5 |
| E21 | HLS dedicated secret/provisioning, required lifetime claims, prefix/doc/variant binding, strict segment regex, current role/visibility authorization | S5 after S4 read boundary |
| E22 | Bounded nonblocking transcode queue, source ownership/head/download limits, FFmpeg/ffprobe file+pipe protocols | S5 |
| E23 | Bounded export parts/downloads, ZIP directory/ZIP64 checks, TAR extension-header checks, metadata/member/expanded-size budgets, streaming extraction | S5 |
| E24 | Bounded/deduplicated import queue, admission-before-persist semantics, nonblocking worker startup and paged boot recovery, capacity response | S5; queue changes move together |
| E25 | Persist credential kind/origin/expiry with jobs; app-owned job access; create/read permissions; live authority rechecks before every worker side effect; unauthorized raw-export cleanup | S5 after S3/S4 |
| E26 | RTC fixed API authority, verified derived peer identity, body admission, one-use 30s ticket before upgrade, wrong-ID consumption, duplicate-active rejection | S6; S3 live contract handoff |
| E27 | RTC input/capacity/time/redirect limits, no credential error logging, strict upgrade params, payload limits including Bun enforcement, shutdown cleanup | S6 |
| E28 | SDK RTC validates host/label/local insecure mode, ticket after ICE, fresh reconnect ticket/backoff, init errors/timeouts reject, destroy cancels reconnect | S6; S2 generated artifacts |
| E29 | Social logout destroys RTC/channels/timers/maps, shared pending init and generation guards stop stale completions/inbound/send/presence callbacks across account changes | S6 |
| E30 | Authenticated group detail moves to POST body; anonymous GET remains, URL tokens rejected; SDK/social/demo/E2E consumers updated | S7 |
| E31 | Detail authentication cannot regress to unsigned/uncertified identity; service-role and app read checks survive transport refactor | S7 after S3/S4 integration |
| E32 | Contact syntax/normalization, replacements unverified, actual OTP checks and contact-change race check, verified-contact-only recovery and no accidental activation of existing contacts | S8 |
| E33 | Recovery-purpose token shape/finite expiry/local issuer/signing; recovered login uses self kind; account/profile/send-code/change-password cannot accept app authority | S8 after S3 |
| E34 | Authenticator self-only restore/vault/account switch/fresh login, granular management labels/warnings, approval/denial/batch/auto-completion paths and fixtures | S3; lifecycle S2 |
| E35 | Social exact permission requests and changed role/service/management operations, auth listener shape, ad/DM/follow/group/media/moderation consumers and types/mock | S3; S6/S7 shared hunks |
| E36 | All SDK exports/declarations/maps/npm/browser/RTC builds and published copies reflect combined sources; synchronization regression retained | S2 materializer with S1/S3/S6/S7 |
| E37 | RTC CI/runtime/package/lock/test config, ecosystem compose and `web10.app.yml` fixed API origin, coordinated deployment protocol | S6 |
| E38 | Source tests/fixtures/anti-tests and E2E seam coverage retained or explicitly stronger replacements; source test counts are historical, not new evidence | Every owner; coordinator reverse audit |
| E39 | Threat model/findings/operations/credentials/logging/RTC/detail/runbook/auth/group/SDK KB, original audit corrections and decision/tracker history preserved truthfully | Domain authors; S3 coordinator synthesis |

Known original audit labels include backend B-1 (issuer/shared-key weakness),
B-2 (secret defaults), B-3 (unsigned decode), B-4 (body logging), B-5 (CORS
assumption), and SDK S-1 (popup origin). The source docs contain further labels:
read them before mapping; E01-E39 are extraction rows, not invented audit findings.

## Documentation And Evidence Ownership

- S1 authors logging/credential/operational exposure evidence and proposed `security/operations.md` sections. S3 materializes cross-domain operations so S5/S6/S8 deployment requirements are not overwritten.
- S2 authors popup and SDK lifecycle evidence, supplying SDK audit corrections to S3.
- S3 owns `auth/auth.md`, `auth/delegation.md`, `sdk/contracts.md`, integrated `security/overview.md`, `threat-model.md`, `findings.md`, `operations.md`, `audit-runbook.md`, `hardening-2026-10.md`, and shared strategy/AGENTS integration. Collect source content from both pins, preserve historical findings as historical, and qualify status by destination evidence.
- S4 owns `groups/access.md` authority/query evidence; S7 owns `groups/detail.md`; S6 owns `security/rtc-admission.md`; S1 owns `security/credentials.md` and `security/logging.md`. If current dev already has these, reconcile hunks rather than replacing them.
- S5 and S8 update relevant existing media/import/recovery/account KB pages identified during inventory and hand cross-domain findings/operations sections to S3. No source document may be discarded merely because its title lacks a lane owner.
- S3 integrates `knowledge-base/security/scans/2026-10/{README,backend,d60-genericity,loc-breakdown,sdk}.md` corrections from all owners. Preserve D60 warnings and original unresolved risks; recalculating LOC must distinguish old snapshot from current measurement.
- Each implementation workspace checks in `knowledge-base/security/scans/2026-10/extraction/S1.md` through `S8.md` respectively. These reports do not exist just because this plan mentions them. Record source pins/bases, original finding IDs, complete owned-file/hunk and test inventories, disposition, commits/PRs, exact commands/results, screenshots, dependency holds, residual risks, and handoffs.

## Eight Copy/Paste Workspace Blocks

Each block is a standalone future implementation instruction. Read this
document's ledger/ownership tables in the destination workspace as well.

Launch prerequisite: this draft is local to the Caracas workspace, not on
`origin/dev`. Before launching, provide the exact reviewed document in every
destination workspace, either through an identified planning commit or as a
supplied local file. For workspaces on this machine, read the current draft at
`/Users/starscream/conductor/workspaces/web10/caracas/knowledge/strategy/security-hardening-extraction.md`.
Each block's short document reference means that supplied document if the
repo-relative path is absent. Record its planning commit or reviewed snapshot
in the report; do not substitute a different plan silently.

### S1: Exposure And Operations

```text
Implement S1: extract exposure/operations hardening with least security loss.
FIRST: complete the Mandatory Source-Reading Checkpoint in the planning document;
read pinned code/tests, write exact hunk/line receipts and baseline evidence
before application edits. Do not implement from this block's prose alone.
Planning document (read this local path if absent in your workspace):
/Users/starscream/conductor/workspaces/web10/caracas/knowledge/strategy/security-hardening-extraction.md
Sources: PR1157 61ece872c1e9bfb8706e4c4e9776ef01c53a467a;
PR1159 ede48ff19056111b2d15660b7b2667bf85e9b858 in jacoby149/web10.
This pasted task authorizes implementation, intended commits/push, and PRs to
dev after verification, not merge/deployment or changes to original PR refs.
Keep this workspace's assigned branch name; do not rename/reset it. Inspect
status/branch/base, preserve unrelated work, and ask if not dev-derived.
Read all AGENTS.md, ai-pack/AGENTS.md, browse strategy, scan CHANGELOG,
plan/parallel-execution/current dev for already-done work; read thesis and
ai-use-theory fully. Follow orient/generate/compare/repair, apply_patch only.
Read knowledge-base/strategy/security-hardening-extraction.md for hunk ownership.
Fetch separately: git fetch origin dev; then git fetch origin pull/1157/head
pull/1159/head. Verify both pinned objects with cat-file -t and rev-parse
<sha>^{commit}; do not trust mutable gh pr diff as source. Record merge-base
origin/dev <pin> for each; inventory git diff <recorded-base> <pin> by owned
path and git show <pin>:<path>; supplement already-merged/source history.

Own metadata-only log_requests/_insert_log in api/app/middleware.py and safe
bare_exception_handler/validation_handler in main.py. Prefer 1157's
no-body/no-buffer/route-template boundary over 1159's buffered redaction.
Map every superseded redaction test to an equivalent stronger non-exposure
assertion; preserve status/latency/outcome/correlation diagnostic usefulness.
No unsigned user extraction, arbitrary headers/URL params/error text or body
logging. Test unmatched paths, hostile methods, validation and DB-insert errors,
streaming responses and server-error paths. S3 hands request_origin ContextVar
set/reset patch to you; integrate it around all paths without owning auth.py.
Own settings.py secret/default removal, typed bool/int/float/env/admin parsing
and removal of globals dump. S3 owns auth-key/id/legacy-cutoff settings; request
its patch, do not infer credential kinds or edit issuer helpers. Explicit
bootstrap admins, signing/S3/ClickHouse/Twilio/Stripe/beta credentials must be
provisioned; document missing config and never rotate live keys yourself.
Own config.py list_admins replacement semantics, including saved empty list.
Own system.py ready/pwa_listing: approved registered app, parser ambiguities,
public literal/all DNS answers, IPv6 edge cases, numeric connection pinning,
Host and TLS hostname verification, no redirects, timeout and decoded size cap.
S3 owns get_config/patch_config/am_admin delegated capability hunks; S6 owns
rtc_authorize/model. Coordinate imports; never whole-file-copy system.py.
Own SDK http.ts authPost/authGet redirect:error and credentials:omit; token.ts
cookie encoding/malformed cookie handling/null-prototype dictionary and strict
three-part base64url UTF-8 object JWT decode. Decode remains metadata only.
S2 owns popup lifecycle/builds; hand package/source build needs to S2.

Inventory source findings and all owned tests before editing. Start with API
test_middleware_security.py, test_main.py, test_settings_security.py,
test_system_security.py, test_node_config.py, test_bugbot.py, and PR1159
test_log_redaction.py; SDK http.test.ts/token.test.ts. Account for every source
test hunk, including shared broad suites. Run targeted tests then full API/SDK
suites and lint/type/build/whitespace checks from current manifests. Test actual
redirect refusal and no-cookie transport, not only parser snapshots.
Write extraction/S1.md under knowledge-base/security/scans/2026-10 with both pins,
bases, original finding IDs, hunk/test dispositions, results and S3 handoffs.
Own security/credentials.md and logging.md; send operations/threat/findings/
historical audit/AGENTS/tracker hunks to S3 coordinator for serialized integration.
Keep historical exposure/retention/backups/proxy access logs and secret rotation
as operational actions, not magically fixed by new logging. Do not alter D56.
For any visible UI touched, read design.md, use tokens and URL state, run the
self-booting screenshot harness, inspect desktop then 375px; never foreground dev.
Research can start now; bounded transport/logging/SSRF/config fixes can be
separate PRs. Default removal has a provisioning release gate; intersecting auth
settings/logging context must be integrated before the S3 cohort deploys.
Acceptance: E01-E06 covered, no credential/content logging or redirect replay,
no secret default authority, pinned public manifest fetch, complete hunk ledger.
Before commit inspect status/diff/log, stage intended files. Coordinate truthful
changelog/plan/lane edits with S3. Open PRs to dev, check conflicts immediately,
watch ALL checks, use scripts/ci-failures.sh <n>, repair until green. Prove any
baseline failure on current dev. End with PR URLs, dependency/deploy holds,
residual risks, next unticked slice and paste-ready handoff. Do not merge.
```

### S2: Unified Popup Lifecycle

```text
Implement S2: one coherent popup lifecycle from BOTH source PRs, not two guards.
FIRST: complete the Mandatory Source-Reading Checkpoint in the planning document;
read pinned code/tests, write exact hunk/line receipts and baseline evidence
before application edits. Do not implement from this block's prose alone.
Planning document (read this local path if absent in your workspace):
/Users/starscream/conductor/workspaces/web10/caracas/knowledge/strategy/security-hardening-extraction.md
Sources: PR1157 61ece872c1e9bfb8706e4c4e9776ef01c53a467a;
PR1159 ede48ff19056111b2d15660b7b2667bf85e9b858, jacoby149/web10.
This pasted task authorizes implement/test/intended commit/push/PR to dev only;
no merge/deploy, branch rename/reset, or mutation of original source refs.
Inspect assigned branch/status/base; preserve other work; ask if not dev-derived.
Read AGENTS.md entirely, ai-pack/AGENTS.md, strategy, CHANGELOG, plan/lanes,
thesis and ai-use-theory. Compare current dev for already-completed changes.
Read security-hardening-extraction.md ownership/ledger. Use apply_patch and
orient -> generate -> compare -> repair; logs show sanitized seam outcomes.
Fetch origin dev and separately git fetch origin pull/1157/head pull/1159/head.
Verify cat-file -t and rev-parse <sha>^{commit} for both pins. Record each
merge-base origin/dev <pin>; inspect git diff <base> <pin> by owned path and
git show <pin>:<path>. Mutable gh pr diff is orientation only; account for
already-merged behavior using original file inventory and source history.

Own sdk/src/popup.ts and popup lifecycle hunks of browser.ts/v3.ts: readiness,
openAuthPortal, authListen sender binding, contractRequest reuse/fallback,
contract_response and closeAuthPopup; reconcile both source implementations.
Exact origin AND Window source are required. Bind each active interaction;
replacing a popup/origin cannot let stale readiness/auth change current state.
Include queued response from an authentic sender that closed just after posting
without trusting an old replaced popup. Test same-origin wrong-window attacks.
Handle blocked popup, opaque/invalid origin, first/return login, existing grants,
consent-only handoff:none, delayed readiness, timeout/close, duplicate messages,
listener teardown, retries and exactly-once callback/token acceptance.
Do not blanket-copy browser.ts: S1 owns token/http parser safety; S3 owns
credential-kind/identity/expiry/provider/app-origin policy, delegateApp,
appContractCovers and SDK token types; S6 owns RTC; S7 owns detail transport.
Prepare lifecycle independently where safe on current token protocol. S3 sends
the app-only acceptance patch and authenticator contract. Rejecting every legacy
handoff early is NOT independently safe. Hold those policy hunks for the cohort.
Hand opener-message lifecycle requirements/tests to S3 for Interface.tsx; do
not take ownership of the authenticator or invent compatibility token inference.

Own serialized SDK build/package script integration and browser sync tooling
(1157 sync-browser.mjs/sync-browser.test.ts). Collect S1/S3/S6/S7 package/export
requirements before final build. Regenerate sdk/dist declarations/maps/npm/
browser/wapi and RTC outputs; synchronize marketing/marketing-ui/public/docs/
wapi.js, social public/wapi.js and marketing docs/rtc.js as applicable.
Never resolve generated conflicts by copying one PR's bundle or hand-editing it.
Inventory all changed outputs and prove required copies match generated sources.
Source tests: sdk/src/browser.test.ts from BOTH pins, sync-browser.test.ts,
and lifecycle scenarios in social authListener/authContract and UI delegation.
Retain each distinct anti-test; S3 owns policy assertions in shared suites.
Add real seam tests, not pre-seeded cookies that skip the popup. Run SDK full
tests/types/build, affected UI/social tests and browser popup round-trip E2E;
report unavailable live/browser runs honestly, never call fixtures full E2E.
Before visible changes read design.md and keep brand/tokens/URL state; use
self-booting harness and inspect desktop then 375px, never foreground dev.
Write knowledge-base/security/scans/2026-10/extraction/S2.md with both pins/bases,
original finding IDs, full hunk/test/output inventory, stronger replacements,
results, dependencies and S3 handoffs; send SDK audit/overview/tracker proposals
to S3 coordinator. E07/E36 are primary; E08/E34 are shared with S3.
Acceptance: one source+origin-bound lifecycle, no stale/duplicate token write,
consent response after close works, cleanup works, all shipped clients coherent.
Research now; merge safe lifecycle slices only. App-only handoff/final combined
artifacts are gated on S3 and relevant S6/S7 integrated sources.
Inspect status/diff/log before intended commit; coordinate changelog/plan/lane
with S3. Open bounded PRs to dev, inspect conflicts, watch every check, repair
with scripts/ci-failures.sh <n> until green; prove baseline failures on dev.
End with URLs, actual results, holds/risks and next unticked paste-ready handoff.
```

### S3: Issuer, Delegation And Coordinated Consumer Rollout

```text
Implement S3 and coordinate least-loss integration; do not make one giant PR.
FIRST: complete the Mandatory Source-Reading Checkpoint in the planning document;
read pinned code/tests, write exact hunk/line receipts and baseline evidence
before application edits. Do not implement from this block's prose alone.
Planning document (read this local path if absent in your workspace):
/Users/starscream/conductor/workspaces/web10/caracas/knowledge/strategy/security-hardening-extraction.md
Pinned sources: PR1157 61ece872c1e9bfb8706e4c4e9776ef01c53a467a and
PR1159 ede48ff19056111b2d15660b7b2667bf85e9b858 in jacoby149/web10.
Pasting authorizes implementation, intended commit/push and dev PR publishing,
not merge/deployment, current-branch rename/reset or original-ref modification.
Inspect assigned dev-derived branch/status/base and preserve unrelated work.
Read entire AGENTS.md, ai-pack/AGENTS.md, strategy, CHANGELOG/plan/lanes,
thesis, ai-use-theory and security-hardening-extraction.md. Check current dev
already-done behavior. Follow KB/logs/tests/features and four-phase flow.
Fetch origin dev, then git fetch origin pull/1157/head pull/1159/head separately;
verify cat-file -t and rev-parse <sha>^{commit} against both pins. Record both
merge-base origin/dev <pin> values, git diff <base> <pin> owned-path inventories,
and git show <pin>:<path> full functions. Supplement source history/original
file list for already-merged changes. Never use moving gh pr diff as oracle.

Own services/auth.py verified_payload/decode_token/encode_token/public_jwks,
validate_app_origin/certify/check_admin/certify_with_remote_provider; auth token
models, v3 login/JWKS/delegate, auth_helper self_user/app_contract_origin/
require_app_permission/user/user_or_anon. Locally selected keys only, no jku/
x5u/provider fetch; explicit signing provision, expiry/purpose/provider/issuer/
target checks, canonical app origins and delegation no later than parent expiry.
Foreign credentials fail closed until issuer-qualified identity migration;
publishing JWKS/local RS256 is not completed federation. Do not invent crypto.
Own contract self-only mutation/app-scoped listing and access session oracle.
Own reserved namespace/wildcard app semantics, exact group/node/user/imports
grants and check_admin capability intersection with current saved admin list.
Audit ALL endpoint consumers of Token/decode/user/admin, not just touched files.
Materialize blocking/user blockUsers, appstore rateApps, moderation moderate,
system delegated policy allowlists/get_config/patch_config/am_admin, node-ad
mutation and active-node-ad current-admin selection. S4 owns group/person
authority; apply your app management/moderation/self-heal gates in agreed hunks.
S4 materializes query/document permission handoffs; S5 media/import, S6 RTC,
S7 detail, S8 account/recovery. Supply helper contracts and regression patches;
do not edit their full files. S1 materializes request_origin middleware context
and auth settings imports alongside its metadata-only logging/default changes.

Own authenticator Interface.tsx delegation/session policy, sessionClaims.ts,
tokenVault.ts, self-only restoration/fresh login/account switch. Integrate S2
opener lifecycle: exact bound source+origin, referrer/handshake paths, no self
token posted to app, distinct app token identity/provider/site/expiry/origin.
Cover approval, deny, batch errors, approveAll and auto-completion; no early
close/hand-off on partial failure. Own permissionLabels.ts and consent/contract/
request screens: exact labels, management/import scope warnings and wildcard
distinctions. Preserve consent screenshots/fixtures, but don't call them E2E.
Own social interfaces/auth.ts, permissions.ts, permission-consumer hunks in
access/ads-catalog/dms/groups/moderation/posts and affected types/mock/tests.
S7 owns groups detail transport and data/v3.ts V3GroupDetail export; S6 P2P/logout;
S2 SDK lifecycle.
Send SDK delegateApp/appContractCovers/types/policy patches to S2 materializer.
Read design.md before UI edits, preserve tokens/URL state/all states. Use
self-booting ui/social harnesses, inspect desktop then 375px, never foreground dev.

Use bounded PRs: key helpers; model/helper contract; endpoint-family gates;
authenticator/SDK/social consumers; final cohort integration. A safe helper PR
cannot import submitted decode_token's legacy-kind rejection in isolation.
Research everywhere now. Dependent patches can wait against named foundations.
Before app issuance/legacy rejection goes live, EVERY accepting endpoint and
login/recovery/consent/client consumer must be coherent, including S5 persisted
jobs and S6 RTC. If dev auto-deploys, require operator deployment freeze/atomic
release; don't invent flags or compatibility from Origin/site to evade the gate.
Coordinate S1 provisioning and S5 HLS key before RS256-only deployment.

Inventory original findings and tests: auth_security, auth_services, certify,
delegation, delegation_surfaces, v3_access/verify_access, conformance/endpoints,
cors, moderation/node_ads, shared conftest; SDK browser/v3, social authContract/
authListener and data consumers; UI delegation/sessionRestore/tokenVault/
permissionLabels/consentAccountSwitch/recoveryPhone. Keep distinct source tests.
Run full API/SDK/UI/social suites, lint/types/builds and permission matrix;
drive real popup first/return/account-switch/approval forks and revoked app
requests without Origin. Test explicit self vs app, wildcard management denial,
expired/malformed/purpose/foreign/target/key cases and current-role/admin removal.
Write extraction/S3.md with immutable hunk/test accounting and rollout holds.

As coordinator own integrated auth/delegation/sdk-contracts/overview/threat/
findings/operations/runbook/hardening docs and October README/backend/sdk/D60/
LOC audit corrections. Collect S1/S2/S4-S8 domain proposals, preserve all source
docs/history/risks accurately, integrate AGENTS/decisions/plan/lanes/changelog
hunks serially. No fresh finding IDs or 'fixed' without destination evidence.
Final gate: full BOTH-source file+HUNK ledger and reverse destination audit,
including tests, fixtures, locks, artifacts, docs and deploy instructions.
Every hunk gets extracted/already-dev/superseded/deferred with destination,
owner, test, PR/commit and reason. Unknown/unassigned is not complete.
Acceptance: E08-E12/E16/E34-E35 and integrated E38-E39, coherent atomic rollout
without requiring a giant single PR, no forgotten ambient management authority.
Inspect status/diff/log before intended commits; open dev PRs, check conflicts,
watch ALL checks and fix via scripts/ci-failures.sh <n> until green; prove any
baseline failure. End with URLs, exact results, cohort holds, operator decisions,
residual risks and next unticked paste-ready handoff. Do not merge/deploy.
```

### S4: Document, Group And Query Authority

```text
Implement S4: document/group/query authority and canonical capability provenance.
FIRST: complete the Mandatory Source-Reading Checkpoint in the planning document;
read pinned code/tests, write exact hunk/line receipts and baseline evidence
before application edits. Do not implement from this block's prose alone.
Planning document (read this local path if absent in your workspace):
/Users/starscream/conductor/workspaces/web10/caracas/knowledge/strategy/security-hardening-extraction.md
Sources pinned: PR1157 61ece872c1e9bfb8706e4c4e9776ef01c53a467a;
PR1159 ede48ff19056111b2d15660b7b2667bf85e9b858 in jacoby149/web10.
Pasting authorizes implement/test/intended commit/push/dev PRs, not merge/deploy.
Do not rename/reset the assigned branch or change original PR refs; inspect
status/base/dev derivation and preserve other work. Read all AGENTS.md,
ai-pack/AGENTS.md, strategy, CHANGELOG/plan/lanes/current dev already-done
state, thesis, ai-use-theory and security-hardening-extraction.md ownership.
Use apply_patch and orient/generate/compare/repair with sanitized seam logs.
Fetch origin dev and separately git fetch origin pull/1157/head pull/1159/head;
verify both pinned commit objects with cat-file/rev-parse. Record merge-base
origin/dev <pin> for each. Inspect git diff <base> <pin> owned hunks and git
show <pin>:<path>; supplement original inventory/history for already-dev work.
Mutable PR diffs are not the pinned source oracle; never whole-file-copy.

Own clickhouse.py get_document/get_document_any_author/get_doc_groups latest
state-before-deleted filter; can_read_group/can_write_group/effective roles,
readable_groups_batched role union; read_document_by_id using full visibility
boundary; can_read_carrier_post actual service/current canonical carrier read.
Membership is not blanket service permission. Align direct/group/query paths
for block/share/moderation/tombstone behavior and public/authenticated classes.
Own documents.py update attachment destination create-authority checks.
Own groups.py person-authority portions: structural update manageRoles,
create-existing assignRoles checks/no owner reinstatement or duplicate member
loop; accept-invite accepts invited only, not pending self-approval; management
role checks where source changes strengthen person authority. S3 supplies exact
app-permission/moderation/self-heal guards; do not edit its auth foundations.
S7 exclusively materializes group-detail GET/POST/shared implementation: send
service-read/current-role/detail checks to S7, do not fork the detail function.
S3 owns app namespace has_permission/node-ad author selection; S5 owns media
helpers in the same clickhouse.py. Coordinate function/import hunks explicitly.

Own safe_query.py lexical CTE scope, qualified/raw/reserved/function/settings
rejection, quoting/literal escaping, allowed document namespace/wildcards,
hard limits including caller LIMIT/set operations and round-trip backstop.
Own query.py rate budget including anon, row/byte/time/readonly enforcement,
safe error references and canonical _canonical_prepare_doc/_prepare_rows.
Re-fetch projected doc IDs through current full read boundary. Prove author/ref
face pairs against current authorized canonical data; projected body/author
and ad-helper output never authorize signing. Preserve legitimate extra columns,
drop spoofed prepared capability fields, authorize attached ads independently.
S3 supplies signed-origin and app-service allowlist hunks. S5 supplies owned
media resolution/HLS contracts. Canonical prepare is gated on those boundaries;
parser/resource/role/tombstone/attachment/invite slices can merge independently
when tested on current dev without new credential requirements. Do not label
the whole query or documents file independent; own only agreed semantic hunks.

Inventory original finding IDs and ALL test hunks first: direct_document_security,
group_document_authz, tombstone, v3_clickhouse, query_security/query_endpoint/
safe_query, v3_endpoints/conformance, people_directory, ads and node_ads;
shared conftest token kind belongs to S3, media list/delete tests belong to S5.
Test forged projected body/author/face/ref/ad rows, hidden/blocked/shared-off/
deleted docs, role service mismatch, nested/sibling CTE tricks, qualified/raw
tables/functions/settings, huge/offset/union limits, result and prepared bytes.
Run targeted then full API/permission suites, lint and whitespace; where SQL
semantics matter, run live ClickHouse probes rather than mocked compiler only.
Document unavailable live probes as unverified, not fixed. Preserve source
query behavior features added on dev and D60 genericity; no new social endpoints.
Write extraction/S4.md with pins/bases, original findings, owned-file/hunk/test
dispositions, actual commands, dependency refs, S3/S5/S7 patch handoffs/risks.
Own groups/access.md authority docs and identified query KB updates; send
overview/findings/operations/historical audit/tracker hunks to S3 coordinator.
Read design.md before any UI touch; tokens/URL state/all states, self-booting
screenshots inspected desktop then 375px, never foreground dev server.
Acceptance: E13-E15/E17-E19 accounted, direct and query boundaries agree,
no capabilities minted from attacker projections; dependent app/prepare hunks
are held until foundation plus media integration, not silently skipped.
Inspect status/diff/log before intended commit; serialize truthful changelog/
plan/lane with S3, open bounded dev PRs, check conflicts, watch every check,
repair via scripts/ci-failures.sh <n> until green, prove baseline failures on dev.
End with URLs, actual results, holds/risks and next unticked paste-ready handoff.
```

### S5: Media, HLS And Import Safety

```text
Implement S5: ALL media/HLS/transcode/import safety and persisted authorization.
FIRST: complete the Mandatory Source-Reading Checkpoint in the planning document;
read pinned code/tests, write exact hunk/line receipts and baseline evidence
before application edits. Do not implement from this block's prose alone.
Planning document (read this local path if absent in your workspace):
/Users/starscream/conductor/workspaces/web10/caracas/knowledge/strategy/security-hardening-extraction.md
Use multiple bounded PRs rather than one media+import mega-PR.
Pinned PR1157: 61ece872c1e9bfb8706e4c4e9776ef01c53a467a;
pinned PR1159: ede48ff19056111b2d15660b7b2667bf85e9b858, jacoby149/web10.
Pasting authorizes implement/test/intended commit/push/dev PR publishing only;
no merge/deploy/branch rename/reset/original-ref edits. Inspect assigned branch
status/base, preserve other work and ask if workspace is not dev-derived.
Read entire AGENTS.md, ai-pack/AGENTS.md, browse strategy, CHANGELOG/plan/
lanes/current dev completion, thesis/ai-use-theory and extraction ownership doc.
Follow orient/generate/compare/repair, apply_patch only, no secret/content logs.
Fetch origin dev, then git fetch origin pull/1157/head pull/1159/head separately;
verify pinned cat-file -t/rev-parse commit IDs. Record merge-base origin/dev
<pin> each; inspect git diff <base> <pin> owned hunks and git show <pin>:<path>,
supplement source history/original inventory for merged work. No whole-file copy.

Own services/hls.py owns_object_key/MAX_MEDIA_BYTES/_signing_config/mint_sig/
verify_sig/can_view_doc/segment_key; dedicated explicit HLS secret, lifetime
claims, strict prefix tree/doc binding, fullmatch segment/variant validation.
S4 supplies current role/full visibility/carrier boundary: membership alone
cannot authorize playback. HLS must work when auth becomes RS256-only and no
PRIVATE_KEY is configured; request provisioning coordination from S1/S3.
The source retains an explicitly configured PRIVATE_KEY fallback for HLS;
account for preserving or intentionally superseding it with provisioning and
regression evidence. Do not silently drop this source behavior.
Own services/transcode.py queue admission, source ownership/head/download size,
FFmpeg and ffprobe file/pipe protocols; queue.Full endpoint response together.
Own media.py owned filenames/keys/service/upload limits/confirm HEAD checks,
read-url current service lookup/list allowed services/media-only deletion/
thumbnail read/transcode permission/prefix and exact variant-key checks.
S3 supplies app permission/node-ad monetization+admin guards; use its helpers,
not a new ambient-authority implementation. Own clickhouse.py media validation,
confirm/list/delete/get_media_by_object_key, author-bound minio URL resolver and
media_refs validation. S4 owns document visibility/tombstones; share only agreed
hunks. Every caller of changed resolver signatures must be audited, including
query preparation and ad/media nested docs; give S4 the exact helper contract.

Own imports.py/import_worker.py resource safety: presigned upload/head/download
limits; bounded streaming read; archive part/member/expanded/metadata budgets,
ZIP directory/ZIP64 allocation checks, TAR PAX/GNU extension-header checks.
Ignored videos still count toward budgets; no unbounded getmembers/read.
Own queue bound/dedup/admission/persist/boot recovery/start order/cleanup as a
single coherent slice: put_nowait alone can deadlock/break old boot semantics.
Separate safe resource PRs from persisted-auth PRs, with explicit dependencies.
Own authorization column/schema/job serialization and origin-bound owned jobs,
imports create/read permissions, stored credential kind/origin/expiry, renewed
start authorization and authorize_import_job/import_permissions. Recheck live
contract/service/group ownership/manageRoles/assignRoles authority before each
worker read/write/upload/attach/group/profile/face action; raw exports are
cleaned on terminal authorization failure. Old jobs without scope fail closed
and require renewed authorization, not an invented grandfathering bypass.
These auth hunks REQUIRE S3 verified claims/helpers and S4 role gates. They
must be in the coordinated app-issuance release; research/tests/patch can start
now but no premature standalone merge with missing foundations.
Review D60 importer app-specific legacy seams without expanding them; preserve
generic authorization intent, record existing residual violations explicitly.

Inventory original findings and every source test hunk: media_security, hls,
import_worker, imports_endpoint, import_delegation and shared endpoint/clickhouse
fixtures. Test forged foreign object metadata nested minio refs/read-url/delete,
wrong HLS prefixes/variants/newline regex bypass, hidden/revoked visibility,
RS256 auth with dedicated HLS secret, queue saturation/restart/concurrent starts,
ZIP/TAR bombs/headers/multipart cumulative budgets, revoked/expired/changed-role
jobs between side effects and app A reading/starting app B's job. Run targeted
and full API tests/lint; use live S3/ClickHouse/transcode/import probes where
available, record unavailable live evidence. Check source thumbnail-fetch and
other remaining outbound/resource risks rather than claiming all import SSRF
or CPU/disk budgets solved by this extraction.
Write extraction/S5.md with pins/bases, all hunks/tests, PR split/dependencies,
commands/results, S3/S4/S1 handoffs, schema/old-job/provisioning and residual risks.
Update domain media/import KB; send findings/operations/audit/tracker hunks to
S3 coordinator. If UI touched read design.md, preserve tokens/URL state/all
states, self-booting screenshots desktop then 375px inspected, no foreground dev.
Acceptance: E20-E25 plus media E15/E21 dependency complete with explicit holds.
Inspect status/diff/log before intended commits; coordinate truthful changelog/
plan/lane, open bounded dev PRs, check conflicts, watch ALL checks and fix via
scripts/ci-failures.sh <n> until green; prove baseline failures on current dev.
End with URLs, actual results, release holds/risks and next paste-ready slice.
```

### S6: RTC Admission, Logout And Deployment

```text
Implement S6: PR1159 RTC admission/logout/CI/deploy integrated with PR1157 auth.
FIRST: complete the Mandatory Source-Reading Checkpoint in the planning document;
read pinned code/tests, write exact hunk/line receipts and baseline evidence
before application edits. Do not implement from this block's prose alone.
Planning document (read this local path if absent in your workspace):
/Users/starscream/conductor/workspaces/web10/caracas/knowledge/strategy/security-hardening-extraction.md
Pins: PR1157 61ece872c1e9bfb8706e4c4e9776ef01c53a467a;
PR1159 ede48ff19056111b2d15660b7b2667bf85e9b858 in jacoby149/web10.
Pasting authorizes implement/test/intended commit/push/PR to dev, not merge or
live deploy. Keep assigned branch; no rename/reset/original-ref mutation.
Inspect status/base, preserve unrelated work; ask if not dev-derived. Read all
AGENTS.md, ai-pack/AGENTS.md, strategy, CHANGELOG/plan/lanes/current dev
completion, thesis/ai-use-theory and extraction doc ownership/dependency ledger.
Use apply_patch and four-phase KB/log/test flow with credential-free logs.
Fetch origin dev then separately git fetch origin pull/1157/head pull/1159/head;
verify both pinned commit objects via cat-file/rev-parse; record each merge-base
origin/dev <pin>. Inspect git diff <base> <pin> owned paths and git show pinned
functions; supplement original inventory/history for already-merged changes.

Own api/rtc/index.ts/server.ts/createRtcServer/server.test.ts, package/lock/
Dockerfile/.gitignore/tsconfig/test config; fixed explicit CERTIFY_BASE_URL.
API authority is configured, never taken from unverified provider. Bound
authorization POST timeout/redirect/size/input/capacity. Issue cryptographically
random one-use 30s admission ticket only after verified API identity; strict
upgrade parameters, consume even wrong-ID attempt before upgrade, duplicate
active-ID denial, limited WS payload incl Bun delivery guard, clean shutdown.
Do not log session/ticket/Axios error objects or admit then disconnect invalid
clients after they already reached signaling. Test pre-upgrade denial.
Own system.py RTCAuthorizeRequest/rtc_authorize hunks and test_rtc_authorize.py;
S1 owns other system sections; S3 owns issuer/helpers. Integrate S3 live app
contract/origin gate as well as certify/decode, so revoked app tokens cannot
mint tickets. Identity components/site/label must agree with the combined SDK
and new credential-kind model. Send precise origin-context contract to S3:
server-to-server RTC authorization cannot blindly rely on browser Origin.
Delegation changes app-token site to app_origin. Inventory all peerId/connect
destination-site callers, including social and the messages demo, and test
remote addressing as well as local admission. Legacy "web10" destinations must
not silently stop matching peers; hold release until addressing is coherent.

Own sdk/src/rtc/index.ts/browser.ts and tests/types/export requirements: validate
configured host/port/label/local-only insecure mode, body token POST with redirect
refusal/cookie omission, ticket after ICE discovery, server-derived expected
peer identity, startup rejection/timeout/cancel, fresh reconnect ticket/backoff,
destroy clears signaling/channels/timers. S2 owns SDK package script/build/
generated outputs and copies; hand source/package exports to S2, don't hand-edit
dist or docs/rtc.js. S1 owns shared http/token parser. No raw JWT in WS URL.
Own social data/p2p.ts generation/pending-init/logout teardown; S7 owns the
data/v3.ts V3GroupDetail export. Destroy old connector, clear presence/channel/maps, invalidate late
init/inbound/ping/send/open/close callbacks across logout/account switch.
Check actual logout wiring, not only teardown unit tests. S3 owns auth consumer
rollout and shared types; agree hunk handoffs, don't rewrite social auth.ts.
Own .github/workflows/js-ci.yml/js.yml RTC tests/build, deployment ecosystem
compose and web10.app.yml fixed API URL requirements. Coordinate SDK artifact
availability with S2 and secret/settings provision with S1/S3.

Research now; independent logout cleanup may be a safe early PR. API/RTC/ticket
SDK/consumers are a deploy-together protocol change, and app credential support
requires S3. Explicitly document dev auto-deploy hold until coherent cohort.
Do not invent compatibility accepting old JWT~label tickets to avoid the hold.
Established RTC connections are NOT automatically expired/revoked by the
30-second admission TTL. Document lifetime/current-channel authority and any
remaining sender-identity limitations separately; no universal revocation claim.

Inventory original finding IDs/tests: api/rtc/server.test.ts, API rtc_authorize,
sdk/src/rtc/index.test.ts, social data/p2p.test.ts, CI configs/lockfiles/Docker
and generated RTC/browser artifacts. Test replay/wrong-ID/expired/duplicate/
malformed/oversize/capacity/ticket-issuance failures, revoked-app admission,
redirect refusal, reconnect/destroy, account switch and stale callbacks.
Run RTC suite/build/typecheck under deployed Bun and supported Node as relevant,
SDK/API/social suites and targeted real signaling/P2P E2E. Record if live tests
are unavailable; source suite counts are historical, not this workspace's pass.
Read design.md if visible UI touched; tokens/URL state/all states, self-booting
screenshots inspected desktop then 375px; never run foreground dev server.
Write extraction/S6.md with pins/bases, owned hunk/test/CI/deploy inventory,
actual evidence, S2/S3 handoffs, coordinated release and established-lifetime
risks. Own security/rtc-admission.md; send operations/runbook/audit/AGENTS/
decisions/tracker proposals to S3 coordinator. Acceptance: E26-E29/E37 complete,
fixed authority and pre-upgrade one-use admission, logout no stale activity,
coherent runtime/deploy requirements and no false established-session guarantee.
Inspect status/diff/log before intended commits; coordinate truthful changelog/
plan/lane, open dev PRs, check conflicts immediately, watch ALL checks and repair
via scripts/ci-failures.sh <n> until green; prove baseline failures on current dev.
End with PR URLs, actual results, deploy holds/risks and paste-ready next slice.
```

### S7: Group Detail Transport And Auth

```text
Implement S7: body-authenticated group detail with no authority regression.
FIRST: complete the Mandatory Source-Reading Checkpoint in the planning document;
read pinned code/tests, write exact hunk/line receipts and baseline evidence
before application edits. Do not implement from this block's prose alone.
Planning document (read this local path if absent in your workspace):
/Users/starscream/conductor/workspaces/web10/caracas/knowledge/strategy/security-hardening-extraction.md
Pinned sources: PR1157 61ece872c1e9bfb8706e4c4e9776ef01c53a467a;
PR1159 ede48ff19056111b2d15660b7b2667bf85e9b858 in jacoby149/web10.
Pasting authorizes implement/test/intended commit/push/dev PRs only, not merge/
deploy, branch rename/reset or original-ref edits. Inspect assigned status/base
and preserve unrelated work; ask if not a dev-derived implementation workspace.
Read all AGENTS.md, ai-pack/AGENTS.md, browse strategy, CHANGELOG/plan/lanes/
current dev completion, thesis, ai-use-theory and extraction ownership doc.
Use apply_patch, KB/log/test four-phase flow and sanitized diagnostics.
Fetch origin dev and separately git fetch origin pull/1157/head pull/1159/head;
verify cat-file -t/rev-parse <sha>^{commit} for both pins. Record each merge-base
origin/dev <pin>, inspect git diff <base> <pin> owned hunks/git show pinned full
functions; supplement original file inventory/history for already-on-dev work.
No whole-file copying, cherry-picking omnibus, or mutable PR diff as oracle.

Own groups.py detail-only sections: _reject_detail_query_token, anonymous GET
group_detail, body POST post_group_detail and shared _group_detail; GroupDetail
model in v3/models/groups.py and exports required by current structure.
Reject token query parameters on BOTH routes, including empty/malformed/repeated
params. Anonymous GET remains for public clients; authenticated detail uses
optional JSON body token. Fail closed on invalid presented credentials, never
silently downgrade an invalid token to anon or authorize unsigned claims.
PR1159 adds certify on shared detail; PR1157 adds app readAll/service role and
current read boundary checks. Combine those in shared _group_detail, not in
the old GET signature. S3 owns auth helpers; S4 owns service/person authority.
Request their detail-specific patches/tests and name integration commits.
Don't rewrite group management/create/invite/moderation sections they own.
Preserve public/unlisted/member detail behavior and current metadata boundaries;
membership alone must not expose posts without service permission. No new
app-shaped identity/face endpoint or broader node social concepts (D60).

Own SDK v3.ts getGroupDetail/related transport/type/export hunks and SDK
group-detail.test.ts; use S1 credential-bearing POST redirect/error/omit contract,
do not route through authGet query token or invent a generic query-token helper.
S2 owns popup sections/final SDK builds/package scripts. Hand source/export
changes to S2 and request regenerated dist declarations/maps/browser/npm copies.
Own social data/groups.ts detail transport/groupDetailTransport.test.ts hunks;
own the V3GroupDetail export in social data/v3.ts, not an RTC export.
S3 owns permission-consumer hunks and shared types/mock; coordinate explicitly.
Own affected e2e groups-demo/sharing-demo/social-groups-directory tests and any
consumer seam changes discovered by inventory; update marketing protocol-spec
and sdk/api.md/group detail docs, not just one social call site.

Research now; body transport can merge with today's verified auth if routes,
SDK and consumers are coordinated. The final detail service/app authority
patches depend on S3/S4; block cohort deployment until they are integrated.
Do not retain URL token compatibility: the explicit source intent rejects it.
Audit every detail caller for URL leaks, logs/history/referrer risk, redirect
replay and anonymous/public fallback. S1 metadata logging does not clean old
proxy/browser logs; send historical-exposure implications to coordinator.
Inventory original findings/all test hunks: SDK group-detail.test.ts, API
v3_endpoints detail cases, social groupDetailTransport.test.ts, listed E2E.
Test anonymous GET, valid self/app POST, invalid/expired/revoked/wrong-Origin
token, query token rejection both routes, service-role denial and public/private
metadata behavior. Drive actual SDK transport and browser/demo group details.
Run affected API/SDK/social/E2E plus lint/types/build/whitespace; record missing
browser/live evidence honestly. Read design.md before UI touch; tokens/URL
state/all states; self-booting screenshots inspect desktop then 375px, no
foreground server. A screenshot of login is not verification of the detail page.
Write extraction/S7.md with pins/bases, all owned hunks/tests/callers/artifacts,
results, S1/S2/S3/S4 handoffs and release holds. Own groups/detail.md and SDK
api.md/detail sections plus marketing protocol-spec detail instructions; send
cross-domain findings/audit/operations/tracker hunks to S3 coordinator.
Acceptance: E30-E31, no bearer in detail URL, coherent GET/POST client rollout,
no service/app authority lost during transport extraction.
Inspect status/diff/log before intended commit; coordinate truthful changelog/
plan/lane, open bounded dev PRs, check conflicts, watch every check, repair using
scripts/ci-failures.sh <n> until green; prove baseline failures on dev.
End with URLs, actual evidence, dependency holds/risks and next paste-ready slice.
```

### S8: Account, Contact And Recovery

```text
Implement S8: account/contact/recovery hardening, including auth integration.
FIRST: complete the Mandatory Source-Reading Checkpoint in the planning document;
read pinned code/tests, write exact hunk/line receipts and baseline evidence
before application edits. Do not implement from this block's prose alone.
Planning document (read this local path if absent in your workspace):
/Users/starscream/conductor/workspaces/web10/caracas/knowledge/strategy/security-hardening-extraction.md
Pins: PR1157 61ece872c1e9bfb8706e4c4e9776ef01c53a467a;
PR1159 ede48ff19056111b2d15660b7b2667bf85e9b858 in jacoby149/web10.
Pasting authorizes implement/test/intended commit/push/dev PR publishing only;
no merge/deployment, branch rename/reset, or original source-ref modifications.
Inspect assigned workspace status/base and preserve unrelated work; ask if not
dev-derived. Read full AGENTS.md, ai-pack/AGENTS.md, strategy, CHANGELOG/
plan/lanes/current dev completion, thesis, ai-use-theory and extraction doc.
Use apply_patch, KB -> logs -> tests -> features and orient/generate/compare/
repair. OTPs/contacts/passwords/session/recovery tokens are not log payloads.
Fetch origin dev, then git fetch origin pull/1157/head pull/1159/head separately;
verify both pinned commit objects with cat-file/rev-parse; record merge-base
origin/dev <pin> each. Inspect git diff <base> <pin> owned hunks and git show
pinned functions; supplement original source/history for already-dev changes.
No whole-file-copy or moving PR diff as the source oracle.

Own account.py change_pass/change_phone/set_email/verify_phone/verify_email/
get_profile/send_code/set_recovery_phone and recovery.py request_code/verify_code/complete,
_account_has_contact/_check_verify_token/_mint_verify_token/_mint_login_token.
Contact replacement must be unverified; validate phone/email shape, normalize
phone digits for OTP calls. Actually check OTP, then confirm stored contact
hasn't changed before marking verified; don't set verification on code presence.
Recovery enumerates/resets only OTP-proven verified linked contacts; no accidental
activation of an existing unverified contact, and newly created account activation
must be distinguished explicitly. Review current Twilio/E2E behavior and shared
DB contact-update semantics, not only endpoint mocks.
Own self-only account integration using S3 self_user, including profile and
password/send-code paths, no app token upgrading account authority. Do not write
your own decode/signing helpers. S3 owns verified_payload/encode_token and auth
settings/models. Request a precise helper contract and test fixture handoff.
Recovery-purpose credentials validate purpose/kind/contact/local issuer/provider,
numeric finite expiry and signature. Recovered session uses the coherent self
credential model and configured issuer signer, never the old default key.
S3 owns authenticator session/vault/consent; supply recoveryPhone/session-restore
test requirements without competing Interface.tsx edits.

Research now. OTP/contact/verified-contact recovery slices can land on existing
verified session protocol with complete tests. Switching all account paths to
self_user and new recovery/session signing is gated on S3 foundation/cohort.
Submitted decode_token rejects purpose tokens as sessions; recovery must use
the verified purpose-token path coherently. Do not import one helper and leave
recovery unable to issue/verify a replacement credential.
Do not invent compatibility treating site/Origin as proof of self authority.
Document operational effects for contacts that were previously unverified and
legacy sessions needing re-login. Do not rotate live keys/send real SMS/change
real user contacts without separate operator authorization.

Inventory original findings and every source test hunk: account_contact_security,
recovery, auth_security/services and shared v3_endpoints/account/tombstone tests;
UI recoveryPhone/sessionRestore requirements go to S3. Keep source contact-race,
OTP negative, normalized-phone, invalid-purpose/finite-expiry and verified-only
recovery assertions. Add app-token denial for every account endpoint and account
switch/expiry tests against the integrated foundation, not fabricated claims.
Run targeted then full API tests/lint/permission matrix and affected authenticator
suite/typecheck. Use controlled recovery live/E2E probes where configured; record
missing SMS/live evidence honestly and never present mocks as real delivery.
If UI touched read design.md first; preserve tokens/URL state/all states, use
self-booting screenshots inspected desktop then 375px, never foreground dev.
Write extraction/S8.md with both pins/bases, original finding IDs, all owned
hunk/test dispositions, actual results, S3 helper/UI handoffs, cohort gates and
residual replay/attempt-budget/contact-race guarantees actually established.
Update existing account/recovery KB identified in inventory; hand shared
findings/threat/operations/audit/AGENTS/tracker proposals to S3 coordinator.
Acceptance: E32-E33, real OTP verification and verified-contact-only recovery,
no app account authority, coherent purpose/session issuance and no false claim
of replay-proof or globally rate-limited recovery unless tested in current code.
Inspect status/diff/log before intended commits; coordinate truthful changelog/
plan/lane, open bounded dev PRs, check conflicts, watch ALL checks and repair
via scripts/ci-failures.sh <n> until green; prove baseline failures on dev.
End with PR URLs, actual evidence, release holds/risks and next paste-ready slice.
```

## Final Coordinator Gate

S3 collects the eight reports and produces the final checked-in integration
accounting. It must be reconstructible without remembering this conversation.
The coordinator can split its integration/documentation PRs; it cannot declare
the work complete by adding eight PR titles to a list.

Accounting complete is not security extraction complete. A deferred original
protection, regression scenario, or operational prerequisite keeps its affected
slice/cohort incomplete or release-held. An operator-approved scope reduction
must be labeled a deliberate omission, never successful full preservation.

| Required Ledger Column | Meaning |
|---|---|
| Source PR / pinned SHA / recorded baseline | Immutable provenance, including already-merged history |
| Original path / function / hunk range or new-file section | Full file AND hunk accounting; split mixed hunks into semantic subrows |
| Original finding ID / E-row | Accurate audit provenance; no invented historical IDs |
| Disposition | `extracted`, `already-on-dev`, `superseded`, or `deferred`; no blank/unknown/unassigned |
| Owner / destination path/function | One implementation owner and explicit patch materializer |
| Destination commit / PR / release cohort | Evidence of where it lives and whether deployed, not assumed merge status |
| Original test / destination test / exact run evidence | Preserve distinct scenarios; explicitly account for fixtures, broad-suite hunks and artifact tests |
| Dependency / hold / reason | Why a hunk waits, why stronger replacement supersedes it, or why an already-dev match is equivalent |
| Residual risk / operator decision | Unresolved guarantees, live probes, ops and deliberate deferrals |

Required closure steps:

1. Enumerate every changed file from both immutable sources, not only production paths or the first page of GitHub results. Cover added/removed code, fixtures, docs, dependency locks, runtime/CI configs, generated outputs, exports, and deployment instructions.
2. Account for each changed hunk/section in each file. A file-level owner does not prove its authorization, logging, fixture and artifact hunks all survived. Include source changes already present on dev with exact equivalent destination evidence.
3. For overlapping source implementations, record both sides. Example: PR1159 body-redaction implementation is superseded by metadata-only logging, but its non-exposure attack scenarios remain mapped to destination tests. Do not retain body capture just to maximize line retention.
4. Perform a reverse audit: every destination security behavior, helper, test, doc claim and deployment action maps back to source intent or an explicitly justified integration repair. Remove accidental app-specific node expansion, stale assertions, invented compatibility and unaudited extra scope.
5. Run combined API permission/conformance/security suites, SDK/RTC/UI/social/marketing affected suites, types/build/lint/whitespace and source-output synchronization. Check changed CI/deploy configurations on actual target runtime. Record exact commands/results; do not reuse the original PR descriptions' historical pass counts.
6. Drive real first/return/account-switch popup and consent forks, direct/query/media visibility, deferred-import revocation, body detail transport, RTC admission/reconnect/logout, and recovery seams. Preserve API anti-tests as the floor; mocks/screenshots do not replace browser/live integration evidence.
7. Resolve conflicts then all CI checks for every published extraction/integration PR. A green PR with an unmet prerequisite is still release-held. Only an operator-authorized, coherent cohort may merge/deploy where automation would expose partial migration.
8. Verify KB, code, reports and changelog describe the same current state. Keep source-era audits identifiable as historical. Record breaking credential rollout/re-login accurately and keep the root operating docs true.

## Residual Risks And Decisions

- **Federation remains unresolved.** Local RS256/JWKS and rejection of foreign bare usernames are not issuer-qualified multi-node identity. Any legacy HS256 verification window must be explicitly provisioned, time-bounded and justified, not silently enabled by extraction.
- **Operations remain real work.** Provision persistent signing/HLS keys and bootstrap admins; rotate previously exposed/shared secrets; review current/historical ClickHouse, browser, proxy, RTC, CI and backup logs, access controls, retention and purge policy. New log code does not erase old leaks.
- **RTC TTL is admission lifetime only.** Established signaling/data channels do not gain automatic expiry or contract revocation from a 30s ticket. Record existing sender identity and message-authentication limits; do not advertise global connection revocation.
- **Resource limits have scope.** Per-worker query/recovery budgets are not global distributed limits. Import byte/member bounds are not a universal disk/CPU/time/thumbnail-fetch SSRF solution. Preserve any unresolved source risks and prove improvements separately.
- **Recovery guarantees need precise evidence.** Signature/purpose/verified-contact checks alone do not prove one-use recovery tokens, global OTP attempt control, or atomic contact-race prevention under every storage timing.
- **D60 still applies.** Existing importer/group-detail/node-ad app-shaped seams need their original genericity warnings retained. Do not expand them during security extraction or erase the warnings because permission tests pass.
- **Live evidence is not optional by assertion.** The sources reported remaining live security probes, delegation gauntlets, browser E2E, deployment review and independent audit gaps. Schedule and record them; until run, retain `unverified`/`release-held` language and do not claim production-audited security.
- **Release coordination needs an operator choice.** Confirm how automatic dev deployments are held while bounded PRs assemble the credential/endpoint/client/worker/RTC cohort. Choose deliberate release ordering and provisioning, not a giant S3 PR or fabricated full independence.

All eight workspaces may orient and design tests immediately. The point of the
gates is to retain that parallel research without shipping eight incompatible
definitions of authority.
