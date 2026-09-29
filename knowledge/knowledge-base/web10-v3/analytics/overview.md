# Content Analytics

The node's per-content performance engine. Any app on the platform — the
social app, a notes app, a shop — can measure how its **content** performs:
how often it was shown, how long people looked, what they did. One generic
engine, keyed on the **document**, not the app.

This is `app_visits` (D49) generalized from the *app* level to the
*document* level. The data model lives in `../db/clickhouse.md`; the SDK
surface in `../sdk/api.md`; the decision (D85) in
`../../strategy/decisions.md`.

## The Three Primitives

Everything a creator sees is a query over three events:

| Primitive | Meaning | Captured where |
|---|---|---|
| **Impression** | content was shown to a reader | delivery: the node's read path · viewport: the app's UI (gated) |
| **Engagement** | a reader reacted (like / comment / repost) | `reactions` docs (already exists) |
| **Click** | a reader tapped a CTA | the app's UI (gated on a preceding impression) |

## What a "Surface" Is

A **surface** is *which screen in the app showed the content.* It is a
string label the app sends with each event — **not** a fixed list the node
knows about.

web10-social's surfaces: `feed` (the home feed), `shorts` (the vertical
video scroller), `discover` (the board), `profile` (someone's page), `group`
(a community's feed). A notes app would send `list` / `detail`. A shop would
send `catalog` / `product`. The node stores whatever string it gets and
groups by it; it never needs to know what surfaces exist.

Why it matters: it answers **"where is my content actually finding an
audience?"** A post seen 1,000× breaks down as 600 feed / 300 shorts / 80
profile / 20 discover. It is the same idea as YouTube's "traffic sources"
(Browse / Suggested / Search), TikTok's "where your views come from" (For You
/ Following / Profile), and Instagram's "where people saw your post" (Feed /
Explore / Reels). *Surface* is just web10's word for that.

The generalization is the point: **the app brings its own surface labels; the
engine just counts them.** The node code is identical for every app — it
stores the label and groups by it, and the app decides what the labels mean.

## Two Tiers of Impression

"Impression" is two things, and the split is the load-bearing anti-gaming
move:

| Tier | What it is | Captured by | Gameable? |
|---|---|---|---|
| **Delivery** | doc X was *served* to reader R on surface Z | the node's read path (a side effect of `read()`) | No — the node counts it |
| **Viewport** | reader R *saw* doc X for Ns / M% of it | the app's UI (IntersectionObserver / video `timeupdate`), **gated on a preceding delivery** | Bounded — can only report what you were served |

The **delivery** tier is the floor: the node returned the doc, so it counts.
It is un-gameable because the client does not control it — there is no
`trackImpression()` to fire from devtools.

The **viewport** tier is where "how many seconds" and "did they scroll past
it" live. The server has no idea which of the 50 docs a reader stared at for
30 seconds — that is inherently client-side knowledge. So the app fires a
viewport signal from its own UI. But the node **drops any viewport signal for
a doc it did not serve to that reader** — so a user in devtools cannot
fabricate "I watched post X for 60s" if the read never returned post X to
them. They can only over-report on posts they genuinely saw, which poisons
only their own dashboard (the "gaming your own numbers" case, bounded by
dedup + windowing).

## The Generic Event Log

The node stores one table, keyed on the document:

```
content_events (doc_id, service, reader_key, surface, event_type, payload, seen_at)
```

- **`event_type`** — `delivery` (node-written) / `viewport` / `click` /
  app-defined.
- **`payload`** — a JSON blob the app fills: `{ dwell_ms, visible_pct }` for
  a feed viewport, `{ watched_ms, duration_ms }` for a short, `{ cta_id }`
  for a click.
- **`surface`** — the app's screen label (above).

The node stores the label + the payload **verbatim**. It does not know what
`feed` means or what `dwell_ms` means. The app interprets it. Same split as
the query engine (D62): the node is the primitive, the app is the semantics.

## The SDK Surface

Two methods (the rest already exists):

- **`read(service, { groups, surface })`** — `surface` is a new optional
  param. The node logs a delivery impression per returned doc.
- **`trackContentEvent(docId, { surface, type, ...payload })`** — the
  generic client-side signal. `type` is `viewport` / `click` / app-defined.
  Gated on a preceding delivery + deduped per (doc, reader, surface, type,
  window). A click is just `type: 'click'`.

The app wires `trackContentEvent` to its own UI: an `IntersectionObserver`
for a feed (a post enters/exits the viewport → `dwell_ms`, `visible_pct`), a
`<video>` `timeupdate` for shorts (`watched_ms` / `duration_ms`), a button
`onClick` for a CTA (`cta_id`). The app decides *when* to fire and *what* to
measure; the node gates + stores.

## Anti-Gaming (the D49 pattern, generalized)

The node only counts what a **verified** user's token actually did, deduped
and windowed:

- **Delivery** — deduped per (doc, reader, surface) per window. Refresh the
  feed 100× → 50 impressions (the 50 docs), not 5000. Same as `app_visits`
  (1 row per (app, user) per 3h).
- **Reach** — `countDistinct(reader_key)` over impressions. A reader is one
  reader; they cannot make themselves ten.
- **Viewport / click** — gated on a preceding delivery (you cannot report on
  what the node did not serve you) + deduped per (doc, reader, surface,
  type, window).
- **Engagement** — one reaction per reader per doc (mutually exclusive,
  self-healing; already exists).
- **The malicious app** — has to use real, verified web10 accounts. The node
  mints tokens (login + verified phone, D61); an app cannot mint them.
  Spamming means N real accounts with N verified phones — the bot-account
  problem every platform has, not an SDK-specific hole.

## Honest by Incentive, Not Just Construction

web10 does not take a cut of creator ads — its revenue is **node ads**
(D55/D57), which run on this same engine. So (1) the platform has no hidden
incentive to inflate creator numbers, (2) a creator gaming their own numbers
poisons only their own dashboard, and (3) the one number that pays the
platform (node-ad performance) is server-side and is the basis of the
platform fee — so the platform has a **hard** incentive to keep the engine
honest. The engine is neutral, first-party, node-owned — the "own your data"
story applied to the node's own metrics. The opposite of the ad-network
model, where the platform profits from the data and the user has reason to
distrust it.

## The "Crazy" Metrics Are Queries, Not a New Engine

The capture is generic and built once. The "crazy" analytics are reporting —
ClickHouse queries + a dashboard over the same `content_events` log:

| Metric | It's just a query over |
|---|---|
| Impressions by surface | `count()` grouped by `surface` |
| Reach | `countDistinct(reader_key)` |
| Average watch % | `avg(watched_ms / duration_ms)` over `viewport` |
| Retention curve | percentile of `watched_ms` by second |
| Active-time heatmap | histogram of `seen_at` |
| Audience demographics | join `reader_key` → `users` (age / location) |
| "Which post drove follows" | correlate a `click` / `viewport` with a follow |

**v1 is the core:** delivery + viewport + click + engagement + reach. The
rest (demographics, retention curves, active-times, attribution) are v2+
queries on data that is already flowing — not a separate system.

## The Dashboard (Design the Mock First, Build to It)

The dashboard is the user-facing half, and it is **designed as a mock before
the engine is built** — the mock is the spec, and the engine is built *to*
the mock (not the other way around). This is the "docs first, then code"
philosophy applied to the UI: the mock defines the data contract (what
charts, what time horizons, what the realtime view looks like, what the
per-post detail looks like), and the capture/query/SDK items exist to feed
it. Designing the mock first prevents both overbuilding (you only build what
the mock needs) and underbuilding (you see what's missing).

The visual layer, and why it's not a separate system:

- **Time-series (line graphs)** — `content_events` carries `seen_at`, so
  "impressions per day over window W" is `GROUP BY toDate(seen_at)`. The
  "metrics over time" view (impressions, reach, clicks, avg dwell) is a
  time-series query, not a new table.
- **Time horizons** — the mock fixes the windows (7d / 30d / 90d / 1y /
  all-time). The query takes a window param; the UI switches it.
- **The realtime view (the addictive part)** — "your content is being
  watched RIGHT NOW" (YouTube's most-visited tab). It's just
  `WHERE seen_at > now() - 48h` polled every ~30s, with the last hour
  bucketed by minute. The `seen_at` column already makes this free — no
  new capture, no new table.
- **Per-post detail** — the drill-down: impressions, reach, avg dwell /
  watch %, clicks, conversion, each by surface, over the selected window.

The "addictive, watching it update in real time" feel is the realtime view
plus the time-series — both are queries over the same log, which is why the
visual layer is reporting, not a new engine.

## The Line It Does Not Cross (D56 / D60)

- **Content-free.** An event is `doc_id + reader_key + surface + event_type
  + payload + seen_at` — never the doc's body. The payload carries
  *measurements* (dwell, percentage, CTA id), not content.
- **Node-owned, first-party.** The node's own ClickHouse, not a third party.
- **D60-generic.** The engine is in `api/`, keyed on the document, with no
  app-specific columns. A notes app, a music app, and a shop use the same
  table. The app-specific part (surface labels, the dashboard) lives
  client-side.

## What This Is Not

- **Not the platform telemetry (D56).** That is `marketing_events` —
  route-level product usage (pageviews, funnels, errors) for the *operator*.
  This is doc-level content performance for the *creator*. Different tables,
  different questions, same first-party philosophy.
- **Not a client-side counter.** The client never controls the counting; it
  only reports viewport / click signals it is gated to send.
- **Not a per-app feature.** It is a platform primitive; web10-social is the
  first consumer, not the owner.
