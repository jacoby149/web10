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
// KB: knowledge-base/web10-v3/analytics/creator-dashboard.md

import { getV3Client } from './v3';
import { pickThumbnail, type V3Document, type V3ResolvedMedia } from 'web10-npm';

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

// ── Top-post enrichment (content previews + type classification) ────────────

/** Content type for a non-ad post. */
export type ContentType = 'post' | 'video' | 'short';

/** Ad format (only meaningful when `isAd`). */
export type AdFormat = 'inline' | 'post';

/** An enriched top-post entry: analytics metrics + the doc's identity. */
export interface TopPostDetail {
  doc_id: string;
  impressions: number;
  reach: number;
  avgWatchPct: number | null;
  /** The post's title (or truncated text fallback). */
  label: string;
  /** The thumbnail URL (or null if no media). */
  thumbnailUrl: string | null;
  /** Whether this doc is an ad. */
  isAd: boolean;
  /** The content type (for non-ads). */
  contentType: ContentType;
  /** The ad format (for ads). */
  adFormat: AdFormat;
}

/** Classify a V3Document into content/ad type. */
function classifyDoc(doc: V3Document): { isAd: boolean; contentType: ContentType; adFormat: AdFormat } {
  const tags = doc.tags ?? [];
  const isAd = tags.includes('ad');
  const isShort = tags.includes('short');
  const body = doc.body;
  const rawRefs = Array.isArray(body.media_refs) ? body.media_refs : [];
  const hasVideo = rawRefs.some(
    (m) => typeof m === 'object' && m !== null && 'mime_type' in m && String((m as V3ResolvedMedia).mime_type ?? '').startsWith('video/'),
  );
  const adFormat: AdFormat = body.format === 'post' ? 'post' : 'inline';

  let contentType: ContentType;
  if (isShort) contentType = 'short';
  else if (hasVideo) contentType = 'video';
  else contentType = 'post';

  return { isAd, contentType, adFormat };
}

/** Extract a short label from a doc (title > truncated plain text > 'Untitled'). */
function extractLabel(doc: V3Document): string {
  const body = doc.body;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title) return title;
  const text = typeof body.text === 'string' ? body.text : '';
  if (text) {
    const plain = text.replace(/[#*`>\[\]!]/g, '').replace(/\n+/g, ' ').trim();
    return plain.length > 60 ? plain.slice(0, 57) + '…' : plain;
  }
  return 'Untitled';
}

/**
 * Enrich the top-N post metrics with their doc identity: title, thumbnail,
 * content type, ad format. Reads each doc via `readById` (no surface label —
 * the read does NOT log a delivery impression). A read failure for one doc
 * degrades to a minimal entry (no thumbnail, "Untitled").
 *
 * The caller passes the `topPosts` array (already sorted by impressions desc)
 * and gets back the same entries enriched with the doc's identity.
 */
export async function enrichTopPosts(topPosts: PostMetric[]): Promise<TopPostDetail[]> {
  if (!topPosts.length) return [];
  const w = getV3Client();
  const docIds = topPosts.slice(0, 10).map((p) => p.doc_id);

  const results = await Promise.allSettled(
    docIds.map(async (docId) => {
      const doc = await w.readById(docId, 'posts');
      const { isAd, contentType, adFormat } = classifyDoc(doc);
      const rawRefs = Array.isArray(doc.body.media_refs) ? doc.body.media_refs : [];
      const resolvedMedia = rawRefs.filter(
        (m): m is V3ResolvedMedia => typeof m === 'object' && m !== null && 'mime_type' in m,
      );
      const thumb = pickThumbnail(resolvedMedia);
      const metric = topPosts.find((p) => p.doc_id === docId)!;
      return {
        doc_id: docId,
        impressions: metric.impressions,
        reach: metric.reach,
        avgWatchPct: metric.avgWatchPct,
        label: extractLabel(doc),
        thumbnailUrl: thumb?.url ?? null,
        isAd,
        contentType,
        adFormat,
      } satisfies TopPostDetail;
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<TopPostDetail> => r.status === 'fulfilled')
    .map((r) => r.value);
}
