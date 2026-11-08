# PostHog-only analytics — implementation and release gates

## The goal and the operator's decision

Jacob needs to compare acquisition channels by confirmed accounts, activation and
return, and give investors inspectable third-party reports. Five Instagram
creators at $200/month are the first campaign, not a bespoke analytics system.
D103 chooses managed PostHog, not Mixpanel/Amplitude or a three-vendor stack.

Follow-up, 08.11.2026: **"okay, implement those plesae, and gut out ga4 and hotjar!"**
This authorizes remaining local implementation and immediate legacy-code removal,
superseding the earlier retain-until-acceptance coding sequence. It does not
authorize deployment, production configuration, paid purchases, vendor writes or
vendor-account cancellation.

## What is implemented (5.0.0–5.0.2, merged to dev)

The binding runtime/measurement contract is
[telemetry.md](../web10-v3/telemetry.md); do not reimplement it from this summary.

- GA4/Hotjar loaders, client APIs, admin fields, public telemetry fields,
  frontend env examples, Docker arguments and ecosystem wiring removed.
- All three apps use one pinned shared PostHog adapter, default-off. Invalid/
  unavailable collection does not start another vendor. Existing operational
  diagnostics/history and D86 content/ad metrics remain.
- Five-second config/context/identity request bounds, safe startup queue,
  pageview dedup, templated routes and allowlisted metadata.
- Seven-day signed first-touch source context, safe links to configured app
  origins, existing popup redirect metadata and optional signup/recovery context.
  Early navigation forwards bounded source labels without waiting for the SDK.
- Server-verified, provider/account-incarnation-scoped opaque identity with a
  separate API-only secret. Reset/generation/token fences prevent stale replies
  and shared-device anonymous merges. Anonymous traffic remains separate; source
  labels—not a manufactured person identity—bridge marketing to signup.
- Durable signup context in the **same users row as creation**, retained by all
  account-version writers. Periodic current-account reconciliation, stable vendor
  event UUIDs, persisted acknowledgements, bounded retries and admin-only health.
  At-least-once delivery, not a cross-system exactly-once claim.
- Browser-observed foreground social sessions. Activation is such a session at
  age `[0h,24h)`; week-one returning requires activation plus another session at
  `[24h,168h)`, with immature cohorts pending. This is not the earlier proposed
  advertised-creator-follow requirement or verified content viewing.
- Optional default-off text/input/attribute-masked, media-blocked replay and
  sanitized coordinate heatmaps. Reduced replay fidelity is intentional.
- Dry-run-by-default provisioning of five vendor reports: canonical acquisition,
  activation/mature return, identified activity, anonymous campaign landings and
  event freshness/completeness. No homemade acquisition dashboard. Actual spend,
  QA/automation exclusions and investor access rules are operational inputs—not
  invented metrics or automatic proof of humans.

## Evidence and its limits

`node scripts/check-posthog-browser.mjs --replay` runs real Chromium, the pinned
SDK and each app's actual adapter with synthetic config/identity and intercepted
vendor transport. It decodes real snapshot/heatmap/event batches, checks source
labels and private text/attribute/URL/credential sentinel absence, and verifies
zero legacy requests. The synthetic ordinary-browser fixture normalizes
UA/UA-CH/webdriver because production SDK bot filtering rejects automation.
It is **not** human/bot validation, live storage, vendor playback or actual auth.
Config desktop/375px images are inspected in `.context/posthog/`.

`api/scripts/check_product_analytics.py` uses disposable ClickHouse 24.8.14.39:
actual account insertion, duplicate denial, six account mutations preserving
context, one canonical outcome and a fresh pass sending none after persisted ack.
Discover enrollment and vendor transport are substituted; it is not permission,
full signup/popup, process-restart or vendor-assurance proof. Initial SQL binding
failed on a literal `%` in a parameterized LIKE; the corrected real SQL passes,
with owned-container cleanup verified. Unit controls replay crash-before-ack with
the same vendor event UUID and deny forged/expired/foreign/anon/deleted/revoked
identity requests. Report provisioning and a five-campaign maturity oracle have
offline tests; **live HogQL execution verified 08.11.2026 against project
720098 via the Query API** (all five definitions execute; 0 rows — collection
not yet enabled — so cohort reconciliation awaits real data).

Third-party hosting is not an independent audit. Public project ingestion can be
forged; a `capture_origin=server` field is a convention, not a vendor-enforced
signature. Reconcile important claims with canonical account facts. Do not
promise perfect attribution, causal lift, complete bot detection or known people
across devices when only anonymous visits were observed.

## Remaining delivery queue

| Bite | Local implementation | Acceptance still required |
|---|---|---|
| P0 vendor decision | Complete | None for vendor choice; historical decision 4.14.3 |
| P1 contract | Concrete runtime/metric defaults in telemetry.md | Region, actual project access/permissions, retention/deletion procedure, sampling, limits, spend/exclusions and legal activation review |
| P2 capture/config | Merged | Independent boundary review and actual integrated route lifecycle/collection-health checks |
| P3 identity/outcomes | Merged | Connected popup/signup/recovery, multi-tab/picker/logout, real process outage/restart/retry and actual vendor identity/event reconciliation |
| P4 reports/replay | Provisioning and masked capture implemented | Vendor apply done 08.11.2026 (managed dashboard 2321231 + five reports; live HogQL execution clean, 0 rows pre-collection). Remaining: reconcile expected cohorts once data flows, inspect vendor playback/heatmaps, restrict investor access |
| P5 connected acceptance | Floors pass; connected-acceptance harness ready (`scripts/posthog-connected-check.mjs`, 5.0.3, offline-tested) | Live harness run against a deployed node + real project: full app/auth/SDK/API/ClickHouse/PostHog fixture→facts→events/persons→reports/export agreement, live HogQL execution of the five reports, failure/quota behavior and independent review |
| P6 retirement/rollout | Legacy code/config wiring removed | Approved normal deployment, deployed revision/config, five final links on physical-phone Instagram plus desktop/Safari and explicit collection-gap/rollback receipt |

Keep all gates honest. The full system is not launch-ready just because the code
exists. Actual week-one/D30 observations remain pending until cohorts mature.
Do not delete historical records or cancel external accounts as a side effect.
The earlier [influencer audit](influencer-analytics.md) remains a source of
adversarial cases, not an instruction to build a custom report/ledger engine.

## Operator setup, when approved

1. Create/choose a PostHog project and its region. No live credentials were used
   for this implementation. Never paste personal API keys into chat.
2. Provision/back up `POSTHOG_IDENTITY_SECRET` (>=32 random characters) on the API;
   do not reuse auth keys or rotate without identity migration. Apply through
   normal deployment. Set public ingest key/region/enablement in Node Config;
   replay/heatmaps remain a separate switch.
3. `node scripts/posthog-reports.mjs` previews the exact report definitions without
   network. Approved `--apply` reads project ID/region/personal API key from the
   operator environment and creates/updates only its own managed reports.
4. Run connected/deployed acceptance before the paid pilot. Start with
   `node scripts/posthog-connected-check.mjs` (dry-run manifest; `--run` needs
   `POSTHOG_API_ORIGIN`, `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY`,
   `WEB10_API_ORIGIN`, `WEB10_ADMIN_TOKEN` in the environment): telemetry
   preflight → signed first-touch → canonical signup → verified pseudonym →
   reconciliation health → the `account_created` event against an independent
   client-computed UUID oracle → live HogQL execution of all five reports. The
   synthetic account it creates is reported for the QA exclusion list, not
   deleted. Then verify retention, access restrictions, quota/drop alerts,
   deletion process and disclosure. Do not infer those from local mocks or a
   vendor's funding round.

Ownership: `platform-telemetry`; shared adapter and report/check scripts plus
coordinated API/account/schema, SDK optional metadata, auth, social lifecycle,
Node Config and public legal seams. No unrelated lane work. Normal PRs target
`dev`, resolve conflicts and pass all checks; no review/CI waiver is implied.
