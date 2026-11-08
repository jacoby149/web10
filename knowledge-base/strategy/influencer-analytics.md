# Five-influencer acquisition analytics — validation before spend

> **Superseded architecture, 08.11.2026 (D103).** The operator chose PostHog
> only: [posthog-migration.md](posthog-migration.md) is the active P0–P6 queue.
> Do not implement the A0–A6 queue below as a custom acquisition engine or
> five-creator admin dashboard, and do not require supplementary GA4 at release.
> This document is retained as the dated source audit, proposed pilot metric
> definitions and adversarial validation scenarios. Those definitions still need
> approval and mapping to actual PostHog report semantics. Existing inaccuracies
> remain unfixed; no PostHog integration or analytics-readiness claim.

## The decision this must support

Jacob is testing **five Instagram creators at $200/month each: $1,000/month
total**, alongside separate cold outreach to platform-burned creators. At
renewal, he needs to know which paid creator brought new accounts that actually
used the product and returned. A handsome chart is not a receipt.

Operator request, 07.11.2026: "i want to make sure our analytics are ready to see
which of the 5 is being most successful / come up wiht a plan to have fully
validated analytics instead of unvalidated".

**Status: planning only. Not launch-ready.** No campaign system, runtime repair,
live analytics-property verification, deployment or production test is completed
by this document. Recommended defaults below need operator approval in A0.
"Validated" will mean a dated, version-pinned receipt for the supported funnel,
not perfect knowledge of humans or attribution across every device.

## 1. What exists, and why it is insufficient

Audit baseline: `7381d872d950be036741c88a8e73bdcc07684b42`.
Existing D56 telemetry and D86 content analytics are already built; do not
reimplement them. Checked `plan.md`, `parallel-execution.md` and the newest
changelog entries: they contain those systems, not this acquisition acceptance.

| Evidence in current source | Consequence / proof still needed |
|---|---|
| `marketing/marketing-ui/src/lib/analytics.ts`: first-party pageview/funnel/error beacons; all three apps have runtime GA4/Hotjar loading | Instrumentation exists. Live IDs, actual receipt and reporting configuration have not been checked. |
| Both marketing/social `src/main.tsx` trackers pass `location.pathname`; first-party pageviews have referrer but no dedicated campaign/account association | The first-party path field alone cannot distinguish five query-tagged creator links. GA4 may capture campaign parameters separately; not verified. |
| `api/app/v3/models/auth.py` and `endpoints/auth.py`: signup has username/password/contact fields; `ui/src/interfaces/Interface.tsx` signs up then logs in | No dedicated acquisition handoff or canonical conversion is wired in this inspected path. A signup-button click is not an account. Audit contact-anchored account creation in `endpoints/recovery.py` too. |
| `api/app/endpoints/system.py:207–251`: public best-effort ingest returns `ok`, including when a storage insert fails | HTTP 200 is not proof an event was saved. Public beacons are not authority for account creation, human identity or payouts. |
| `clickhouse.py:5422–5484`: total named `pageviews` uses unfiltered `count()` | Mixed event types inflate that headline. Extracted current SQL on a six-row SQLite substitute (3 pageviews, 2 funnel, 1 error) reports 6 pageviews, not 3. Actual ClickHouse regression remains OPEN. |
| `ui/.../AnalyticsPage.tsx:180` puts `days` in JSON; `system.py:255` declares scalar `days: int = 30` as a query parameter | Source-contract mismatch: selecting 7/90 does not supply the API's declared query parameter. Real browser/HTTP replay remains OPEN. |
| `api/tests/test_node_config.py:404–459` supplies mocked query results | These tests check returned shapes, not SQL counting or the UI's request contract. A green unit suite would not settle either gap. |
| `web10-v3/analytics/overview.md` describes server delivery/dedup and "un-gameable"/verified-account claims | Server-served content is useful evidence, not proof of a human. Current signup's optional contact is not verified phone ownership. Reconcile these assumptions against runtime; never inherit a human guarantee from those words. |

This is a bounded readiness audit, not an L1–L4 security scan. The local SQL
probe substitutes SQLite aggregation/time syntax; it is not real ClickHouse,
browser or deployed evidence. Its first AST-extraction attempt failed before
execution; the corrected probe produced the six-versus-three result above.

## 2. Agree on the scoreboard before implementing it (A0)

Recommended pilot contract:

- **Acquisition unit:** a newly created provider-scoped human account principal,
  not an acting group identity, browser cookie, login, post or claimed username.
  "Human account" describes the personal principal, not certified humanity.
  Existing-account visits are a separate reactivation metric.
- **Attribution:** first eligible creator touch within seven days before account
  creation, fixed at conversion; keep later touches as assists, never additional
  acquisitions. Direct/internal visits do not overwrite a touch. Expired,
  malformed and unknown codes are unattributed with a reason. Campaign codes
  identify a source; they grant no access and do not prove Instagram origin.
- **Campaign registry:** five stable creator IDs plus placement IDs (Story, Reel,
  bio), start/end dates, destination, and actual spend. Separate codes for cold
  email, organic and QA. Prefer one domain-branded link per placement; preserve
  an allowed destination through login without permitting arbitrary redirects.
- **Observed landing sessions:** deduped first-party browser sessions, explicitly
  not unique people. Fix the session timeout and storage lifetime in A0. Do not
  manufacture cross-device matches or merge unrelated people sharing a device.
- **Signup:** server-confirmed successful new account creation, counted once.
  Failed/duplicate/retried creation and logging into an old account are not new
  signups. Recovered conversion writes must retain the original event identity.
- **Activated:** within 24 hours of signup, the account successfully follows the
  advertised creator and has an authenticated foreground content session. Define
  that session as UI foreground evidence correlated to an authorized server
  content delivery, not login, background refresh or a bare pageview. Foreground
  evidence is client-reported and remains spoofable; label it accordingly. Quiet
  readers qualify; posting or commenting is not compulsory.
- **Week-one returning:** an activated account has another qualifying session at
  age `[24h, 168h)`. Only cohorts at least 168 hours old enter the final rate.
  Show incomplete cohorts as **pending**, not zero. Optional exact D7/D30 return
  uses `[7d, 8d)` / `[30d, 31d)` with eligibility at 8d / 31d; do not mix these
  with the week-one measure. Tests may advance time, live receipts may not.
- **Primary renewal metric:** actual campaign/cohort spend divided by week-one
  returning accounts; secondary metrics: spend/signup and spend/activation.
  Fix spend allocation to acquisition cohorts before the campaign. Do not divide
  full-month spend by one immature day's returns or silently prorate expenses.
  Zero denominator is N/A, not $0. Report numerator, denominator, observation
  window and maturity, and avoid declaring a winner on tiny unequal samples.
- **Attribution limits:** browser switching, cleared/blocked storage, forwarded
  links and off-link discovery create uncertainty. Store/report unattributed and
  assisted traffic; attributed conversions are not causal incremental lift.

## 3. Build a trustworthy path, not another social backend

Target flow: **creator link → validated campaign touch → explicit authenticator
handoff → canonical account creation → authenticated account association →
activation/return evidence → cohort aggregation → admin report**.

Use first-party records as the decision ledger. GA4 is a supplementary source
and Hotjar diagnoses friction; neither certifies a conversion or a real person.
Third-party blocking must not disable first-party conversion accounting.

A0 must specify the generic event/attribution contract and storage owner before
runtime work. Reuse existing generic seams where adequate. Any required node
extension must work equally for a notes app or a shop: opaque campaign IDs,
verified subject, lifecycle fact and timestamps, not Instagram names, follower
concepts or a social-specific endpoint/table. Creator mappings, follows,
activation rules and ranking remain app/report concerns (D60). Coordinate with
auth/SDK/content-analytics owners rather than editing their flows independently.

Required integrity properties:

- Versioned event schema with stable event ID, origin/provenance, server receipt
  time and source event time where appropriate. Define dedup keys, retries,
  persistence acknowledgement and freshness bounds; dedup must survive restart.
- Bind anonymous touch to the actual successfully authenticated account through
  a bounded, server-validated handoff; never trust a browser-supplied subject or
  silently claim an existing account as newly acquired. Define one-use/retry,
  expiry, account-picker, cancellation and concurrent-tab behavior before coding.
  Do not invent new cryptography or piggyback on consent identifiers as authority.
- Account creation must succeed even if analytics is unavailable. Define a
  durable recovery/reconciliation mechanism for the creation-to-event crash gap,
  with a visible incomplete state until repaired. A best-effort beacon alone
  cannot satisfy conversion accounting. Do not backfill invented campaign ties.
- Keep auth window/origin binding and existing consent intact. Attribution is
  not a grant; it must not expand token scopes, allow redirects to an attacker,
  expose credentials, or transfer state between principals on shared devices.
- Content-free diagnostics at each seam: accepted/rejected/deduped/recovered
  counts, reason codes and last persisted time. No JWTs, contacts, post bodies,
  DMs or raw auth URLs/query strings in analytics or logs. Use allowlisted
  campaign fields and minimal first-party pseudonymous identifiers. Account
  linkage is personal data even if pseudonymous: approve retention/deletion,
  access and disclosure rules; no raw account/contact identifiers in GA4.
- Admin-only reports and aggregate exports; non-admin/foreign-account denials
  need negative tests. Keep D56 content masking and advertising restrictions.

## 4. User quality without pretending to detect every bot

Show **all attributed**, **flagged for review**, **excluded QA/known automation**
and **eligible** counts separately, with overlap rules, versioned reasons and
an auditable review history. No secret subtraction or "100% real users" badge.

Initially flag signup bursts, repeat scripted session patterns and implausible
conversion/return patterns. Tune against labeled synthetic automation and a small
consenting human sample; report false positives and misses. Shared Wi-Fi,
ad-blocking, short sessions and no posting are not proof of fraud. Verification
status, if collected, is evidence of a verification step, not a unique human.
Do not add compulsory phone verification, fingerprinting, automatic bans or
third-party fraud purchases as a side effect of this plan. Any network-based
signal needs explicit data-policy/retention approval first.

## 5. The proof: declare expected outcomes, then run the real funnel

Create a fixed QA campaign with five synthetic creators and a manifest of
touches, accounts, action times and expected per-creator results. The oracle is
hand-calculated independently of report code. Replay real application actions;
do not seed only final aggregates or mock away the system being validated.

| Required case family | Acceptance evidence |
|---|---|
| Five distinct links and placement codes | Marketing and direct-social landings through actual authenticator/SDK return produce exact source/account ties. Test desktop and 375px; inspect screenshots. |
| A then B, repeated A, direct return, expired/unknown code, no code | First-touch/assist/expiry/unattributed rules match the manifest with no double credit. |
| New signup, old-account login, failed/duplicate signup, contact-code account creation, cancellation and retry | Only canonical new accounts count. No recovery/signup alternative silently bypasses capture. |
| Refresh, StrictMode/remount, back/forward, double submission, duplicate/out-of-order delivery, multiple tabs and account switching | One conversion per account; correct scope; no old account's touch/activity leaks to a new one. |
| Block GA4/Hotjar; storage denied/cleared; beacon returns false/throws; offline, storage error, restart between creation and event | Supported first-party path works or is visibly incomplete/unattributed. Recovery reconciles exactly; lost beacons never masquerade as saved conversions. |
| UTC boundaries, 24h/168h/D7/D30 edges, late arrivals, mixed event types and 7/30/90 selector | Actual ClickHouse rows, API summaries, charts and aggregate export match expected values. Immature retention stays pending; server time determines eligibility. |
| Forged public signup/activity beacon, claimed other-account subject, replayed/expired handoff, non-admin report | Cannot fabricate a canonical conversion or cross-account association. Claimed behavior never gains server-authoritative provenance. Replay each boundary attack before/after repair. |
| Labeled bot scenarios plus legitimate passive readers/shared-device humans | Intended flags/exclusions explain every count; false positives/misses documented, no claim of complete human detection. |
| Deliberately break ingest or stop reporting | Health shows stale/incomplete data, persisted timestamp and discrepancy; a genuine zero remains distinguishable from an outage. |

For deterministic fixtures require **zero unexplained discrepancies** between
the expected ledger, canonical accounts, persisted events, report API, UI and
export. Test reporting on actual project-version ClickHouse, not only SQLite.
Record source revision, commands, browser/DB versions, manifest hashes, expected
and actual counts, rejected/recovered events, and cleanup. Evidence artifacts
must be sanitized; never save bearer tokens in receipts or screenshots.

GA4 DebugView/Realtime and later processed reporting need their own live receipt
after access is provided. Reconcile overlapping event definitions and document
blockers/latency differences rather than require impossible equality with the
first-party ledger. A green GA4 DebugView is not full-funnel acceptance.

## 6. Small sequential deliveries and launch gate

| Bite | Deliverable and gate |
|---|---|
| **A0 — approve contract and validation fixture** | Approve §2 metrics, attribution/maturity/spend rules, source/identity/retention contract, generic storage/handoff design, reporting mock and independent expected-results manifest. No runtime work until unresolved authority/policy decisions are settled. |
| **A1 — repair existing analytics accuracy** | Reproduce/fix mixed-event pageview totals and date-range wiring separately; test actual SQL and real HTTP/UI. Verify beacon-failure behavior. Keep old dashboards working. |
| **A2 — campaign capture and safe handoff** | Implement approved touch/destination/handoff contract across marketing/social/auth/SDK, with boundary replay tests, dedup/expiry/account-transition evidence and no privilege changes. |
| **A3 — canonical conversions and cohort evidence** | Implement approved durable conversion/association/recovery, activity and retention calculations. Real storage proves restart/retry/canonical identity; immature, QA, suspicious and unattributed counts remain distinct. |
| **A4 — operator comparison and quality review** | Admin view of all five: spend, observed sessions, new signups, activation, mature returns/rates, cost metrics, flagged counts and completeness. Include denominator/window/formula tooltips, aggregate export and last reconciled timestamp. Route/query holds filters; tokens-only desktop/375px UI, loading/error/empty/stale states. |
| **A5 — connected acceptance** | Run every §5 case on an isolated real stack with real app/SDK/auth/ClickHouse, reconcile the independent fixture, test outage visibility, review trust boundaries and repair until gates pass. Screenshots alone and mocked event tests do not close this bite. |
| **A6 — deployed acceptance and campaign release** | After explicit approval and normal reviewed deployment, verify revision/config and all five final link destinations in actual Instagram's in-app browser on a physical phone, plus desktop/Safari. Use separately excluded, approved QA accounts; confirm real report rows and supplementary GA4 receipt where enabled. No production writes/config/deployment authorized by the plan itself. |

Implementation ownership: continue under `platform-telemetry`, with explicit
coordination for `api/`, `clickhouse-init/`, `sdk/src/`, auth `Interface.tsx`,
admin Analytics and social follow/activity seams. Do not take unrelated lane
work or rebuild creator post/ad analytics. Keep PRs small; trust-boundary fixes
follow AI Security Theory's record/repro/review requirements, one finding each.
Every PR targets `dev`, resolves conflicts and passes **all** checks.

**Launch-ready requires A0–A6 evidence, not just implementation checkmarks.**
Prelaunch accelerated-clock tests validate future retention math; real pilot
week-one/D30 observations remain pending until those cohorts actually mature.
After launch, reconcile daily during week one and after each relevant deployment;
freeze winner claims when collection is stale or discrepant. A seven-day campaign
is not automatically seven days of mature signup cohorts.

Current evidence: source audit and bounded SQLite probe only. **A0 approval,
A1–A4 implementation, A5 connected proof, A6 deployed proof and real retention
observations are all OPEN.** No production access or analytics credentials were
used, and no runtime files were changed for this plan.
