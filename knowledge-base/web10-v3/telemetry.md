# Telemetry — PostHog only, content out

## Why

The operator needs to know which channels bring accounts that use web10 and
return. Investors need inspectable definitions and third-party reports, not a
homemade chart. D103 selects managed PostHog; the five-influencer pilot is one
campaign, not a special analytics backend. D56's competitive usage tracking and
content-blind recording intent remain. A vendor is not an independent auditor,
proof of humanity or a causal attribution experiment.

## Current implementation

Local 5.0.0 implements account measurement, campaign handoff, durable signup
outcomes, optional masked replay/heatmaps and vendor-report provisioning.
**GA4 and Hotjar loaders, client APIs, public telemetry fields, admin controls,
frontend env/build args and deployment wiring are removed.** Historical node
configuration/events and release records are not deleted. PostHog off or failed
means no external usage-analytics vendor, not legacy fallback.

No live project, vendor reports, playback or physical-phone acceptance has been
verified; this code is not a production-readiness receipt. D86 creator-facing
content/ad metrics and first-party operational diagnostics are separate and
unchanged. Their previously recorded counting/window issues are not fixed here.

## How the data moves

1. All three frontends load public config from `/telemetry`. A valid enabled
   project key and exact US/EU cloud ingestion host lazy-load pinned
   `posthog-js@1.447.3` through `marketing/shared/telemetry`. No frontend env
   override or personal API key. Config/context/identity fetches have a five-
   second bound. Initial events queue in memory (64 maximum); unpersisted browser
   activity can be lost. Consecutive duplicate route calls are suppressed.
2. Standard bounded campaign slugs are captured from the initial URL. Only
   configured app origins receive the signed `_w10a` context or safe UTM fallback
   on links. Social adds source metadata to its current URL before the existing
   SDK popup builds its redirect; the authenticator accepts nested metadata only
   from configured opener origins. Early clicks do not wait for SDK/network.
   `/analytics/context` signs first-touch labels for seven days under a separate
   telemetry-only key. Labels remain user-controlled source claims, not proof of
   Instagram origin, a grant, or account identity.
3. Signup and contact-recovery creation pass optional `analytics_context` to the
   normal account creation path. One `users` insert stores canonical creation
   time and the immutable analytics JSON together. Every account-version writer
   copies that JSON. Existing-account login/recovery never creates a new signup
   outcome. Bad/expired context becomes unattributed; telemetry config errors do
   not fail creation and produce a recoverable incomplete context.
4. The API worker scans current eligible accounts since first activation, sends
   `account_created` with the original server timestamp and a stable UUID, and
   writes private delivery acknowledgements in `node_config`. A crash before ack
   resends the same UUID/insert ID; workers may race, so this is at-least-once
   delivery, relying on vendor dedup plus distinct-account report calculations,
   not a cross-system exactly-once transaction. Pending failures stay retryable;
   passes are bounded and exclude acknowledged events. No saved JWT or contacts
   go into this path. `/admin/analytics/health` is admin-gated and distinguishes
   no receipt, pending/failure and a timestamped successful pass.
5. `/analytics/identity` verifies freshness/signature, local provider, active
   delegated client if present and the current personal account. It returns a
   provider/account-incarnation-scoped HMAC pseudonym and original source labels,
   never a username/contact/password/token. Browser-supplied subjects/acting
   groups cannot select it. A separate persistent `POSTHOG_IDENTITY_SECRET`
   (>=32 characters) is required. Never reuse an auth signing key or rotate this
   secret without an identity migration.
6. Frontends fence delayed identity replies by generation and current token.
   Logout/picker transitions clear identity/context; group acting mode remains
   the human. Reset before identify deliberately prevents merging unrelated
   anonymous activity on shared devices. **Anonymous landings remain separate
   from account identities**; campaign source bridges the acquisition journey,
   not a claimed person-level marketing→auth funnel or cross-device anonymous
   match. Signed-in sessions use the same canonical pseudonym across apps/devices.
7. Social emits `product_session` for signed-in foreground use, at most once per
   30-minute interval in a page instance. This is browser-observed app use, not
   server-verified content viewing. Existing successful follow/post/save events
   remain available. `scripts/posthog-reports.mjs` provisions saved PostHog
   reports; there is no new custom acquisition dashboard.

## Measurement definitions

- Acquisition: canonical new account, not login/group identity or certified human.
- First eligible observed campaign touch: seven-day signed context, fixed in the
  creation row. Direct visits do not overwrite it; unknown/expired/missing is
  unattributed. Existing accounts keep their original acquisition label.
- Activation: an identified foreground social session in `[0h,24h)` after signup.
  The earlier proposed requirement to follow the advertised creator is **not**
  implemented or silently counted. Quiet readers can qualify without posting.
- Week-one return: activated account with another session at age `[24h,168h)`;
  only cohorts at least 168h old are final. Reports show pending separately.
- Counts use distinct canonical IDs; duplicate delivery rows are not new accounts.
  QA/automation exclusions, actual campaign spend/allocation and bot-risk review
  require explicit operational inputs. No invented CAC, automatic fraud bans,
  "real human" guarantee, or winner claim from immature/tiny samples.

## Content boundary and recording

Manual events pass a final schema/property allowlist. Routes are templates, not
user/document/conversation IDs. Search, hashes, raw auth URLs, contacts, profile
data, post/DM bodies, media URLs, credentials and arbitrary metadata stay out.
SDK-added person updates/full URL/referrer fields are removed; personal API keys
never enter frontend config. Person profiles are used only for verified opaque
identities. Public vendor ingestion remains forgeable: `capture_origin=server`
is a provenance convention, not cryptographic vendor enforcement. Reconcile
important claims against canonical facts; do not treat the public project key as
an anti-fraud or payout boundary.

**D107 (09.11.2026) supersedes the blanket exclusion below: visible by default,
mask sensitive regions.** The operator rejects mask-everything-then-allowlist.
Normal UI and public author/title/caption/count text across Posts, Video, Shorts
and Music need no public marker or label dictionary. The denylist is form
values/editable drafts, DMs, private/unknown-visibility records, private admin/
account surfaces and credentials. Public images may be inlined as bounded
raster pixels; signed source URLs/srcset are dropped. SVG UI geometry survives.
Audio/video streams, canvas and cross-origin embeds remain unsupported—not a
claim that playback frames are recorded. SDK masking and the ID-aware wire
gate both enforce sensitive ancestry, including incremental text/marker changes.
Unknown IDs deny until a known snapshot/addition; no arbitrary plugin/network
payloads. Event properties remain content-free. Deployment, fresh vendor
recordings and broad real-screen/review coverage remain release gates.

Optional replay/heatmaps are separately default-off, and **D106 (08.11.2026)
makes them layout-faithful, content-blind**: the recorder masks all
text/inputs, blocks media/canvas/iframes, and keeps console/network
bodies/headers, JSON-LD and external dependencies disabled; the stylesheet and
fonts inline so a recording shows the real page. Replay data is additionally
sanitized at the wire: content-bearing attributes are dropped (input values,
alt/title/placeholder, media srcs, DOM ids, every `data-*`/`aria-*` payload),
`class`/`style` are kept (app-controlled static values), and hrefs become
route templates. Heatmap URL keys are route templates; only numeric
coordinates/type survive. Local Chromium captures real snapshot/heatmap
batches and checks private sentinels plus class survival; a live dev recording
was operator-inspected 08.11.2026. Do not relax masking to improve the
recording except under the superseding D107 policy above.

Replay compatibility follow-up (09.11.2026): preserving class names alone did
not preserve stylesheets. rrweb style-text and `_cssText` need an inert CSS
parser, retaining layout declarations while dropping generated `content`,
resource URLs/imports and attribute reads. Ordinary DOM text stays masked.
The pinned SDK also calls `maskCapturedNetworkRequestFn` with only `{name}`
for its Meta URL: return a route template for that call, not null, or the
recorder discards the page/viewport Meta event. Actual network entries still
return null. Verify decoded wire events **and reconstructed playback**, not
merely that a `$snapshot` batch exists. New recordings after deployment are
required; removed metadata/CSS cannot be recovered from old recordings.
Fixed structural MIME/input types, stylesheet rel and numeric rrweb blocked-media
dimensions also survive; masking `type="text/css"` disables the stylesheet.

## Configure and verify

1. Provision one PostHog project in the chosen region; configure its access,
   retention/deletion, sampling, collection limits and alerts. Do not paste
   personal API keys in chat. No vendor purchase/project creation is automated.
2. Set a separate persistent `POSTHOG_IDENTITY_SECRET` on the API, back it up,
   then restart through normal deployment. The ecosystem compose passes only
   this API-only secret; no frontend build arg contains it.
3. Node Config: project ingest key, matching US/EU region, `Use PostHog`; optional
   masked replay/heatmaps. First enablement records `posthog_capture_since`.
   Turning collection off applies next load; accounts created explicitly while
   off are not backfilled. Historical settings are retained but inert.
   Admin enablement is rejected until the API identity secret is configured;
   disabling remains available even when that secret is missing.
4. `node scripts/posthog-reports.mjs` is network-free dry-run. To create/update
   only managed dashboards/insights, use `--apply` with `POSTHOG_PROJECT_ID`,
   `POSTHOG_REGION=US|EU`, `POSTHOG_PERSONAL_API_KEY` in the operator environment.
   This writes the vendor project and requires explicit approval/access. Reports
   are not made public; live HogQL execution was checked 08.11.2026 via the
   Query API (personal key; 0 rows pre-collection). Access/permission
   restrictions remain an open gate.
5. Local checks: three frontend builds/suites, SDK suite, API suite,
   `node --test scripts/posthog-reports.test.mjs`,
   `node scripts/check-posthog-browser.mjs [--replay]`, and from `api/`,
   `uv run python scripts/check_product_analytics.py` (owned disposable ClickHouse).
   Sanitized local receipts/screenshots live in `.context/posthog/`.
6. Connected acceptance (P5): `node scripts/posthog-connected-check.mjs` previews
   the steps with no network; `--run` (env: `POSTHOG_API_ORIGIN`,
   `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY`, `WEB10_API_ORIGIN`,
   `WEB10_ADMIN_TOKEN`) executes them and persists a sanitized receipt to
   `.context/posthog/` — the synthetic account's username is reported for the QA
   exclusion list. Executed live on dev and prod 08.11.2026 (5.0.5), both
   `complete: true`; the Query API's property columns come back bare
   (`capture_origin`, not `properties_capture_origin`), so automation must use
   explicit aliases. Replay/heatmap validation against real sessions and
   week-one cohort observations remain open.

Before activation, verify current legal copy, retention/deletion procedure and
approved project access. Live vendor storage/report reconciliation, playback,
actual signup/popup flow, multi-tab/account switching, outage/restart/quota
behavior, Safari/physical-phone Instagram and independent boundary review remain
release gates. Existing source-audit scenarios in `strategy/influencer-analytics.md`
remain useful; current plan is `strategy/posthog-migration.md`. No production
configuration, deployment, vendor writes or vendor-account cancellation is implied
by local implementation or the offline provisioning tests.
