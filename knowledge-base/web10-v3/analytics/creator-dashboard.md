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

### Tier 2 — "Per-Post Detail" (click a post from Tier 1)

The drill-down: one post's full performance over the selected window.

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

## Planned (next narrowing, after Tier 1–2 are in use)

| Feature | What it is | Data needed |
|---------|------------|-------------|
| **Comparison periods** | "This 30d vs last 30d" (the GA "compare" toggle) | Two `contentAnalytics` reads (current + prior window) |
| **Time-of-day heatmap** | "When are your fans active?" (YouTube "audience by hour") | `seen_at` hour bucketing (node-side or client-side from rows) |
| **New vs returning viewers** | "How many first-time vs repeat?" | Node-side `first_seen` flag (small D86 addition) |
| **Click-through rate per ad** | The D86 click counter (the "clicks coming soon" lane) | `click` events (already captured, not yet wired to a read) |
| **Revenue per post** | Overlay actual $ on the impressions chart | The actuals box (already on the ad) + the per-post impressions |
| **Realtime view** | "Your content is being watched RIGHT NOW" (YouTube's most-visited tab) | `WHERE seen_at > now() - 48h` polled every ~30s |

## The Line It Does Not Cross

- **Content-free.** The dashboard shows metrics (impressions, reach, watch %),
  never the doc's body. The Top Posts list shows the post's title/text as a
  label (the creator's own content, I3-scoped to them), not a metric.
- **D60.** The dashboard is client-side. The node exposes the generic
  `contentAnalytics` read; the app interprets the rows into charts.
- **I3.** A creator only ever sees their own content's metrics (the read is
  author-scoped server-side).
