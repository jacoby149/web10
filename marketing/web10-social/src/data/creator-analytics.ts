// ── creator-analytics.ts — the D86 creator dashboard data layer ─────────────
// The client-side aggregation over the D86 engine's `contentAnalytics` read.
// The node returns one row per (doc, surface, day) over the trailing window,
// I3-bound to the caller's own docs (a creator only ever sees their own
// content's events). This module aggregates those rows into the shapes the
// dashboard charts need:
//
//   - daily:      sum(impressions/reach) grouped by day  (the time-series)
//   - bySurface:  sum(impressions/reach) grouped by surface (the breakdown)
//   - topPosts:   sum(impressions/reach) grouped by doc_id, sorted desc
//   - totals:     the grand sum (the at-a-glance stat)
//
// No node surface (D60) — the read already exists (3.223.3); this is pure
// client-side aggregation. The dashboard is reporting, not a new engine.
//
// KB: knowledge/knowledge-base/web10-v3/analytics/creator-dashboard.md

import { getV3Client } from './v3';

/** One day's totals (the time-series point). `day` is `YYYY-MM-DD`. */
export interface DailyMetric {
  day: string;
  impressions: number;
  reach: number;
}

/** One surface's totals (the "where are people seeing me" breakdown). */
export interface SurfaceMetric {
  surface: string;
  impressions: number;
  reach: number;
}

/** One post's totals (the "top posts" ranked list + the per-post detail). */
export interface PostMetric {
  doc_id: string;
  impressions: number;
  reach: number;
  /** For video posts: the average fraction watched (0..1), or null. */
  avgWatchPct: number | null;
}

/** The aggregated creator analytics over a window. */
export interface CreatorAnalytics {
  daily: DailyMetric[];
  bySurface: SurfaceMetric[];
  topPosts: PostMetric[];
  totals: { impressions: number; reach: number };
}

const EMPTY: CreatorAnalytics = {
  daily: [],
  bySurface: [],
  topPosts: [],
  totals: { impressions: 0, reach: 0 },
};

/**
 * Read + aggregate the creator's own content metrics over a trailing window.
 * `windowDays` is 7 / 30 / 90 (the dashboard's time horizons). Returns the
 * aggregated shapes (above). A read failure degrades to the empty shape (the
 * dashboard shows zeros, never an error) — the reach card is a funnel beat,
 * not a hard dependency.
 */
export async function readCreatorAnalytics(
  windowDays: number,
): Promise<CreatorAnalytics> {
  try {
    const w = getV3Client();
    const { rows } = await w.contentAnalytics({ service: 'posts', windowDays });
    return aggregateRows(rows);
  } catch (e) {
    console.warn('[social:analytics] readCreatorAnalytics failed (degrading to empty):', e);
    return EMPTY;
  }
}

/**
 * Read + aggregate ONE post's metrics over a window (the per-post detail,
 * Tier 2). Filters the rows to `docId` before aggregating, so the charts show
 * just that post's trajectory. Same degradation as `readCreatorAnalytics`.
 */
export async function readPostAnalytics(
  docId: string,
  windowDays: number,
): Promise<CreatorAnalytics> {
  try {
    const w = getV3Client();
    const { rows } = await w.contentAnalytics({ service: 'posts', windowDays });
    return aggregateRows(rows.filter((r) => r.doc_id === docId));
  } catch (e) {
    console.warn('[social:analytics] readPostAnalytics failed (degrading to empty):', e);
    return EMPTY;
  }
}

/**
 * Aggregate raw content-event rows into the dashboard shapes. Pure — no I/O —
 * so it is trivially testable. A doc with no events is absent (the caller
 * treats absent as 0).
 */
export function aggregateRows(
  rows: {
    doc_id: string;
    surface: string;
    day: string;
    impressions: number;
    reach: number;
    clicks: number;
    avg_watch_pct: number | null;
  }[],
): CreatorAnalytics {
  if (!rows.length) return EMPTY;

  const byDay = new Map<string, DailyMetric>();
  const bySurface = new Map<string, SurfaceMetric>();
  const byDoc = new Map<string, PostMetric>();
  let totalImpressions = 0;
  let totalReach = 0;

  // For avg_watch_pct we want the average of the non-null values per doc.
  const watchSums = new Map<string, { sum: number; count: number }>();

  for (const r of rows) {
    totalImpressions += r.impressions;
    totalReach += r.reach;

    // daily
    const d = byDay.get(r.day) ?? { day: r.day, impressions: 0, reach: 0 };
    d.impressions += r.impressions;
    d.reach += r.reach;
    byDay.set(r.day, d);

    // bySurface
    const s = bySurface.get(r.surface) ?? { surface: r.surface, impressions: 0, reach: 0 };
    s.impressions += r.impressions;
    s.reach += r.reach;
    bySurface.set(r.surface, s);

    // byDoc
    const p = byDoc.get(r.doc_id) ?? {
      doc_id: r.doc_id,
      impressions: 0,
      reach: 0,
      avgWatchPct: null,
    };
    p.impressions += r.impressions;
    p.reach += r.reach;
    byDoc.set(r.doc_id, p);

    // watch % (average of non-null per doc)
    if (r.avg_watch_pct != null) {
      const w = watchSums.get(r.doc_id) ?? { sum: 0, count: 0 };
      w.sum += r.avg_watch_pct;
      w.count += 1;
      watchSums.set(r.doc_id, w);
    }
  }

  // Fold the averaged watch % into the per-doc metrics.
  for (const [docId, w] of watchSums) {
    const p = byDoc.get(docId);
    if (p) p.avgWatchPct = w.count > 0 ? w.sum / w.count : null;
  }

  const daily = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const surfaces = [...bySurface.values()].sort((a, b) => b.impressions - a.impressions);
  const topPosts = [...byDoc.values()].sort((a, b) => b.impressions - a.impressions);

  return { daily, bySurface: surfaces, topPosts, totals: { impressions: totalImpressions, reach: totalReach } };
}
