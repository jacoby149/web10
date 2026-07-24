import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as feed from '../../data/feed';

describe('readDiscoverFeed', () => {
  const originalFetch = (globalThis as unknown as Record<string, unknown>).fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (globalThis as unknown as Record<string, unknown>).fetch = originalFetch;
  });

  it('returns posts on success', async () => {
    const mockPosts = [
      {
        author: 'alice',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Hello world',
        tags: ['web10'],
        created_at: '2026-07-23T00:00:00Z',
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 13,
      },
    ];
    (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPosts),
    });

    const result = await feed.readDiscoverFeed('trending', 10);
    expect(result).toEqual(mockPosts);
    expect((globalThis as unknown as Record<string, unknown>).fetch).toHaveBeenCalledWith(
      'https://api.web10.app/discover/posts?sort=trending&limit=10',
      { method: 'PATCH' },
    );
  });

  it('returns empty array on network error', async () => {
    (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockRejectedValue(new Error('network error'));

    const result = await feed.readDiscoverFeed('recent', 5);
    expect(result).toEqual([]);
  });

  it('returns empty array on non-ok response', async () => {
    (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await feed.readDiscoverFeed('trending', 20);
    expect(result).toEqual([]);
  });

  it('defaults to recent sort and limit 20', async () => {
    (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await feed.readDiscoverFeed();
    expect((globalThis as unknown as Record<string, unknown>).fetch).toHaveBeenCalledWith(
      'https://api.web10.app/discover/posts?sort=recent&limit=20',
      { method: 'PATCH' },
    );
  });
});