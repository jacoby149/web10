import { describe, it, expect } from 'vitest';
import { aggregateRows } from '@/data/creator-analytics';

// The D86 creator-analytics aggregation is pure (no I/O) — it turns the node's
// one-row-per-(doc, surface, day) output into the dashboard shapes. These tests
// pin that aggregation, which is the data contract the charts render.

const ROWS = [
  { doc_id: 'p1', surface: 'feed', day: '2026-10-01', impressions: 100, reach: 40, clicks: 5, avg_watch_pct: null },
  { doc_id: 'p1', surface: 'discover', day: '2026-10-01', impressions: 50, reach: 20, clicks: 2, avg_watch_pct: null },
  { doc_id: 'p1', surface: 'feed', day: '2026-10-02', impressions: 30, reach: 10, clicks: 1, avg_watch_pct: null },
  { doc_id: 'p2', surface: 'shorts', day: '2026-10-01', impressions: 200, reach: 80, clicks: 10, avg_watch_pct: 0.5 },
  { doc_id: 'p2', surface: 'shorts', day: '2026-10-02', impressions: 100, reach: 40, clicks: 4, avg_watch_pct: 0.7 },
];

describe('aggregateRows', () => {
  it('returns the empty shape for no rows', () => {
    const a = aggregateRows([]);
    expect(a.daily).toEqual([]);
    expect(a.bySurface).toEqual([]);
    expect(a.topPosts).toEqual([]);
    expect(a.totals).toEqual({ impressions: 0, reach: 0 });
  });

  it('sums the grand totals across all rows', () => {
    const a = aggregateRows(ROWS);
    // 100+50+30+200+100 = 480 impressions; 40+20+10+80+40 = 190 reach.
    expect(a.totals).toEqual({ impressions: 480, reach: 190 });
  });

  it('aggregates the daily time-series (summed across docs + surfaces, sorted by day)', () => {
    const a = aggregateRows(ROWS);
    expect(a.daily).toEqual([
      { day: '2026-10-01', impressions: 350, reach: 140 }, // 100+50+200 / 40+20+80
      { day: '2026-10-02', impressions: 130, reach: 50 }, // 30+100 / 10+40
    ]);
  });

  it('aggregates the surface breakdown (sorted by impressions desc)', () => {
    const a = aggregateRows(ROWS);
    expect(a.bySurface).toEqual([
      { surface: 'shorts', impressions: 300, reach: 120 }, // 200+100
      { surface: 'feed', impressions: 130, reach: 50 }, // 100+30
      { surface: 'discover', impressions: 50, reach: 20 },
    ]);
  });

  it('aggregates the top posts (summed across surfaces + days, sorted by impressions desc)', () => {
    const a = aggregateRows(ROWS);
    expect(a.topPosts).toEqual([
      { doc_id: 'p2', impressions: 300, reach: 120, avgWatchPct: 0.6 }, // (0.5+0.7)/2
      { doc_id: 'p1', impressions: 180, reach: 70, avgWatchPct: null },
    ]);
  });

  it('averages avg_watch_pct over the non-null rows per doc (null when none)', () => {
    const a = aggregateRows(ROWS);
    const p2 = a.topPosts.find((p) => p.doc_id === 'p2');
    const p1 = a.topPosts.find((p) => p.doc_id === 'p1');
    expect(p2?.avgWatchPct).toBeCloseTo(0.6);
    expect(p1?.avgWatchPct).toBeNull();
  });
});
