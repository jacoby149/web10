# The Creator Analytics Dashboard (web10-social)

The user-facing half of the D86 engine — the creator's "how is my content
performing" surface. This is the **mock** the engine was designed to feed
(`overview.md` "The Dashboard"): the concrete charts, the data contract,
the interactions, and the tiering.

The dashboard lives in the Monetization tab's **Analytics** section
(`/monetize?tab=analytics`). It is the funnel: even a creator with zero ads
sees their real reach + a projection of what they could be making, which
pulls them toward setting up ads.

## The Data Source

One read: `w.contentAnalytics({ service: 'posts', windowDays: N })`.

Returns rows of `{ doc_id, surface, day, impressions, reach, clicks, avg_watch_pct }`
— one row per (doc, surface, day) over the trailing window, I3-bound to the
caller's own docs. The client aggregates up to whatever the chart needs:

| Chart | Aggregation |
|-------|-------------|
| Impressions over time | `sum(impressions)` grouped by `day` |
| Reach over time | `sum(reach)` grouped by `day` |
| Surface breakdown | `sum(impressions)` grouped by `surface` |
| Top posts | `sum(impressions)` grouped by `doc_id`, sorted desc |
| Per-post detail | filter rows by `doc_id`, then aggregate as above |

No new node surface. The read already exists (3.223.3). The dashboard is
pure client-side aggregation + rendering.

## The Charting Library: Recharts

**Decision: Recharts** (v2, React-native, ~50kb gzipped).

Why Recharts and not a hand-rolled SVG:
- Hover tooltips (exact values on hover) — the "Google Analytics feel"
- Brush / date-range selection — zoom into a window
- Multiple series overlaid (impressions + reach on one chart)
- Gradient area fills (the Spotify/YouTube look)
- `ResponsiveContainer` — works at desktop + 375px without a resize observer

Why not D3 / visx / nivo:
- D3 is too low-level (we'd be building the tooltip + brush + axis ourselves)
- visx is mid-level (better than D3, but still more code than Recharts for a dashboard)
- nivo is a wrapper over visx + D3 (heavier, less control over dark theme)

The "robust" part (per-post drill-down, comparison periods, date-range
picker) is **product logic we build on top of Recharts**, not charting-library
territory. Recharts gives us the chart primitives; we build the dashboard.

## The Tiers

### Tier 1 — "Your Reach" (always visible, no product needed)

The funnel's first beat: "your content is already being seen." Shown to
every creator, even with zero ads.

| Chart | Type | Data | Interaction |
|-------|------|------|-------------|
| **Impressions over time** | Area chart (gradient fill) | `sum(impressions)` by `day` | 7d / 30d / 90d toggle. Hover → exact value. |
| **Reach over time** | Line (overlaid on the area, or a toggle) | `sum(reach)` by `day` | Same window. The "distinct people" tell. |
| **Surface breakdown** | Horizontal bar | `sum(impressions)` by `surface` | "Where are people seeing me?" — feed / discover / profile / shorts / watch. |
| **Top posts** | Ranked list (not a chart) | `sum(impressions)` by `doc_id`, top 5 | Click a post → Tier 2 (per-post detail). |

The **totals row** (impressions + reach, the two big numbers) sits above the
charts — the at-a-glance "how big is my audience" stat.

### Tier 2 — "Per-Post Detail" (click a post from Tier 1) [built 3.235.6]

The drill-down: one post's full performance over the selected window.
Built in 3.235.6: `PostAnalyticsPanel.tsx` (the per-post detail card),
`AnalyticsSection.tsx` (reads `?post=<doc_id>` from the URL, loads via
`readPostAnalytics`, renders the panel in place of Tier 1), and
`ReachCharts.tsx` (Top Posts rows are now clickable buttons). The panel
shows: the post's identity (thumbnail + title + type + window), the two
big numbers (impressions + reach), the daily time-series (Recharts
ComposedChart), the surface breakdown, the average watch % (video/short
only), and the projection beat (if the post has a product ad).

| Chart | Type | Data | What it tells you |
|-------|------|------|-------------------|
| **Impressions + reach per day** | Composed (area + line) | that doc's rows by `day` | The post's own trajectory. |
| **Surface breakdown** | Horizontal bar | that doc's rows by `surface` | "Did this post blow up on discover or in the feed?" |
| **Avg watch %** | Single stat + sparkline | `avg(avg_watch_pct)` for that doc | For video posts: how much people watched. |
| **The projection for this post** | Number | `projectEarnings(impressions, product)` | "This post got 45k impressions → if you'd run an ad here, ~$135." The funnel's per-post beat. |

Reachable by: clicking a post in the Top Posts list (Tier 1), or a deep link
(`/monetize?tab=analytics&post=<doc_id>`). Back button returns to Tier 1.

### Tier 3 — "What you could be making" (the calculator)

Already built (3.228.0). The what-if calculator (impressions slider + price +
commission) + the "Add a product" CTA. Seeded from the creator's real D86
total when available.

### Tier 4 — "Portfolio + Performance" (only with product ads)

Already built (3.224.0). The per-ad rows + the projection-vs-actual tell.

## Content Previews + Type Filtering (Tier 1 upgrade)

The Top Posts list (Tier 1) shows real content previews instead of raw
"Untitled post" labels. Each row carries a thumbnail (from the doc's
`media_refs` via `pickThumbnail`), the post's title (or truncated text),
and the impression count.

**Two-level filter** (the "Content | Ads" toggle + sub-filter row):

| Top-level | Sub-filters | What it shows |
|-----------|-------------|---------------|
| **Content** | All / Posts / Videos / Shorts | Non-ad docs, filtered by content type |
| **Ads** | All / Inline / Post | Ad docs, filtered by `body.format` |

Content type is derived from the doc's `tags` + `media_refs`:
- `short` — `tags` includes `'short'` (9:16 video, auto-tagged by the composer)
- `video` — any `media_refs` item with `mime_type` starting `video/` (and not short)
- `post` — everything else (text, image, mixed)

Ad format comes from `body.format`: `'inline'` (default, the compact AdBlock)
or `'post'` (the full post-like card).

**Data path:** `enrichTopPosts(topPosts)` in `creator-analytics.ts` reads the
top-10 doc_ids via `w.readById` (no `surface` label — the read does NOT log a
delivery), classifies each, and extracts the thumbnail + label. A read failure
for one doc degrades to a minimal entry.

## Per-Post Full Profile (Tier 2, next PR)

The single-post drill-down (click a post from Tier 1 → `/monetize?tab=analytics&post=<doc_id>`)
should show the **full analytical profile** at that granular level:

- The post's own metrics (impressions, reach, watch %, surface breakdown) —
  already spec'd in Tier 2 above.
- **All ads attached to this post** (the creator's pinned ad + any node ad)
  with their individual performance: impressions, clicks, CTR.
- **How much the post drove to the ads** — the attribution: "this post got
  45k impressions and its attached ad got 3.2k clicks → 7.1% CTR."
- The post's own `ad_preference` state (pinned / none) + the ad's `format`
  (inline / post) so the creator sees the full picture.

This is parity with YouTube Studio / Meta Business Suite: the single-content
profile includes its monetization layer, not just its organic reach.

**Data needed:** the post's `contentAnalytics` rows (already available) +
the attached ad's `doc_id` (from `doc.ad` / `doc.node_ad` on the read) +
the ad's own `contentAnalytics` rows (a second `readById` + filter).

## Per-Ad Full Profile (Tier 2b, next PR)

The single-ad drill-down (`/monetize?tab=analytics&ad=<doc_id>`):

- The ad's own metrics (impressions, clicks, CTR, surface breakdown).
- **Which posts this ad is attached to** (reverse lookup: posts whose
  `ad_target` = this ad's doc_id) + each post's impressions.
- The ad's product link (if D89) + the product's aggregate performance.
- The ad's `format` (inline / post) + `status` (active / paused).

**Data needed:** the ad's `contentAnalytics` rows + a `w.query` for
`SELECT doc_id, body.title FROM posts WHERE ad_target = '<ad_doc_id>'`
(the reverse lookup is a client-side query, D60-clean).

## Per-Product Aggregate (Tier 5, next-next PR)

The product-level view: "how is this product performing across all its ads?"

- **All ads for this product** (by `product_id` or legacy `product` section)
  with their individual + aggregate metrics.
- **Which posts have ads attached for this product** (the posts whose
  attached ad references this product) + each post's impressions.
- **Product-level CTR / conversion** (aggregated across all its ads).
- The product's `actuals` (logged revenue) vs the projected earnings.

This is the "product performance" view that Meta/TikTok give advertisers:
the product is the unit of analysis, the ads are the delivery vehicles,
the posts are the context.

**Data needed:** a `w.query` for all ads with `product_id = '<product_doc_id>'`
+ each ad's `contentAnalytics` + the reverse post lookup per ad.

## Planned (further out, after the above are in use)

| Feature | What it is | Data needed |
|---------|------------|-------------|
| **Comparison periods** | "This 30d vs last 30d" (the GA "compare" toggle) | Two `contentAnalytics` reads (current + prior window) |
| **Time-of-day heatmap** | "When are your fans active?" (YouTube "audience by hour") | `seen_at` hour bucketing (node-side or client-side from rows) |
| **New vs returning viewers** | "How many first-time vs repeat?" | Node-side `first_seen` flag (small D86 addition) |
| **Realtime view** | "Your content is being watched RIGHT NOW" (YouTube's most-visited tab) | `WHERE seen_at > now() - 48h` polled every ~30s |

## The Line It Does Not Cross

- **Content-free.** The dashboard shows metrics (impressions, reach, watch %),
  never the doc's body. The Top Posts list shows the post's title/text as a
  label (the creator's own content, I3-scoped to them), not a metric.
- **D60.** The dashboard is client-side. The node exposes the generic
  `contentAnalytics` read; the app interprets the rows into charts.
- **I3.** A creator only ever sees their own content's metrics (the read is
  author-scoped server-side).
