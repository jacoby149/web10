# decisions.md — why the big calls were made

A lightweight decision log (ADR-style). Each entry: the decision, why, and
what it rejects. Add to the TOP as new decisions land. This exists so
parallel agents and future-you don't re-litigate settled questions. Details
and task breakdowns live in `plan.txt`.

Status legend: [decided] intent set · [in-progress] · [open] still debating.

---

### D43 — The API runs DB endpoints in a thread pool with a thread-local ClickHouse client [decided]
Operator, 23.08.2026, after the auth popup's "Checking node status..." hung for
seconds on login and login felt "inconsistent — sometimes instant, sometimes 5s,
like ClickHouse is flaky" (it wasn't):

**Decided** — the v3 API endpoints (and the `/ready` health check) are `def`
(sync), so FastAPI runs them in a worker-thread pool, and the ClickHouse client
is a **thread-local** (each worker thread gets its own `clickhouse_connect`
connection, created once on first use). A burst of concurrent DB requests
occupies worker threads, not the event loop.

**Why:** the endpoints used to be `async def` doing a *blocking*
`clickhouse_connect` call. On a single-threaded asyncio loop, each request held
the loop for the duration of its ClickHouse round-trip, so a burst of concurrent
requests (the auth popup fires ~6 on load) **serialized**: total time ≈ the *sum*
of the round-trips, not the max. The `/ready` probe the popup waits on was stuck
in that queue → the multi-second "Checking node status..." hang, and the
"sometimes instant, sometimes 5s" feel (the sum varied with the network). Making
the endpoints sync moves the blocking work off the loop into the thread pool; the
thread-local client means concurrent requests run in parallel without racing on a
shared single connection (a shared `clickhouse_connect` client is not
thread-safe).

**Rejects:** `async def` endpoints calling a blocking client (blocks the loop);
a shared global ClickHouse client (data race under concurrency); an async
ClickHouse client (`get_async_client`) — not needed once the work is off the loop
in a thread, and it'd touch every call site.

**Scale note:** at 100k users the bottleneck moves to ClickHouse itself (and the
HTTP ~6-connections-per-host limit), not the event loop — so a *timing* test
("parallel is faster than serialized") is not a robust local assertion (measured
0.9–1.2× speedup at N=20–60). The concurrency anti-test asserts *correctness*
under a burst (all requests succeed, no cross-user data leak), not speed. See
`e2e/tests/concurrency-torture.spec.ts`.

### D42 — The consent popup is an automatic handshake, not a tap-fest; group contracts are lazy [decided]
Operator, 21.08.2026, after watching the notes demo re-prompt on every return run:
"your all set just doesn't exist anymore, it sends the token and closes the popup,
for you" · "each time there is a request is a distinct popup open" · "the app can
tell if it gets an access denied it's pulling from a group it should have but
doesn't… then the app gives a button to prompt the user to open the popup to
approve the group contract" · "in limitations breed simplicity" · "the success of
the request confirms the group" · "in a social media context, you start doing
stuff to your groups only after you are logged in… the flows better suit the
contracts themselves now."

**Decided** — the return run is zero-friction, by four rules:

1. **One popup per contract, each self-contained** (open → decide → close). The
   single popup holding itself open in a "waiting for more contracts" limbo
   between the app contract and the group contract is deleted. No more one window
   doing two jobs.
2. **"All set" as a *screen* is deleted.** The *detection* ("this contract needs
   no approval") stays — expressed as **auto-complete**: the popup hands back the
   token and closes itself, zero UI. No Close-window button. The button asked the
   user to tap the one thing the popup already knew how to do.
3. **Group contracts are lazy, not proactive.** The app does *not* send the group
   contract on login. It just reads. **A successful read is the confirmation** —
   no popup, no contract. A 403 ("a group I should have but don't") shows a
   button; the click opens a second popup for the group contract. The click is a
   user gesture → `window.open` is never blocked.
4. **The app tells the two 403s apart** — app-contract-missing (→ re-request the
   app contract) vs. group-missing (→ request the group contract) — and shows the
   right button.

**Return-run default:** one zero-UI popup (login/token) → read works → done.
**Zero taps.** First-time setup is two popups (login/app-consent, then
group-consent via the button) — two taps paid *once* to buy zero taps forever
after, and it suits the contracts: the app contract (infrastructure trust, a
one-time grant) is decided at login; the group contract (a social action on your
groups) is decided only once you're logged in and actually touching a group.

**Why:** the one-popup limbo (the popup can't know whether a group contract is
coming, so it stays open waiting) is the root of the all-set dead-end, the
Close-window tap, the messaging hell, *and* the group re-prompt. Self-contained
popups + a lazy group contract delete the limbo and the re-prompt **by
construction** — we never ask for the group unless a read fails. The browser's
popup-blocker rule (a `window.open` must be a user gesture) stops being a
limitation and becomes the design: the group popup is only ever opened from a
button click.

**Rejects:** the stay-open-waiting-for-more-contracts state · "all set" as a
tappable screen · proactive group `contractRequest` on every login (the actual
cause of the re-prompt) · no-op group-contract filtering as the *primary* fix
(band-aid — it is demoted to a nice-to-have edge case inside the group popup,
not the load-bearing wall). The postMessage handshake itself is kept unchanged —
what changes is that each contract gets its own clean window instead of one
window doing two jobs.

**Separate, not subsumed:** D42 fixes *friction*. The *identity* bugs (the popup
acting for its own cookie's user — the red cookie-torture e2e tests: identity
hijack + the "all set" *lie*) are a distinct security fix: the popup must know
who the app is acting for (the opener passes `?as=<username>`) and the SDK must
verify the returned token's user before storing it. D42 + that check together =
a reliable notes app.

### D41 — web10 is a data-policy platform, not a privacy platform; no default E2E [decided]
Reverses D6, D16, D17, D18, D19 and the e2e half of D27. The node is
readable by design. Full reasoning: `thesis.md`.

The old plan treated I4 as "the node operator cannot read your data" and
built toward e2e encryption (phone-as-keychain, wrapped keys, CP-ABE,
MLS). That was the wrong bet for this product, for three reasons:
(1) **discovery** — feeds, trending, search, moderation — requires the
node to read content, so "discoverable" and "hidden from the node" are
mutually exclusive; (2) the real threat to a creator is the platform
*owning* the audience/relationship/revenue and revoking it, not the
platform *reading* public posts (YouTube reads your "private" videos —
that's the norm); (3) **trust here is legal, not cryptographic** — a node
operator who mishandles data can be sued, and you can't sue math.

So: the node stores readable, searchable, auditable data. Access is
controlled by the terms/permission model (I3), not by cryptography. The
value prop is ownership + control + portability + no-shadow-ban, not
operator-blindness. The mobile encryptor app (`mobile/encryptor/`) is
deleted; the client is a PWA.

E2E is not banned — it is not the default and not our job. A user or
third party may build their own e2e layer on the SDK + WebRTC. If a real
creator asks for "my DMs must be cryptographically blind to the node,"
that becomes an **opt-in tier, never the default.**

Rejects: e2e-by-default, phone-as-keychain, CP-ABE/MLS group crypto as a
product feature, "the node can't read your data" as the trust story, and a
native mobile app. The full "what this is / is not" statement lives in
`thesis.md`.

### D40 — Feed + profile PULL directly; discovery board is Discover-only [decided]
Operator, 31.07.2026: "it doesnt have to be on the discovery for me to see
it… if i am on his page, it should hit his service directly. likewise on
the feed, it should hit all the friends directly with get requests. the
thing that should be public discover is only the discover page." And on
the feed architecture: "the feed will have a more solid architecture,
this is the v0! :) kind of whatsappy or something." **Decided:** (1) the
profile wall reads the author's `public_posts` DIRECTLY from their
collection (anon-read whitelisted by the canonical term) — shipped in
1.0.297 (#477, `readUserPublicPosts`); (2) the friends feed PULLS — your
own posts + one direct read per active followee's `public_posts`
(`readPullFeed`, 1.0.298) — replacing the inbox fan-out read path for the
feed v0; (3) the discovery board serves ONLY the Discover/trending/
search surfaces (per D39 it remains the one public cross-user
projection). Consequences: a board-moderated post stays on the author's
profile and in friends' feeds (moderation is discover-only by design);
the inbox fan-out write path (D-post-delivery) is now vestigial for the
feed — left in place, retirement is a later cleanup; "100% delivery" is
told as pull ("they are pulling from their friends"), the marketing page
already dropped fan-out language (1.0.289). Rejects: feed-via-inbox
(fan-out copies drift from the source of truth and break when follows
don't persist); profile-via-discovery (a discover-only takedown ripped
posts off profiles).

---

### D39 — Discovery board is a general projection; READERS pass `services` [decided]
Operator, 31.07.2026: "the discovery board should take an input of the
services, so the frontend can actually ask the discovery board what it
wants… fallout avatar could post its services there — that way apps all
benefit. That is the only means to have trending shit for the public,
right?" Trigger: prod fallout-avatar records ghosted into the social
trending feed as empty posts (30.07). First fix attempt gated the WRITE
side to an allowlist; the operator overrode it — the index is the one
public cross-user read path, so every app must be able to use it.
**Decided:** WRITE side indexes ANY anon-readable service (unchanged);
READ side — all four board endpoints (`/discover/posts`, `/search`,
`/topics`, `/users`) take a `services` filter (comma-separated, URL or
body `query.services`); omitted → default set `("public_posts",
"web10_apps")` so legacy callers keep the posts-only board. web10-social
and marketing-ui pass `services=public_posts`. Moderation (`removed`)
applies per service on top. Rejects: write-side service allowlist (would
have locked non-social apps out of the only public trending mechanism);
per-app discovery indexes (one index, filtered reads, is simpler).
Related: moderation is board-scoped only — profile walls and inbox
fan-out are moderation-immune (1.0.292, #477).

### D38 — Hotjar SaaS for marketing-ui session analytics (override self-hosted) [decided]
Operator, 30.07 rant: "if we havent set up hotjar on the marketing page, we
NEED to!" The standing plan.txt decision was self-hosted PostHog/OpenReplay
(marketing traffic never feeds a third-party SaaS). **Override: Hotjar the
SaaS ships first** because the operator needs it this week and self-hosted
infrastructure cannot be provisioned in the same timeframe. Hotjar is scoped
to `marketing/marketing-ui` ONLY — the platform surfaces (`ui/` +
`marketing/web10-social`) remain recording-free (RADIOACTIVE, unchanged).
The Hotjar snippet loads dynamically from `analytics.ts` via
`VITE_HOTJAR_SITE_ID` / `VITE_HOTJAR_VERSION` env vars; without the site ID,
it is a no-op (dev-safe). The self-hosted PostHog path remains the aspirational
target for later if the operator wants to migrate away from Hotjar — it is
not blocked, just deferred. Rejects: self-hosted PostHog/OpenReplay this sprint
(operational urgency trumps the self-hosted principle for marketing-only traffic).

### D37 — App Store v2 Registration Record Shape & #web10apps Social Projection [decided]
Full spec: `.context/appstore-v2-registration-spec.md`. Summary: the `web10.apps`
collection gains `review_state` (state machine: pending → approved/rejected,
approved → pending_on_change on listing edit), `metadata_version` (monotonic),
`web10apps_post_id` (stable anchor for social projection), and node-hosted
listing metadata (`description`, `icon_url`, `screenshots` — never hot-linked
from app origin). Every approved app projects as a synthetic discovery entry
with `tags: ["#web10apps"]` so the social feed discovers apps as posts. The
product page comment panel and the `#web10apps` thread read the SAME ledger
entries targeting `system/web10_apps/{web10apps_post_id}` — one conversation,
two lenses. Star ratings are `AppRating` schema ledger entries (1-5, per-user
upsert). Gates v2 bite a (product page), v2 bite b (comments + ratings), and
the v2 rewire build.

### D36 — The "your algorithm" knobs belong IN the app's Discover (D20 revisited) [decided]
Operator, 29.07 (screenshot of /trending's knob rack): "the trending page on
the marketing site is amazing! the discover should borrow much more heavily
from it, the knobs to tune your algorithm should be on discover." This is the
D20-revisit sign-off that D-inapp-discover-knobs was gated on. The nuance
that makes it NOT a D20 reversal: D20's chronological guardrail governs the
FEED (the follower inbox — "no algorithm" is the delivery pitch, untouched);
Discover is already a ranked, ranked-by-definition surface, so client-side
knobs there extend "the algorithm is yours" into the app without touching
the delivery story. The feed stays chronological, full stop. What ships:
the /trending card language + controls (presets, KnobRack/RotaryKnob,
powerMean — copied per the verbatim-copies rule, not shared) ported to
web10-social's DiscoverScreen. Rejects: knobs on the chronological feed
(still rejected); a shared knobs package (premature).

### D35 — Public media is a COLLECTION (`public_media`), not a flag or a blanket whitelist [decided]
Cross-user media reads are dead today: the `media` service ships with no read
whitelist (web10-social serviceTerms.ts — owner-only), and both
`POST /{user}/read` and the media-records list gate on
`is_permitted(token, user, "media", "read")` (api/app/endpoints/media.py:83,
:101). So a follower can never presign an author's photo, another user's
avatar dies at issue time, and on dev's private bucket (D23) every cross-user
image 403s. D19 Phase C predicted this ("publishing grants audience media
read — public media needs an explicit path"). The explicit path is D30
applied to media: a second service, **`public_media`**, carrying the same
anon-read whitelist `public_posts` and `profile` already carry.

- Upload-confirm accepts a target service (`media` default | `public_media`),
  validated against exactly that two-value allowlist — the body must never
  name an arbitrary collection.
- `POST /{user}/read` (and the records list) accept the same optional
  service and permission-check against the REQUESTED service.
- Public content's attachments (a public post's media, the avatar/banner a
  public profile references) confirm into `public_media`; DM and private-post
  media stay in `media`, owner-only.
- Publishing staged content moves the media records with the post records —
  the same create-in-target + delete-from-source move as D30.

The collection stays the security boundary (I3); the panic button stays one
terms flip. API half is lane item A12; client half (serviceTerms entry,
uploadMedia targeting, resolveMediaRefs passing service) is
D-public-media-client.

Rejects: a blanket read whitelist on `media` (leaks DM/private-post
attachments — D30's media note keeps private media owner-only); a
`public: true` field inspected at presign time (per-record inspection, the
exact mistake D30 kills); proxying public media reads through the API (D14
already rejected the proxy for bandwidth cost).

### D34 — Follows are PUBLIC by default; the follow graph mirrors to the public ledger [decided]
This extends D32 to the follow graph. `followUser` (follows.ts) mirrors to
`/public/entries` with `payload.action='follow'` targeting the followed user —
the exact D32 pattern reactions/comments already use (unconditional; collection-
level terms is the lock; unfollow deletes the entry like `deleteComment`). The
follower count of any user reads from the ledger, not from cross-collection
reads (I3 forbids those). The `Follow` schema is registered alongside
`Reaction`/`Comment` in `feed.ts` DEFAULT_SCHEMAS. The persona seed script
backfills existing cross-follows into the ledger (idempotent, like 1.0.145).

WHY public: follower count is social proof — "a creator page without follower
count is not a creator page" (gauntlet step 6). The alternative (a dedicated
API endpoint aggregating across collections) would require changing the
discovery aggregation in `documentdb.py` to query every user's `follows`
collection, which is O(N) across users and defeats the purpose of the
inbox-pattern read model. The ledger is already O(1) per user.

The panic button is one terms flip: flip the `follows` service to owner-only in
the authenticator's terms editor, or stop mirroring new follows (the ledger
entries are coarse — they only carry username, not private metadata). The
collection-level boundary holds: the `follows` service itself remains
owner-only; only the aggregated follow event is public.

Rejects: a dedicated follower-count endpoint (O(N) across collections);
per-user follower counters on the star record (stale without write-through);
and keeping follows private (the gauntlet bar requires social proof).
The D-number namespace collided: "D21" meant three different things
(quotas, media polish, the studio M0 slice), lane D skipped "D20" to dodge
this file's D20, and D24/D26 mean different things here vs. the lane
queues. Parallel agents resolve references by grep — this was going to
cause a wrong-item pickup eventually. The call: decisions.md keeps the
bare D-nn numbers (32 entries, referenced throughout plan.txt — renaming
them breaks every live pointer); lane/board items use the slug convention
that already existed (D-comments-ledger, D-trending-*, now D-url-routing).
Legacy ticked lane items D21-D25 stay as history; the one-day-old lane
items "D26"/"D27" (23.07) were renamed D-profile-media-refresh /
D-url-routing before anything else referenced them. Never mint a new bare
D-nn lane item (parallel execution.txt rule 4). Rejects: renaming the
decisions (dozens of live references); a DEC- prefix (same churn, and the
short form is the heavily-cited namespace, so the short form goes to the
citations).

### D32 — Interactions (comments, reactions, reposts) are PUBLIC by default; collection-level terms is the lock [decided]
Comments are NOT DMs — they are public discourse attached to a post, not
private correspondence. So the `comments` service ships anon-readable (the
same anon-read whitelist `public_posts` already carries,
serviceTerms.ts:71), and `createComment` mirrors to the public ledger
(`/public/entries`) **unconditionally** — matching `createReaction`
(reactions.ts:35, already unconditional). The public ledger is anon-
queryable (`PATCH /public/entries` is anon-OK, public.py:42), so any web
visitor (the default anon user on any page) reads comments; the trending
feed's comment count (currently always 0 — see D-comments-ledger) goes
live. A second tap removes your reaction; a comment is owned by its
author (delete is author-only per public.py:82).

WHY collection-level, not per-post: this is D30 applied to interactions.
D30 rejected per-record visibility fields because "the permission layer
never looks inside the record" (decisions.md:55-59) — a `private` flag on
a comment cannot be enforced by terms, which key on the COLLECTION. The
earlier draft of D-trending-comments proposed gating the comment mirror
on the PARENT POST's visibility ("mirror only if the post is public") —
that is the same per-record-inspection mistake D30 already killed. If
`comments` is a public collection, the mirror is unconditional; the
lock-down is ONE terms change in the authenticator (flip `comments` to
owner-only), not a per-post branch in the write path.

Per-record permissions is a FUTURE decision, explicitly deferred. The
layered model the operator named (23.07): collection-level = authoritative
but lenient (public by default — one place to lock it all down); individual
POSTS can be configured more privately (public_posts/private_posts/
staging_posts collections, D30); comments/reactions/reposts ride their own
collection's default ("public") and do NOT inherit the parent post's
visibility. The panic button is the authenticator's terms editor — flip
the `comments`/`reactions` service to owner-only and the whole interaction
surface goes dark, server-side, for every post on the node at once.

Rejects the per-post-visibility-gate-on-comments draft I proposed. The
"reactions on private posts leak to the anon ledger" framing I raised is
NOT a bug under this decision — it is the design: interactions are public,
the collection terms is the boundary, and if you don't want interactions
on a private post to be public, you lock the `comments`/`reactions`
collection (one change), not each comment.

### D31 — App Store curation is ALLOWLIST, not takedown [decided]
D16's status note (parallel execution.txt, written 1.0.84) recorded the
operator choosing *takedown* ("a `removed` flag") over *allowlist* ("hide-
until-approved is the stricter optional mode — the operator wants takedown,
not allowlisting"). On 23.07.2026 the operator reversed that: "any app can
register, but i should be able to approve." So:

- `documentdb.register_app` now inserts new entries as `approved: false`
  via `$setOnInsert` (repeat visits bump visits without resetting the
  approval state).
- `db["web10"]["apps"]` records gain an `approved` boolean. Historical
  apps that predate the field arrive as pending (the field is absent) so
  the operator curates them once on first launch — no migration script,
  no auto-approval of legacy rows.
- `get_apps` filters `{"approved": True}`, so `POST /stats` (and the
  marketing-ui AppStore that reads it) only surface approved apps.
- Two new admin-only endpoints reuse `check_admin`: `POST /apps/admin`
  (lists all with a pending count) and `POST /apps/approve` (toggles).
  No `/apps/remove`/`/apps/restore` takedown verbs — unapproving IS the
  takedown. The authenticator's Node Config panel gained an "App Store
  Approvals" card next to the rest of the node's variables.

Rejects the "takedown over allowlist" half of the D16 status note. The
earlier D20 reversal (empty-catalog-would-read-jank → restore-the-store,
since A7 reconnected 208 real users + real apps) still stands; this is
the curation-model sub-decision one level below it. The Node Config panel
also gained the missing config vars (db_url, db_name, algorithm [read-
only, I1], Stripe subscription IDs, s3_use_ssl, logo paths) — and a
diff-based Save so untouched/stripped secret fields are never overwritten
with empty strings (closes the pre-existing "Save wipes secrets" bug).

### D30 — Content lifecycle is a COLLECTION, not a status field [decided]
A post's visibility/lifecycle is expressed by WHICH collection it lives in —
never a `needs_review`/`imported`/`draft` flag on the record. Three tiers,
each a service with its own terms: `staging_posts` (owner-only — imported or
drafted content awaiting triage, discovery ignores it), `private_posts`
(owner-only — deliberately private), `public_posts` (anon-read — public,
discovery-indexed). Publishing / changing visibility = MOVE the record between
collections (create-in-target + delete-from-source, body preserved); safe
because staged/private content is owner-only and unpublished, so no comment or
reaction points at it and the `_id` change breaks nothing. This extends the
existing public/private split (plan.txt:836) by one tier — not a new pattern.

WHY not a field: web10 gates access per-SERVICE. Terms records key on the
collection and cannot read a record's body, so a `needs_review` boolean
CANNOT enforce "only the creator can see this" — the permission layer never
looks inside the record. To make the boundary real you'd need a separate
collection anyway (for terms to bite), at which point the flag is redundant.
The collection IS the security boundary (I3). Bonus: no query pollution (no
surface filters `needs_review != true`), and bulk ops stay instant — "make
everything private" = change one terms record.

Media: blob access is real access control, not URL-secrecy — `POST
/{user}/read` runs `is_permitted(token, user, "media", "read")` then mints a
short-lived presigned GET (api/app/endpoints/media.py:74). `media` is a single
owner-only service, so staged/private media is creator-only, enforced
server-side. The corollary is a real task: because the gate is per-service and
coarse, PUBLISHING a post must also grant its audience read access to the
post's media (public media needs an explicit path — a public-media grant/tier
or a discovery-minted link); it is not automatic.

friends/unlisted deferred honestly: there is no friends graph to gate on yet,
so imported `friends`/`unlisted` content stages as private (safe default —
never auto-expose). `friends_posts` (graph-predicate terms) and `unlisted_posts`
(anon-read terms but excluded from the discovery index = "anyone with the link,
not discoverable" — the correct home for YouTube unlisted, which today
mis-maps to friends) are future tiers this model absorbs by adding a collection.

Rejects: `needs_review`/`imported`/`draft`/`staging` boolean fields on records
(can't gate access, pollute every query, mix triage state with real private
content — the "yucky" option). Prompted by web10-social shipping the
visibility split half-built: the composer sets no visibility (native posts
trap in private_posts, never reach the wall or public), while imports write to
the legacy anon-readable `posts` service (import auto-publishes your whole
history — the opposite of staging). D19 repairs the foundation then builds the
management layer on it.

### D29 — Product pride gates the board: the killer app first, infra parks [decided]
Operator call (22.07.2026): the deployed product is still a shell — the
pieces exist but the whole doesn't hold — while the board kept surfacing
infrastructure-company work (SDK rewrite, MCP, ux telemetry, provisioning).
Reprioritization: web10-social IS the product until further notice. Every
task is judged by one question: "does this make the social app something
the operator opens on his phone, in front of someone, and is proud of?"
The bar is THE GAUNTLET (plan.txt top): 8 end-to-end steps run from a
phone against dev, each encoded as a playwright journey as it passes.
Explicitly PARKED until the gauntlet passes: C2 SDK rewrite, C3 MCP,
C3.5 create-web10, D11 ux telemetry, E4 provisioning, E8 store submission,
docs/knowledge prose beyond fixes. This is D20 (platform first, protocol
second) enforced on the task board, and Priority Zero's successor — its
baseline chain (A7/B6/D16.1/D17) merged, but baseline was never the real
bar; pride is. Rejects: breadth-first lane rotation ("pull the top of any
unblocked lane"), which produced motion without a demoable product.

### D28 — Schema-registry public ledger for flexible interactions [decided]
A shared system collection `web10.public` holds structured public interactions
(reactions, ratings, endorsements, custom events). Any authenticated user can
write; anon can read. Entries reference a **schema** defined in `web10.schemas`.
Schema IDs are `provider.uuid6` — globally unique across federated nodes.
Schema authors can CRUD their own schemas; anyone can read and use them.
Payloads are validated against the schema on write. This gives infinite
flexibility (no hardcoded types) with structure (no schemaless chaos). The
social app caches schemas locally and registers defaults (Reaction, etc.) on
boot. Engagement counts are schema-agnostic: the discovery index aggregates
public ledger entries by `schema_id` and attaches them to post previews.
Rejects: hardcoded interaction types (limits flexibility), schemaless public
data (dev nightmare), blockchain/append-only (no utility for this use case),
and per-record visibility fields (terms + separate collections give bulk
control and per-app permissions for free).

### D27 — Posts are plaintext; visibility via separate collections [decided; e2e-DMs half superseded by D41]
Posts and comments are plaintext on the node by design. They are discoverable,
searchable, and sortable — the node reads content to power discovery feeds,
trending, and search. The `encrypted` field on posts/comments/reactions schemas
is dead weight for those services. (D41 extends this: there is no default e2e at
all — the node is readable by design, and the mobile encryptor that was to back
the DMs-only e2e tier is deleted. "Posts plaintext" here stands and is
reinforced.) The node is the honest broker: it enforces terms, never leaks.

Visibility is controlled by **separate collections**, not per-record flags:
`public_posts` (terms whitelist anon reads, discovery indexes it),
`private_posts` (terms block anon, discovery ignores it). Each collection is
a separate service with its own terms record. This gives bulk control
("make all posts private" = change 1 terms record, instant), per-app
permissions (App A reads public, App B reads both), and zero API filtering
overhead. The social app abstracts this from the user — a visibility toggle
routes to the right collection.

Discovery surfaces only what terms allow anon to read. Rejects: E2E encryption
for posts (blocks discovery by construction), per-record visibility fields
(requires updating N records for bulk changes, adds API filtering complexity),
and treating all data as equally private (the creator thesis requires
discoverability).

### D26 — SDK npm publish stays tag-gated; no auto-publish on merge [decided]
`cd.yml` publishes `web10-npm` to npm on a `v*` tag push (the `npm` job,
gated on `startsWith(github.ref, 'refs/tags/v')`). The operator asked whether
a version bump on merge to `dev`/`main` should auto-publish so the SDK stays
fresh. Decision: keep it tag-gated. Reasons: (1) the SDK is legacy wapi.js
(axios + peerjs, untyped) — the C2 typed rewrite is in flight; auto-publishing
the legacy surface at every merge would drown npm with versions nobody should
install; (2) npm provenance + `--access public` already works; the gate is a
feature, not a bug — it forces a deliberate release decision; (3) the SDK
package.json version (1.0.8) is decoupled from the repo's CHANGELOG versioning
(1.0.x) — auto-publish needs a version-bump step that currently doesn't exist.
When C2 lands, the typed SDK should either bump the major version (breaking
change: drop axios, drop peerjs from core) or publish as a new package name.
Until then, a `v*` tag is the right friction: publish when the SDK is actually
worth installing. Rejects: auto-publish on merge (drowns npm, publishes legacy
surface), and a version-bump-on-merge script (premature for a package about to
be rewritten).

### D25 — DB backend is per-env config, not baked; prod bootstraps on the host mongo [decided]
The node's DB is a config item (`db_url`/`db_name` in `NodeConfig`,
default `mongodb://ferretdb:27017`), and the backend is wire-protocol
compatible either way (documentdb.py speaks to real Mongo OR
FerretDB/DocumentDB — D3). So the DB hookup is chosen PER ENVIRONMENT,
never hardcoded:
- **dev = all-in-one.** The containerized FerretDB/DocumentDB inside
  the stack. Self-contained: one Portainer stack, its own volume,
  clean wipe+reseed (pairs with the C6 persona seed), dev/prod
  parity for everything except the data source. `docker compose up`
  works out of the box on the defaults — the local dev experience.
- **prod = bootstrap on the existing HOST mongo (A7).** It already
  holds the ~208 real users + the original app-store apps and runs
  natively on the box (not a container). Point prod's `db_url` at it
  (host gateway / LAN ip) to go live on real data with zero migration
  risk. This is a config change, not code.
- **eventual: migrate prod into the containerized documentdb** so
  prod is ALSO self-contained + license-clean. Two reasons it
  shouldn't stay on host mongo forever: (1) SSPL — the whole point of
  D3 was that MongoDB's license is a problem for the node-operator
  model; the flagship prod node running real Mongo re-introduces it;
  (2) the host mongo is outside the stack lifecycle (separate backup,
  no compose record). Path: `mongodump` host → `mongorestore` into the
  container (plan.txt already lists the mongo→ferretdb migration),
  then flip `db_url`. Data-only, no app change.

Where config lives: IN THE DB, WordPress-style (wp_options in mysql).
`web10.config` holds the node config doc (`_id:"node"`, `{body:{...}}`),
`web10.jwt_keys` holds the signing keys — `api/app/services/config.py`.
Not a flat file on the data volume (older plan wording said "data
volume"; the real store is the db collection).

The ONE exception, by necessity: **`db_url` itself can't live in the
db** — chicken-and-egg, you need the connection string to reach the db
that would hold it. So `db_url` is bootstrapped from env/stack config
(compose `DB_URL` → `settings.DB_URL` → the pymongo client), and
everything else (provider, policy, S3, stripe/twilio, branding) lives
in `web10.config` and is editable in the panel. This is exactly why
`ConfigUpdate` omits `db_url`/`db_name` and `SetupRequest` takes them
as a bootstrap input — it's architecturally correct, not just a
guardedness choice (and it happens to also be the safe default, since
repointing a live node's DB swaps its whole data identity).

Corollary — the WordPress-style first-run: a node boots into a setup
wizard + config panel where an operator CAN set everything (provider,
DB, S3, policy, stripe/twilio, branding — `NodeConfig` already models
all of it) but sane DEFAULTS mean `docker compose up` just works for a
dev.

### D24 — design.md §3 correction: `web10-social/public/alternative.png` was never the keys mark [decided]
D12 (web10-social level-up) and D13 (marketing-ui rebuild) independently
discovered the same bug while paying the asset debt design.md §3 queued:
`marketing/web10-social/public/alternative.png` — the file design.md's
canonical table names as "the keys mark alone, white on transparent" — is
actually an unrelated line-art illustration of a person playing guitar.
White-on-transparent on a white background renders blank, which is why it
went unnoticed. Decision: derive the real square mark from the existing
lockup (`marketing-ui/public/brand/logo-lockup.png`, formerly
`layouts/images/logo_white.png`) by cropping the keys glyph to its bounding
box and padding to a square — "from existing files," not a redrawn
approximation. D13 generated `.context/brand-assets/` (keys-mark-source-
transparent.png, icon-192/512.png and favicon.ico composited on `#09090b`,
apple-touch-icon.png) for B5 and D12 to apply inside their own directories;
D12 applied them in `marketing/web10-social/public/` (replacing
`alternative.png`, `logo192.png`, `logo512.png`, `favicon.ico`, adding
`apple-touch-icon.png`). design.md §3's table still names `alternative.png`
as the canonical square mark — that entry is now correct again in content,
but the file's provenance (derived crop, not vectorized) should be updated
there by whoever next touches design.md's asset section. SVG vectorization
remains unpaid debt (no bitmap-tracing tool was available in-sandbox).
Rejects: shipping the guitar illustration knowingly mislabeled, and
inventing a new mark from scratch (design.md explicitly forbids this).

### D23 — One design language, dark-first violet, design.md is the law [decided]
The three frontends had drifted into three styling worlds (ui/: light-first
blue Tailwind + inline styles; web10-social: dark shadcn violet; marketing-ui:
Bulma with hardcoded hex), the "shared tokens" existed only as a comment, and
the repo shipped boilerplate as brand — the React atom as logo512.png and
Apple's App Store glyph as hub.png (a trademark problem, not a taste problem).
Decision: a single binding standard, `design.md` at the repo root, that every
agent must read before touching any user-facing surface (gated in CLAUDE.md +
AGENTS.md). Its calls: dark-first everywhere (the only real logos are
white-on-transparent; the creator world — Kick/Twitch/OBS/Discord — lives
dark; D20's bar is Kick/Twitch-grade slick); brand accent is the violet
already in web10-social (#8b5cf6 on zinc #09090b); canonical marks are the
keys lockup (`marketing-ui/.../logo_white.png`) and square keys mark
(`web10-social/public/alternative.png`) — files named `logo*.png` are NOT
logos and get purged; type is self-hosted Inter (UI) + Space Grotesk
(display) + JetBrains Mono (code), never Google-CDN'd; tokens are one
Tailwind v4 @theme block (design.md §13) copied verbatim per app; marketing-ui
migrates off Bulma entirely (already rejected in D22); quality is enforced by
the screenshot test + PR screenshots (desktop + 375px) in design.md §12.
Rejects: per-app palettes, light-first defaults, a shared npm package for
tokens (premature — verbatim copies with a sync header), FontAwesome (CDN
kit = privacy leak; Lucide only), and treating brand assets as "just images"
— shipping someone else's trademark is a legal bug.

### D22 — UI stack: Tailwind CSS + shadcn/ui, replacing rectangles-npm [decided]
rectangles-npm is a homemade layout framework only one person understands;
uis built on it read as engineering prototypes, not products. The replacement
must be boring and mainstream so any frontend dev can contribute, and it must
be themeable from day one because creator nodes wear their brand (phase 4
white-label). Tailwind CSS + shadcn/ui is the pick: native to our Vite +
React 19 + TypeScript toolchain, huge ecosystem, accessible Radix primitives,
CSS variable–based theming (creator branding = swapping CSS vars), and the
design-token layer maps directly to Tailwind's `tailwind.config.css`. The
shared tokens (type scale, spacing, color, radius, dark mode) live in
`ui/src/styles/tokens.css` as CSS custom properties consumed by both the
node's `ui/` and `marketing/web10-social/` (D2.5). Rejects: CSS-in-JS
(emotion/styled-components — runtime cost, SSR headaches, another abstraction),
Bulma (the old vendor we're already ripping out), and any framework that
requires a build-step for theming (creator themes must be hot-swappable CSS
vars, not rebuilds).

### D2.5-stack — web10-social: tailwind v4 + Radix UI + Lucide icons [decided]
B2.5 had not merged when D2.5 started, so the stack pick was made independently
in web10-social. Tailwind CSS v4 (native PostCSS-free, @theme directives),
Radix UI primitives (react-slot, react-avatar, react-dropdown-menu, react-label),
Lucide React icons, class-variance-authority for component variants, clsx +
tailwind-merge for className composition. Dark-first design tokens matching
the existing dark theme. rectangles-npm and @chatscope/chat-ui-kit retired
from web10-social. When B2.5 merged, web10-social was already on the same
stack (tailwind + shadcn was the named default in plan.txt). Rejects: keeping
rectangles-npm (one-person framework, reads as engineering tool not product),
keeping @chatscope (heavy, opinionated, incompatible with the new design
language), waiting on B2.5 (M0 timeline doesn't allow it).

### D21 — User billing is stripped; metering survives as operator-set quotas (anti-abuse), and the money screen is in M0 [decided]
Users are never charged (D5: accounts free, paid by the operator's revenue),
so the legacy per-user billing surface (plans, user subscriptions, per-account
Stripe) is stripped from the product. The metering machinery it rode on
(credits/space, `charge()`, the star-record ledger) is NOT deleted — it is
repurposed as node policy: operator-set per-user quotas, where credits =
rate/abuse throttle and space = storage caps (which also solves the
import-storage-lands-on-the-creator gap). Stripe remains for the creator
economy only (memberships, rails, marketplace). Second half of the decision:
the Studio's monetization-menu screen (the rung-0 cards — memberships,
Amazon tag, direct deals) is an M0 deliverable, because the pitch to
creators is money and the demo video must SHOW the money screen, not
describe it. Rejects: charging end users anything, deleting the metering
code (it's the quota system), and shipping an M0 demo whose economics are
a slide instead of a screen.

### D20 — The proposition is creator ownership + no shadow ban; the killer app stands on its own; lens/customizability cut to later.md [decided]
This is a product for influencers, and largely a story business. The pitch
("THE STORY" in plan.txt) has to land as "oh shit... this is the only way":
(1) you already don't own your audience — 1M subs and the video does 300k;
subs are not delivery, and the reach gap IS the shadow ban, visible in your
own analytics; (2) urgency — AI influencers are arriving in volume and the
algorithm has no loyalty to humans; own your persona and channel NOW;
(3) ownership is the only structural defense: the inbox pattern (fan-out on
write) delivers to 100% of followers BY ARCHITECTURE — it can't be quietly
revoked because it isn't a policy; (4) it's a hedge, not an exodus — the home
base is owned, platforms become distribution; (5) it must be THE COOL THING:
Kick/Twitch-grade slick, never fediverse jank (PeerTube, even Mastodon) — if
it looks like a protest app, the pitch dies on the first screenshot.
Consequences: the killer app must stand on its own as a plain good social app
(post, feed, DMs, media); the feed is chronological + a sort dropdown — "no
algorithm" IS the feed feature and costs zero code beyond the inbox pattern.
Feed customizability, preset lenses, the lens record, and the LLM chatbox are
cut from the roadmap to later.md (<5% of users touch settings; retention
comes from defaults; "the customizable social network" was Ello/Vero's pitch
and it doesn't travel). M0's kill test becomes twenty creator pitches, not a
viral consumer video. D19's BYOK architecture stands ready if the chatbox
earns its way back (promotion bar in later.md). Rejects: "own your algorithm"
as the lead pitch, feed customizability as a launch feature, the
consumer-demo wedge as primary distribution, and fediverse-adjacent
positioning/aesthetics.

### D19 — Chatbox LLM is BYOK-only; the key is a wallet secret the phone beams to chosen apps [superseded by D41]
The phase-8 lens chatbox never runs on operator-paid inference by default: a
free-signup node exposing a server-side LLM endpoint is a free API proxy, and
the abuse lands on the operator's bill — exactly the surprise cost that kills
hobbyist self-hosting. v1 is bring-your-own-key, held client-side
(localStorage) and calling the provider directly from the browser, so the
node never sees the key or the conversation. Presets (chronological, detox,
close-friends) need zero LLM, so the "own your algorithm" pitch works without
a key. Phase 11 graduates the key into the phone wallet: an e2e-encrypted
record (ciphertext on the node, portable like everything else) that the phone
beams only to the web10 apps the user picks at provisioning — the keyring's
`agent:lens-llm` naming already anticipates this (D18). True revocation is
rotating the key at the provider; device revocation only stops future
provisioning. Node-provided inference may return later as an operator OPT-IN
with hard per-user caps, never the default. The LLM's web10 token stays
scoped to the lens service regardless (I5) — who pays for inference is
independent of what the token can touch. Rejects: operator-pays-by-default,
proxying chat through the node, storing the key as a plaintext record, and
routing every chat call through the phone (D15: the phone is the root of
trust, not a proxy).

### D18 — The keyring is generic like the record model: named keys, a small closed verb set [superseded by D41]
The same discipline that made `{service, body}` survive: no hardcoded schema.
Audiences are user-named keys (any string — a circle, a single record, an LLM
agent, an HLS stream), minting is one cheap call (HKDF from the master seed),
and principals are **public keys, not usernames** (humans bind on top via the
key manifest + signatures), so grantees can be friends, devices, agents, or
things that don't exist yet. One composability rule does the heavy lifting:
wrap targets are pubkeys OR other named keys — which makes membership, nested
circles, and backup (seed wrapped under a passphrase key) the *same verb*.
The verb set is small and closed: mint / rotate / wrap / unwrap / encrypt /
decrypt / sign / verify / list / handout; revoke is a **composition**
(terms-drop + rotate + rewrap), not a primitive. Everything the keyring
persists is an ordinary `{service:"keys"}` record, so terms/CRUD/portability
apply unchanged and the node grows zero key-specific endpoints. Every wrapped
blob carries `{v, suite}` ids for crypto agility. Scope guard: keys do keys,
not policy — no roles or ACL language inside grants; authorization stays
terms (node) + possession (crypto). A futureproof checklist in plan.txt
phase 11 gates the design review. Rejects: enum'd circle types,
username-bound grants, a backup-specific subsystem, unversioned wire formats,
and a policy DSL inside the keyring.

### D17 — Crypto suite is pinned to boring standards; no blockchain, no invented crypto [superseded by D41]
E2E encryption (phase 11) assembles existing, audited primitives: X25519 +
Ed25519 (identity/devices, HKDF-derived from one master seed), HPKE (RFC 9180)
for wrapping keys to people, XChaCha20-Poly1305 for content, Argon2id for
passphrase-wrapped backups, and Signal-style QR safety numbers for optional
verification. MLS (RFC 9420) is the pre-chosen graduation path when group
size/churn outgrows pairwise wraps. Explicitly rejected: anything web3-shaped
(chains, tokens, "decentralized key registries"), hand-rolled ECDH (the
secp256k1 experiments in `sdk/src/wapiencrypt.js` are a seed, not a
direction), and cryptographically self-expiring keys (without trusted
hardware on every reader they don't exist — timed access is the node's job,
see D16).

### D16 — Revocation is layered: node gating (instant) + epoch rotation (forward) [superseded by D41]
Sharing is by **audience keys with epochs** — a symmetric key per circle per
epoch, HPKE-wrapped to each member's public key and stored as a signed,
terms-gated **grant** record in the owner's collection. Revoking someone is
two enforced layers plus an optional third: (1) node layer, instant — terms
drop them, so they can't fetch ciphertext or presigned URLs anymore; (2)
crypto layer, forward — bump the epoch, rewrap to everyone-but-them, so all
future content is unreadable to them even if they obtain ciphertext; (3)
optional lazy re-encryption of history. Epochs are independent random keys
(a derivable hash chain would let old epochs compute new ones). Timed access
= an `expires` field on the grant, enforced by the node's `is_permitted`
machinery + 30–60s presigned URLs (D14); the sensitive tier (live handout
from the phone) gives true real-time control. Honestly stated limit: no
system can make someone un-know a key or unsee content they already
downloaded — Signal/WhatsApp/MLS rotate forward rather than pretend, and so
do we. Rejects: per-friend-per-post wrapping (no revocation unit), DRM-style
expiring keys, and re-encrypt-everything-on-every-unfriend as a requirement.

### D15 — Multi-device: phone is root of trust, companions are linked, traffic never proxies through the phone [decided]
The WhatsApp Desktop model. The phone (wallet) holds the master seed and
identity key; a laptop generates its own device keypair and is provisioned
ONCE over a P2P WebRTC channel (QR pairing secret so the rtc signaling
server can't MITM; rtc stays untrusted by construction). The phone signs a
**device cert** {device pubkey, id, expires} with the identity key and syncs
current audience keys — after linking, the companion encrypts/decrypts alone.
Day-to-day reads/writes on a laptop never route through the phone; the phone
is only in the loop for root operations (link, revoke a device, epoch bumps,
live-handout tier). Device revocation = signed revocation in the key
manifest + epoch bump; any linked device can bless a replacement phone, so
lost phone ≠ lost life. Rejects: phone-as-proxy for all traffic (kills
availability and battery, the original phase-11 sketch implied it), and
server-side device provisioning (node could insert readers).

### D14 — Media reads use per-request presigned URLs with tight expiry [decided]
S3-class stores can't express the terms model per object (bucket policies are
bucket-level, object ACLs are coarse and deprecated). Rather than proxy every
media read through the API to get live terms enforcement, the media service
checks `is_permitted` **at issue time** and returns a presigned URL that is
issued fresh on every read, expires in 30–60 seconds, and is logged on
issuance. This consciously accepts a gap: a presigned URL is
check-once-then-open until expiry — terms revocation inside that window is
not enforced. The window is the safety net, and it's tiny. Rejects: streaming
all blobs through the API (node becomes a media proxy — bandwidth and scaling
cost); a per-request auth proxy in front of S3 (rebuilds the media CRUD
surface we're avoiding). If a real threat model demands live revocation
later, the proxy option remains open as a tightening, not a redesign.

### D13 — Media fits the record abstraction; "service" stays the namespace [decided]
`/{user}/{service}` keeps meaning "a data namespace in the user's collection"
— it is not a running service, and media does not change that. The media
service (a literal running service) gets no new URL hierarchy: uploads and
reads are gated by the same `is_permitted` machinery against
`service="media"`, and each blob's metadata is an ordinary
`{service:"media", body}` record in the owner's collection, so terms/ACLs,
portability, and the user-owns-the-policies story apply to media with zero
new concepts. Rejects: restructuring URLs to `/{user}/{service}/{collection}`
(breaks every existing route and app for a naming itch); renaming "service"
(same churn, no capability gained). If the namespace word still grates later,
that's a docs/glossary fix, not an API fix.

### D12 — Repo trio: api / ui / marketing/marketing-ui; docs live in marketing/marketing-ui [decided]
`home/` + `docs/` merge into **`marketing/marketing-ui/`** — web10 Inc's website as one
site (landing + dev docs, one build), because docs are a key part of a SaaS
marketing site. With phase 2's auth2→`ui` rename, the repo reads clean:
`api` (the node), `ui` (the node's admin/consent surface), `marketing/marketing-ui`
(Inc's site). Everything stays in this monorepo by choice — one dev, atomic
commits — multi-repo is a later option, not a goal. Doc surfaces split three
ways: generated OpenAPI ships with the api (every node self-documents),
protocol spec + conventions stay in-repo as versioned markdown/JSON Schema
(the conformance suite tests those files), the rendered docs site is
presentation inside marketing/marketing-ui (js-native framework: Starlight or
Docusaurus). Rejects: docs inside the node's `ui` (ships Inc's content with
every node); hosted SaaS docs (off-message for a self-hosting product);
separate marketing/docs repos now.

### D11 — Killer app is first-party, in this repo (not a separate repo) [decided]
The social app is the **default lens**: it ships with every node, renders the
operator's ad slots, and embodies the conventions doc. Building it is how the
protocol (aggregate, inbox, lens record) gets discovered, so schema+api+sdk+app
need atomic commits. Lives in `social/`. Demo apps (crm/mail) → `examples/`,
kept in-repo but out of the default compose. Third-party apps stay external —
that's the protocol working. Rejects: apps-in-a-separate-repo (breaks atomic
protocol changes and denies the node a built-in experience).

### D10 — Anti-abuse (phone requirement etc.) is node policy, not hardcode [decided]
Hardcoded phone-required signup is extreme for a small node, reasonable for a
huge one. Signup gates (open/invite/approval/beta/email/captcha/phone) become
a per-node config in the setup wizard + admin panel. Recovery must not assume
SMS. Rejects: one global abuse posture baked into the code.

### D9 — Developers get sandboxed aggregation, not just 4 CRUD verbs [decided]
4 CRUD ops is too weak to build real apps on. Mongo queries are structured
JSON (not string-injectable), so allow (nearly) the full query language and
make it safe by: prepending `$match{service}`+`$replaceRoot` so pipelines
can't escape scope, allowlisting stages, denylisting JS-exec and
cross-collection stages, and capping resources. Rejects: staying at 4 verbs
(bottleneck), and raw unrestricted queries (injection/scope-escape risk).

### D8 — Security invariants are end-to-end and machine-enforced [decided]
Five invariants (I1–I5 in the v3 KB) must hold every phase; the conformance
suite tests them so they can't silently rot. Prompted by finding the
federation bug (D7). Rejects: security as a one-time checklist.

### D7 — Federation switches HS256 → RS256/EdDSA + JWKS [decided, in-progress]
CONFIRMED BUG: with symmetric HS256, providers can't verify each other's
tokens, so the code trusts a token's own unsigned `provider` claim + a bare
remote 200 (spoofing + SSRF). Fix: asymmetric signing, per-node keypair,
public keys published at a well-known JWKS URL, offline verification — the
OIDC model. Dual-verify during migration, then drop HS256. Rejects: the
call-the-remote-and-trust-200 scheme.

### D6 — E2E encryption: phone is the keychain, two modes [superseded by D41]
Node stores ciphertext; keys live on the user's phone (secure enclave).
Default **wrapped-key mode** (keys wrapped to each friend's pubkey, stored;
friends decrypt without your phone online — scales to thousands of friends).
**Live-handout mode** (key handed out P2P per read) for the sensitive tier.
Key backup is passphrase-wrapped and escrowed with a party separate from the
node (**trust splitting**). Rejects: server-side key custody; phone-online-
required-for-every-read as the only mode.

### D5 — Monetization: influencer nodes, free accounts, 3% rail [decided]
Creators run nodes and monetize (sponsorships/routing); marketing revenue
subsidizes free user accounts; web10 takes ~3% of revenue flowing through its
rails (Square-like, in-the-flow-of-funds, not a self-reported license). Ads
are operator-owned records — curated by architecture; works at audiences of
100 (affiliate/direct) before any ad network. Rejects: user subscriptions as
the primary model; programmatic ad networks as the foundation.

### D4 — Positioning: "WordPress for social media/streaming" [decided]
Open self-hostable software + a managed-hosting/rails company (the Automattic
shape). The customer is the creator/publisher, not the end user — sovereignty
rides along invisibly. Rejects: leading the pitch with crypto comparisons
(early web10 framing).

### D3 — DocumentDB/FerretDB as the open DB backend [decided]
Keep the Mongo document model + wire protocol (load-bearing: web10's API IS
Mongo query syntax), but support FerretDB/DocumentDB so nodes aren't tied to
MongoDB's SSPL (a real risk for the node-operator business). pymongo connects
unchanged; mostly a `DB_URL` change. Atlas stays a supported option. Audit
`collstats`/`dbstats` (metering) on FerretDB. Rejects: relational stores
(force a central schema — impossible here); Mongo-only (license risk).

### D2 — Modernize the toolchain first (phase 0) [decided]
Stack is ~2019 (FastAPI 0.68, pydantic 1, PyJWT 1.7, React 16/CRA, no TS,
913 dependabot alerts). Move to uv (python) + Bun/Vite/TypeScript (js) before
building features, so everything lands on modern ground. Rejects: building
new features on the old stack.

### D1 — Parallelize execution into 4 lanes for Conductor [decided]
Work splits into api / ui / greenfield-services / docs-apps-mobile lanes with
directory ownership, fed by a wave-0 test seatbelt. See `parallel
execution.txt`. Rejects: linear single-branch execution (too slow for the
scope).
