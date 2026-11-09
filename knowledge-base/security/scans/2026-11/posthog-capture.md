# PostHog browser-capture foundation — bounded verification, 08.11.2026

Author/model: GPT-6.1 Sol. D103; local implementation first labeled 4.15.0 and
folded into 5.0.0 before merge (one branch, one PR — the pre-gut capture entry
was superseded, not shipped separately). Not a completed
L1–L4 scan, independent review, live-project acceptance or production change.

## 09.11.2026 D107 public-text policy follow-up

The operator supersedes blanket content exclusion, then explicitly rejects the
first narrow public-caption/label-allowlist draft: visible by default, mask
sensitive regions. Bounded L1/L2 inspection covers SDK callbacks/wire sanitizer,
ID-policy tracking and sensitive caller annotations, not L3/L4 coverage.
Normal DOM text is readable without a marker. Form values/editable drafts,
DMs, private/unknown-visibility post views, pickers and private admin/account
regions are masked/blocked. Portaled lightboxes/menus carry their own scope.
Sensitivity reasons are independent: removing an attribute cannot override a
different private reason. Privacy changes apply before text/attribute mutations;
unknown IDs and paths through removed ancestors deny until re-observed.

SVG UI geometry survives. Public image snapshots use the supported
`maskAttributeFn`: only already-decoded CORS-readable pixels, longest edge 512px,
raster data URL bounded at the wire. No source URLs/srcset, CORS mutation or new
fetch. The SDK silently ignores unsupported `inlineImages`; initial browser
assertion and frontend typechecks catch that mistake before switching callback.
Unloaded/tainted images omit pixels until a later snapshot. Actual audio/video
streams, canvas and cross-origin iframes remain excluded. Event properties and
arbitrary plugin/network/input channels retain their content-free gate.

Unit controls exercise callback/wire independently, including raw private
sentinels. Real pinned-SDK/browser fixtures capture ordinary/public text, an
in-place mutation, UI SVG and loaded image pixels, reconstruct sanitized wire
at desktop/375px and assert private/credential absence. These are synthetic
DOM/config/identity fixtures, not full screens or vendor-hosted playback.
The first scoped reviewer found the discarded allowlist's private-word equality
exception and failure to recover newly public text. Default-visible policy
removes the dictionary; independent sensitivity reasons support recovery.
Original-HEAD synthetic wire control reproduces ordinary button text becoming
`[masked]`; `.context/posthog/d107-original-head-repro.json`. Current local
receipts: 349 marketing tests, 292 authenticator tests and all three frontend
builds pass; six intercepted adapter reconstruction cases pass with public
text/SVG/pixels and private/credential sentinel absence. Full social-suite and
current-policy review were still pending at that receipt point.
The current-policy reviewer then found missing sensitive ancestry on Music
comments, private playlist list/detail/share metadata and profile/saved wall
tiles. Add visibility-derived markers at each repeat/portal and private
collection roots; public variants stay visible. Focused component controls
cover the comments/list/detail/share/tile branches alongside the wire tests;
these are not full browser exploit receipts. Model-diverse convergence, broad-screen private
coverage, normal CI, disclosure publication and approved deployment/new hosted
recordings remain OPEN. No production/vendor writes.

## 09.11.2026 replay compatibility follow-up

Operator screenshot: `.context/attachments/h9T3Po/image.png`, blank player.
Read-only inspection of the shared adapter and the pinned SDK's
`LazyLoadedSessionRecording._maskUrl/onRRwebEmit` confirms that our null network
mask also removes Meta events. Original-HEAD synthetic replay reproduces this
and stylesheet text replaced with `[masked]`; retained baseline receipt:
`.context/posthog/baseline-replay-failure.json`. The strengthened real-SDK
browser check fails on absent Meta dimensions before repair.

Repair preserves route-templated name-only SDK URL callbacks, still rejects real
network entries, and parses style text/`_cssText` and inline declarations in an
unattached stylesheet. Remove generated content, font sources, imports and
URL/image-set/attribute-read declarations; ordinary text/inputs, media and
content-bearing DOM attributes remain excluded. No active DOM is used to parse
CSS; unsupported/invalid parsing yields empty CSS. Stylesheet selectors/static
declarations retain the existing app-controlled-CSS assumption, not arbitrary
untrusted stylesheet support or complete CSS-channel assurance.
Preserve fixed structural MIME/input types, stylesheet rel and numeric rrweb
blocked-media dimensions; the prior masked CSS MIME type made styles inert.
Public, read-only bundle fetches on 09.11.2026 confirm that both social.web10.app
(`/assets/index-CpI73rln.js`) and web10.app (`/assets/index-DCbZjd-S.js`) still
contain the null callback. Receipt: `.context/posthog/public-bundle-check.json`.
No live browser/ingestion, vendor write, configuration change or deployment.

The browser harness now reconstructs intercepted wire snapshots with pinned
`@rrweb/replay@2.2.1`, requires positive Meta dimensions and asserts computed
grid/gap/height. Its fixture uses each actual adapter and app stylesheet, plus
synthetic DOM/identity/config and all external transport interception. It is
not the full social app or PostHog's hosted player. Independent/model-diverse
review, actual deployed revision and new-session vendor playback remain OPEN.

## 5.0.0 continuation — identity/outcomes/legacy removal, still OPEN

The operator explicitly requests the remaining implementation and removal of
GA4/Hotjar. The 4.15.0 scope below is historical, not current runtime. Added
backend surfaces are generic `/analytics/context`, `/analytics/identity` and
admin-gated `/admin/analytics/health`; no social-specific API or auth grants.
Identity verifies local issuer/signature/freshness, current delegated registration
and active canonical user before returning a provider/account-incarnation HMAC
pseudonym. Dedicated >=32-character telemetry secret, never JWT signing material.
Tests deny forged, expired, foreign, anonymous, deleted and revoked-client tokens;
foreign denial precedes remote certification. Supplied usernames/group actors do
not select the returned identity.

Seven-day signed campaign tickets grant no authority and contain no credential
or subject. Source labels are user-controlled, not verified Instagram origin.
Frontend handoff is configured-origin-only, snapshot-at-entry and safe for early
clicks; identity responses are generation/token-fenced. Reset before identify
prevents unsafe shared-device anonymous merging, deliberately leaving anonymous
landing identities separate. UI cancellation/logout/picker transitions clear
context; actual multi-tab/popup integration still needs connected review.

Canonical signup context is atomically stored with creation in a private users
column and retained by all six account-version writers. The safe-query raw-table
denylist already excludes users/node_config. Worker reconciliation selects latest
canonical rows before deletion filtering, retains original timestamps, reuses
stable vendor UUIDs/insert IDs after crash-before-ack and persists private acks/
health without JWTs. Concurrent workers can resend: at-least-once plus vendor
dedup/report distinct-account counts, not exactly-once. Rotating the telemetry
secret without migration breaks identity continuity and is explicitly forbidden.

Actual ClickHouse 24.8.14.39 verifies insertion, duplicate denial, all six context
copies, one outcome and a fresh pass sending none after ack. Discover enrollment
and outbound vendor transport are substituted. An initial real-SQL binding error
on a literal LIKE `%` was fixed by escaping it for parameter binding; actual
corrected SQL passes and owned-container cleanup is verified. Not a process-kill,
full auth/permission journey or live vendor persistence receipt.

Real Chromium/pinned full SDK captures snapshots and heatmap batches on all
three adapters with no private text/attribute/URL/credential sentinel. rrweb
masks all attributes/text/inputs and blocks media; recorder network/console/CSS/
font/JSON-LD/canvas/cross-origin content channels are disabled. Final event/replay
and heatmap allowlists remain. Vendor playback quality and actual app surface
coverage are OPEN; masking intentionally reduces fidelity. Synthetic browser
normalization is explicit, not an anti-bot guarantee.

Legacy loaders/public-config/admin/build/env wiring are removed, while history,
operational diagnostics and D86 remain. Old frontend bundles lose their legacy
IDs on a new API response: an intentional breaking telemetry-contract retirement,
with deployment/collection-gap acceptance still required.

Report provisioning is dry-run unless explicitly applied with operator access;
offline API-shape tests and the five-campaign oracle do not execute vendor HogQL.
Public project ingestion is forgeable: origin fields do not certify events.
Reconcile investor/business claims with canonical facts. Independent review, full
L1–L4 coverage, live vendor/actual auth/phone/restart/quota/playback, data retention/
deletion/access and rollout acceptance remain OPEN. No production mutation,
vendor write, purchase or account cancellation performed.

## Historical 4.15.0 scope and intent

The operator requests implementation, not only a vendor-selection document.
Add optional PostHog browser capture, preserving the current collection path
until explicit activation. No auth/token/consent changes, new endpoints, account
identity, canonical outcome capture, new DB schema or D86 changes.

Backend-first inspection covers the added fields in `models/config.py`,
`services/config.py` and public `endpoints/system.py:telemetry_config`, plus their
existing admin update path. Browser scope: the shared capture adapter, three
analytics wrappers, bundler/build inputs and Config controls. New capture sends
only allowlisted browser events and metadata, not content/credentials. Existing
first-party/legacy telemetry is not certified by these tests.

## Controls and evidence

- `ConfigUpdate` rejects personal `phx_` keys and arbitrary PostHog destination
  URLs; only empty/public-project keys and exact HTTPS US/EU cloud ingest origins
  are accepted. The public endpoint explicitly selects its response fields and
  redacts invalid old saved keys; tests retain unrelated secret/admin sentinels
  in config and prove they do not reach the response. Existing admin check
  remains in front of config writes. Generic config remains extensible; this
  does not certify every other saved field or existing config trust boundary.
- The browser validates enabled/key/host again and fails closed. Only a valid
  selected config imports the pinned SDK; selection suppresses legacy startup
  even on import/init failure. Default-off/invalid keys/hosts/string enablement,
  asynchronous and synchronous failures have focused tests.
- Automatic URL/referrer/person additions are filtered at `before_send` and
  automatic channels are disabled. Caller metadata cannot supply SDK identity/
  transport fields. A raw private query/contact/conversation sentinel is removed;
  route templates and bounded campaign slugs are the approved metadata scope.
  SDK event UUID and capture timestamp are preserved, not raw person updates.
- Startup events are bounded at 64; duplicate initial route calls are suppressed
  while later navigation/back still count. Account identity is deliberately not
  implemented; sessionStorage anonymous activity cannot be marketed as accounts.
- `node scripts/check-posthog-browser.mjs` self-boots Chromium/Vite and the real
  pinned SDK against all three **adapters**. It intercepts every external request,
  decodes the actual SDK compressed `api_key/batch/sent_at` envelope and checks
  two expected pageviews plus the applicable existing structural event, sentinel
  absence, no person updates/automatic events and zero legacy requests. The SDK
  bot filter initially rejected default Playwright; the fixture explicitly
  normalizes UA/UA-CH/webdriver for the synthetic ordinary-browser path. A second
  probe failure was the decoder expecting a bare array instead of the actual
  batch envelope; the decoder was corrected without weakening the checks.
- Real Config UI rendered at desktop/375px with mocked admin reads; both images
  inspected, no mobile document overflow. `.context/posthog/browser-receipt.json`
  and screenshots are local sanitized artifacts, not public raw-event exports.
- Full local suites: 332 marketing tests, 288 authenticator tests, 2,188 social
  tests with both one worker and the default two-worker runner; 2,076 API tests
  plus eight subtests pass with one opt-in skip. Builds/typechecks pass on all
  frontends. Final focused 52-test capture/wrapper rerun and API Ruff checks pass.

## Remaining gates

Independent source/boundary review and broader L1–L4 coverage remain OPEN. No
real PostHog persistence, actual app-auth journey, cross-origin identity linkage,
backend conversion dedup/recovery, account/cohort math, live outage/quota alert,
recording/heatmap safety, external sharing permissions, legal activation review,
physical-phone behavior or rollout assurance. Startup timestamps reflect capture
at SDK drain; unpersisted queue entries and vendor-limit events can be lost.
Backend outcome authority and durable recovery belong in P3, not a public beacon.

Switching off applies next page load, restores retained legacy selection and does
not backfill a collection gap. Do not delete legacy history, enable replay, expose
personal/admin API keys, or call this an independently audited/human-certified
analytics system. See `strategy/posthog-migration.md` for P1–P6 close conditions.
