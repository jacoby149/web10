# decisions.md — why the big calls were made

A lightweight decision log (ADR-style). Each entry: the decision, why, and
what it rejects. Add to the TOP as new decisions land. This exists so
parallel agents and future-you don't re-litigate settled questions. Details
and task breakdowns live in `plan.txt`.

Status legend: [decided] intent set · [in-progress] · [open] still debating.

---

### D53 — Discoverable groups: a `discoverable` boolean lists a group in the directory; `anon` membership controls whether its posts are anon-readable [decided]
Operator, 27.08.2026 — "would be cool if groups were in some kind of
directory like the app store, groups have that too, where you can see groups
that are readable by anon, kind of a thing not totally sure how" — then
"this needs to be planned out better in the knowledge base, this discoverable
groups, good thing it isnt totally essential." — then, on the first draft
(which equated discoverability with `anon` membership): "idk, shouldnt the
groups discoverability be a different boolean? that it is on this groups
directory?" — then, on implementing it: "lets implement it discoverable by
default." — then, on the detail: "no 404… like you said governed by the
policy, it is just if the group is blasted is the discover. kind of like
unlisted youtube video." — then, on the directory shape: "the apps can go
crazy with it, enriching the minimal thing… the group dir could be joined
with the .query to the social group identity service stuff and then the
search could happen, making it more flexible."

**Decided** —

1. **Two controls, two decisions.** Listing a group in the directory and
   letting a reader read its posts are *different* decisions, so they get
   *different* controls:
   - **`discoverable`** — a boolean on `group_contracts`, owner-set.
     **Defaults to `true`** (discoverable by default, per the operator) —
     *except* `invite_only` groups, which default to `false` (inherently
     private: DMs, private circles), and the node-default discover group,
     which is explicitly `false` (a board, not a directory entry). It is a
     **blasting** flag — it controls **listing only** (whether the group is
     advertised in the directory). It never gates the detail and never gates
     content.
   - **membership** — on `group_members`. Controls **content readability**:
     a reader with `readAll` on the service sees the group's posts.
     Independent of `discoverable`. (For the anon reader specifically, this is
     "`anon` is a member.")
2. **They are orthogonal — the discover group is the proof.** The node-default
   discover group (3.16.2) is `anon`-readable (it is the public board) yet is
   *not* a directory entry (it's a board, not a community). So it is
   `discoverable: false` + `anon` member. Equating the two would force a UI
   fudge to hide the board from the list; the boolean makes it a non-case.
3. **The directory is a minimal, canonical view.**
   `GET /v3/groups/directory` (no token) returns the `discoverable = true`
   groups as a **minimal list**: id, name (identity record, else slug), owner,
   join policy, member count, permission summary. **No tags, no banner, no
   description, no posts** in the minimal list — apps enrich it. It is a
   **view** over existing data (`group_contracts` ⋈ `group_members` ⋈
   `group-identity-service`), **not** a dedicated `group_directory` table:
   apps are external entities with a node-side lifecycle (hence the `apps`
   table); groups are core internal entities that already have their
   structures, so a directory table would duplicate the identity data.
4. **The detail is a flexible, principal-based read — unlisted-model.**
   Reading a group by ID is **not** gated by `discoverable` (like an unlisted
   YouTube video: not in the browse, but open if you have the link). It takes
   a token (optional) and reads as that principal (`user_or_anon`): metadata
   (contract, member count, identity) is always returned for an existing
   group; **posts are returned only if the *reader* is a member** (I3), else a
   "join to view posts" state. **Only a non-existent group 404s** — a
   non-discoverable group does *not*. This is the flexibility: any app can
   grab any group it has a principal for. Full model: `groups/detail.md`.
5. **Display metadata + tags live in `group-identity-service`.** One
   documents record per group — name, description, banner, avatar, website,
   **tags** (the topic). Append-only, managed by the `page-curator` role
   (designed in `groups/identity.md`). It is the single home for group display
   metadata; the directory, the detail, and every app read it from here.
   `group_contracts` carries no name/icon — the slug is the fallback.
6. **Topic search is a composition, not a node-baked filter.** The node
   provides the minimal directory + the queryable identity docs; apps join
   them (e.g. `directory` ⋈ `query('group-identity-service', {tags: …})`) to
   search by topic. A server-side `?tag=` filter is a possible future
   optimization that shortcuts — never replaces — the composition.

**Why:** "readable by anon" and "on the directory" are two decisions, and the
discover group proves they come apart. The boolean separates them cleanly:
listing is an owner choice about *visibility* (a new field, default on —
discoverable by default), readability is a *membership* permission (the
machinery that already enforces I3 for every other member). I3 still holds end
to end — the directory exposes only metadata for groups that are listed, and
the detail returns posts only to a reader who is a member. The default-on
choice matches the node-readable-by-design stance (D41) and the
public-by-default posts: a new group is findable unless its owner (or its
`invite_only` nature) says otherwise. The detail is deliberately *looser* than
the app store's (which 404s unapproved apps): a group's content is already
membership-gated, so the detail is a principal-based read any app can use for
any group — unlisted-model, like an unlisted video. And the directory stays
minimal (a view, not a table) so apps can enrich it and compose topic search
themselves. This is the groups analog of the app store (D47/D49/D52): a
public, anon-browsable store surface where the listed thing (a group) is
identified by its URL and read through the same permission-gated read path
everything else uses.

**Rejected:** equating discoverability with `anon` membership (the first
draft — conflates listing with readability; the discover group needs a UI
fudge; can't express "listed but content-private"); a **constrained detail**
(404 for non-discoverable groups, posts only for `anon` — the second draft:
uses a *listing* flag to gate *reachability*, and blocks a signed-in member
from reading their own group through it); listing all `open`-join groups
(leaks the existence of groups that are open-to-join but not meant to be
publicly browsed, and conflates "can join" with "is listed"); a dedicated
`group_directory` table (duplicates the identity data that belongs in
`group-identity-service` — two sources of truth; the `apps` table precedent
doesn't transfer because groups are core internal entities, not external
registrations); a node-baked `?tag=` search filter (freezes the search shape
into the node; composition keeps it flexible); a separate discovery index
(the discover group proved discovery IS a group read — D40); a dedicated
opt-in endpoint (the boolean is set through the existing group-update path).
The "List in directory" toggle is a UI convenience that sets `discoverable`
**and** adds `anon` for the common case — it is not a new primitive.

**The one honest cost:** the boolean is a second source of truth, and it can
diverge from membership (`discoverable: true` but `anon` not a member). That
divergence is not a bug — it is the "listed, join to view" state (item 4).
The only real hazard is a group that is listed but whose owner *expected* it
to be readable; the detail page's "join to view" state makes that visible
instead of silent.

**Not essential now** (operator): planned, not urgent — gated behind the
social app's community surface (the directory is the browse surface; the
join/engage flow lives in the app).

Full model: `knowledge-base/web10-v3/groups/discoverability.md` (the
directory + the flag) and `knowledge-base/web10-v3/groups/detail.md` (the
flexible by-ID read).

---

### D52 — App store product page: the detail endpoint is keyed by the app's URL; `web10apps_post_id` is retired [decided]
Operator, 26.08.2026 — "in the apps would be cool if there was a little
button that said to see more … it expands, has a deeper paragraph
description from the manifest, and then has ALL the available stats, the
90d users, the visits, the 30d users, you get what i mean, everything in
one screen, and the apps reviews comments kind of thing" — then "clicking
the tile opens this modal or whatever it is" — then "in the knowledge base
we need to talk about how the app store is going to work, it will need its
own endpoints."

**Decided** —

1. **The product page is a page, not a modal.** The existing
   `/app-store/app/:id` route (PR #426) is the surface. Tap tile → page;
   the Open button → launch. Deep-linkable and shareable — the address bar
   is part of the product. A modal with no URL state is a review rejection
   per the deep-link rule, and it is cramped for "everything in one
   screen."
2. **A new `GET /v3/apps/detail?url=` serves the page.** Public, pure
   read, one call: app + rating aggregate + rating list + the full
   five-metric breakdown + the node macro. **No visit bump** — a
   product-page view is not an app visit; `app_visits` rows come only from
   SDK pings carrying a verified token (D49). D49's item 5 assigns the
   detail page the full breakdown ("the grid card shows the headline, the
   app detail page shows the full breakdown") — this spec is what that
   line points at.
3. **The URL is the key.** D47 made the full URL the app's identity
   (canonical form, D49 hardening #4); the detail endpoint keys on it, and
   `web10apps_post_id` is retired (v2 vestige — the `#web10apps` discovery
   ledger, dropped in v3; the v3 `apps` table never had the column;
   `list_store_apps` still blanks it to `""` for the UI; the UI route
   param becomes the URL-encoded canonical URL).
4. **Reviews are a rating with words.** `app_ratings` gains a `comment`
   column; one voice per author (dedup key `(target_app_id, author)`),
   latest wins, no history. No separate reviews table.
5. **The page shows D49's metric set, not an invention.** Per app:
   `visits`, `users_1d`, `users_30d`, `users_90d`, `users_1y` — the same
   realtime queries over `app_visits` the grid uses (`get_app_metrics`,
   exact `countDistinct`). Node context: the `/v3/stats` macro (users,
   app_count, active_users, storage). No consent-based user count
   (`app_contracts` holders) — D49's metric set is the store's number, and
   consent is a separate trust surface, not a store metric.

**Why:** the product page was built (PR #426) against a phantom endpoint
(`PATCH /discover/app/{id}` — no such route in the API, so every page 404s
into "App not found") and a blanked ID (`list_store_apps` sets
`web10apps_post_id: ""`, so the card never takes the internal-Link path
and the tile opens the site directly). The root cause is an identity gap:
the UI wanted a short ID for the route, but the store's identity is
already the URL. Keying on the URL deletes the gap instead of papering
over it with a second ID system.

**Rejected:** a modal (no URL state — review rejection; cramped for the
full stats + reviews layout); a "see more" expander on the card (a third
tap target on a small tile; inline expansion breaks grid row alignment); a
parallel ID for the route (post_id / slug / numeric — D47: the URL is the
identity, a second ID system is drift by construction); a separate
`app_reviews` table (duplicates `app_ratings`' dedup semantics); a
consent-based user count on the page (muddies D49's metric set — consent
≠ usage).

Full model: `knowledge-base/web10-v3/app-store/endpoints.md`.

---

### D51 — Ad dissemination is a per-creator setting; curation is a shared SDK helper [decided]
Operator, 26.08.2026 — building on D50: "i am pulling feed, or something, you can use
clickhouse join feed with arbitrary ads per user, so you pull posts per your feed,
with the ads from your users. OR posts in the feed can directly reference an ad";
"can have ad algorithms, round robin, greedy, idk maybe all kinds of different ad
things. in the settings for ads for creators on how their ads get disseminated";
"the pick happens per creator! each creator chooses! their ads are curated
accordingly."

**Decided** — (1) How a creator's ads get mixed into a viewer's feed is a
**per-creator choice**, not a platform decision. Each creator sets how *their
own* ads rotate to *their own* audience (ownership, not an ad network). No
global algorithm, no per-viewer logic: for each followed creator, the feed
curates that creator's ads per that creator's setting. (2) **The setting** is a
field on the creator's `settings` doc: `dissemination` = `round_robin` |
`greedy` | `pinned` | `frequency_capped` (+ params like `cap`), chosen in the
Partner Links card. (3) **The feed + ads join** is one ClickHouse query — the
feed read with `collection_name IN ('posts','ads')` over the viewer's groups
(ads and posts are the same table, same group delivery). A post can also `ref`
an ad directly (`ref_value`), so a post can be the ad, carry one, or link to
one. (4) **The curation is a shared SDK helper** (`curateAds(creatorAds,
creatorSetting)`), not SQL — the stateful algorithms (round-robin's "last
shown," greedy's performance weighting) don't belong in a query. The server
serves the per-creator ads + setting (a plain read); the helper deterministically
orders the subset to show, so every app curates a creator's ads identically.

**Why:** the pick being per-creator keeps it thesis-aligned — the creator
controls their own ad mix, the platform never injects or auctions. And because
ads + posts are the same table with the same delivery, "feed with ads" is a
query filter, not a new subsystem. The SDK-helper split (server serves, helper
curates) gives cross-app consistency without stateful ClickHouse logic.

**Rejected:** a platform-side ad auction/injection (that's the v4 exchange
layer, the paved model — D50's two-layer note); encoding the curation
algorithms in the feed query (stateful round-robin/greedy is awkward in SQL and
couples curation to the read); a per-viewer dissemination (the setting is the
creator's, applied to their ads — not the viewer's).

Full model: `knowledge-base/web10-v3/social/ads.md` (the Dissemination section).

---

### D50 — Ads are a v3 default service, creator-owned; the rung-0 card is "Partner Links" [decided]
Operator, 26.08.2026 — the Studio's rung-0 monetization screen showed
"Memberships & Tips" + "Amazon Associates" (+ a Direct Deals card).
Operator: "direct deals and affiliate link are the same kind of right?" —
collapse them; "people should upload HLS videos, photographs, some kind of
web10 social style content, with a custom affiliate link, doesnt need to be
amazon affiliate link"; "there needs to be a standards ad object that holds
ad data that is in the web10 docs, then the social app or any app can pick
up the ads per user to display them! clickhouse is great for this"; "ads
would be a default service, web10 users manage that they put their ads
into! scoped to them!"

**Decided** — (1) The rung-0 card "Amazon Associates" + "Direct Deals"
collapses into one card: **Partner Links**. They are the same primitive — a
link that pays the creator when someone clicks and buys. The counterparty
(Amazon, a brand the creator DM'd, the creator's own store) does not change
the shape, so one card, one object, `offer.kind` = `affiliate` | `direct` |
`own_store`. (2) **An ad is a document in the `ads` default service** —
`collection_name = 'ads'`, `author_key` = the creator. It is content (a
video, a photo, a post) that carries a monetizable link (the offer). The
creator owns it, scopes it to their followers group, and it is delivered by
architecture (100% of followers) — the same delivery as a post. (3) **Any
app** that holds `ads: [readAll]` in its contract picks up the ads per
viewer with the same multi-group read the feed uses, and renders creative +
offer + disclosure. (4) The **Partner Links UI** (the Studio card) is the
ingest: the creator sets up their offers and attaches one to content.

**Why:** the thesis is creator ownership + no ad network ("the only
sponsors you'll ever see are ones the creator chose" — `manifesto.md`). An
ad as a creator-owned document in a default service is the mechanical
expression of that: no exchange, no bidding, no third-party targeting, the
creator's link is the link. It ships on v3 with zero new tables (it is a
document), rides the existing delivery + media + read machinery, and is the
concrete, demonstrable difference vs. the paved platforms — every piece of
content carries its own money link, not one clunky bio link.

**Rejected:** a separate `partner_links` + `ads` table pair (over-engineered
— the offer embeds in the ad doc); building the v4 ad-network tables
(`ad_campaigns`, `ad_targeting`, `ad_partners` with dsp/ssp/exchange,
bidding) to serve creator ads (that is the paved exchange layer, a later
M3 milestone — the wrong layer for creator-owned ads); making the ad a
`posts` document with an ad flag (a separate `ads` service lets apps query
ads specifically and keeps the feed's `posts` read clean).

Full model: `knowledge-base/web10-v3/social/ads.md`. The v4 ad-network
layer (the separate concern): `knowledge-base/web10-v4/db/clickhouse-v4.md`.

---

### D49 — App store metrics: real-user activity, windowed at ingest, computed realtime [decided]
Operator, 26.08.2026 — after the app store shipped (D47), the operator
stress-tested the visit model: "what if an approved app changes its
manifest," "it could rename itself on the next ping," "put on a cautious
hat, think about stupid things," then specified the replacement metric
set. The raw ping-count `visits` column is retired as a store metric.

**Decided** — the store measures **real web10 user activity**, not page
pings:

1. **One usage table, `app_visits (app_url, username, seen_at)`.** A row
   is appended per *counted* ping. **Anon pings are dropped at ingest** —
   only a ping carrying a *verified* token (I2: signature checked, never
   an unsigned decode) produces a row, keyed by the token's username. An
   app can only grow its numbers by getting real logged-in users; its own
   server pings are anon and count for nothing.
2. **The ingest gate (operator's words): "if > 3h, insert."** Per
   `(app_url, username)`: append a row only if there is no prior row or
   the latest `seen_at` is > 3h old. 100 navigations in an hour = 1 row.
   The table is bounded at ≤ 8 rows/user/app/day regardless of traffic —
   this is the "doesn't pile on ClickHouse" property.
3. **`apps` stops appending per ping.** It is a stable registration
   record: a row is appended on first registration or a real metadata
   change only. The v2-parity visit-increment-append (and the `visits`
   counter column as a store metric) is retired — `apps` stays ~1 row per
   app. Usage and registration are separate tables with separate growth
   rules.
4. **The metric set, all realtime queries over `app_visits`** (metric-as-
   query, not a maintained counter — no increment races, no stale state):
   - `visits` — `count()` of rows (each row is already a 3h-windowed,
     anon-free counted session)
   - `users_1d` / `users_30d` / `users_90d` / `users_1y` — distinct real
     users with a row in the trailing window
5. **Headline + sort = `users_30d`** — stable, fair to new apps, not spiky
   like 1d, not tombstone-like like 1y. `users_1y` is a detail stat only,
   never a headline or sort key. All five metrics are returned per app;
   the grid card shows the headline, the app detail page shows the full
   breakdown.
6. **The store paginates** — `limit`/`offset` (sorted by `users_30d`
   desc, `visits` tiebreak); the grid pages through instead of rendering
   every app.
7. **Required piece — the sign-in re-ping.** The auto-register ping fires
   at `createV3Client()` (page load, often pre-sign-in → anon → dropped).
   The SDK re-fires the ping on the sign-in transition so a user's usage
   starts counting the moment they authenticate. Without this the metric
   silently means "returning users," not "users."

**Why:** a raw ping count is gameable (an app can loop its own
registration) and means nothing concrete to a visitor. Distinct real
users in a trailing window is un-gameable *by construction* (only the node
mints tokens), is the number a visitor actually wants ("people are using
this"), and is on-brand: the store prints "1,284 web10 users · last 30
days," not a vague visit total. ClickHouse makes the whole set realtime-
trivial (windowed `count`/`countDistinct` over one small table), so there
is no counter to maintain, sync, or race.

**Rejected:** IP-based rate-limiting (the node sits behind NPM —
`request.client.host` is the proxy, and XFF is spoofable in a
token-in-body, origin-untrusted model — the node can only honestly key on
what it sees: the URL + the verified token); per-URL global windowing
(every popular app saturates the same ceiling — the ranking loses its
meaning at the top); lifetime `num_users` (tombstone metric — only goes
up, a dead app outranks a hot one); maintaining counters in `apps`
(append-per-ping piles on ClickHouse and races under concurrency);
`users_1y` as a headline (drifts toward tombstone — a user idle 11 months
still counts).

Full model: `knowledge-base/web10-v3/app-store/overview.md` (metrics
section); schema in `knowledge-base/web10-v3/db/clickhouse.md`.

---

### D48 — Node config lives in ClickHouse: v3 stacks run no Mongo [decided]
Operator, 26.08.2026 — "I am not seeing the admin panel … confirm I am
admin … auth.dev.web10.app is broken, we need to fix the code so I see the
admin panel + configuration."

**Decided** — the node config (the admins list, setup state, JWT key
records) moves to ClickHouse. The v2 config lived in the Mongo
`web10.config` / `web10.jwt_keys` collections, but the v3 ecosystem stack
runs **no Mongo** (removed in #526) — so on dev/prod every config read
blocked ~30s on a dead pymongo server-selection timeout, then raised.
`check_admin` 500'd, the auth UI's `checkAdmin` set `isAdmin=false`, and
the Node Config panel never rendered for the node's admin. `/setup` status
and `/setup/configure` were broken the same way. e2e never caught it
because the e2e compose still runs FerretDB.

New `node_config` table (ReplacingMergeTree, the house pattern):
`config_id='node'` holds the node config JSON; `config_id='jwt:<kid>'`
holds JWT key records. Reads dedup to the latest row; saves append.
`config.py` keeps its interface and now delegates to ClickHouse. The auth
UI's `checkAdmin` switches to the purpose-built `POST /am_admin`
(returns `{admin: bool}`, never errors) instead of the app-store admin
list. Pre-existing volumes get the table via the boot-time schema
self-heal (idempotent `CREATE TABLE IF NOT EXISTS`, alongside the
`apps.visits` ALTER).

**Why:** ClickHouse is the only store in v3 (`faq/olap-only.md`); a config
document that reads a database the stack doesn't run is a time bomb that
only detonates off the e2e stack. Admin-ness stays the config `admins`
list (unioned with `settings.DEFAULT_ADMINS` as the lockout-proof
baseline) — the v3 users table has no admin flag.

**Rejected:** re-adding a Mongo/FerretDB service to the v3 stack (defeats
the one-store simplification); env-only config (no persistence — setup
would be lost on redeploy); an admin flag on the users table (admin-ness
is node-global operator config, not a user attribute).

Full model: `knowledge-base/web10-v3/setup/node-config.md`; schema in
`knowledge-base/web10-v3/db/clickhouse.md`.

---

### D47 — App registration: a path is an app; the demos register as first-party apps [decided]
Operator, 25.08.2026 — the v3 app store was bricked (stats hung 30s, apps
never showed) and the operator asked: "if that is really a web10 app it
should be able to register, if it has all the pwa jazz, make all the demo
apps register."

**Decided** — the store's identity for an app is its **full URL, path
included.** `www.web10.app/docs/notes/` is a different app from
`www.web10.app/`. Consequences:

1. **Registration is the visit tracker (v2 parity, restored).** The SDK
   auto-registers on every `createV3Client()` — anonymous, fire-and-forget,
   `POST /v3/apps/register {url: location.href minus query}`. First
   registration → `visits: 1, pending`; every repeat → `visits + 1`. The
   store sorts by visits. The v3 migration had dropped both the auto-
   register ping and the visit counter (hardcoded 0) — that is why the
   store looked dead. Both are back.
2. **A known host with a path is an app; a known host at its root is
   infrastructure.** The store's `KNOWN_HOSTS` filter (social/auth/api/www)
   applies only to root URLs — those map to the curated plug slots. A path
   on a known host (`/docs/notes/`) renders in the grid. `.localhost`
   hosts stay filtered (dev hygiene — the store is a public surface).
3. **The PWA manifest is the store's identity source.** Each app ships
   `manifest.json` at its own path; the node proxies it via
   `GET /pwa_listing?url=...` (manifest URL = `{url without trailing
   slash}/manifest.json`, so paths with or without a trailing slash
   resolve). The store renders the manifest's name + 192/512 icon, falling
   back to the registered name, then the host. A service worker is NOT
   required for listing — that is installability, per-app, later.
4. **The demos are first-party apps.** All eight (`hello`, `notes`,
   `messages`, `groups`, `media`, `feed`, `sharing`, `tasks`) ship a PWA
   manifest and register like any other app — no hardcoded store entries,
   no special-casing. Real visit counts, real grid presence.

**Why:** the v3 store bricked on two independent drops from v2 — (a)
`/v3/stats` still called the v2 Mongo `total_s3_size()` scan, but the v3
stack runs no Mongo, so every stats call blocked ~30s on a dead
`serverSelectionTimeout` (the marketing front page + store hung on load);
(b) the registration/visit machinery was gutted (no auto-register, visits
hardcoded 0, no `visits` column). Fixing (a) is a bugfix; (b) is a model
call, and the model call is D47: registration identity is the full URL,
so the demos — which live under the marketing host, one per path — are
individually registrable, countable, and showable. The alternative
(host-only identity) collapses all path apps on one host into one entry
and makes the demos invisible; hardcoding each first-party app into the
catalog means every new first-party app needs a code change.

**Rejected:** host-only registration identity (collapses path apps);
hardcoded first-party catalog entries for the demos (registration is the
mechanism); browser-side manifest fetch (CORS — the node proxies, v2
parity); requiring a service worker for store listing (installability ≠
identity); porting v2's `pending_on_change` review state machine (the
operator's approve/reject is the review — small node, operator's call).

Full model: `knowledge-base/web10-v3/app-store/overview.md`.

---

### D46 — web10-social converges on the SDK: retire the v1 auth seam and the hand-rolled v3 client [decided]
Operator, 25.08.2026, during Phase 3 scoping (3.9.1) — after confirming the
demos run the new SDK for BOTH auth and data.

**Decided** — web10-social converges on the SDK the demos already run. Both
legacy seams are retired: (1) **auth** — `web10-npm@^1.0.8`'s v1 `wapiInit`
(via `Web10SocialAdapter`) → the SDK's D42 flow (`openAuthPortal` +
`contractRequest` + `authListen`, with D45's dedupe); (2) **data** — the
hand-rolled `src/data/v3.ts` (raw fetch to `/v3/*`) → the SDK's
`createV3Client`. The dependency follows the pattern `ui/` already uses: a
local `file:` reference to `sdk/` (v2.0.0), not a registry pin. The data
modules (posts, feed, dms, comments, reactions, contacts, profile) keep
their API — the swap is inside the `getV3Client()` seam. The demos
(`docs/hello/script.js` et al.) are the reference implementation.

**Why:** the app predates the current SDK. When v3 landed, the npm package
was still v1-only (`wapiInit` is the v1 API — 3.1.3: "v2 SDK can't be used
yet"), so the app kept the old SDK for auth and hand-rolled a v3 data
client. The SDK has since caught up fully (v3 API + D42 consent flow + D45),
and all seven demos prove it for both auth and data. Two clients means two
places where token handling, the distinguishable-403 shape (app-contract vs
group — D42), and media resolution can drift — and the drift already
happened once: a v1 door on a v3 body. The D42 consent flow is not a feature
you bolt on; it IS the v3 auth model (lazy group contracts, zero-UI
auto-complete, identity check). Re-implementing it per app is exactly how
this divergence happened in the first place. D20 test — does it make the
creator platform better? Yes: the M0 gate requires the slice to stand on its
own, and the auth door is the first thing a real user touches.

**Rejects:** keeping the hand-rolled `v3.ts` client (no dep churn, but the
consent flow gets re-implemented per app; the drift already happened once) ·
staying on a registry pin and waiting for a v2 publish (the repo's
established consumption path for the current SDK is `file:` — `ui/` does
this; a registry pin on the v1 line is the divergence itself) · a thin
"adapter forever" (the current `Web10SocialAdapter` spreads the v1 `wapi`
instance and patches methods onto it — that is the seam that rotted; it goes
away and the app talks to the SDK directly).

### D45 — `authListen` dedupes redundant same-user token deliveries [decided]
Operator, 24.08.2026, after the sharing demo (#666) printed "sharing group
ready" twice on a normal login.

**Decided** — the SDK's `authListen` (browser.ts) no longer re-fires the
signed-in callback when the delivered token decodes to the SAME user already
in the cookie. It still refreshes the cookie (a same-user token can carry a
newer expiry), but the "signed in" signal fires only on a real transition:
first login (no current token). A user switch is still rejected by the D42
identity check before the dedupe is even reached. The sharing demo's
`initApp` is also idempotent (an `appInitialized` flag) as defense-in-depth.

**Why:** the consent popup hands back the token on every "return to app"
(`goToApp` → `postMessage({type:'auth'})`), and a normal D42 flow opens TWO
popups (login + lazy group), so the same user's token is delivered twice.
Every delivery re-fired the callback, so the app re-ran `initApp` and
re-appended its "ready" line — user-visible duplicate UI state. The re-fire
served no purpose: by the time a same-user token arrives, the cookie already
proves the app is acting as that user, and every demo (and the documented
`if (isSignedIn()) initApp() else authListen(initApp)` pattern) restores the
session from the cookie on page load, so the app has already initialized. The
one imagined benefit (re-init to pick up a refreshed token) is broken anyway:
`v3Post` resolves `state.token ?? readTokenCookie()`, and `state.token` is
frozen at client creation, so a re-init re-renders the UI (cookie-first
`readToken()`) while API calls keep using the stale in-memory token.

**Rejects:** per-demo guards as the only fix (the same latent bug is in every
demo — hello/notes/messages/groups/media/tasks — a shared-component bug
belongs in the shared component) · token-string-equality dedupe (would not
suppress a same-user *refreshed* token, so it wouldn't guarantee the fix) ·
changing `v3Post`'s `state.token ?? cookie` precedence to fix the refresh case
(bigger behavior change, pinned by `v3.test.ts`; the refresh-reinit case is
rare and already broken, so it's out of scope here).

**Note (known wart, not fixed here):** `state.token` shadows the cookie in
`v3Post`, so a same-user token *refresh* updates the cookie but not the
in-memory token API calls use. Tracked for a follow-up; out of scope for this
bug fix.

### D44 — HLS is v3; P2P delivery stays v4 [decided]
Operator, 23.08.2026, after the media demo (#661) landed: "we should do hls in
v3, that is like the one feature that makes this legit legit youtube vs bs" ·
"fuck the peertube stuff! too complicated" · "also creates security questions,
what if people send bullshit shards" · "we NEED to have 'a' platform!!!!" ·
"can leave that p2p one in v4 folder"

**Decided** — HLS transcoding is a v3 feature, not a v4 one. The pipeline:
video upload → in-process ffmpeg worker (dedicated thread, bounded
concurrency) → HLS renditions (360p/720p/1080p) + master manifest +
thumbnails → MinIO → signed manifest + JWT on every segment (bifurcated auth)
→ hls.js playback (Safari native). The document shape is
`transcoding_settings.enabled: true` + variants + thumbnails on the `minio`
type (the v3 schema that already existed, now actually used). P2P delivery
(PeerTube's WebTorrent + P2P Media Loader stack) stays v4. The KB was
reorganized to match: `web10-v3/media/` now holds the full pipeline
(transcoding, streaming, minio-auth-bifurcated, streaming-tension,
why-minio-not-file-types, client-side-transcoding, transcoding-foundation);
`web10-v4/media/` holds only the scale layers (streaming-at-scale,
peertube-p2p-stack). `mobile-transcoding.md` deleted (pre-D41 — the client is
a PWA, not a native app).

**Why:** adaptive bitrate is the difference between "video works" and "video
is legit" — it's the YouTube bar, and it's user-visible at *every* scale (a
3G phone, café Wi-Fi, a desktop on fiber). P2P is the opposite shape: an
*economics* optimization (bandwidth cost scales sub-linearly with concurrent
viewers), not a capability. At v3 audience size there are no concurrent
viewers, so P2P saves nothing and ships a real security surface (untrusted
peer shards — torrent piece-hashing makes corruption detectable, but the
channel is still untrusted input from arbitrary peers) plus NAT/TURN
operational pain, for zero demo value. D20 test — does it make the creator
platform better? HLS: yes, it's the feature that makes the platform a real
video platform. P2P: not until M2+ scale makes bandwidth cost a felt problem.

**Rejects:** client-side-only transcoding as the whole story (ffmpeg.wasm is
a cost optimization — the server always segments to HLS; pre-encoding just
makes the server job cheaper, it's not a free-tier gate) · P2P in v3 (scale
+ security surface + ops pain, no user-visible capability) · native mobile
transcoding (D41: PWA, not a native app) · Celery/Redis as the v3 transcoding
queue (the node targets a one-container deploy; an in-process worker with a
bounded ffmpeg subprocess is simpler and the job interface — in, manifest out
— doesn't change if a node ever outgrows it).

**Supersedes:** the "v3 — No Transcoding" position in the old
`transcoding-foundation.md` (the field existed but was `false`; now video
uploads are transcoded by default).

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
