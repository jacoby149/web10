// Screenshot harness — mock of @/data/creator-analytics.
// Seeded analytics data so the dashboard renders with realistic content
// and no backend.
import type { CreatorAnalytics, TopPostDetail } from '@/data/creator-analytics';

const SEED_ANALYTICS: CreatorAnalytics = {
  daily: [
    { day: '2026-10-01', impressions: 120, reach: 80 },
    { day: '2026-10-02', impressions: 200, reach: 140 },
    { day: '2026-10-03', impressions: 180, reach: 120 },
    { day: '2026-10-04', impressions: 310, reach: 200 },
    { day: '2026-10-05', impressions: 250, reach: 170 },
    { day: '2026-10-06', impressions: 420, reach: 290 },
    { day: '2026-10-07', impressions: 380, reach: 260 },
  ],
  bySurface: [
    { surface: 'feed', impressions: 800, reach: 540 },
    { surface: 'discover', impressions: 520, reach: 380 },
    { surface: 'profile', impressions: 210, reach: 150 },
    { surface: 'shorts', impressions: 130, reach: 95 },
  ],
  topPosts: [
    { doc_id: 'doc-1', impressions: 420, reach: 290, avgWatchPct: null },
    { doc_id: 'doc-2', impressions: 380, reach: 260, avgWatchPct: 0.72 },
    { doc_id: 'doc-3', impressions: 310, reach: 200, avgWatchPct: null },
    { doc_id: 'doc-4', impressions: 250, reach: 170, avgWatchPct: 0.55 },
    { doc_id: 'doc-5', impressions: 200, reach: 140, avgWatchPct: null },
    { doc_id: 'doc-6', impressions: 180, reach: 120, avgWatchPct: null },
    { doc_id: 'doc-7', impressions: 150, reach: 100, avgWatchPct: 0.81 },
    { doc_id: 'doc-8', impressions: 120, reach: 80, avgWatchPct: null },
  ],
  totals: { impressions: 1860, reach: 1260 },
};

const SEED_TOP_POSTS: TopPostDetail[] = [
  {
    doc_id: 'doc-1', impressions: 420, reach: 290, avgWatchPct: null,
    label: 'Behind the scenes: studio setup', thumbnailUrl: null,
    isAd: false, contentType: 'post', adFormat: 'inline',
  },
  {
    doc_id: 'doc-2', impressions: 380, reach: 260, avgWatchPct: 0.72,
    label: 'Full breakdown: my editing workflow', thumbnailUrl: null,
    isAd: false, contentType: 'video', adFormat: 'inline',
  },
  {
    doc_id: 'doc-3', impressions: 310, reach: 200, avgWatchPct: null,
    label: 'New gear haul 🎬', thumbnailUrl: null,
    isAd: false, contentType: 'post', adFormat: 'inline',
  },
  {
    doc_id: 'doc-4', impressions: 250, reach: 170, avgWatchPct: 0.55,
    label: '60-second tutorial: color grading', thumbnailUrl: null,
    isAd: false, contentType: 'short', adFormat: 'inline',
  },
  {
    doc_id: 'doc-5', impressions: 200, reach: 140, avgWatchPct: null,
    label: 'Sponsored: Nova Lens Pro', thumbnailUrl: null,
    isAd: true, contentType: 'post', adFormat: 'inline',
  },
  {
    doc_id: 'doc-6', impressions: 180, reach: 120, avgWatchPct: null,
    label: 'Sponsored: StreamKit bundle', thumbnailUrl: null,
    isAd: true, contentType: 'post', adFormat: 'post',
  },
  {
    doc_id: 'doc-7', impressions: 150, reach: 100, avgWatchPct: 0.81,
    label: 'Quick tip: audio in one take', thumbnailUrl: null,
    isAd: false, contentType: 'short', adFormat: 'inline',
  },
  {
    doc_id: 'doc-8', impressions: 120, reach: 80, avgWatchPct: null,
    label: 'Weekend vlog: city walk', thumbnailUrl: null,
    isAd: false, contentType: 'video', adFormat: 'inline',
  },
];

export function readCreatorAnalytics(_windowDays: number): Promise<CreatorAnalytics> {
  return Promise.resolve(SEED_ANALYTICS);
}

export function readPostAnalytics(_docId: string, _windowDays: number): Promise<CreatorAnalytics> {
  return Promise.resolve(SEED_ANALYTICS);
}

export function enrichTopPosts(topPosts: { doc_id: string; impressions: number; reach: number; avgWatchPct: number | null }[]): Promise<TopPostDetail[]> {
  const ids = new Set(topPosts.map((p) => p.doc_id));
  return Promise.resolve(SEED_TOP_POSTS.filter((p) => ids.has(p.doc_id)));
}

export function aggregateRows(_rows: unknown[]): CreatorAnalytics {
  return SEED_ANALYTICS;
}
