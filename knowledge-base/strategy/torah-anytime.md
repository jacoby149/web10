# Torah Anytime — marketing partnership and Torah-only community

## Why

Operator direction, 11.11.2026:

> so, torah anytime, they are open to spreading torah with web10. lets put this in the plan for the marketing.
> they have petabytes of torah data, that would be a significant thing for the new internet to get that many users that much data, we could sync it.
> we will have to implement features to whitelabel a web10 node though for sure. also, reduce permissions for the users, some more roles for sure. we need to make sure that this social platform is torah only

Treat Torah Anytime as a warm institutional/anchor-partner opportunity: a
Torah library and community under its own brand, powered by web10. An existing
catalog plus an existing audience could be a significant adoption path for the
network. The goal is spreading Torah, not maximizing imported bytes.

**Status:** openness to collaboration and petabyte-scale holdings are
operator-reported. Inventory, audience size, rights, technical access,
operating arrangements and an agreed pilot are not verified here. The sent
email below clarifies the offer: free lifetime license and future improvements;
TorahAnytime covers hosting. It supersedes the earlier “totally free” shorthand.
No signed partnership, user
migration, capacity proof or permission to copy/publish is implied.

This is an explicit partner-specific catalog-sync opportunity, not a reversal
of D95's general creator-onboarding direction. Do not resurrect the retired
importer. The current `marketing-importing/` Instagram workflow is a reference
for resumability/deduplication, not a Torah Anytime connector or petabyte pipeline.

## Sent email to Shimon — authoritative offer

Operator reports this email was sent (recorded 11.11.2026; send date not separately verified):

> Hi Shimon,
>
> My name is Jacob Hoffman! I am a software engineer for 6+ years, and I am starting a white-label social platform called web10. Here it is, live: https://social.web10.app
>
> A real social media platform with a very attractive UI — much more Facebook, Instagram, Twitter than a plugin on a website. If you like the shape of it, we can put TorahAnytime's branding on it: your speakers get pages under TorahAnytime's name, moderated to your standards, and every post reaches every follower.
>
> The platform I linked is the public one. It is open to anybody, and it is shared by everyone. The one for TorahAnytime would be separate, and it would be Torah only.
>
> Normally the license is $500 a year, plus the cost of the infrastructure to host it. But for TorahAnytime, because I am a frum Jew, the license is free for life — you would just cover the server (at your size, 16 cores and 32GB of RAM). I do the setup myself, and with access to your database I will create accounts for every speaker on TorahAnytime, ready from day one. Every improvement I ship after that, you get for free.
>
> Glad to walk you through it anytime — my number is 1-347-209-2325.
>
> — Jacob Hoffman
> web10.app

**Planning consequences:**
- The communicated standard price is $500/year plus infrastructure; the
  partner offer waives the license for life and includes future improvements
  free. This records the email, not a new platform-wide pricing decision.
- TorahAnytime covers the server. Confirm storage, transcoding, bandwidth/CDN,
  backups and operational responsibilities before agreement; neither conceal
  those costs nor promise unlimited free hosting.
- Jacob offered personal setup and speaker accounts ready from day one with
  database access. Scope an authorized minimal export/read-only integration,
  speaker identity/ownership and secure claim/invite flow; distinguish provisioned
  speaker pages/accounts from speakers who have actually joined. No blanket
  database credentials, personal-data transfer or impersonated consent is
  authorized by this email.
- The public demo is not the proposed separate Torah-only deployment.
- **16 cores / 32 GB RAM is a communicated sizing estimate, not a benchmark.**
  Validate against catalog/storage strategy, concurrent users, playback/egress,
  transcoding and recovery before promising capacity or purchasing a server.
- “Every post reaches every follower” describes feed availability/delivery,
  not guaranteed human viewing, notifications or uptime. Demonstrate the actual
  follow/feed behavior and agree reliability expectations in the pilot.
- Sending is recorded; partner acceptance, database authorization, provisioning
  and implementation remain open. No follow-up send is authorized here.

## Hosting follow-up — existing partner server

Operator reports TorahAnytime said **“you can use our server”** and expects
their existing infrastructure to be good. This is the current hosting direction:
deploy alongside/on their approved infrastructure rather than assume a new
server purchase or duplicate their catalog. Exact machine, available resources,
deployment access and operating responsibilities remain unknown. Permission to
use a server is not automatically database access or permission to alter existing
services.

TA0 should request a lightweight infrastructure handoff: available CPU/RAM,
storage/media location, OS/container support, network/egress and an approved
isolated deployment target with access, backup and rollback arrangements. Check
actual headroom and a bounded workload without disrupting TorahAnytime's current
service. Do not require the earlier 16-core/32GB estimate as a purchase or minimum
specification, or treat confidence in their server as verified capacity. No
provisioning, credentials request or server changes are executed by this record.

## Partner-facing offer: immediate value-adds, reliable, free lifetime license

Operator follow-up, 11.11.2026:

> they are cool, they asked is this free, are you actually trying to spread chesed? i said yeah! totally free, literally spreading torah onto the new internet! but cant say that, have to say adding twitter, adding theese features to torah anytime, really reliably
>
> i.e. the immediate value ads

Lead with **adding useful Twitter-like social features to Torah Anytime**, not
bringing their data/users onto a new internet. Chesed and spreading Torah are
the motivation; concrete improvements to their existing experience are the
offer. Here “value-adds” means useful features, not advertising inventory.

Earlier draft, not sent; use the actual sent email above for commitments:

> The license is free for life; you cover hosting. I want to help spread Torah. The idea is to add
> Twitter-like features to Torah Anytime: follow your favorite teachers, see
> their latest Torah in one feed, and share shiurim easily—all under your
> brand, Torah-only, and built to work reliably. We can start with the features
> that help your users most, without replacing what already works.

Candidate immediate benefits to validate with the partner: teacher follows and
updates, a Torah feed, easy shiur sharing and saved shiurim/collections. Replies
or discussion are optional and depend on their moderation/permission policy,
not an automatic promise of unrestricted posting. These are proposed benefits,
not a claim that integration is already available. Reliability is an acceptance
requirement: correct follow/feed behavior, working shared links, dependable
audio/video playback and honest loading/error/retry states on desktop/mobile;
agree and test the actual pilot journeys before describing them as proven.

The free lifetime license is recorded, not “free trial, upsell later.” The
partner covers hosting, as stated in the sent email. Scope the full operating
cost and responsibilities transparently and size the pilot accordingly; do not
imply unlimited petabyte hosting is included or funded. No surprise fees,
forced migration or requirement to understand web10 infrastructure to benefit.

## Immediate demo — three small bites, not the full rollout

Operator-selected demo URLs: **https://torah.web10.app** (social) and
**https://api.torah.web10.app** (API). The operating kit lives in
[`whitelabel-demo/`](../../whitelabel-demo/README.md): DNS/TLS, isolation,
password gate, sample seeding and dated receipts. Hostnames are chosen; DNS,
server target and live deployment are not yet verified. Supporting auth/media/
RTC routes still need a decision. Do not borrow production endpoints by default.

Operator narrows the demo to light/dark logo settings, password protection and
a small stocked selection of rabbis' content. Follow-up: **TorahAnytime offers
downloads**, per operator. Use that supported download path for the selected
sample; do not assume scraping, database access or full-library sync is needed.
Confirm the selected material can be rehosted for this partner demo; an available
download button alone does not settle redistribution rights.

- **DEMO1 — light/dark logo settings.** Add editable “Logo for light mode” and
  “Logo for dark mode” to Node Settings, using existing `logo_light`/`logo_dark`
  configuration rather than a second branding model. Save/reload must retain
  the values and the demo's visible branding must use the matching asset on
  theme changes, with a sensible missing/broken-image fallback. Existing
  authenticator build-time logo support is not saved-node-setting integration.
  Scope renderer wiring to the actual demo surfaces; desktop/375px captures
  in both themes, focused persistence/theme tests and normal build/CI gates.
  No larger white-label redesign is required for this demo.
- **DEMO2 — password-gated demo.** Use an isolated demo deployment and an
  established server/edge access gate; do not ship a password or credential
  check in the frontend bundle. Choose its hostname and provision the secret
  out of band, not in git/chat. Cover the app, deep links and demo-owned
  API/media/preview entry points so a direct content URL cannot bypass the
  gate. Keep normal web10 account authorization behind it. Test unauthenticated
  denial, wrong password, successful entry and session expiry/logout behavior;
  audit any external media URLs for bypass. No changes to public production
  access. Actual hosting/access and security review are execution gates.
- **DEMO3 — download and stock a small Torah sample.** Pick a bounded list of
  rabbis/shiurim with the operator, use TorahAnytime's supported downloads and
  seed only the gated demo. Preserve speaker/title/source attribution; demo
  speaker pages must not suggest the rabbis personally registered or endorsed
  the demo. Record source IDs and seeded records so a repeat run does not
  duplicate posts and cleanup stays scoped. No partner passwords, real speaker
  credentials, bulk account import or ongoing sync is needed. Gate: selected
  links/files, permission to rehost the sample, agreed count/byte limit and an
  approved isolated demo target. Verify actual downloaded bytes, playable
  media, feed/profile/share journeys and desktop/375px presentation before
  showing it; do not leave it as placeholders or publicly publish the sample.

Demo acceptance is simple: unlock the demo, see TorahAnytime branding in either
theme, browse a populated Torah feed/speaker pages and play the selected shiurim.
Use existing capabilities and controlled demo content. Expanded role presets,
production Torah-only enforcement, full catalog sync and scale-up remain later
TA0–TA4 work, not prerequisites to building this isolated demo. The demo is not
proof of those production capabilities. No implementation, download or deployment
has been performed by this planning update.

## Product requirements to scope before implementation

### White-label node and social experience

Plan reusable configuration for the partner's domain, name, artwork, theme,
navigation, onboarding, community rules and support/contact identity across the
social PWA and authenticator. Existing configurable authenticator artwork is a
starting point, not proof of end-to-end white-label support. Include install
metadata, share cards and email/recovery touchpoints in the inventory. Custom
branding must not obscure the actual operator, issuer or consent destination.
Use the shared product, not an unmaintainable partner fork. Read `design.md`
before future UI implementation; require desktop and 375px captures.

### Restricted permissions and additional role presets

**Working model — approve the speaker, then trust the publisher.** The operator
wants speaker-level approval as the planning baseline: TorahAnytime approves
who may publish; a listener account alone never grants upload/post authority.
They may vet a prospective speaker's first few videos before approval, then
allow the approved publisher to post without manually auditing every video.
This describes our current assumption about their workflow, **not a verified
statement of TorahAnytime's existing process**. The roughly 1,200-speaker figure
discussed by the operator does not establish how approval or review works.

TA0 must confirm this with Shimon: who approves a speaker/uploader, whether
initial submissions are reviewed (and how many), when direct publishing starts,
and how approval is suspended/revoked or a publisher returned to review. Do not
invent an initial-video count or make per-post preapproval the default without
that confirmation. Keep moderation/removal and reports available after approval;
trust does not mean irrevocable publishing authority. Listener signup/access
approval is a separate unresolved policy, not implied by speaker approval.

Ordinary signup must not automatically grant public publishing, upload,
community creation, role management or moderation authority on the partner's
surfaces. Propose a least-privilege matrix for **viewer/student**, **approved
teacher/publisher**, **editor/curator**, **moderator** and **administrator**;
Torah Anytime must approve the actual names and capabilities. Comments,
reactions, DMs, links and user profiles require explicit policy decisions,
not an assumption that every social feature stays open.

Reuse the generic per-service group roles and app contracts in
`../web10-v3/groups/access.md`; additional presets need not mean new permission
primitives. Grants are additive: a restricted member role cannot subtract an
`anyone` or `authenticated` create grant. Inventory default/public grants and
self-owned publishing paths before claiming restrictions. Hiding compose
buttons is not enforcement; direct API calls, alternate clients, delegated
identities and revoked roles need denial tests at the real boundary. Keep the
API generic (D60), never hardcode Torah concepts in `api/`.

### Torah-only platform, not merely a filtered Discover tab

Torah Anytime defines what counts as Torah content, appoints reviewers and owns
approval, removal and appeal policy. Begin pilot scoping with approved-source
catalog content and approved publishers. Use the speaker-approval working model
above; confirm any initial-vetting and exceptional submission/edit review before
implementation rather than assuming every video is pre-reviewed. A keyword blocklist or AI classifier is
not a guarantee of Torah-only content. Existing D59 board hiding alone is
insufficient: hidden content can still be accessible elsewhere.

Define the policy boundary across feeds, search, profiles, groups, direct/share
links, comments, reposts, previews, embeds, recommendations, ads and enabled
media surfaces. General-network discovery/server mixing must not silently
introduce unapproved material; external sources are off unless explicitly
approved under the same policy. Decide the treatment of DMs/private spaces
before enabling them. State residual limits honestly: partner-surface curation
is not a claim to control every independent node on the open network.

### Catalog sync and bounded scale-up

Obtain an authorized source API/export and agreed rights for originals,
transcodes, transcripts, thumbnails and speaker attribution. Confirm catalog
counts/bytes, formats, languages, metadata and change cadence; do not import
accounts, subscriptions or personal data without a separate agreement and
appropriate user authorization. The source catalog remains authoritative unless
the partner agrees otherwise.

Design stable source-ID mapping, resumable/checkpointed idempotent sync,
metadata/media integrity checks, retry/rate bounds, updates, deletions and
rights takedowns. Compare metadata-first/source-backed playback with selective
replication before assuming all petabytes must be copied. Measure an agreed
small authorized sample, including real playback/search and update/delete
reconciliation, then price storage, transcoding, egress/CDN, backups and ongoing
operations. No full-catalog copy, paid provisioning or production publication
without explicit scope, budget and approval.

## Sequence and acceptance gates

1. **TA0 — partner discovery and pilot agreement.** Document counterpart,
   verified inventory/access/rights, audience baseline, desired branding,
   Torah-only rules, proposed permission matrix and a bounded pilot proposal.
   Prioritize immediate user-facing value-adds, preserve the sent free-lifetime-
   license/partner-funded-hosting offer, validate the communicated server estimate
   and scope speaker provisioning plus reliability acceptance.
   Record unknowns rather than filling them with guesses. No live sync/spend.
2. **TA1 — white-label contract.** Inventory existing configuration versus
   gaps; specify reusable partner branding/domain behavior and split UI,
   deployment and delivery changes into separately owned bites. Gate: TA0.
3. **TA2 — role and Torah-only publication contract.** Map every enabled
   surface/write path to existing grants, review lifecycle and bypass-denial
   tests; resolve broad grants and outside-source exposure. Gate: TA0 and
   partner approval. Future trust-boundary work follows the security method.
4. **TA3 — bounded catalog-sync design and trial.** Specify source mapping,
   reconciliation, integrity, sample/bandwidth/storage limits, rollback and
   measured cost. Gate: TA0 authorized sample, approved limits and explicit
   execution permission; publication additionally requires TA2 enforcement.
5. **TA4 — partner pilot and expansion decision.** After implementation,
   independent review and all normal CI gates, demonstrate branded desktop/
   375px journeys, real allowed/denied role operations, no unapproved content
   across the surface matrix, real media/search and repeat-sync parity.
   Partner signs off before rollout. Track authorized catalog coverage, sync
   freshness/failures, actual opt-in users/return learning activity and cost;
   imported bytes or source audience totals are not acquired users. Expand
   only against observed capacity and an approved budget.

Planning is recorded; DEMO1–DEMO3 and TA0–TA4 remain open in `parallel-execution.md` and
`plan.md`. This document authorizes no implementation, outreach send, copying,
spending or deployment.
