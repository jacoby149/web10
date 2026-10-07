# October 2026 Audit — D60: Is the node generic?

> **Historical architecture assessment, corrected 06.10.2026:** original source
> coordinates and recommendations below are retained, not binding remediation
> decisions or current security assurance. D60 explicitly retains configurable
> ranked reads; D75 retains the generic node ad mechanism, and D89 authorizes
> explicit node monetization/moderation delegation. Moving all ranking/ads to
> clients needs an approved architectural decision, not an audit assertion.
> Hardcoded social service/topology coupling must be assessed separately from
> whether a configurable capability is universal. No architecture change,
> deployment or test result is claimed by this correction.

**The question:** is the backend (`api/`) generic to *any* app, or has it taken
the shape of web10-social? The D60 test: *"Would a notes app, a music app, or a
shop use this endpoint / table / column / field?"* If the honest answer is "no,
only web10-social," it leaked into the node.

**Short answer: the *primitives* are generic and excellent. The *product
decisions* are not.** The node is a great generic data/authorization engine, but
it has absorbed four social-app product concepts that should live client-side. A
notes app could use the CRUD + groups + query engine. It could **not** run on
this node without inheriting a discover board, a power-mean feed ranker, an ad
monetization engine, and a content-moderation policy — none of which a notes app
wants.

## What IS generic (the good — this is the actual D60 win)

These are the load-bearing seams, and they are correctly app-agnostic:

- **Documents CRUD** — `documents.py` create/read/update/delete. A doc is
  `{service, body}`; `service` is a caller-chosen string. A notes app uses
  `service="notes"`. No social concept. ✅
- **Groups + roles + the D58 read gate** — `group_contracts`, `group_members`,
  `can_read_group` / `effective_role_perms`. Access is expressed as *role grants
  on a group*, not "followers" or "public." A shop's "customers" group is the
  same primitive as a creator's "followers" group. ✅
- **The query engine** (`safe_query.py`) — the app writes its own `SELECT` over
  its services; the node hardcodes nothing about *what* the app queries. This is
  the seam that *should* carry app-specific reads. ✅
- **App contracts** (per-origin permissions) — pure infrastructure trust. ✅

These four are the "WordPress for social media" substrate, and they are clean.
The problem is what's been bolted on top of them.

## What is NOT generic (the D60 violations)

### G-1 — High — the node owns a **discover board**

`clickhouse.py:647`: `DISCOVER_GROUP_ID = f"{settings.PROVIDER}/groups/web10/discover"`.
`ensure_discover_group()` (`clickhouse.py:678-709`) **auto-creates this group on
boot and backfills every user as a member** (`main.py:78` calls it at startup).

- "Discover" is a **social-app product concept** (the public feed board). A
  notes app has no discover board. A shop has no discover board.
- The node is *forcing* a social topology onto every node: every account is
  auto-enrolled in a public board the node invented.
- **The generic seam already exists:** publicness is a *role grant* — an app
  creates a group and adds an `anyone` read-grant row (D58). The discover board
  should be **web10-social's** group, created by the app, not the node's.
- **Fix:** move `ensure_discover_group` out of the node. The social app creates
  its discover group on first run (it already knows how to make groups + grant
  `anyone`). The node stops knowing "discover" exists.

### G-2 — High — the node runs a **feed-ranking algorithm**

`clickhouse.py:2212-2310`: `_power_mean_score` + `_power_mean_score_sql` — a
**recency + likes + comments** power-mean score, computed **in SQL** and applied
in `read_documents_in_groups` (`clickhouse.py:2525`, `ORDER BY score DESC` at
`:2478`).

- **Likes and comments are social-app signals.** A notes app has no likes. A
  shop has no comments-on-products feed. The node is ranking documents by
  *social engagement*.
- The docstring even says "the feed knobs, server-side" and "mirrors
  `marketing-ui/src/lib/powerMean.ts`" — the node is **duplicating the social
  app's ranking** so they "score identically." That duplication is the smell:
  the node learned the app's product decision.
- **The generic seam already exists:** the query engine. The app writes
  `SELECT … ORDER BY <its own score>` over its services. The node should return
  *rows*, not *ranked rows*.
- **Fix:** move the power-mean rank into the client's query (the social app
  already has `powerMean.ts`). The node's `read_documents_in_groups` should
  order chronologically (or not at all) and let the app rank. This is the
  single biggest "the node took the app's shape" item.

### G-3 — High — the node runs an **ad / monetization engine**

`clickhouse.py:2840` `attach_pinned_ads`, `:2919` `attach_node_ads`; the
`documents` table has **`ad_mode` + `ad_target` columns** (`clickhouse.py:190-191`);
`documents.py:113,154-155,202-205,258-281,295-305` thread `ad_preference`
through create/update/read; `query.py:132-133` attaches ads on every query.

- **Ads are a web10-social monetization concept** (D55/D57 — the operator's own
  decision, `decisions.md:352`, moved the ad catalog into the social app). But
  the *attachment engine* — "pin this ad to N% of reads," "attach node ads" —
  lives in the node, and it is wired into the **generic read path** (every
  `read` / `query` call runs `attach_pinned_ads` + `attach_node_ads`).
- A notes app's read path would run ad-attachment code it never asked for.
- **This is the clearest violation:** the node is *monetizing* on behalf of one
  app. The generic seam is "the app reads its own ad docs and attaches them
  client-side" (the app already has the ad catalog). The node should not know
  what an "ad" is.
- **Fix:** move ad attachment client-side. The `ad_mode`/`ad_target` columns
  can stay as *generic doc metadata* (any app could use a two-field preference),
  but the *attachment logic* (`attach_pinned_ads` / `attach_node_ads`) is a
  social-app product decision and belongs in the app.

### G-4 — Medium — the node runs a **content-moderation policy**

`documents.py:17-43` `_moderate_post`: on post-create, if `service == "posts"`
and the doc is on the discover board, it runs a **blocklist + auto-hide**
policy (`moderation.py`).

- Moderation *as a capability* could be generic (any app might want a
  blocklist). But this specific hook is **hardcoded to `service == "posts"` +
  the discover board** — it's the social app's content policy, running in the
  node.
- **Fix:** make moderation a *generic* capability (a blocklist the app opts
  into, keyed on any service) or move the social policy client-side. As-is it's
  "the node knows posts and the discover board."

### G-5 — Medium — **hardcoded service names** in node logic

**Current-source correction:** `clickhouse.py::can_read_carrier_post` now reads
the carrier's actual service and passes it to the read gate; the historical
hardcoded `posts` item below no longer describes that path. This does not certify
all media resolution: stale referenced metadata remains SEC-012/015.

- `documents.py:27`: `if service != "posts" or …` — the moderation hook special-
  cases the literal string `"posts"`.
- `clickhouse.py:1032`: `can_read_group(g, reader, "posts", …)` — the HLS
  carrier-post check hardcodes `"posts"`.
- `clickhouse.py:2498-2502`: the feed read hardcodes `collection_name =
  'reactions'` and `'comments'` (to count likes/comments for the rank — see G-2).
- `import_worker.py:73,564`: the YouTube importer hardcodes `"posts"` +
  `"profile"` (defensible — it's a *specific* importer, not the generic path —
  but it's still the node knowing social service names).
- **Fix:** these should be parameters or app-provided. The generic read path
  should never name a service.

### G-6 — Low — **social group-tag inference** in migrations

`clickhouse.py:389-401` `_infer_membership_visibility` and `:460-488`
`_infer_group_tag` hardcode `"web10-social-followers"`, `"web10-social-dm"`,
`"web10-social-group"` and the `followers` / `dm-` slug shapes.

- These are **one-time, sentinel-gated backfills** (run once, then retire), so
  they're lower-severity than G-1..G-4. But they are the node *knowing the
  social app's group taxonomy* to migrate legacy data.
- **Fix:** acceptable as a one-time migration (it's historical), but flag that
  the node learned the app's tag vocabulary. New nodes don't need it.

## The pattern

The generic seams (CRUD, groups, query engine, app contracts) are **correct and
clean**. The violations are all **product decisions that ran in the node
instead of the app**: a discover board (G-1), a feed ranker (G-2), an ad engine
(G-3), a content policy (G-4), and the service names those decisions need (G-5).

The tell, every time: **the node is doing something "for the feed" or "for
monetization" or "for the public board."** A generic node stores data, enforces
access, and runs the app's queries. It does not *rank feeds*, *attach ads*, or
*moderate posts* — those are what the app does with the data it reads.

## Why it matters (beyond purity)

- **It blocks other apps.** A notes/music/shop app can't run on this node
  without a discover board it didn't ask for, a feed ranker it can't use, and an
  ad engine in its read path. D60's whole point — "another app could build on
  this" — is currently false.
- **It couples the node to the social app's changes.** Every time the social app
  tweaks its feed rank (`powerMean.ts`), the node's `_power_mean_score_sql` has
  to change too, or they drift (the docstring's "mirrors … exactly" is a
  maintenance hazard, not a feature).
- **It's a security surface too.** More node-side app logic = more code that
  runs on every read = more to audit (this is why G-2/G-3 showed up in the
  security pass as well).

## Recommended order of attack

**Historical proposals, not approved work orders:** G-2/G-3 removal conflicts with
the retained capabilities in D60/D75 and requires an explicit ADR. Security
repairs must preserve current app/person authorization regardless of where a
product capability eventually lives. The original blanket "correct and clean"
primitive claims are superseded by the security findings ledger, including SQL,
projection, service-role and tombstone findings; genericity is not security proof.

1. **G-2 (feed rank)** — move the power-mean rank to the client query. Biggest
   "app shape in the node," and the query-engine seam already supports it.
2. **G-3 (ads)** — move `attach_pinned_ads` / `attach_node_ads` client-side.
   Keep `ad_mode`/`ad_target` as generic metadata, drop the attachment engine.
3. **G-1 (discover board)** — stop auto-creating it; the social app creates its
   own discover group.
4. **G-4 (moderation)** — make it a generic opt-in capability or move it out.
5. **G-5 (service names)** — parameterize; the generic path never names a
   service.
6. **G-6 (tag inference)** — leave as a one-time migration; note it.

**The end state:** the node is a generic `{service, body}` store with group-based
access and a caller-driven query engine. web10-social is *one app* on it that
happens to create a discover group, rank by power-mean, attach ads, and moderate
posts — all client-side, through the generic seams. That's the "WordPress for
social media" the thesis describes: the node is the WordPress, the social app is
the theme.
