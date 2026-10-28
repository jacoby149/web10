# The Security Record — web10 coverage recordd

The altitude. One row per **(unit, level)**. This is the coverage record — the
thing you point at to prove forward progress. Format, status, and staleness rules
live in the cartridge: [`ai-pack/ai-security-theory/the-security-record/`](../../ai-pack/ai-security-theory/the-security-record/README.md).

> **Status key:** `PASS` requires evidenced current-level disposition and required
> sign-off under the campaign strategy. A `BP-n` reference or completed read alone
> does not pass a blocked guarantee. `OPEN` = unresolved findings, coverage or
> sign-off. `STALE` = evidence invalidated or relatively old, re-scan owed.
>
> **Level key (the scope ladder):** `L1` = file-scan (the file itself) · `L2` =
> call-graph-scan (the file + its direct call graph, one hop) · `L3` = service-scan
> (the whole service, transitive closure) · `L4` = project-wide-scan (all services,
> the final boss). The order is L1 → L2 → L3 → L4, each to 100% before the next,
> backend-first. When all four are 100%, the surface has **passed the AI pentest**.

## Current Protocol L1 Read Pass (27.10.2026)

[Current index/ledger](scans/2026-10/l1-current-index.md) records the exhaustive
selected manifest at `f7aabdb26346752141f46f19c393dbadfd25ddd2`: 171 paths/30,451
logical lines, 105 paths freshly read and 66 byte-equal historical paths. Exact
1,341-path exclusions, all six classes, runnable evidence and fresh same-model
reviews are linked there. This is read coverage, NOT L1 security PASS.

New local evidence includes OAuth expired-principal acceptance (same D-01 root),
conditional code single-use failure and operator Mongo URI credential output.
Real DB schema/merge/revocation effects and backup protection remain unverified.
Refresh-family invalidation is not a proven C+I exploit; deliberate gate exemption
is a policy/control limitation, not accidental auth bypass. All existing open
protocol findings, separate B-8 integration and required model-diverse review
remain blockers; no L2 advancement. Scan receipts pending publication. O10
follow-up at `1332abc678344d24dc6f85227549dda2b0bef9a9` rescans complete SDK v3/index
and changed artifacts: selected union now 171 paths/31,537 lines, other 160 selected
paths unchanged. [Fresh O10 review](scans/2026-10/l1-o10-review.md) keeps callback/
refresh observations conditional, first-use exchange as correctness, inherited
refresh selection distinct from repaired parsing. No new proven server C+I exploit.
Operator approved larger evidence PR; code/test CI limit unchanged, no exemption.

## Seed state — from the October 2026 audit

Source scan: [`scans/2026-10/`](./scans/2026-10/README.md) (invariant-driven,
`file:line` evidence). **Honesty note:** the hardening for most of these (PRs
1157 + 1159) is **in flight, not merged** as of this security record's date. Until they
land, the affected rows are **OPEN**, not PASS — a PASS would be a corrupted
measure. Re-scan after the hardening merges to flip them.

| Unit | Level | Status | Model | Date | Last-pass | Sys | Finding / note |
|---|---|---|---|---|---|---|---|
| `api/app/services/auth.py :: decode_token` | L1 | **OPEN** | (audit) | 2026-10 | — | auth | B-3 unsigned decode path; B-1 I1 symmetric HS256. Hardening in 1157 (unmerged) |
| `api/app/settings.py` | L1 | **OPEN** | (audit) | 2026-10 | — | config | B-2 secrets in source (signing key + Stripe/Twilio/CH creds). Hardening in 1157 (unmerged) |
| `api/app/middleware.py` | L1 | **OPEN** | `gpt-6.1 sol` | 2026-10-18 | — | logging | B-4 source repair merged #1225 with passing repro gate. [Evidence](scans/2026-10/repair-b4-middleware.md). Deployment, historical exposure and required security sign-off remain unclosed; no whole-file PASS. |
| `api/app/main.py :: CORS` | L1 | **OPEN** | (audit) | 2026-10 | — | boundary | B-5 `allow_origins=["*"]` — load-bearing assumption, needs a pinning test |
| `api/app/v3/services/clickhouse.py :: read path` | L1 | PASS | (audit) | 2026-10 | — | query-engine | I3 read gate on lock (the crown jewel holds) — `can_read_group` / `effective_role_perms` |
| `api/app/v3/services/safe_query.py` | L1 | PASS | (audit) | 2026-10 | — | query-engine | I3 wall for caller SQL on lock — boundary on input CTEs, not output filter |
| `api/app/v3/services/clickhouse.py :: get_document_any_author` | L1 | **OPEN** | (audit) | 2026-10 | — | media | B-6 reads without author scoping; bounded by doc-bound sig — verify sig checked first |
| `api/app/v3/services/clickhouse.py :: node_ad_performance` | L1 | PASS | `qwen3.8-27b` (OpenCode) | 2026-10-18 | — | analytics | Read-only aggregate over `content_events` for node-ad docs (D57); admin-gated at `POST /admin/analytics` (`check_admin`); no new I3 surface (no author-scoped read — the operator reads the node's own ad inventory); per-ad rows carry doc_id + counts only (no content, no PII); CH failure degrades to `null`. Repro: `api/tests/test_node_config.py` (live node ads incl. per-ad rows; `node_ads: null` with no inventory; non-admin 403). |
| `api/app/v3/services/import_worker.py` | L1 | **OPEN** | `gpt-6.1 sol` | 2026-10-18 | — | import | Historical D90 review is superseded by [J](scans/2026-10/l1-api-j.md)/[K](scans/2026-10/l1-api-k.md) at `8af7e0fce`: L1-J-01 copies A's logs into overlapping B trace insert arguments. Owner-gated reads do not fix stored misattribution. No live cross-owner disclosure or fix claimed. |
| `sdk/src/browser.ts :: authListen` | L1 | **OPEN** | (audit) | 2026-10 | — | sdk-auth | S-1 `postMessage` token accepted with no origin check. Hardening in 1159 (unmerged) |
| `sdk/src/v3.ts` (token-in-body) | L1 | **OPEN** | (audit) | 2026-10 | — | sdk-auth | S-2 token in JSON body — composes with B-4 (body logged). By design; the log is the risk |
| `sdk/src/http.ts :: authGet` | L1 | **OPEN** | (audit) | 2026-10 | — | sdk-auth | S-3 `byUserGroups` sends no token — functional gap, not a leak |
| `sdk/src/token.ts :: decodeJwt` | L1 | PASS | (audit) | 2026-10 | — | sdk-auth | S-4 unsigned base64 decode — acceptable for reading claims; doc: never for authz |
| `sdk/src/token.ts :: cookie` | L1 | PASS | (audit) | 2026-10 | — | sdk-auth | S-5 `SameSite=Lax`+`Secure`, no HttpOnly (impossible by design), 60-day — acceptable, noted |
| `api/app/v3/endpoints/groups.py :: POST /v3/groups/list` | L1 | PASS | `qwen3.8-27b` (OpenCode) | 2026-10-19 | — | groups | Owner-row self-heal on the /list read (the dead-group ratchet breaker, 3.237.1): for every user-created group (`{provider}/groups/users/{creator}/…`) in the caller's list, the creator's member row is re-pointed to `owner` when missing or non-owner. Gated on `creator == caller` (the creator is parsed from the group_id; another user's group is never touched — a follower's read of a followed group is read-only). The write is the same `add_group_member` the /join endpoint uses (a current `owner` row; latest-row dedup makes it win). No new read surface (the /list response shape is unchanged), no I3 change (the healed row only restores the creator's own access to their own group), no admin path. Repro: `api/tests/test_v3_endpoints.py::TestListGroups` (heals the caller's own followers group; never another user's) + `api/tests/test_v3_clickhouse.py::TestHealFollowersGroupOwner` (missing row → owner, already owner → no-op, drifted member → re-pointed, missing group → no-op, no owner role → no-op). |
| `api/app/v3/endpoints/oauth.py` (client registry, D92 O1) | L1 | PASS | `qwen3.8-27b` (OpenCode) | 2026-10-22 | — | oauth | OAuth 2.0 client registry (the delegated-access foundation): `oauth_clients` ClickHouse table (ReplacingMergeTree + tombstone) + admin-only register/list/lookup/revoke under `/v3/oauth/clients/`. `register` + `list` + `revoke` are `check_admin`-gated (non-admin → 403); `lookup` is unauthenticated but returns only public fields (`client_id`/`client_name`/`redirect_uris`) — the `client_secret` is minted via `secrets.token_urlsafe(32)`, returned exactly once at register, and never returned by list/lookup. Redirect URIs are https-only + exact-match (validated at register). No token claim, no `certify`/`has_permission` change yet (the Origin→client_id re-keying is O2/O3), so no new I3/I5 surface. Repro: `api/tests/test_oauth_clients.py` (15: admin register mints secret, non-admin 403 on register/list/revoke, non-https redirect rejected, list omits secret, lookup 404 on missing/tombstoned, revoke tombstones). |
| `api/app/services/auth.py :: certify` (delegation gate, D92 O2) | L1 | PASS | `qwen3.8-27b` (OpenCode) | 2026-10-22 | — | auth | OAuth 2.0 delegation gate at the verification seam: `TokenData` gains an optional `client_id` claim; `certify()` verifies — when `client_id` is present — that the client exists and is active (not tombstoned) via `ch.get_oauth_client()`, else `TOKEN` (401). Tokens without a `client_id` (the popup flow) skip the check entirely — today's behavior, byte-for-byte (I1 signature/provider/expiry checks unchanged and run first). Strictly *tightens* the gate for delegated tokens (a revoked/unknown client can no longer certify); no new read surface, no I3 change, no weakening of any existing invariant. The Origin→client_id `has_permission` re-keying is O3 (not yet landed). Repro: `api/tests/test_auth_services.py::TestCertify` (5: normal token passes, active client passes, missing client → TOKEN, tombstoned client → TOKEN, expired token still rejected). |
| `api/rtc/` (admission) | L4 | **OPEN** | — | — | — | rtc | RTC socket admission / certify gate (cross-service RTC↔API) — see `BP-3`. Hardening in 1159 (unmerged) |
| `ui/src/components/CredentialPage/` (auth forms) | L1 | PASS | `qwen3.8-27b` (OpenCode) | 2026-10-26 | — | auth-ui | Autofill-hostile formless login repaired (3.242.0): the credential forms (login / signup / recovery / change-password) were divs + a button whose click handler scraped the DOM by id — no `<form>` for a password manager to key off (the 1Password grant landed an empty `web10.app` entry with nothing to fill). Now real `<form>` elements with a `type="submit"` button (`onSubmit` + `preventDefault` keeps the SPA flow) + `name` attrs on the inputs. **No invariant change** — no token/credential handling altered, no new read surface, no I1–I6 surface touched (the values still come from the same DOM the click handler used to scrape). Repro: `ui/src/__tests__/authFormsAutofill.test.tsx` (8: the `<form>` element + `type="submit"` + `name` attrs across all four surfaces; submitting the form drives `login`/`signup`/`recoverRequest`/`recoverVerify`/`recoverComplete`). |
| `sdk/src/v3.ts :: oauth` (w.oauth(), D92 O10) | L1 | OPEN | Initial `qwen3.8-27b`; fresh `openai/gpt-6.1-sol` (OpenCode) | 2026-10-27 | — | sdk-auth | Shipped in 3.245.0 with 17 mocked helper tests; implementation completion is preserved, but the initial PASS is superseded by the [pinned source/artifact rescan and fresh review](scans/2026-10/l1-o10-review.md). Callback-result binding and refresh/client ownership remain conditional concerns; first-use exchange has a confirmed correctness gap, and inherited refresh selection requires additional ambient pollution. Original tests do not establish initial connection, browser callback integrity, real server authority or model-diverse sign-off. Confidential-client secrets remain caller-supplied; deliberate JS-cookie storage, caller-managed state and restoration semantics are not reversed. No new proven server C+I exploit or protocol PASS. |
| federation signing (I1) | L4 | **OPEN** | — | — | — | federation | B-1 / D7 — HS256 → RS256/EdDSA + JWKS (cross-node). See `BP-1` |
| delegation model (I5) | L3 | **OPEN** | — | — | — | auth | scoped app-management delegation (within the API service). See `BP-2`. Hardening in 1157 (unmerged) |

## Commit-pinned L1 scans

These receipts supplement the seed audit; they do not upgrade unrelated seed
PASS rows to complete file coverage. `Scan commit` pins the source even for OPEN
rows; no successful fix/last-pass is implied.

| Unit | Level | Status | Model | Date | Scan commit | Sys | Evidence |
|---|---|---|---|---|---|---|---|
| `api/app/middleware.py`, lines 1-143 (whole file) | L1 | **OPEN** | `gpt-6.1 sol` (OpenCode) | 2026-10-18 | `d86658be6d9bb202bbab981a918a6b69c9bde966` | logging | [Receipt + synthetic PoC](scans/2026-10/l1-middleware.md). Existing B-4 reproduced: request/response tokens reach insert arguments; error JSON also reaches meta and detail reaches message. No fix, live DB proof, or independent convergence sign-off. |
| `api/app/settings.py`, lines 1-140 (whole file) | L1 | **OPEN** | `gpt-6.1 sol` (OpenCode) | 2026-10-18 | `8704e9f5c97968d9161c4f5f889c0d0fa0a8be6c` | config | [Receipt + redacted PoC](scans/2026-10/l1-settings.md). Existing B-2 defaults confirmed; new B-8 CLI secret dump reproduced. Boolean type erasure handed to L2, not claimed as a bypass. No fix, live credential validation, or convergence sign-off. |

## API L1 Campaign Receipts

[Coverage inventory](scans/2026-10/l1-api-index.md) pins the 59-file API app
denominator. Scope coverage is separate from vulnerability disposition and
three-dry sign-off. No campaign PASS is claimed.

| Scope | Source/date/model | Coverage | Disposition / evidence |
|---|---|---|---|
| A | `8af7e0fce`; 2026-10-18; `gpt-6.1 sol` | 794 lines | OPEN: [receipt](scans/2026-10/l1-api-a.md), L1-A-02 local manifest destination/JSON proxy primitive; sensitive-error sink remains unverified disclosure, not a confirmed protected-data leak. |
| B | Same pin/date/model | 622 lines | OPEN: [receipt](scans/2026-10/l1-api-b.md), L1-B-01 unsigned destination/status trust in remote helper; no production reference found. Existing B-1/B-3 bounded evidence, not a live bypass. |
| D | Same pin/date/model | 695 lines | OPEN: [receipt](scans/2026-10/l1-api-d.md), L1-D-01 expired-token principal production; L1-D-02 malformed/None expiry classified valid. No actual store mutation or CRUD grant demonstrated. |
| C | Same pin/date/model | 675 lines | [Receipt](scans/2026-10/l1-api-c.md): no confirmed local finding; caller/media provenance handoffs and sign-off pending, not PASS. |
| H | Same pin/date/model | 614 lines | OPEN: [receipt](scans/2026-10/l1-api-h.md), L1-H-01 handler discards identity and forwards arbitrary object key to signing sink; dynamic proof uses stub auth/signer, not authenticated HTTP/private-object retrieval. |
| I | Same pin/date/model | 705 lines | [Receipt](scans/2026-10/l1-api-i.md): no confirmed local finding; delegated authority/log provenance handoffs and sign-off pending, not PASS. |
| E | Same pin/date/model | 826 lines | OPEN: [receipt](scans/2026-10/l1-api-e.md), L1-E-01 account bearer accepted in group-detail query parameter; static transport hygiene, not a demonstrated theft/auth exploit; related S7 remains open. |
| F | Same pin/date/model | 614 lines | [Receipt](scans/2026-10/l1-api-f.md): no confirmed local finding; delegated document authority/preparation handoffs and sign-off pending, not PASS. |
| G | Same pin/date/model | 530 lines | OPEN: [receipt](scans/2026-10/l1-api-g.md), L1-G-01 caller SQL literals reach INFO logger; request/stub-compiled fields tested separately, not a live compiler/retention/data theft proof. |
| J | Same pin/date/model | 532 lines | OPEN: [receipt](scans/2026-10/l1-api-j.md), L1-J-01 real trace handlers copy one synthetic job's message into both overlapping jobs' event insert arguments; live endpoint disclosure untested. |
| K | Same pin/date/model | 867 lines | [Receipt](scans/2026-10/l1-api-k.md): no confirmed C+I finding; parser whole-remainder read is reliability debt; persisted-authority/redirect/storage handoffs and sign-off pending. |
| L | Same pin/date/model | 535 lines | [Receipt](scans/2026-10/l1-api-l.md): no confirmed local finding; compiler accepts qualified/scalar/settings candidates but no SQL executed; execution-boundary handoffs and sign-off pending. |
| M | Same pin/date/model | 790 lines | [Receipt](scans/2026-10/l1-api-m.md): no confirmed local finding; migration visibility/policy concurrency candidates require actual upgrade/consumer evidence; review/sign-off pending. |
| N | Same pin/date/model | 825 lines | [Receipt](scans/2026-10/l1-api-n.md): no confirmed local finding; permissions/tombstone/caller-authority handoffs; `read_documents` correctly ranks before deleted filtering in the inspected query, no blanket resurrection claim. |
| O | Same pin/date/model | 797 lines | [Receipt](scans/2026-10/l1-api-o.md): no confirmed local finding; contract revocation, moderation scope and optional membership-join handoffs; generated SQL alone is not a bypass. |
| P | Same pin/date/model | 806 lines | [Receipt](scans/2026-10/l1-api-p.md): no confirmed local finding; membership/metadata/media/preparation handoffs, including existing B-6; review/sign-off pending. |
| Q | Same pin/date/model | 875 lines | [Receipt](scans/2026-10/l1-api-q.md): no confirmed local finding; mocked signer forwarding is not an authorized HTTP/private-object exploit; recovery/config/visit handoffs and sign-off pending. |
| R | Same pin/date/model | 851 lines | [Receipt](scans/2026-10/l1-api-r.md): no confirmed local finding; app/analytics/reporting handoffs, with dedup-window preconditions explicit; review/sign-off pending. |

## Remaining Backend L1 Receipts

[Inventory](scans/2026-10/l1-backend-inventory.md) and
[coverage index](scans/2026-10/l1-backend-index.md) pin the additional backend/
runtime denominator at `db325cd3c`, date 2026-10-18, scanner `gpt-6.1 sol`.
Inventory and line coverage do not establish service PASS or deployment security.

| Scope | Coverage | Disposition / evidence |
|---|---|---|
| RTC | 5 files / 492 newlines | OPEN, existing BP-3. [Receipt](scans/2026-10/l1-rtc.md): 13 fake-dependency close/routing cases, no real PeerServer admission/identity exploit or dependency audit. |
| B1 root orchestration/schema | 9 files / 729 newlines, 732 logical lines | OPEN, existing B-2. [Receipt](scans/2026-10/l1-backend-b1.md): static defaults, values withheld; ports/socket/build/schema handoffs are unverified integration questions, not deployed compromise. |
| MA | Historical 3 files / 657 lines | D91 removes this service from current source; [pinned receipt](scans/2026-10/l1-marketing-a.md) retained. Source retirement is not live shutdown/rotation; shared B-2 remains OPEN. |
| MB | Historical 4 files / 727 lines | D91 removes these mappers; [pinned receipt](scans/2026-10/l1-marketing-b.md) retained, not a current runtime PASS. |
| MC | Historical 9 files / 712 lines | D91 removes the scaffold from current source; [pinned L1-MC-01/02 evidence](scans/2026-10/l1-marketing-c.md) retained. Production retirement remains unverified, not closed by declaring the files gone. |
| PREVIEW | 3 files / 422 lines | [Receipt](scans/2026-10/l1-preview-backend.md): no confirmed local finding; fixed-origin anonymous composition and safe fallback probes do not establish renderer/public-grant security. Ghost-post 200-vs-404 is correctness debt; review/sign-off pending, not PASS. |

## Protocol L1 Repair Progress

28.10.2026: **A-01/F-01 sender slice** [verified locally](scans/2026-10/repair-consent-senders.md):
bound readiness/replies, pre-send guard, configured legacy callback migration;
19 new runtime cases red -> green, 265 SDK passes/typecheck and five-runtime parity.
Request correlation remains demonstrated local debt (one matching reply invokes
two callbacks); class and L1 OPEN. Browser CI/rollout/diverse review pending.

28.10.2026: **S-1** [source repair merged #1273](scans/2026-10/repair-s1-auth-sender.md) at c258ce048
binds token handoff to configured window/origin, preserving standalone and
explicit-login lifecycle plus configured legacy opener support. 246 SDK tests,
typecheck and five-runtime correspondence pass; fresh same-model review. Browser
CI passed on identical a2262c620 inputs; migration/delivery/diverse sign-off remain OPEN; A-01/F-01 and S-6 separate.

27.10.2026: **L1-D-01/D-02 and OAuth occurrence L1-OAUTH-01** share the
[source repair merged #1271](scans/2026-10/repair-d01-token-freshness.md) at b828736b4. Verified
user decoding/certification enforce parseable ISO expiry at the absolute deadline;
the oracle classifies invalid/expired before stores. Initial 48 regressions red
-> green, 92 controls/1,325 API passes plus four subtests, fresh same-model review.
Anonymous and unsigned metadata contracts preserved. Integration/rollout/diverse
review remain OPEN; no HS256/issuer, purpose, provider or revocation assurance.

27.10.2026: **L1-DEPLOY-01** [source repair merged #1268](scans/2026-10/repair-deploy01-frozen-installs.md)
removes three fail-open install fallbacks and pins Dockerfile-only CI triggering.
Eight controls and 1,233 API tests plus four subtests pass; native frozen installs/
builds retain manifests/locks and local dependencies, fresh same-model review.
Merged at c6f9cc85d. Actual production Linux builds for marketing and social passed
on 8a420f767, with all applicable PR checks green; source build/CI inputs are
byte-identical in the squash merge. E2E's dev image is not credited as production
evidence. Deployment, dependency authenticity and diverse sign-off remain open.

27.10.2026: **L1-J-01** [source repair merged #1267](scans/2026-10/repair-j01-import-traces.md)
denies cross-context trace copying while preserving owned diagnostics/tracebacks
and thumbnail work. Pre-lock filtering plus reentry suppression resolves the
reviewed concurrent store-failure deadlock. Nine controls, 1,225 API passes plus
four subtests and fresh same-model review; merged at e0c271da1, deployment/history/diverse
sign-off remain OPEN, not whole-worker or L1 PASS.

27.10.2026: **L1-G-01** [source repair merged #1266](scans/2026-10/repair-g01-query-logging.md)
denies SQL/name/error and parser-fallback log echoes, retaining topology,
literal metadata, correlation IDs, counts and duration. Original eight cases
and two later parser-fallback cases red -> green; 24 focused cases, 1,216 API
tests plus four subtests pass, fresh same-model review. Merged at b5ebcd7e7;
deployment/diverse review remain open; no whole-query/whole-file or L1 PASS.

27.10.2026: **L1-PKG-01** [local repair](scans/2026-10/repair-pkg01-mongo-output.md)
omits raw Mongo URI input from audit stdout and both extractor output modes.
Twelve output regressions red -> green; independent replay and migration controls
preserve account rows/count/checksum. Fresh same-model design-intent review
records the deliberate host-diagnostic/external-parser compatibility tradeoff.
Source repair merged #1265 at b5d128a52; not deployed or L1 PASS.
Backup protection/defaults/operational exposure and diverse sign-off remain open.

27.10.2026: SDK-B-01 source repair merged #1255 (3.244.1); rollout/sign-off remain
open. **B-8** [local source repair](scans/2026-10/repair-b8-settings.md) replaces
the settings globals dump with fixed safe output. Four CLI subcases red -> green,
import compatibility preserved, 1,180 API tests pass; fresh same-model review.
Source repair merged #1265 at b5d128a52; deployment/sign-off pending, not whole-settings PASS; B-2 remains OPEN.
OAuth additions/changed authority paths after the original API pin require delta
L1 coverage and disposition before advancement; old receipts do not cover them.

**B-4:** [source repair evidence](scans/2026-10/repair-b4-middleware.md) records
all nine regressions red on the pinned original and green on the candidate fix;
full API suite 1,138 green after syncing dev on 20.10.2026. This repairs the middleware capture/insert-failure
boundary in source only, not main exceptions, explicit log intake, SQL logs,
import traces, historical data or operational credential exposure. Other protocol
findings and L1 advancement gates remain open. No model-diverse/three-dry claim.

## SDK L1 Source Campaign

21.10.2026 repair, merged #1255: SDK-B-01 source/artifact repair verified; [repro and fresh
review](scans/2026-10/repair-sdk-b01-cookie.md). Own data-property parsing and
own-token selection deny synthetic inherited tokens in source/five runtimes.
208 SDK tests and typecheck pass at repair pin. Deployment/sign-off pending; scope B
remains OPEN for other handoffs, not whole-file PASS. Alignment #1248 merged.

[Source/artifact inventory](scans/2026-10/l1-sdk-index.md), source pin
`caeed4427`, date 2026-10-18, scanner `gpt-6.1 sol`. Seven non-test source files/
2,496 logical lines; tests and distributions separately accounted, not assumed safe.

| Scope | Logical coverage | Disposition / evidence |
|---|---:|---|
| A browser adapter | 315 | OPEN: [receipt](scans/2026-10/l1-sdk-a.md), existing S-1 sender-unbound token acceptance and S-6 wildcard metadata; A-01 consent-response integrity alias grouped with F-01, not independent grants. |
| B HTTP/token/exports/types | 271 | OPEN: [receipt](scans/2026-10/l1-sdk-b.md), L1-SDK-B-01 inherited token selection via a synthetic __proto__ cookie, not global prototype mutation or demonstrated browser cookie planting/API access. |
| C RTC client | 227 | [Receipt](scans/2026-10/l1-sdk-c.md): no new confirmed C+I issue; existing BP-3 and real handshake/lifecycle/consumer authority remain unverified, not PASS. |
| D v3 foundations | 633 | [Receipt](scans/2026-10/l1-sdk-d.md): no confirmed local C+I issue; shared permission-array mutation is correctness evidence, not a server grant; helper-consumer review pending. |
| E v3 data/request methods | 459 | [Receipt](scans/2026-10/l1-sdk-e.md): no confirmed local C+I issue; cookie/state precedence and fake-helper flow do not establish authenticated cross-account requests; server/transport handoffs pending. |
| F v3 groups/consent/types | 591 | OPEN: [receipt](scans/2026-10/l1-sdk-f.md), L1-SDK-F-01 alias with A-01 for unbound consent responses in different implementations; existing S-6 metadata wildcard and S-3 functional omission, no actual grant or token leak demonstrated. |

### SDK Artifact Follow-Up (20.10.2026)

[Clean-build/copy evidence](scans/2026-10/sdk-artifact-correspondence.md) at
`89323cd93` proves 16/17 original clean outputs matched; four browser files lagged
source. Candidate alignment regenerates those files and explicitly produces the
wapi alias; five fresh-build/API-parity tests pass, SDK total 171 plus typecheck.
The source-existing analytics/group/ICE/anonymous-read delta is documented, not
silently called a cookie fix. L1-SDK-B-01, six orphan declaration/maps, docs RTC
IIFE provenance and deployment/full artifact/security sign-off remain open.

## Remaining L1 Boundaries

The API app inventory above now has full file-local line coverage, not security
PASS or three-dry sign-off. Prior seed PASS labels are historical narrow reviews,
not complete contemporary file assurance. The worker's disproven PASS is withdrawn.
The broader project L1 pass remains incomplete; excluded/unscanned surfaces include:

- **SDK** — current source receipts A-F merged #1219/#1220, completing line
  accounting only (L1-008). Seed October rows never established this coverage;
  open findings, artifact correspondence and required independent security
  sign-off remain separate debt, not a campaign PASS.
- **Frontend / render surface** — the XSS surface, the `rehype-sanitize` choke
  point, every `dangerouslySetInnerHTML`, the markdown render. (The audit's
  "pass 2," never started.)
- **Remaining backend/runtime** — the historical pin had 33 files/3,739 newlines
  covered and 76 selected files/12,623 newlines unscanned. D91 removes marketing
  source/packaging/workflow and changes wiring, so refresh the inventory before
  using those counts for current code; removed files are not scan successes.
  API packaging, migrations, Ubuntu/CI/scripts, edge/operator tooling and actual
  dependency/artifact/deployment assurance remain open. Do not call all runtime done.
- **`marketing/web10-social/src/data/`** — the social app's data layer (token
  handling, the permission requests).
- **`ui/`** — the authenticator (consent, session restore, the token vault).

These are the next scan scopes. See
[`ai-pack/ai-security-theory/running-it/`](../../ai-pack/ai-security-theory/running-it/README.md)
for how to slice + run them in parallel.
