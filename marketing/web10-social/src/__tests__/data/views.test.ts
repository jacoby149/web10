import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import {
  readViewCounts,
  readViewCount,
  trackPostViewport,
  trackVideoViewport,
} from '../../data/views';

function mockV3Client() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    readToken: vi.fn(() => ({ provider: 'web10.app', username: 'alice' })),
    create: vi.fn(),
    read: vi.fn(),
    readRefCounts: vi.fn(),
    contentViews: vi.fn(),
    trackContentEvent: vi.fn(),
    getMyGroups: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('views v3 data layer (D86 — the content analytics engine)', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // NOTE: there is no `recordView` — the view IS the delivery, logged
  // server-side by the read path (the app passes `surface` on the read). A
  // client-side "record a view" write would be redundant (the node already
  // recorded the delivery) and gameable, so it does not exist.

  describe('readViewCounts', () => {
    it('returns the per-post view metrics (impressions + reach) from contentViews', async () => {
      mock.contentViews.mockResolvedValue({ p1: { impressions: 50, reach: 5 }, p2: { impressions: 20, reach: 2 } });
      const counts = await readViewCounts(['p1', 'p2']);
      expect(counts).toEqual({ p1: { impressions: 50, reach: 5 }, p2: { impressions: 20, reach: 2 } });
      expect(mock.contentViews).toHaveBeenCalledWith({
        service: 'posts',
        docIds: ['p1', 'p2'],
        groups: expect.any(Array),
      });
    });

    it('returns {} for an empty post list (no read issued)', async () => {
      const counts = await readViewCounts([]);
      expect(counts).toEqual({});
      expect(mock.contentViews).not.toHaveBeenCalled();
    });

    it('degrades to {} on failure (a view count is never a hard error)', async () => {
      mock.contentViews.mockRejectedValue(new Error('boom'));
      const counts = await readViewCounts(['p1']);
      expect(counts).toEqual({});
    });
  });

  describe('readViewCount', () => {
    it('returns the view metrics for a single post', async () => {
      mock.contentViews.mockResolvedValue({ p1: { impressions: 70, reach: 7 } });
      await expect(readViewCount('p1')).resolves.toEqual({ impressions: 70, reach: 7 });
    });

    it('returns empty metrics for an absent post', async () => {
      mock.contentViews.mockResolvedValue({});
      await expect(readViewCount('p1')).resolves.toEqual({ impressions: 0, reach: 0 });
    });

    it('returns empty metrics for an empty post id', async () => {
      await expect(readViewCount('')).resolves.toEqual({ impressions: 0, reach: 0 });
      expect(mock.contentViews).not.toHaveBeenCalled();
    });
  });

  describe('trackPostViewport (the D86 client-gated viewport tier)', () => {
    it('fires a viewport signal with dwell_ms + visible_pct', () => {
      trackPostViewport('p1', 'feed', 4200, 0.8);
      expect(mock.trackContentEvent).toHaveBeenCalledWith('p1', {
        service: 'posts',
        surface: 'feed',
        type: 'viewport',
        payload: JSON.stringify({ dwell_ms: 4200, visible_pct: 0.8 }),
      });
    });

    it('omits visible_pct when not provided', () => {
      trackPostViewport('p1', 'discover', 1500);
      expect(mock.trackContentEvent).toHaveBeenCalledWith('p1', {
        service: 'posts',
        surface: 'discover',
        type: 'viewport',
        payload: JSON.stringify({ dwell_ms: 1500 }),
      });
    });

    it('does not fire for a zero/negative dwell (a scroll-past)', () => {
      trackPostViewport('p1', 'feed', 0);
      trackPostViewport('p1', 'feed', -5);
      expect(mock.trackContentEvent).not.toHaveBeenCalled();
    });

    it('does not fire for an empty post id', () => {
      trackPostViewport('', 'feed', 4200);
      expect(mock.trackContentEvent).not.toHaveBeenCalled();
    });

    it('never throws on a network failure (fire-and-forget)', () => {
      mock.trackContentEvent.mockRejectedValue(new Error('boom'));
      expect(() => trackPostViewport('p1', 'feed', 4200)).not.toThrow();
    });
  });

  describe('trackVideoViewport (the D86 watched_ms tier)', () => {
    it('fires a viewport signal with watched_ms + duration_ms', () => {
      trackVideoViewport('p1', 'shorts', 12500, 60000);
      expect(mock.trackContentEvent).toHaveBeenCalledWith('p1', {
        service: 'posts',
        surface: 'shorts',
        type: 'viewport',
        payload: JSON.stringify({ watched_ms: 12500, duration_ms: 60000 }),
      });
    });

    it('omits duration_ms when unknown', () => {
      trackVideoViewport('p1', 'watch', 30000);
      expect(mock.trackContentEvent).toHaveBeenCalledWith('p1', {
        service: 'posts',
        surface: 'watch',
        type: 'viewport',
        payload: JSON.stringify({ watched_ms: 30000 }),
      });
    });

    it('does not fire for a zero watched_ms', () => {
      trackVideoViewport('p1', 'shorts', 0, 60000);
      expect(mock.trackContentEvent).not.toHaveBeenCalled();
    });
  });
});
